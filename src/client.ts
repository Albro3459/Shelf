import { CatalogError, CatalogRecordError, DEFAULT_BRANCHES, DIRECTORY_URL, LANDING_URL, REQUEST_URL } from './model.js';
import type { Branch } from './api-model.js';
import { parseDirectory } from './directory.js';
import type { EbrplClient, EbrplClientOptions, SearchOptions } from './model.js';
import { parseBook, parseBranches, parseResponse } from './xml.js';

class SessionError extends CatalogError {}

type Session = { sessionId: string; cookies: Map<string, string> };

function retainCookies(headers: Headers, cookies: Map<string, string>): void {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() :
    (headers.get('set-cookie') ?? '').split(/,(?=\s*[^;,=\s]+=[^;,]*)/);
  for (const value of values) {
    const pair = value.split(';')[0]?.trim();
    const separator = pair?.indexOf('=') ?? -1;
    if (!pair || separator < 1) continue;
    const name = pair.slice(0, separator);
    if (/^cf_clearance$/i.test(name)) continue;
    if (/;\s*max-age=0(?:;|$)/i.test(value)) cookies.delete(name);
    else cookies.set(name, pair.slice(separator + 1));
  }
}

function positiveInteger(value: number, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new CatalogError(`${name} must be an integer from 1 to ${maximum}`);
  }
  return value;
}

export function createEbrplClient(options: EbrplClientOptions = {}): EbrplClient {
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = positiveInteger(options.timeoutMs ?? 20000, 'timeoutMs', 120000);
  const userAgent = options.userAgent ?? 'LibraryAvailabilityCatalog/0.1';
  if (!userAgent.trim() || /[\r\n]/.test(userAgent)) throw new CatalogError('Invalid User-Agent');
  let directory: { branches: Branch[]; expiresAt: number } | undefined;
  let directoryRequest: Promise<Branch[]> | undefined;

  async function request(url: string, init: RequestInit, cookies: Map<string, string>): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set('User-Agent', userAgent);
      if (cookies.size > 0) headers.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
      const response = await fetcher(url, { ...init, headers, signal: controller.signal, redirect: 'error' });
      retainCookies(response.headers, cookies);
      if (!response.ok) {
        if (response.status === 401) throw new SessionError('Catalog session expired (HTTP 401)');
        throw new CatalogError(`Catalog request failed (HTTP ${response.status})`);
      }
      return await response.text();
    } catch (error) {
      if (controller.signal.aborted) throw new CatalogError(`Catalog request timed out after ${timeoutMs}ms`);
      if (error instanceof CatalogError) throw error;
      throw new CatalogError('Catalog network request failed');
    } finally {
      clearTimeout(timer);
    }
  }

  async function initialize(): Promise<Session> {
    const cookies = new Map<string, string>();
    const html = await request(LANDING_URL, { method: 'GET' }, cookies);
    const sessionId = /Vfocus\.Settings\.sessionID\s*=\s*['"]([^'"\r\n]+)['"]/.exec(html)?.[1];
    if (!sessionId || !/^[A-Za-z0-9._-]+$/.test(sessionId) || cookies.size === 0) {
      throw new CatalogError('Catalog landing page did not provide an anonymous session');
    }
    return { sessionId, cookies };
  }

  async function lookup(fields: Record<string, string>): Promise<ReturnType<typeof parseResponse>> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const session = await initialize();
        const form = new URLSearchParams({
          fu: 'BibSearch', Application: 'Bib', Database: '1', Language: 'eng', Profile: 'Iguana',
          Namespace: '0', MetaBorrower: '', ASRProfile: '', SessionCMS: '', CspSessionId: session.sessionId, SIDTKN: session.sessionId,
          ...fields,
        });
        const xml = await request(REQUEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: LANDING_URL },
          body: form.toString(),
        }, session.cookies);
        if (!xml.trim() || /<html\b[\s\S]*(?:session\s+(?:expired|invalid)|(?:log|sign)[ -]?in)/i.test(xml)) {
          throw new SessionError('Catalog returned an empty response or an expired session page');
        }
        return parseResponse(xml);
      } catch (error) {
        if (!(error instanceof SessionError) || attempt === 1) throw error;
      }
    }
    throw new CatalogError('Catalog session could not be renewed');
  }

  return {
    async getBranches() {
      if (directory && Date.now() < directory.expiresAt) return directory.branches.map(branch => ({ ...branch }));
      if (!directoryRequest) {
        directoryRequest = (async () => {
          const session = await initialize();
          const text = await request(DIRECTORY_URL, { method: 'GET', headers: { Referer: LANDING_URL } }, session.cookies);
          const branches = parseDirectory(text);
          directory = { branches, expiresAt: Date.now() + 3600000 };
          return branches;
        })();
      }
      try { return (await directoryRequest).map(branch => ({ ...branch })); }
      finally { directoryRequest = undefined; }
    },
    async searchBooks(query: string, searchOptions: SearchOptions = {}) {
      const normalizedQuery = query.trim();
      if (!normalizedQuery || normalizedQuery.length > 1000) throw new CatalogError('Search requires 1 to 1000 characters');
      const startRecord = positiveInteger(searchOptions.startRecord ?? 1, 'startRecord', 1000000);
      const limit = positiveInteger(searchOptions.limit ?? 10, 'limit', 100);
      const response = await lookup({
        RequestType: 'ResultSet_DisplayList', Index: '1*Keywordsbib', Request: normalizedQuery,
        SearchMode: 'simple', TemplateId: 'Iguana_Brief', StartValue: String(startRecord),
        NumberToRetrieve: String(limit), ExportByTemplate: 'Brief', SearchTechnique: 'Find',
        FacetedSearch: 'Yes', Cluster: '1', BestMatch: '99', Sort: 'Relevancy',
        SortDirection: '-1', WithoutRestrictions: 'Yes', Associations: 'Also',
        SummaryHoldings: DEFAULT_BRANCHES.join(','),
      });
      return { total: response.total, books: response.documents.map(parseBook) };
    },
    async getAvailability(recordId: string, branchCodes: readonly string[] = DEFAULT_BRANCHES) {
      if (!/^1\.[1-9]\d*$/.test(recordId)) throw new CatalogError('Record ID must have the form 1.1906252');
      if (branchCodes.length === 0 || branchCodes.length > 100 || branchCodes.some(code => !/^EBRPL\/[A-Z0-9]{2,10}$/.test(code))) {
        throw new CatalogError('Select EBRPL branch codes such as EBRPL/JCR');
      }
      const selectedBranches = [...new Set(branchCodes)];
      const response = await lookup({
        RequestType: 'RecordNumber', Request: recordId.slice(2), TemplateId: 'Iguana_Full',
        ExportByTemplate: 'Full', LinkToWord: '1', Versions: '1', SummaryHoldings: selectedBranches.join(','),
      });
      const document = response.documents[0];
      if (response.total === 0) throw new CatalogRecordError('No catalog record was found for this ID', 'not-found');
      if (response.total !== 1 || response.documents.length !== 1 || !document) {
        throw new CatalogError('Catalog lookup did not return exactly one record');
      }
      const book = parseBook(document);
      if (book.recordId !== recordId) throw new CatalogError('Catalog returned a different record ID');
      if (book.isPhysicalBook !== true) throw new CatalogRecordError('This catalog record is not a confirmed physical book', 'not-physical');
      return { book, branches: parseBranches(document, selectedBranches), checkedAt: new Date().toISOString() };
    },
  };
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createApiHandler } from '../server/handler.js';
import { parseDirectory } from '../src/directory.js';
import { InputError, resolveInput } from '../src/input.js';
import type { Book, EbrplClient } from '../src/model.js';
import { CatalogError, CatalogRecordError, createEbrplClient } from '../src/index.js';
import { createCatalogService } from '../src/service.js';

const book: Book = {
  recordId: '1.1906252', title: 'Example', authors: [], isbns: [], isPhysicalBook: true,
  documentType: 'Book', materialType: 'FICA', catalogUrl: 'https://catalog.ebrpl.com/iguana/www.main.cls#recordId=1.1906252',
};
const branches = [{ code: 'EBRPL/EBR', name: 'Main Library' }, { code: 'EBRPL/BBR', name: 'Bluebonnet Regional' }];
const directoryText = JSON.stringify({ search: { restrictions: [{ ident: 'Location_1', values: [
  ...branches.map(branch => ({ ident: branch.code, name: branch.name })), { ident: 'EBRPL/ELR', name: 'Digital Resources' },
] }], wordingsStdRestr: [{ restriction: 'Location', values: [{ code: 'EBRPL/ROU', wording: 'Rouzan Branch Library' }] }] } });

function client(overrides: Partial<EbrplClient> = {}): EbrplClient {
  return {
    async getBranches() { return branches; },
    async searchBooks() { return { total: 1, books: [book] }; },
    async getAvailability() { return { book, branches: [], checkedAt: '2026-10-19T12:00:00Z' }; },
    ...overrides,
  };
}

test('input resolver recognizes IDs, ISBNs, keywords, and exact HTTPS catalog URLs', () => {
  for (const input of ['1.1906252', '1906252', 'https://catalog.ebrpl.com/iguana/www.main.cls?surl=search&p=*#recordId=1.1906252']) {
    assert.deepEqual(resolveInput(input), { kind: 'record', recordId: '1.1906252' });
  }
  for (const query of ['9798892426367', '054792822X', 'Tolkien hobbit', 'Dune: House Atreides', 'Dune:House Atreides']) {
    assert.deepEqual(resolveInput(query), { kind: 'search', query });
  }
  for (const input of ['', '0', 'http://catalog.ebrpl.com/iguana/www.main.cls#recordId=1.1',
    'https://catalog.ebrpl.com.evil.test/iguana/www.main.cls#recordId=1.1',
    'https://catalog.ebrpl.com@evil.test/iguana/www.main.cls#recordId=1.1',
    'https://user:secret@catalog.ebrpl.com/iguana/www.main.cls#recordId=1.1',
    'https://catalog.ebrpl.com:444/iguana/www.main.cls#recordId=1.1',
    'https://catalog.ebrpl.com/other#recordId=1.1', 'file:///etc/passwd', '//127.0.0.1/',
    'https://catalog.ebrpl.com/iguana/www.main.cls#recordId=1.1&recordId=1.2']) {
    assert.throws(() => resolveInput(input), InputError, input);
  }
});

test('directory uses selectable public locations and fails on malformed or partial entries', () => {
  assert.deepEqual(parseDirectory(directoryText), branches);
  for (const text of ['<html>upstream error</html>', '{}', JSON.stringify({ search: { restrictions: [{ ident: 'Location_1', values: [{ ident: 'EBRPL/EBR' }] }] } })]) {
    assert.throws(() => parseDirectory(text), CatalogError);
  }
});

test('directory retrieval uses the fixed session endpoint and caches only complete successful results', async () => {
  const requests: string[] = [];
  let failed = true;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push(url);
    if (url.includes('www.main.cls')) return new Response('<script>Vfocus.Settings.sessionID="session-1";</script>', { headers: { 'set-cookie': 'session=one; Secure' } });
    assert.equal(url, 'https://catalog.ebrpl.com/iguana/Service.Search.cls?language=eng');
    assert.equal(new Headers(init?.headers).get('cookie'), 'session=one');
    assert.ok(new Headers(init?.headers).get('referer'));
    return new Response(failed ? '{}' : directoryText);
  };
  const catalog = createEbrplClient({ fetch });
  await assert.rejects(catalog.getBranches(), CatalogError);
  failed = false;
  assert.deepEqual(await catalog.getBranches(), branches);
  const cached = await catalog.getBranches();
  cached[0]!.name = 'changed';
  assert.deepEqual(await catalog.getBranches(), branches);
  assert.equal(requests.length, 4);
});

test('physical search pagination advances through digital pages without claiming a physical total', async () => {
  const catalog = client({ async searchBooks(_query, options) {
    return { total: 5, books: options?.startRecord === 1 ? [{ ...book, isPhysicalBook: false }, { ...book, isPhysicalBook: null }] : [book] };
  } });
  const service = createCatalogService(catalog);
  assert.deepEqual(await service.search('hobbit', { startRecord: 1, limit: 2 }), {
    kind: 'search', query: 'hobbit', books: [], totalCatalogResults: 5, nextStartRecord: 3,
  });
  const next = await service.search('hobbit', { startRecord: 3, limit: 2 });
  assert.equal(next.kind, 'search');
  if (next.kind === 'search') assert.deepEqual(next.books, [book]);
  assert.deepEqual(await service.search('1906252'), { kind: 'record', recordId: '1.1906252' });
});

test('availability requests every directory branch and preserves unknown missing holdings', async () => {
  const record = readFileSync(new URL('./fixtures/record-hobbit.xml', import.meta.url), 'utf8');
  const catalog = createEbrplClient({ fetch: async (input, init) => {
    if (String(input).includes('www.main.cls')) return new Response('<script>Vfocus.Settings.sessionID="session-1";</script>', { headers: { 'set-cookie': 'session=one; Secure' } });
    if (String(input).includes('Service.Search.cls')) return new Response(directoryText);
    const form = new URLSearchParams(String(init?.body));
    assert.equal(form.get('SummaryHoldings'), 'EBRPL/EBR,EBRPL/BBR');
    return new Response(record);
  } });
  const result = await createCatalogService(catalog).getAvailability('1.611172');
  assert.deepEqual(result.branches.map(branch => [branch.branchCode, branch.branchName, branch.status]), [
    ['EBRPL/EBR', 'Main Library', 'available'], ['EBRPL/BBR', 'Bluebonnet Regional', 'unknown'],
  ]);
  assert.deepEqual(result.branches[1]?.rawStatuses, []);
});

test('HTTP validation rejects bad input before calls and hides upstream details', async () => {
  let calls = 0;
  const handler = createApiHandler(createCatalogService(client({ async searchBooks() {
    calls += 1;
    throw new CatalogError('<xml>secret session token</xml>');
  } })));
  for (const path of ['/api/search?q=', '/api/search?q=ok&limit=-1', '/api/search?q=ok&startRecord=1.2',
    '/api/search?q=ok&q=other', '/api/search?q=https%3A%2F%2Fevil.test', '/api/availability/%ZZ', '/api/availability/1.0']) {
    const response = await handler(new Request(`http://localhost${path}`));
    assert.equal(response.status, 400, path);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  }
  assert.equal(calls, 0);
  const failure = await handler(new Request('http://localhost/api/search?q=hobbit'));
  assert.equal(failure.status, 502);
  assert.doesNotMatch(await failure.text(), /secret|token|xml/);
  assert.equal((await handler(new Request('http://localhost/api/health'))).status, 200);
  assert.equal((await handler(new Request('http://localhost/missing'))).status, 404);
  assert.equal((await handler(new Request('http://localhost/api/search', { method: 'POST' }))).status, 405);
});

test('juvenile, teen, biography, graphic and large print book mappings remain physical', async () => {
  const record = readFileSync(new URL('./fixtures/record-hobbit.xml', import.meta.url), 'utf8');
  for (const code of ['FICJ', 'FICT', 'BIOJ', 'BOARDBK', 'PICTUREBK', 'GRAPHICBKJ', 'GRAPHICNFT', 'LARGPRINTT']) {
    const catalog = createEbrplClient({ fetch: async input => String(input).includes('www.main.cls') ?
      new Response('<script>Vfocus.Settings.sessionID="session-1";</script>', { headers: { 'set-cookie': 'session=one; Secure' } }) :
      new Response(record.replace('<DisplayMaterialType>NONFICA</DisplayMaterialType>', `<DisplayMaterialType>${code}</DisplayMaterialType>`)) });
    const result = await catalog.getAvailability('1.611172', ['EBRPL/EBR']);
    assert.equal(result.book.isPhysicalBook, true, code);
  }
});

test('record errors retain useful statuses while directory failure cannot fall back to preferred branches', async () => {
  for (const [reason, status] of [['not-found', 404], ['not-physical', 422]] as const) {
    const handler = createApiHandler(createCatalogService(client({ async getAvailability() {
      throw new CatalogRecordError('Safe record message', reason);
    } })));
    const response = await handler(new Request('http://localhost/api/availability/1.1906252'));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: 'Safe record message' });
  }
  let availabilityCalled = false;
  const handler = createApiHandler(createCatalogService(client({
    async getBranches() { throw new CatalogError('Broken directory'); },
    async getAvailability() { availabilityCalled = true; throw new Error('Unexpected availability call'); },
  })));
  assert.equal((await handler(new Request('http://localhost/api/availability/1.1906252'))).status, 502);
  assert.equal(availabilityCalled, false);
});

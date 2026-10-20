import { parseXml, XmlElement } from '@rgrove/parse-xml';
import { cleanCatalogText } from './catalog-text.js';
import { CatalogError, LANDING_URL } from './model.js';
import type { Book, BranchObservation } from './model.js';

function children(parent: XmlElement, name: string): XmlElement[] {
  return parent.children.filter((node): node is XmlElement => node instanceof XmlElement && node.name === name);
}

function child(parent: XmlElement, name: string): XmlElement | undefined {
  return children(parent, name)[0];
}

function field(parent: XmlElement, name: string): string {
  return child(parent, name)?.text.trim() ?? '';
}

export function parseResponse(xml: string): { total: number; documents: XmlElement[] } {
  let root: XmlElement | null;
  try {
    root = parseXml(xml).root;
  } catch {
    throw new CatalogError('Catalog returned malformed XML');
  }
  if (!root || root.name !== 'searchRetrieveResponse') {
    throw new CatalogError('Catalog did not return a search response');
  }
  const rawTotal = field(root, 'numberOfRecords');
  const total = Number(rawTotal);
  if (!/^\d+$/.test(rawTotal) || !Number.isSafeInteger(total)) {
    throw new CatalogError('Catalog response has no valid record count');
  }
  const records = child(root, 'records');
  if (!records) {
    throw new CatalogError('Catalog response has no records container');
  }
  const documents = children(records, 'record').map(record => {
    const data = child(record, 'recordData');
    const document = data && child(data, 'BibDocument');
    if (!document) throw new CatalogError('Catalog record has no bibliographic document');
    return document;
  });
  if ((total === 0 && documents.length > 0) || (total > 0 && documents.length === 0) || documents.length > total) {
    throw new CatalogError('Catalog record count does not match the response');
  }
  return { total, documents };
}

function bibliography(document: XmlElement): Map<string, string[]> {
  const data = child(document, 'BibData');
  if (!data) throw new CatalogError('Catalog record has no bibliographic metadata');
  const fields = new Map<string, string[]>();
  for (const element of children(data, 'Element')) {
    const label = field(element, 'Label');
    const value = field(element, 'Data');
    fields.set(label, [...(fields.get(label) ?? []), value]);
  }
  return fields;
}

export function parseBook(document: XmlElement): Book {
  const recordId = field(document, 'Id');
  if (!/^1\.[1-9]\d*$/.test(recordId)) throw new CatalogError('Catalog record has an invalid ID');
  const fields = bibliography(document);
  const first = (...names: string[]): string => {
    for (const name of names) {
      const value = fields.get(name)?.[0];
      if (value) return value;
    }
    return '';
  };
  const rawTitle = first('FullTitleAll') || [first('BriefMainTitle', 'FullMainTitle'), first('BriefTitle', 'FullTitle')].filter(Boolean).join(' ');
  const title = cleanCatalogText(rawTitle.split('#!#')[0] ?? '').replace(/\s*--$/, '').trim();
  if (!title) throw new CatalogError('Catalog record has no title');
  const rawAuthors = fields.get('BriefAuthor') ?? fields.get('FullAuthorInverted') ?? [];
  const authors = [...new Set(rawAuthors.flatMap(value => {
    if (!value.includes('$^')) return [value];
    return [...value.matchAll(/\$\^([^\^]+)\^/g)].flatMap(match => match[1] ? [match[1].trim()] : []);
  }).map(cleanCatalogText).filter(Boolean))];
  const isbns = new Set<string>();
  for (const name of ['FullNumber', 'BriefNumber']) {
    for (const value of fields.get(name) ?? []) {
      for (const match of value.matchAll(/\b(?:97[89][\d -]{10,20}|[\d][\d -]{7,15}[\dXx])\b/g)) {
        const isbn = match[0].replace(/[ -]/g, '').toUpperCase();
        if (/^(?:\d{13}|\d{9}[\dX])$/.test(isbn)) isbns.add(isbn);
      }
    }
  }
  for (const name of ['BriefCoverA', 'FullCoverA']) {
    for (const value of fields.get(name) ?? []) {
      for (const match of value.matchAll(/[?&]isbn=(\d{13}|\d{9}[\dXx])(?=[/:&?]|$)/g)) {
        if (match[1]) isbns.add(match[1].toUpperCase());
      }
    }
  }
  const documentType = field(document, 'DocType') || null;
  const materialType = field(document, 'DisplayMaterialType') || null;
  const ebook = field(document, 'Ebook');
  const material = first('BriefMaterial', 'FullMaterial');
  const isDigital = ebook === '1' || materialType === 'DIGR' || /(?:ebook|eaudio|overdrive)/i.test(material);
  // Book codes follow the catalog's Service.Search.cls publication-type wordings
  const isBookMaterial = [
    'FICA', 'FICJ', 'FICT', 'NONFICA', 'NONFICJ', 'NONFICT', 'BIOA', 'BIOJ', 'BIOT',
    'BOARDBK', 'BRAILLE', 'PICTUREBK', 'GRAPHICBKA', 'GRAPHICBKJ', 'GRAPHICBKT', 'GRAPHICNFA', 'GRAPHICNFT',
    'LARGPRINTA', 'LARGPRINTJ', 'LARGPRINTT', 'LABIO', 'LAFICA', 'LAFICT', 'LANONFICA', 'LANONFICT',
    'LFICA', 'LFICJ', 'LFICT', 'LNFICA', 'LNFICJ', 'LNFICT', 'LAREFT', 'LREFA', 'LREFJ', 'LREFT',
    'REFA', 'REFJ', 'REFT', 'PRIMER', 'READER', 'STEPUP',
  ].includes(materialType ?? '') || /(?:^|\/)book\.svg(?:['"?\s>]|$)/i.test(material);
  const isPhysicalBook = isDigital || (documentType !== null && documentType !== 'Book') ? false :
    ebook === '0' && documentType === 'Book' && isBookMaterial ? true : null;
  return { recordId, title, authors, isbns: [...isbns], documentType, materialType, isPhysicalBook, catalogUrl: `${LANDING_URL}#recordId=${recordId}` };
}

export function parseBranches(document: XmlElement, branchCodes: readonly string[]): BranchObservation[] {
  const summary = child(document, 'HoldingsSummary');
  const rows = summary ? children(summary, 'ShelfmarkData') : [];
  for (const row of rows) {
    if (!/^EBRPL\/[A-Z0-9]{2,10}$/.test(field(row, 'Scope'))) {
      throw new CatalogError('Catalog holdings have an invalid branch identity');
    }
  }
  return branchCodes.map(branchCode => {
    const matching = rows.filter(row => field(row, 'Scope') === branchCode);
    const rawAvailableFlags = matching.map(row => field(row, 'Available'));
    const status = rawAvailableFlags.includes('1') ? 'available' :
      rawAvailableFlags.length > 0 && rawAvailableFlags.every(flag => flag === '0') ? 'unavailable' : 'unknown';
    return {
      branchCode,
      branchName: matching[0] ? field(matching[0], 'LocationWording') || null : null,
      status,
      rawStatuses: matching.map(row => field(row, 'StatusSummary')),
      rawAvailableFlags,
    };
  });
}

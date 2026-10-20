import type { Branch } from './api-model.js';

export type Book = {
  recordId: string;
  title: string;
  authors: string[];
  isbns: string[];
  isPhysicalBook: boolean | null;
  documentType: string | null;
  materialType: string | null;
  catalogUrl: string;
};

export type SearchOptions = { startRecord?: number; limit?: number };
export type SearchResult = { total: number; books: Book[] };
export type AvailabilityStatus = 'available' | 'unavailable' | 'unknown' | 'not-held';
export type BranchObservation = {
  branchCode: string;
  branchName: string | null;
  status: AvailabilityStatus;
  rawStatuses: string[];
  rawAvailableFlags: string[];
};
export type AvailabilityResult = {
  book: Book;
  branches: BranchObservation[];
  checkedAt: string;
};
export type EbrplClientOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  userAgent?: string;
};
export type EbrplClient = {
  getBranches(): Promise<Branch[]>;
  searchBooks(query: string, options?: SearchOptions): Promise<SearchResult>;
  getAvailability(recordId: string, branchCodes?: readonly string[]): Promise<AvailabilityResult>;
};

export const DEFAULT_BRANCHES: readonly string[] = ['EBRPL/JCR', 'EBRPL/SOU', 'EBRPL/BBR'];
export const LANDING_URL = 'https://catalog.ebrpl.com/iguana/www.main.cls?surl=search&p=*';
export const REQUEST_URL = 'https://catalog.ebrpl.com/iguana/Proxy.SearchRequest.cls';
export const DIRECTORY_URL = 'https://catalog.ebrpl.com/iguana/Service.Search.cls?language=eng';

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogError';
  }
}

export class CatalogRecordError extends CatalogError {
  constructor(message: string, readonly reason: 'not-found' | 'not-physical') {
    super(message);
    this.name = 'CatalogRecordError';
  }
}

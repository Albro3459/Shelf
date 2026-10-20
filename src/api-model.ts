import type { AvailabilityResult, Book } from './model.js';

export type Branch = { code: string; name: string };
export type SearchResponse =
  | { kind: 'search'; query: string; books: Book[]; totalCatalogResults: number; nextStartRecord: number | null }
  | { kind: 'record'; recordId: string };
export type BranchDirectoryResponse = { branches: Branch[] };
export type AvailabilityResponse = AvailabilityResult;
export type ApiErrorResponse = { error: string };

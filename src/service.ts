import type { AvailabilityResponse, BranchDirectoryResponse, SearchResponse } from './api-model.js';
import type { EbrplClient, SearchOptions } from './model.js';
import { InputError, normalizeRecordId, resolveInput } from './input.js';

export type CatalogService = {
  search(input: string, options?: SearchOptions): Promise<SearchResponse>;
  getBranches(): Promise<BranchDirectoryResponse>;
  getAvailability(recordId: string): Promise<AvailabilityResponse>;
};

export function createCatalogService(client: EbrplClient): CatalogService {
  return {
    async search(input, options = {}) {
      const resolved = resolveInput(input);
      if (resolved.kind === 'record') return resolved;
      const startRecord = options.startRecord ?? 1;
      const limit = options.limit ?? 20;
      if (!Number.isSafeInteger(startRecord) || startRecord < 1 || startRecord > 1000000 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new InputError('Use a start record from 1 to 1000000 and a limit from 1 to 100');
      }
      const result = await client.searchBooks(resolved.query, { startRecord, limit });
      const next = startRecord + result.books.length;
      return {
        kind: 'search', query: resolved.query,
        books: result.books.filter(book => book.isPhysicalBook === true),
        totalCatalogResults: result.total,
        nextStartRecord: result.books.length > 0 && next <= result.total ? next : null,
      };
    },
    async getBranches() { return { branches: await client.getBranches() }; },
    async getAvailability(recordId) {
      const normalizedRecordId = normalizeRecordId(recordId);
      const branches = await client.getBranches();
      const result = await client.getAvailability(normalizedRecordId, branches.map(branch => branch.code));
      const names = new Map(branches.map(branch => [branch.code, branch.name]));
      return { ...result, branches: result.branches.map(branch => ({ ...branch, branchName: names.get(branch.branchCode) ?? branch.branchName })) };
    },
  };
}

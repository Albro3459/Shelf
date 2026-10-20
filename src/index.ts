export { createEbrplClient } from './client.js';
export { createCatalogService } from './service.js';
export { InputError, normalizeRecordId, resolveInput } from './input.js';
export type { Branch, SearchResponse, BranchDirectoryResponse, AvailabilityResponse } from './api-model.js';
export { CatalogError, CatalogRecordError, DEFAULT_BRANCHES } from './model.js';
export type { AvailabilityResult, AvailabilityStatus, Book, BranchObservation, EbrplClient, EbrplClientOptions, SearchOptions, SearchResult } from './model.js';

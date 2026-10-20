import { ConvexError, v } from 'convex/values';
import { action, internalAction } from './_generated/server';
import type { AvailabilityResponse, BranchDirectoryResponse, SearchResponse } from '../src/api-model.js';
import { CatalogRecordError, InputError, createCatalogService, createEbrplClient } from '../src/index.js';

const catalog = createCatalogService(createEbrplClient());

async function catalogRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const message = error instanceof InputError || error instanceof CatalogRecordError ? error.message :
      'The library catalog could not complete this request. Please try again.';
    throw new ConvexError(message);
  }
}

export const search = action({
  args: { input: v.string(), startRecord: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (_ctx, { input, startRecord, limit }): Promise<SearchResponse> =>
    await catalogRequest(() => catalog.search(input, { startRecord: startRecord ?? 1, limit: limit ?? 20 })),
});

export const getBranches = action({
  args: {},
  handler: async (): Promise<BranchDirectoryResponse> => await catalogRequest(() => catalog.getBranches()),
});

export const getAvailability = action({
  args: { recordId: v.string() },
  handler: async (_ctx, { recordId }): Promise<AvailabilityResponse> =>
    await catalogRequest(() => catalog.getAvailability(recordId)),
});

export const checkAvailability = internalAction({
  args: { recordId: v.string() },
  handler: async (_ctx, { recordId }): Promise<AvailabilityResponse> =>
    await catalogRequest(() => catalog.getAvailability(recordId)),
});

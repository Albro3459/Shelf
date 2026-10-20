import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { createCatalogService, createEbrplClient } from '../src/index.js';

export const checkAvailability = internalAction({
  args: { recordId: v.string() },
  handler: async (_ctx, { recordId }) => {
    const catalog = createCatalogService(createEbrplClient());
    return await catalog.getAvailability(recordId);
  },
});

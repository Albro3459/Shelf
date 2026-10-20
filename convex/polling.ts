'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { createEbrplClient } from '../src/client.js';
import { CatalogRecordError } from '../src/model.js';

export const checkBook = internalAction({
  args: { bookId: v.id('books'), requestedOnly: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<void> => {
    const { bookId } = args;
    const batch = await ctx.runMutation(internal.monitoring.claimCheck, args);
    if (!batch) return;
    const clients = new Map(batch.systems.map(system => [system._id, createEbrplClient({ urls: system.config, timeoutMs: 10000 })]));
    const results = [];
    for (let start = 0; start < batch.records.length; start += 4) {
      const group = await Promise.all(batch.records.slice(start, start + 4).map(async record => {
        const client = clients.get(record.librarySystemId);
        const branches = batch.branches.filter(branch => branch.librarySystemId === record.librarySystemId);
        if (!client || !branches.length) return { catalogRecordId: record._id, observations: [], errorCode: 'system-not-monitored' };
        try {
          const result = await client.getAvailability(record.externalId, branches.map(branch => branch.externalId));
          return {
            catalogRecordId: record._id,
            observations: branches.map(branch => {
              const item = result.branches.find(item => item.branchCode === branch.externalId);
              return { branchId: branch._id, status: item?.status ?? 'unknown' as const,
                rawStatuses: (item?.rawStatuses ?? []).slice(0, 20).map(value => value.slice(0, 200)),
                rawAvailableFlags: (item?.rawAvailableFlags ?? []).slice(0, 20).map(value => value.slice(0, 200)),
              };
            }),
          };
        } catch (error) {
          return { catalogRecordId: record._id, observations: [], errorCode: error instanceof CatalogRecordError ? error.reason : 'catalog-unavailable' };
        }
      }));
      results.push(...group);
    }
    await ctx.runMutation(internal.monitoring.finishCheck, { bookId, startedAt: batch.startedAt, results });
  },
});

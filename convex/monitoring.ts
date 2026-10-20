import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { CHECK_INTERVAL_MS, MAX_RECORDS_PER_BOOK, withinCheckHours } from './notificationModel';
import { currentEvent, currentStatus, eligibleSubscriber, reconcileSubscription, requestCheck } from './notificationState';

export const tick = internalMutation({
  args: {},
  handler: async ctx => {
    if (!withinCheckHours(Date.now())) return;
    await ctx.scheduler.runAfter(0, internal.monitoring.queueDue, {});
  },
});

export const queueDue = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now();
    const books = await ctx.db.query('books').withIndex('by_next_check', q => q.gt('nextCheckAt', 0).lte('nextCheckAt', now)).take(25);
    for (const book of books) {
      await ctx.db.patch(book._id, { nextCheckAt: Math.floor(now / CHECK_INTERVAL_MS) * CHECK_INTERVAL_MS + CHECK_INTERVAL_MS });
      await ctx.scheduler.runAfter(0, internal.polling.checkBook, { bookId: book._id });
    }
    if (books.length === 25) await ctx.scheduler.runAfter(1000, internal.monitoring.queueDue, {});
  },
});

export const claimCheck = internalMutation({
  args: { bookId: v.id('books'), requestedOnly: v.optional(v.boolean()) },
  handler: async (ctx, { bookId, requestedOnly }) => {
    const now = Date.now();
    const book = await ctx.db.get(bookId);
    if (!book || (requestedOnly && !book.checkPending)) return null;
    if ((book.checkLeaseExpiresAt ?? 0) > now) {
      await ctx.db.patch(bookId, { checkPending: true });
      await ctx.scheduler.runAfter(book.checkLeaseExpiresAt! - now + 1, internal.polling.checkBook, { bookId, requestedOnly: true });
      return null;
    }
    const subscriptions = await ctx.db.query('subscriptions').withIndex('by_book_branch_enabled', q => q.eq('bookId', bookId)).collect();
    const branchIds = [];
    for (const sub of subscriptions) if (await eligibleSubscriber(ctx, sub)) branchIds.push(sub.branchId);
    if (!branchIds.length) {
      await ctx.db.patch(bookId, { nextCheckAt: undefined, checkPending: false });
      return null;
    }
    const records = await ctx.db.query('catalogRecords').withIndex('by_book_system', q => q.eq('bookId', bookId)).take(MAX_RECORDS_PER_BOOK + 1);
    if (!records.length || records.length > MAX_RECORDS_PER_BOOK) {
      await ctx.db.patch(bookId, { nextCheckAt: Math.floor(now / CHECK_INTERVAL_MS) * CHECK_INTERVAL_MS + CHECK_INTERVAL_MS, checkPending: false });
      return null;
    }
    const branches = (await Promise.all([...new Set(branchIds)].map(id => ctx.db.get(id)))).filter(branch => branch !== null);
    const systems = (await Promise.all([...new Set(records.map(record => record.librarySystemId))].map(id => ctx.db.get(id)))).filter(system => system?.isEnabled).filter(system => system !== null);
    const startedAt = Math.max(now, (book.checkStartedAt ?? 0) + 1);
    await ctx.db.patch(bookId, { checkStartedAt: startedAt, checkLeaseExpiresAt: now + 10 * 60000, checkPending: false, nextCheckAt: Math.floor(now / CHECK_INTERVAL_MS) * CHECK_INTERVAL_MS + CHECK_INTERVAL_MS });
    return { startedAt, records, branches, systems };
  },
});

const observation = v.object({
  branchId: v.id('branches'),
  status: v.union(v.literal('available'), v.literal('unavailable'), v.literal('unknown'), v.literal('not-held')),
  rawStatuses: v.array(v.string()), rawAvailableFlags: v.array(v.string()),
});

export const finishCheck = internalMutation({
  args: {
    bookId: v.id('books'), startedAt: v.number(),
    results: v.array(v.object({ catalogRecordId: v.id('catalogRecords'), observations: v.array(observation), errorCode: v.optional(v.string()) })),
  },
  handler: async (ctx, { bookId, startedAt, results }) => {
    const book = await ctx.db.get(bookId);
    if (!book || book.checkStartedAt !== startedAt || (book.lastCheckAt ?? 0) >= startedAt) return;
    const records = await ctx.db.query('catalogRecords').withIndex('by_book_system', q => q.eq('bookId', bookId)).take(MAX_RECORDS_PER_BOOK + 1);
    if (records.length !== results.length || records.some(record => !results.some(result => result.catalogRecordId === record._id))) {
      await ctx.db.patch(bookId, { checkLeaseExpiresAt: undefined });
      await requestCheck(ctx, bookId);
      return;
    }
    for (const result of results) {
      const record = records.find(record => record._id === result.catalogRecordId)!;
      await ctx.db.patch(record._id, {
        lastAttemptAt: startedAt, lastErrorCode: result.errorCode,
        ...(!result.errorCode ? { lastSuccessfulCheckAt: startedAt } : {}),
      });
      if (result.errorCode) continue;
      for (const item of result.observations) {
        const branch = await ctx.db.get(item.branchId);
        if (!branch || branch.librarySystemId !== record.librarySystemId) throw new Error('Inconsistent observation branch');
        const old = await ctx.db.query('availability').withIndex('by_record_branch', q =>
          q.eq('catalogRecordId', record._id).eq('branchId', branch._id)).unique();
        const known: 'available' | 'unavailable' | null = item.status === 'available' ? 'available' : item.status === 'unavailable' || item.status === 'not-held' ? 'unavailable' : null;
        const fields = { ...item, catalogRecordId: record._id, checkedAt: startedAt,
          ...(known ? { lastKnownStatus: known, lastKnownAt: startedAt } : {}),
        };
        if (old) await ctx.db.patch(old._id, fields);
        else await ctx.db.insert('availability', fields);
      }
    }
    await ctx.db.patch(bookId, { lastCheckAt: startedAt, checkLeaseExpiresAt: undefined, checkPending: false });
    const observedBranches = new Set(results.filter(result => !result.errorCode).flatMap(result => result.observations.map(item => item.branchId)));
    for (const branchId of observedBranches) {
      const status = await currentStatus(ctx, bookId, branchId);
      const event = await currentEvent(ctx, bookId, branchId);
      if (status === 'available' && (!event || event.endedAt !== undefined)) {
        await ctx.db.insert('availabilityEvents', { bookId, branchId, startedAt });
      } else if (status === 'unavailable' && event && event.endedAt === undefined) {
        await ctx.db.patch(event._id, { endedAt: startedAt });
      }
    }
    await ctx.scheduler.runAfter(0, internal.monitoring.reconcileBook, { bookId, paginationOpts: { numItems: 20, cursor: null } });
    if (book.checkPending) await requestCheck(ctx, bookId);
  },
});

export const reconcileBook = internalMutation({
  args: { bookId: v.id('books'), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { bookId, paginationOpts }) => {
    const page = await ctx.db.query('subscriptions').withIndex('by_book_branch_enabled', q => q.eq('bookId', bookId)).paginate(paginationOpts);
    for (const subscription of page.page) await reconcileSubscription(ctx, subscription);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.monitoring.reconcileBook, {
      bookId, paginationOpts: { numItems: 20, cursor: page.continueCursor },
    });
  },
});

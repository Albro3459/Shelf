import { ConvexError, v } from 'convex/values';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { activeUserId, requireActiveUserId, requireOwnedList } from './access';
import { MAX_SUBSCRIPTIONS } from './notificationModel';
import type { BookAlertOptions, SavedAlert } from './notificationModel';
import { currentStatus, reconcileSubscription, requestCheck } from './notificationState';
import { createEbrplClient } from '../src/client.js';
import { cleanCatalogText } from '../src/catalog-text.js';

async function requireSavedBook(ctx: QueryCtx, listId: Id<'lists'>, bookId: Id<'books'>) {
  const list = await requireOwnedList(ctx, listId);
  const item = await ctx.db.query('listItems').withIndex('by_list_book', q => q.eq('listId', listId).eq('bookId', bookId)).unique();
  if (!item) throw new ConvexError('Save this book to your list before choosing alerts.');
  return list.userId;
}

export const sources = internalQuery({
  args: { listId: v.id('lists'), bookId: v.id('books') },
  handler: async (ctx, { listId, bookId }) => {
    await requireSavedBook(ctx, listId, bookId);
    const records = await ctx.db.query('catalogRecords').withIndex('by_book_system', q => q.eq('bookId', bookId)).collect();
    const systems = await Promise.all([...new Set(records.map(record => record.librarySystemId))].map(id => ctx.db.get(id)));
    return systems.filter(system => system?.isEnabled).filter(system => system !== null);
  },
});

export const syncBranches = internalMutation({
  args: { systemId: v.id('librarySystems'), branches: v.array(v.object({ code: v.string(), name: v.string() })) },
  handler: async (ctx, { systemId, branches }) => {
    const system = await ctx.db.get(systemId);
    if (!system?.isEnabled || !branches.length || branches.length > 100) throw new Error('Invalid branch directory');
    for (const branch of branches) {
      const existing = await ctx.db.query('branches').withIndex('by_system_branch', q =>
        q.eq('librarySystemId', systemId).eq('externalId', branch.code)).unique();
      if (existing) await ctx.db.patch(existing._id, { name: branch.name });
      else await ctx.db.insert('branches', { librarySystemId: systemId, externalId: branch.code, name: branch.name, isEnabled: true });
    }
  },
});

export const prepare = action({
  args: { listId: v.id('lists'), bookId: v.id('books') },
  handler: async (ctx, args): Promise<void> => {
    const systems = await ctx.runQuery(internal.alerts.sources, args);
    try {
      for (const system of systems) {
        const branches = await createEbrplClient({ urls: system.config }).getBranches();
        await ctx.runMutation(internal.alerts.syncBranches, { systemId: system._id, branches });
      }
    } catch {
      throw new ConvexError('Could not load library branches. Please try again.');
    }
  },
});

export const options = query({
  args: { listId: v.id('lists'), bookId: v.id('books') },
  handler: async (ctx, { listId, bookId }): Promise<BookAlertOptions | null> => {
    const userId = await activeUserId(ctx);
    const list = await ctx.db.get(listId);
    if (!userId || list?.userId !== userId) return null;
    const item = await ctx.db.query('listItems').withIndex('by_list_book', q => q.eq('listId', listId).eq('bookId', bookId)).unique();
    if (!item) return null;
    const user = await ctx.db.get(userId);
    const records = await ctx.db.query('catalogRecords').withIndex('by_book_system', q => q.eq('bookId', bookId)).collect();
    const selected = await ctx.db.query('subscriptions').withIndex('by_user_book_branch', q =>
      q.eq('userId', userId).eq('bookId', bookId)).collect();
    const branches = [];
    for (const systemId of new Set(records.map(record => record.librarySystemId))) {
      const system = await ctx.db.get(systemId);
      if (!system?.isEnabled) continue;
      const locations = await ctx.db.query('branches').withIndex('by_system_branch', q => q.eq('librarySystemId', systemId)).collect();
      for (const branch of locations.filter(branch => branch.isEnabled)) {
        branches.push({ _id: branch._id, name: branch.name, isSelected: selected.some(sub => sub.branchId === branch._id && sub.isEnabled) });
      }
    }
    return { branches: branches.sort((a, b) => a.name.localeCompare(b.name)), emailEnabled: user?.emailNotificationsEnabled === true };
  },
});

export const save = mutation({
  args: { listId: v.id('lists'), bookId: v.id('books'), branchIds: v.array(v.id('branches')) },
  handler: async (ctx, { listId, bookId, branchIds }) => {
    const userId = await requireSavedBook(ctx, listId, bookId);
    const ids = [...new Set(branchIds)];
    if (ids.length > MAX_SUBSCRIPTIONS) throw new ConvexError('Choose fewer branches.');
    const records = await ctx.db.query('catalogRecords').withIndex('by_book_system', q => q.eq('bookId', bookId)).collect();
    const systemIds = new Set(records.map(record => record.librarySystemId));
    for (const id of ids) {
      const branch = await ctx.db.get(id);
      const system = branch && await ctx.db.get(branch.librarySystemId);
      if (!branch?.isEnabled || !system?.isEnabled || !systemIds.has(branch.librarySystemId)) {
        throw new ConvexError('One of these branches is not available for this book.');
      }
    }
    const all = await ctx.db.query('subscriptions').withIndex('by_user_book_branch', q => q.eq('userId', userId)).take(MAX_SUBSCRIPTIONS + 1);
    const existing = all.filter(sub => sub.bookId === bookId);
    const added = ids.filter(id => !existing.some(sub => sub.branchId === id));
    if (all.length + added.length > MAX_SUBSCRIPTIONS) throw new ConvexError(`You can save up to ${MAX_SUBSCRIPTIONS} book and branch alert choices.`);
    for (const sub of existing) {
      const isEnabled = ids.includes(sub.branchId);
      await ctx.db.patch(sub._id, { isEnabled, updatedAt: Date.now() });
      await reconcileSubscription(ctx, { ...sub, isEnabled });
    }
    for (const branchId of added) {
      const id = await ctx.db.insert('subscriptions', { userId, bookId, branchId, isEnabled: true, updatedAt: Date.now() });
      const sub = await ctx.db.get(id);
      if (sub) await reconcileSubscription(ctx, sub);
    }
    if (ids.length && (await ctx.db.get(userId))?.emailNotificationsEnabled) await requestCheck(ctx, bookId);
  },
});

export const mine = query({
  args: {},
  handler: async (ctx): Promise<SavedAlert[]> => {
    const userId = await activeUserId(ctx);
    if (!userId) return [];
    const subs = await ctx.db.query('subscriptions').withIndex('by_user_book_branch', q => q.eq('userId', userId)).take(MAX_SUBSCRIPTIONS);
    const alerts = [];
    for (const sub of subs.filter(sub => sub.isEnabled)) {
      const book = await ctx.db.get(sub.bookId);
      const branch = await ctx.db.get(sub.branchId);
      if (book && branch) alerts.push({ _id: sub._id, title: cleanCatalogText(book.title), branchName: branch.name, status: await currentStatus(ctx, sub.bookId, sub.branchId) });
    }
    return alerts;
  },
});

export const disable = mutation({
  args: { subscriptionId: v.id('subscriptions') },
  handler: async (ctx, { subscriptionId }) => {
    const userId = await requireActiveUserId(ctx);
    const sub = await ctx.db.get(subscriptionId);
    if (!sub || sub.userId !== userId) throw new ConvexError('This alert is not available.');
    await ctx.db.patch(sub._id, { isEnabled: false, updatedAt: Date.now() });
    await reconcileSubscription(ctx, { ...sub, isEnabled: false });
  },
});

export const setEmailEnabled = mutation({
  args: { isEnabled: v.boolean() },
  handler: async (ctx, { isEnabled }) => {
    const userId = await requireActiveUserId(ctx);
    const user = await ctx.db.get(userId);
    if (isEnabled && (!user?.email || user.emailVerificationTime == null)) throw new ConvexError('A verified account email is required.');
    await ctx.db.patch(userId, { emailNotificationsEnabled: isEnabled });
    const subs = await ctx.db.query('subscriptions').withIndex('by_user_book_branch', q => q.eq('userId', userId)).take(MAX_SUBSCRIPTIONS);
    for (const sub of subs) await reconcileSubscription(ctx, sub);
    if (isEnabled) for (const bookId of new Set(subs.filter(sub => sub.isEnabled).map(sub => sub.bookId))) await requestCheck(ctx, bookId);
  },
});

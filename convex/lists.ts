import { ConvexError, v } from 'convex/values';
import { internalQuery, mutation, query } from './_generated/server';
import { activeUserId, requireActiveUserId, requireOwnedList } from './access';
import { MAX_LIST_ITEMS, MAX_LIST_NAME, MAX_LISTS } from './listModel';
import type { ListDetail, ListSummary, SavedListItem } from './listModel';
import { normalizeRecordId } from '../src/input.js';

function listName(rawName: string): string {
  const name = rawName.trim();
  if (!name || name.length > MAX_LIST_NAME || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ConvexError(`Use a list name from 1 to ${MAX_LIST_NAME} characters.`);
  }
  return name;
}

export const mine = query({
  args: {},
  handler: async (ctx): Promise<ListSummary[]> => {
    const userId = await activeUserId(ctx);
    if (!userId) return [];
    const lists = await ctx.db.query('lists').withIndex('by_user', q => q.eq('userId', userId)).take(MAX_LISTS);
    return await Promise.all(lists.map(async list => ({
      _id: list._id,
      name: list.name,
      itemCount: (await ctx.db.query('listItems').withIndex('by_list_book', q => q.eq('listId', list._id)).take(MAX_LIST_ITEMS)).length,
    })));
  },
});

export const get = query({
  args: { listId: v.id('lists') },
  handler: async (ctx, { listId }): Promise<ListDetail | null> => {
    const userId = await activeUserId(ctx);
    if (!userId) return null;
    const list = await ctx.db.get(listId);
    if (!list || list.userId !== userId) return null;
    const entries = await ctx.db.query('listItems').withIndex('by_list_book', q => q.eq('listId', listId)).take(MAX_LIST_ITEMS);
    const system = await ctx.db.query('librarySystems').withIndex('by_code', q => q.eq('code', 'ebrpl')).unique();
    const items = await Promise.all(entries.sort((a, b) => b._creationTime - a._creationTime).map(async (entry): Promise<SavedListItem> => {
      const book = await ctx.db.get(entry.bookId);
      if (!book) throw new Error('Saved book is missing');
      const record = system ? await ctx.db.query('catalogRecords').withIndex('by_book_system', q =>
        q.eq('bookId', book._id).eq('librarySystemId', system._id)).first() : null;
      return {
        bookId: book._id, title: book.title, authors: book.authors,
        catalogBook: record && system ? {
          recordId: record.externalId, title: book.title, authors: book.authors, isbns: record.observedIsbns,
          isPhysicalBook: true, documentType: 'Book', materialType: record.physicalFormat ?? null,
          catalogUrl: `${system.config.landingUrl.split('#')[0]}#recordId=${encodeURIComponent(record.externalId)}`,
        } : null,
      };
    }));
    return { _id: list._id, name: list.name, items };
  },
});

export const containingRecord = query({
  args: { recordId: v.string() },
  handler: async (ctx, { recordId }) => {
    const userId = await activeUserId(ctx);
    if (!userId) return [];
    const system = await ctx.db.query('librarySystems').withIndex('by_code', q => q.eq('code', 'ebrpl')).unique();
    if (!system) return [];
    const record = await ctx.db.query('catalogRecords').withIndex('by_system_record', q =>
      q.eq('librarySystemId', system._id).eq('externalId', normalizeRecordId(recordId))).unique();
    if (!record) return [];
    const lists = await ctx.db.query('lists').withIndex('by_user', q => q.eq('userId', userId)).take(MAX_LISTS);
    const matches = await Promise.all(lists.map(async list => {
      const entry = await ctx.db.query('listItems').withIndex('by_list_book', q =>
        q.eq('listId', list._id).eq('bookId', record.bookId)).unique();
      return entry ? list._id : null;
    }));
    return matches.filter(id => id !== null);
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireActiveUserId(ctx);
    const lists = await ctx.db.query('lists').withIndex('by_user', q => q.eq('userId', userId)).take(MAX_LISTS);
    if (lists.length >= MAX_LISTS) throw new ConvexError(`You can create up to ${MAX_LISTS} lists.`);
    return await ctx.db.insert('lists', { userId, name: listName(name), updatedAt: Date.now() });
  },
});

export const rename = mutation({
  args: { listId: v.id('lists'), name: v.string() },
  handler: async (ctx, { listId, name }) => {
    await requireOwnedList(ctx, listId);
    await ctx.db.patch(listId, { name: listName(name), updatedAt: Date.now() });
  },
});

export const removeBook = mutation({
  args: { listId: v.id('lists'), bookId: v.id('books') },
  handler: async (ctx, { listId, bookId }) => {
    await requireOwnedList(ctx, listId);
    const entry = await ctx.db.query('listItems').withIndex('by_list_book', q => q.eq('listId', listId).eq('bookId', bookId)).unique();
    if (entry) {
      await ctx.db.delete(entry._id);
      await ctx.db.patch(listId, { updatedAt: Date.now() });
    }
  },
});

export const remove = mutation({
  args: { listId: v.id('lists') },
  handler: async (ctx, { listId }) => {
    await requireOwnedList(ctx, listId);
    const items = await ctx.db.query('listItems').withIndex('by_list_book', q => q.eq('listId', listId)).take(MAX_LIST_ITEMS);
    for (const item of items) await ctx.db.delete(item._id);
    await ctx.db.delete(listId);
  },
});

export const checkOwnership = internalQuery({
  args: { listId: v.id('lists') },
  handler: async (ctx, { listId }) => {
    await requireOwnedList(ctx, listId);
    return null;
  },
});

import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwnedList } from './access';
import { MAX_LIST_ITEMS } from './listModel';
import { DIRECTORY_URL, LANDING_URL, REQUEST_URL } from '../src/model.js';
import { canonicalIsbn13 } from '../src/isbn.js';

export const saveToList = internalMutation({
  args: {
    listId: v.id('lists'),
    recordId: v.string(),
    title: v.string(),
    authors: v.array(v.string()),
    isbns: v.array(v.string()),
    physicalFormat: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { listId, recordId, title, authors, isbns, physicalFormat }): Promise<Id<'books'>> => {
    await requireOwnedList(ctx, listId);
    let system = await ctx.db.query('librarySystems').withIndex('by_code', q => q.eq('code', 'ebrpl')).unique();
    if (!system) {
      // Bootstrap from the current adapter until its URL configuration moves out of code
      const systemId = await ctx.db.insert('librarySystems', {
        code: 'ebrpl', name: 'East Baton Rouge Parish Library', adapterKey: 'iguana',
        config: { landingUrl: LANDING_URL, searchUrl: REQUEST_URL, directoryUrl: DIRECTORY_URL }, isEnabled: true,
      });
      system = await ctx.db.get(systemId);
    }
    if (!system?.isEnabled) throw new ConvexError('This library system is not available.');
    const record = await ctx.db.query('catalogRecords').withIndex('by_system_record', q =>
      q.eq('librarySystemId', system._id).eq('externalId', recordId)).unique();
    if (record) {
      if (!await ctx.db.get(record.bookId)) throw new Error('Catalog book is missing');
      const entry = await ctx.db.query('listItems').withIndex('by_list_book', q =>
        q.eq('listId', listId).eq('bookId', record.bookId)).unique();
      if (entry) return record.bookId;
    }
    const items = await ctx.db.query('listItems').withIndex('by_list_book', q => q.eq('listId', listId)).take(MAX_LIST_ITEMS);
    if (items.length >= MAX_LIST_ITEMS) throw new ConvexError(`Each list can hold up to ${MAX_LIST_ITEMS} books.`);
    const now = Date.now();
    const bookId = record?.bookId ?? await ctx.db.insert('books', { title, authors, updatedAt: now });
    if (!record) {
      await ctx.db.insert('catalogRecords', {
        bookId, librarySystemId: system._id, externalId: recordId, observedIsbns: isbns,
        ...(physicalFormat ? { physicalFormat } : {}), updatedAt: now,
      });
      for (const isbn13 of new Set(isbns.map(canonicalIsbn13).filter(isbn => isbn !== null))) {
        const owner = await ctx.db.query('bookIsbns').withIndex('by_isbn', q => q.eq('isbn13', isbn13)).unique();
        // Keep conflicting records separate until their edition and language match is confirmed
        if (!owner) await ctx.db.insert('bookIsbns', { bookId, isbn13 });
      }
    }
    await ctx.db.insert('listItems', { listId, bookId });
    await ctx.db.patch(listId, { updatedAt: now });
    return bookId;
  },
});

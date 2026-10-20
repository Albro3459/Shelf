import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,
  users: defineTable({
    ...authTables.users.validator.fields,
    accessStatus: v.optional(v.union(v.literal('pending'), v.literal('active'), v.literal('disabled'))),
    emailNotificationsEnabled: v.optional(v.boolean()),
  }).index('email', ['email']).index('phone', ['phone']),
  lists: defineTable({
    userId: v.id('users'),
    name: v.string(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),
  listItems: defineTable({
    listId: v.id('lists'),
    bookId: v.id('books'),
  }).index('by_list_book', ['listId', 'bookId']).index('by_book', ['bookId']),
  books: defineTable({
    title: v.string(),
    authors: v.array(v.string()),
    language: v.optional(v.string()),
    updatedAt: v.number(),
  }),
  bookIsbns: defineTable({
    bookId: v.id('books'),
    isbn13: v.string(),
  }).index('by_isbn', ['isbn13']).index('by_book', ['bookId']),
  librarySystems: defineTable({
    code: v.string(),
    name: v.string(),
    adapterKey: v.literal('iguana'),
    config: v.object({ landingUrl: v.string(), searchUrl: v.string(), directoryUrl: v.string() }),
    isEnabled: v.boolean(),
  }).index('by_code', ['code']),
  catalogRecords: defineTable({
    bookId: v.id('books'),
    librarySystemId: v.id('librarySystems'),
    externalId: v.string(),
    observedIsbns: v.array(v.string()),
    physicalFormat: v.optional(v.string()),
    updatedAt: v.number(),
    nextCheckAt: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    lastSuccessfulCheckAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
  }).index('by_system_record', ['librarySystemId', 'externalId'])
    .index('by_book_system', ['bookId', 'librarySystemId'])
    .index('by_next_check', ['nextCheckAt']),
});

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
    nextCheckAt: v.optional(v.number()),
    checkStartedAt: v.optional(v.number()),
    checkLeaseExpiresAt: v.optional(v.number()),
    lastCheckAt: v.optional(v.number()),
  }).index('by_next_check', ['nextCheckAt']),
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
  branches: defineTable({
    librarySystemId: v.id('librarySystems'),
    externalId: v.string(),
    name: v.string(),
    isEnabled: v.boolean(),
  }).index('by_system_branch', ['librarySystemId', 'externalId']),
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
  subscriptions: defineTable({
    userId: v.id('users'),
    bookId: v.id('books'),
    branchId: v.id('branches'),
    isEnabled: v.boolean(),
    updatedAt: v.number(),
  }).index('by_user_book_branch', ['userId', 'bookId', 'branchId'])
    .index('by_book_branch_enabled', ['bookId', 'branchId', 'isEnabled']),
  availability: defineTable({
    catalogRecordId: v.id('catalogRecords'),
    branchId: v.id('branches'),
    status: v.union(v.literal('available'), v.literal('unavailable'), v.literal('unknown'), v.literal('not-held')),
    checkedAt: v.number(),
    lastKnownStatus: v.optional(v.union(v.literal('available'), v.literal('unavailable'))),
    lastKnownAt: v.optional(v.number()),
    rawStatuses: v.array(v.string()),
    rawAvailableFlags: v.array(v.string()),
  }).index('by_record_branch', ['catalogRecordId', 'branchId']),
  availabilityEvents: defineTable({
    bookId: v.id('books'),
    branchId: v.id('branches'),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index('by_book_branch_started', ['bookId', 'branchId', 'startedAt']),
  notifications: defineTable({
    userId: v.id('users'),
    subscriptionId: v.id('subscriptions'),
    bookId: v.id('books'),
    branchId: v.id('branches'),
    availabilityEventId: v.id('availabilityEvents'),
    channel: v.literal('email'),
    status: v.union(v.literal('pending'), v.literal('sending'), v.literal('submitted'), v.literal('failed'), v.literal('uncertain'), v.literal('cancelled')),
    attemptCount: v.number(),
    lastAttemptAt: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    providerMessageId: v.optional(v.string()),
    lastErrorCode: v.optional(v.string()),
  }).index('by_recipient_event', ['userId', 'bookId', 'branchId', 'availabilityEventId', 'channel'])
    .index('by_subscription_status', ['subscriptionId', 'status'])
    .index('by_status_next_attempt', ['status', 'nextAttemptAt'])
    .index('by_status_lease', ['status', 'leaseExpiresAt']),
});

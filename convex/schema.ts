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
});

import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { MAX_SUBSCRIPTIONS } from './notificationModel';
import { reconcileSubscription, requestCheck } from './notificationState';

export const current = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.accessStatus === 'disabled') return null;
    return { _id: user._id, name: user.name ?? null, email: user.email ?? null, accessStatus: user.accessStatus ?? 'pending', emailNotificationsEnabled: user.emailNotificationsEnabled === true };
  },
});

export const setAccess = internalMutation({
  args: { userId: v.id('users'), accessStatus: v.union(v.literal('pending'), v.literal('active'), v.literal('disabled')) },
  handler: async (ctx, { userId, accessStatus }) => {
    if (!await ctx.db.get(userId)) throw new ConvexError('Account not found.');
    await ctx.db.patch(userId, { accessStatus });
    const subscriptions = await ctx.db.query('subscriptions').withIndex('by_user_book_branch', q => q.eq('userId', userId)).take(MAX_SUBSCRIPTIONS);
    for (const subscription of subscriptions) await reconcileSubscription(ctx, subscription);
    if (accessStatus === 'active' && (await ctx.db.get(userId))?.emailNotificationsEnabled) {
      for (const bookId of new Set(subscriptions.filter(subscription => subscription.isEnabled).map(subscription => subscription.bookId))) {
        await requestCheck(ctx, bookId);
      }
    }
  },
});

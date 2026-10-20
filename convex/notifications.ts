import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import { MAX_SEND_ATTEMPTS, RETRYABLE_EMAIL_ERRORS, SEND_LEASE_MS } from './notificationModel';
import { currentEvent, currentStatus, eligibleSubscriber } from './notificationState';
import { cleanCatalogText } from '../src/catalog-text.js';

async function eligibleNotification(ctx: QueryCtx, notification: Doc<'notifications'>): Promise<boolean> {
  const sub = await ctx.db.get(notification.subscriptionId);
  if (!sub || sub.userId !== notification.userId || sub.bookId !== notification.bookId || sub.branchId !== notification.branchId ||
    !await eligibleSubscriber(ctx, sub)) return false;
  const event = await currentEvent(ctx, notification.bookId, notification.branchId);
  return event?._id === notification.availabilityEventId && event.endedAt === undefined &&
    await currentStatus(ctx, notification.bookId, notification.branchId) === 'available';
}

export const claim = internalMutation({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, { notificationId }) => {
    const item = await ctx.db.get(notificationId);
    if (!item || !['pending', 'failed'].includes(item.status) || item.nextAttemptAt === undefined || item.nextAttemptAt > Date.now()) return null;
    if (item.attemptCount >= MAX_SEND_ATTEMPTS || (item.status === 'failed' && !RETRYABLE_EMAIL_ERRORS.includes(item.lastErrorCode ?? ''))) return null;
    if (!await eligibleNotification(ctx, item)) {
      await ctx.db.patch(item._id, { ...(item.status === 'pending' ? { status: 'cancelled' as const } : {}), nextAttemptAt: undefined });
      return null;
    }
    const user = await ctx.db.get(item.userId);
    const book = await ctx.db.get(item.bookId);
    const branch = await ctx.db.get(item.branchId);
    if (!user?.email || !book || !branch) return null;
    const system = await ctx.db.get(branch.librarySystemId);
    const records = await ctx.db.query('catalogRecords').withIndex('by_book_system', q =>
      q.eq('bookId', book._id).eq('librarySystemId', branch.librarySystemId)).collect();
    let record = null;
    for (const candidate of records) {
      const observation = await ctx.db.query('availability').withIndex('by_record_branch', q =>
        q.eq('catalogRecordId', candidate._id).eq('branchId', branch._id)).unique();
      if (observation?.status === 'available' && observation.checkedAt === book.lastCheckAt) { record = candidate; break; }
    }
    if (!system || !record) return null;
    const attempt = item.attemptCount + 1;
    await ctx.db.patch(item._id, {
      status: 'sending', attemptCount: attempt, lastAttemptAt: Date.now(),
      leaseExpiresAt: Date.now() + SEND_LEASE_MS, nextAttemptAt: undefined,
    });
    return {
      attempt, recipient: user.email, title: cleanCatalogText(book.title), branchName: branch.name,
      checkedAt: book.lastCheckAt!,
      catalogUrl: `${system.config.landingUrl.split('#')[0]}#recordId=${encodeURIComponent(record.externalId)}`,
    };
  },
});

export const finish = internalMutation({
  args: {
    notificationId: v.id('notifications'), attempt: v.number(),
    result: v.union(
      v.object({ status: v.literal('submitted'), messageId: v.string() }),
      v.object({ status: v.literal('failed'), errorCode: v.string() }),
      v.object({ status: v.literal('uncertain'), errorCode: v.string() }),
    ),
  },
  handler: async (ctx, { notificationId, attempt, result }) => {
    const item = await ctx.db.get(notificationId);
    if (!item || item.status !== 'sending' || item.attemptCount !== attempt) return;
    if (result.status === 'submitted') {
      await ctx.db.patch(item._id, { status: 'submitted', submittedAt: Date.now(), providerMessageId: result.messageId, leaseExpiresAt: undefined, lastErrorCode: undefined });
      return;
    }
    const retry = result.status === 'failed' && RETRYABLE_EMAIL_ERRORS.includes(result.errorCode) && attempt < MAX_SEND_ATTEMPTS && await eligibleNotification(ctx, item);
    const delay = attempt === 1 ? 60000 : 5 * 60000;
    await ctx.db.patch(item._id, {
      status: result.status, lastErrorCode: result.errorCode, leaseExpiresAt: undefined,
      nextAttemptAt: retry ? Date.now() + delay : undefined,
    });
    if (retry) await ctx.scheduler.runAfter(delay, internal.email.send, { notificationId });
  },
});

export const recover = internalMutation({
  args: {},
  handler: async ctx => {
    const now = Date.now();
    const expired = await ctx.db.query('notifications').withIndex('by_status_lease', q =>
      q.eq('status', 'sending').gt('leaseExpiresAt', 0).lte('leaseExpiresAt', now)).take(50);
    for (const item of expired) await ctx.db.patch(item._id, { status: 'uncertain', lastErrorCode: 'worker-lease-expired', leaseExpiresAt: undefined });
    for (const status of ['pending', 'failed'] as const) {
      const due = await ctx.db.query('notifications').withIndex('by_status_next_attempt', q =>
        q.eq('status', status).gt('nextAttemptAt', 0).lte('nextAttemptAt', now)).take(50);
      for (const item of due) await ctx.scheduler.runAfter(0, internal.email.send, { notificationId: item._id });
    }
  },
});

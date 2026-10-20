import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { AvailabilityStatus } from '../src/model.js';
import { CHECK_INTERVAL_MS, FRESHNESS_MS, MAX_RECORDS_PER_BOOK, MAX_SEND_ATTEMPTS, RETRYABLE_EMAIL_ERRORS } from './notificationModel';

export async function currentStatus(ctx: QueryCtx, bookId: Id<'books'>, branchId: Id<'branches'>): Promise<AvailabilityStatus> {
  const book = await ctx.db.get(bookId);
  const branch = await ctx.db.get(branchId);
  if (!book?.lastCheckAt || book.lastCheckAt < Date.now() - FRESHNESS_MS || !branch?.isEnabled) return 'unknown';
  const system = await ctx.db.get(branch.librarySystemId);
  if (!system?.isEnabled) return 'unknown';
  const records = await ctx.db.query('catalogRecords').withIndex('by_book_system', q =>
    q.eq('bookId', bookId).eq('librarySystemId', branch.librarySystemId)).take(MAX_RECORDS_PER_BOOK + 1);
  if (!records.length || records.length > MAX_RECORDS_PER_BOOK) return 'unknown';
  const observations = await Promise.all(records.map(record => ctx.db.query('availability').withIndex('by_record_branch', q =>
    q.eq('catalogRecordId', record._id).eq('branchId', branchId)).unique()));
  const statuses = observations.map(observation => observation && observation.checkedAt === book.lastCheckAt ? observation.status : 'unknown');
  if (statuses.includes('available')) return 'available';
  if (statuses.every(status => status === 'unavailable' || status === 'not-held')) return 'unavailable';
  return 'unknown';
}

export async function eligibleSubscriber(ctx: QueryCtx, subscription: Doc<'subscriptions'>): Promise<boolean> {
  if (!subscription.isEnabled) return false;
  const user = await ctx.db.get(subscription.userId);
  const branch = await ctx.db.get(subscription.branchId);
  const system = branch && await ctx.db.get(branch.librarySystemId);
  return !!(user?.accessStatus === 'active' && user.emailNotificationsEnabled && user.email &&
    user.emailVerificationTime != null && branch?.isEnabled && system?.isEnabled);
}

export async function currentEvent(ctx: QueryCtx, bookId: Id<'books'>, branchId: Id<'branches'>) {
  return await ctx.db.query('availabilityEvents').withIndex('by_book_branch_started', q =>
    q.eq('bookId', bookId).eq('branchId', branchId)).order('desc').first();
}

export async function requestCheck(ctx: MutationCtx, bookId: Id<'books'>): Promise<void> {
  const book = await ctx.db.get(bookId);
  if (!book) return;
  const subs = await ctx.db.query('subscriptions').withIndex('by_book_branch_enabled', q => q.eq('bookId', bookId)).collect();
  let needsCheck = false;
  for (const sub of subs) {
    if (await eligibleSubscriber(ctx, sub) && await currentStatus(ctx, bookId, sub.branchId) === 'unknown') needsCheck = true;
  }
  if (!needsCheck) {
    const now = Date.now();
    await ctx.db.patch(bookId, { nextCheckAt: Math.floor(now / CHECK_INTERVAL_MS) * CHECK_INTERVAL_MS + CHECK_INTERVAL_MS });
    return;
  }
  const delay = Math.max(0, (book.lastCheckAt ?? 0) + 60000 - Date.now());
  await ctx.db.patch(bookId, { nextCheckAt: Date.now() + delay });
  await ctx.scheduler.runAfter(delay, internal.polling.checkBook, { bookId });
}

export async function reconcileSubscription(ctx: MutationCtx, subscription: Doc<'subscriptions'>): Promise<void> {
  const now = Date.now();
  const event = await currentEvent(ctx, subscription.bookId, subscription.branchId);
  const eligible = await eligibleSubscriber(ctx, subscription);
  const available = eligible && event && event.endedAt === undefined &&
    await currentStatus(ctx, subscription.bookId, subscription.branchId) === 'available';
  const pending = await ctx.db.query('notifications').withIndex('by_subscription_status', q =>
    q.eq('subscriptionId', subscription._id).eq('status', 'pending')).collect();
  const failed = await ctx.db.query('notifications').withIndex('by_subscription_status', q =>
    q.eq('subscriptionId', subscription._id).eq('status', 'failed')).collect();
  const previous = [...pending, ...failed];
  for (const notification of previous) {
    if (available && notification.availabilityEventId === event._id) continue;
    if (notification.status === 'pending') await ctx.db.patch(notification._id, { status: 'cancelled', nextAttemptAt: undefined });
    if (notification.status === 'failed' && notification.nextAttemptAt !== undefined) {
      await ctx.db.patch(notification._id, { nextAttemptAt: undefined });
    }
  }
  if (!available) return;
  const existing = await ctx.db.query('notifications').withIndex('by_recipient_event', q =>
    q.eq('userId', subscription.userId).eq('bookId', subscription.bookId).eq('branchId', subscription.branchId)
      .eq('availabilityEventId', event._id).eq('channel', 'email')).unique();
  if (existing) {
    const retry = existing.status === 'failed' && existing.attemptCount < MAX_SEND_ATTEMPTS &&
      RETRYABLE_EMAIL_ERRORS.includes(existing.lastErrorCode ?? '');
    if ((existing.status === 'cancelled' && existing.attemptCount === 0) || (retry && existing.nextAttemptAt === undefined)) {
      await ctx.db.patch(existing._id, { status: retry ? 'failed' : 'pending', nextAttemptAt: now });
      await ctx.scheduler.runAfter(0, internal.email.send, { notificationId: existing._id });
    }
    return;
  }
  const notificationId = await ctx.db.insert('notifications', {
    userId: subscription.userId, subscriptionId: subscription._id,
    bookId: subscription.bookId, branchId: subscription.branchId, availabilityEventId: event._id,
    channel: 'email', status: 'pending', attemptCount: 0, nextAttemptAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.email.send, { notificationId });
}

import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

export async function activeUserId(ctx: QueryCtx): Promise<Id<'users'> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return user?.accessStatus === 'active' ? userId : null;
}

export async function requireActiveUserId(ctx: QueryCtx): Promise<Id<'users'>> {
  const userId = await activeUserId(ctx);
  if (!userId) throw new ConvexError('Sign in with an active account to use lists.');
  return userId;
}

export async function requireOwnedList(ctx: QueryCtx, listId: Id<'lists'>): Promise<Doc<'lists'>> {
  const userId = await requireActiveUserId(ctx);
  const list = await ctx.db.get(listId);
  if (!list || list.userId !== userId) throw new ConvexError('This list is not available.');
  return list;
}

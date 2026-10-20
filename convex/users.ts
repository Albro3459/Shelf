import { getAuthUserId } from '@convex-dev/auth/server';
import { query } from './_generated/server';

export const current = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user || user.accessStatus === 'disabled') return null;
    return { _id: user._id, name: user.name ?? null, email: user.email ?? null };
  },
});

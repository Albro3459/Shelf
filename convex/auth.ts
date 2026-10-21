import Google from '@auth/core/providers/google';
import { convexAuth } from '@convex-dev/auth/server';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google({
    profile(profile) {
      if (!profile.email_verified) throw new Error('Google email must be verified');
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture,
        emailVerified: true,
      };
    },
  })],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId === null) {
        await ctx.db.patch(userId, { accessStatus: 'active', emailNotificationsEnabled: false });
        return;
      }
      const user = await ctx.db.get(userId);
      if (user && (!user.accessStatus || user.accessStatus === 'pending')) {
        await ctx.db.patch(userId, { accessStatus: 'active' });
      }
    },
    async beforeSessionCreation(ctx, { userId }) {
      const user = await ctx.db.get(userId);
      if (!user || user.accessStatus === 'disabled') throw new Error('Account access is disabled');
    },
  },
});

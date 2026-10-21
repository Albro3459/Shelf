import Google from '@auth/core/providers/google';
import { convexAuth } from '@convex-dev/auth/server';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google({
    token: {
      async conform(response: Response) {
        if (!response.ok) {
          const body = await response.clone().json().catch(() => null);
          const errors = ['invalid_grant', 'invalid_client', 'invalid_request', 'unauthorized_client'];
          const error = errors.includes(body?.error) ? body.error : 'unknown';
          const description = typeof body?.error_description === 'string' ? body.error_description.toLowerCase() : '';
          console.warn('Google token exchange failed', {
            status: response.status,
            error,
            reason: description.includes('verifier') ? 'verifier' : description.includes('expired') ? 'expired' : description.includes('redeemed') ? 'reused' : 'unspecified',
          });
        }
        return response;
      },
    },
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

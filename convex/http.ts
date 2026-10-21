import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { httpAction } from './_generated/server';

const http = httpRouter();

auth.addHttpRoutes(http);

const googleSignInPath = '/api/auth/signin/google';
const googleSignIn = http.lookup(googleSignInPath, 'GET');
if (!googleSignIn) throw new Error('Google sign-in route is missing');
const handleGoogleSignIn = (googleSignIn[0] as typeof googleSignIn[0] & {
  _handler: Parameters<typeof httpAction>[0];
})._handler;

// Google returns through a top-level GET, so its cookies can use SameSite=Lax
// Partitioned cookies can be withheld on the first return from Google
http.route({
  path: googleSignInPath,
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const response = await handleGoogleSignIn(ctx, request);
    const headers = new Headers(response.headers);
    headers.delete('Set-Cookie');
    for (const cookie of response.headers.getSetCookie()) {
      if (/;\s*Partitioned\b/i.test(cookie)) {
        headers.append('Set-Cookie', cookie.replace(/;\s*(?:Expires|Max-Age)=[^;]*/gi, '') + '; Max-Age=0');
      }
      headers.append('Set-Cookie', cookie.replace(/;\s*Partitioned\b/gi, '').replace(/;\s*SameSite=None\b/gi, '; SameSite=Lax'));
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }),
});

export default http;

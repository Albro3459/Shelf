import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { env, httpAction } from './_generated/server';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function signInPage(message: string, destination: string, redirect: boolean, headers = new Headers()): Response {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  headers.delete('Location');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
  const script = redirect ? `<script nonce="${nonce}">window.location.replace(${JSON.stringify(destination).replace(/</g, '\\u003c')})</script>` : '';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Shelf</title><style nonce="${nonce}">body{font-family:system-ui,sans-serif;background:#f5f1e8;color:#2e4535;max-width:32rem;margin:15vh auto;padding:2rem}a{color:inherit}</style></head><body><h1>${escapeHtml(message)}</h1><p><a href="${escapeHtml(destination)}">${redirect ? 'Continue' : 'Return to Shelf'}</a></p>${script}</body></html>`, { headers });
}

function failedSignIn(): Response {
  const siteUrl = (env as typeof env & { SITE_URL?: string }).SITE_URL;
  if (!siteUrl) throw new Error('Set SITE_URL for sign-in redirects');
  return signInPage('Google sign-in could not finish. Please start again from Shelf.', siteUrl, false);
}

const http = httpRouter();

auth.addHttpRoutes(http);

const googleSignInPath = '/api/auth/signin/google';
const googleSignIn = http.lookup(googleSignInPath, 'GET');
if (!googleSignIn) throw new Error('Google sign-in route is missing');
const handleGoogleSignIn = (googleSignIn[0] as typeof googleSignIn[0] & {
  _handler: Parameters<typeof httpAction>[0];
})._handler;

// Commit a first-party page before leaving for Google so its cookies are available on return
http.route({
  path: googleSignInPath,
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const response = await handleGoogleSignIn(ctx, request);
    const location = response.headers.get('Location');
    if (response.status !== 302 || !location) return response;
    const headers = new Headers(response.headers);
    headers.delete('Set-Cookie');
    for (const cookie of response.headers.getSetCookie()) {
      if (/;\s*Partitioned\b/i.test(cookie)) {
        headers.append('Set-Cookie', cookie.replace(/;\s*(?:Expires|Max-Age)=[^;]*/gi, '') + '; Max-Age=0');
      }
      headers.append('Set-Cookie', cookie.replace(/;\s*Partitioned\b/gi, '').replace(/;\s*SameSite=None\b/gi, '; SameSite=Lax'));
    }
    return signInPage('Continuing to Google…', location, true, headers);
  }),
});

const googleCallbackPath = '/api/auth/callback/google';
const googleCallback = http.lookup(googleCallbackPath, 'GET');
if (!googleCallback) throw new Error('Google callback route is missing');
const handleGoogleCallback = (googleCallback[0] as typeof googleCallback[0] & {
  _handler: Parameters<typeof httpAction>[0];
})._handler;

http.route({
  path: googleCallbackPath,
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const retried = url.searchParams.has('shelfRetry');
    const cookieName = /(localhost|127\.0\.0\.1):\d+/.test(env.CONVEX_SITE_URL) ? 'googleOAuthpkce' : '__Host-googleOAuthpkce';
    const cookies = (request.headers.get('Cookie') ?? '').split(';').map(cookie => cookie.trim());
    const pkceCookie = cookies.find(cookie => cookie.startsWith(`${cookieName}=`));
    const hasVerifier = !!pkceCookie?.slice(cookieName.length + 1);
    if (code && !hasVerifier) {
      if (retried) {
        console.warn('Google callback has no verifier after same-origin retry');
        return failedSignIn();
      }
      // A new document navigation can resend an existing cookie withheld on the cross-site return
      console.info('Google callback retrying in the same origin');
      url.searchParams.set('shelfRetry', '1');
      return signInPage('Finishing your sign-in…', url.toString(), true);
    }
    url.searchParams.delete('shelfRetry');
    const digest = code && await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
    const codeId = digest ? Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
    const response = await handleGoogleCallback(ctx, new Request(url, { method: request.method, headers: request.headers }));
    const location = response.headers.get('Location');
    const signedIn = location !== null && new URL(location).searchParams.has('code');
    console.info('Google callback result', {
      codeId,
      retried,
      pkceCookieCount: cookies.filter(cookie => cookie.startsWith(`${cookieName}=`)).length,
      site: request.headers.get('Sec-Fetch-Site'),
      mode: request.headers.get('Sec-Fetch-Mode'),
      destination: request.headers.get('Sec-Fetch-Dest'),
      purpose: request.headers.get('Sec-Purpose') ?? request.headers.get('Purpose'),
      signedIn,
    });
    if (response.status === 302 && !signedIn) return failedSignIn();
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }),
});

export default http;

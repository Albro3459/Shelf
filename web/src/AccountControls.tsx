import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

function GoogleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.58-4.13H3.08v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.42 13.91a6 6 0 0 1 0-3.82V7.5H3.08a10 10 0 0 0 0 9l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.92 5.5l3.34 2.59A5.9 5.9 0 0 1 12 5.96Z"/></svg>;
}

export function AccountControls() {
  const { signIn, signOut } = useAuthActions();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  async function updateSession() {
    setIsBusy(true);
    setError('');
    try {
      if (isAuthenticated) await signOut();
      else await signIn('google', { redirectTo: window.location.href });
    } catch {
      setError(isAuthenticated ? 'Could not sign out. Please try again.' : 'Could not start Google sign-in. Please try again.');
    } finally {
      setIsBusy(false);
    }
  }

  const isWaiting = isLoading || (isAuthenticated && user === undefined);
  return <div className="account-controls">
    {isAuthenticated && user && <span className="account-name" title={user.email ?? undefined}>{user.name || user.email || 'Signed in'}</span>}
    <button className="account-button" onClick={() => void updateSession()} disabled={isWaiting || isBusy}>
      {isWaiting || isBusy ? <span className="spinner"/> : !isAuthenticated && <GoogleIcon/>}
      {isWaiting ? 'Loading account…' : isBusy ? (isAuthenticated ? 'Signing out…' : 'Opening Google…') : isAuthenticated ? 'Sign out' : 'Sign in with Google'}
    </button>
    {error && <p className="account-error" role="alert">{error}</p>}
  </div>;
}

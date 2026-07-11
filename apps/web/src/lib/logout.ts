'use client';

import { getSession, signOut } from 'next-auth/react';

/**
 * Perform a server-side logout before clearing the NextAuth session.
 *
 * 1. Reads the refresh token from the current session
 * 2. Calls the backend to revoke the token (best-effort — does not block)
 * 3. Clears the NextAuth browser session
 *
 * The backend request is deliberately fire-and-forget so that a flaky network
 * never prevents the user from signing out locally.
 */
let signingOut = false;

export async function handleSignOut(): Promise<void> {
  if (signingOut) return;
  signingOut = true;

  try {
    const session = await getSession();
    const refreshToken = (session as { refreshToken?: string } | null)?.refreshToken;

    if (refreshToken) {
      try {
        await fetch('/api/proxy/api/v1/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Best-effort — backend may be unreachable; still sign out locally.
      }
    }
  } catch {
    // Best-effort — session read may fail; still sign out locally.
  }

  await signOut({ callbackUrl: '/login' });
  signingOut = false;
}

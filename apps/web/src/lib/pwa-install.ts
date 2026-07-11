/**
 * PWA install prompt persistence.
 *
 * The browser's `beforeinstallprompt` event can fire on every page load —
 * the prompt can re-appear after every navigation/refresh unless we
 * remember the user's decision. We persist three orthogonal signals,
 * scoped to match their lifetimes:
 *
 *   - `fieldconnect_installed`     — set on `appinstalled`. Stored in
 *                                    localStorage. Stays forever — once
 *                                    installed, never prompt again.
 *   - `fieldconnect_install_dismissed` — set when the user clicks X.
 *                                    Stored in sessionStorage. Cleared
 *                                    when the tab/window closes so the
 *                                    prompt can re-appear in future
 *                                    sessions if the app isn't installed.
 *   - `fieldconnect_install_seen`  — set the first time the banner is
 *                                    shown in a session. Stored in
 *                                    sessionStorage so subsequent page
 *                                    navigations/refreshes within the
 *                                    same session don't re-fire the
 *                                    banner.
 *
 * All keys are namespaced with `fieldconnect_` to avoid colliding with
 * anything else stored in the browser.
 */

const KEY_INSTALLED = 'fieldconnect_installed';
const KEY_DISMISSED = 'fieldconnect_install_dismissed';
const KEY_SEEN = 'fieldconnect_install_seen';

/** sessionStorage-backed flag — clears when the tab/window closes. */
function safeSessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore — persistence is best-effort.
  }
}

function safeSessionRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/** localStorage-backed flag — survives across sessions. */
function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // localStorage can throw in private mode or when storage is disabled.
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore — persistence is best-effort.
  }
}

/**
 * Returns true if the app is currently running as an installed PWA.
 * Covers Android/desktop Chrome (`display-mode: standalone`) and
 * iOS Safari (`navigator.standalone`).
 */
export function isRunningInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneDisplay = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone =
    // iOS Safari exposes this only on the navigator object of an installed app.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(standaloneDisplay || iosStandalone);
}

/** Has the user dismissed the prompt in this session? */
export function isInstallDismissed(): boolean {
  return safeSessionGet(KEY_DISMISSED) === 'true';
}

/** Has the app been installed (recorded by us, not the OS)? */
export function isInstallCompleted(): boolean {
  return safeGet(KEY_INSTALLED) === 'true';
}

/** Have we already shown the banner once in this session? */
export function hasSeenInstallPrompt(): boolean {
  return safeSessionGet(KEY_SEEN) === 'true';
}

/**
 * Should the banner be shown at all? Combines all the suppression signals.
 * Use this once on mount to decide whether to attach the prompt listener.
 */
export function shouldShowInstallBanner(): boolean {
  if (isRunningInstalled()) return false;
  if (isInstallCompleted()) return false;
  if (isInstallDismissed()) return false;
  if (hasSeenInstallPrompt()) return false;
  return true;
}

/** Mark the banner as having been shown in this session. */
export function markInstallPromptSeen(): void {
  safeSessionSet(KEY_SEEN, 'true');
}

/**
 * Mark the banner as dismissed by the user for the rest of this session.
 * Stored in sessionStorage so the prompt can re-appear in a future session
 * if the app isn't installed.
 */
export function markInstallDismissed(): void {
  safeSessionSet(KEY_DISMISSED, 'true');
}

/** Mark the app as installed (call on `appinstalled` event). */
export function markInstallCompleted(): void {
  safeSet(KEY_INSTALLED, 'true');
}

/** Clear the session-scoped suppression flags. Exposed for tests/debugging. */
export function _resetSessionInstallState(): void {
  safeSessionRemove(KEY_SEEN);
  safeSessionRemove(KEY_DISMISSED);
}

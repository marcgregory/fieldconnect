/**
 * PWA install prompt persistence.
 *
 * The browser's `beforeinstallprompt` event can fire on every page load —
 * the prompt can re-appear after every refresh unless we remember the
 * user's decision. We persist three orthogonal signals in localStorage:
 *
 *   - `fieldconnect_installed`     — set on `appinstalled`. Stays forever.
 *   - `fieldconnect_install_dismissed` — set when the user clicks X. Stays forever.
 *   - `fieldconnect_install_seen`  — set the first time the banner is shown
 *                                    in a session. Read on mount to enforce
 *                                    "show at most once per browser".
 *
 * All keys are namespaced with `fieldconnect_` to avoid colliding with
 * anything else stored in localStorage.
 */

const KEY_INSTALLED = 'fieldconnect_installed';
const KEY_DISMISSED = 'fieldconnect_install_dismissed';
const KEY_SEEN = 'fieldconnect_install_seen';

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

/** Has the user permanently dismissed the prompt? */
export function isInstallDismissed(): boolean {
  return safeGet(KEY_DISMISSED) === 'true';
}

/** Has the app been installed (recorded by us, not the OS)? */
export function isInstallCompleted(): boolean {
  return safeGet(KEY_INSTALLED) === 'true';
}

/** Have we already shown the banner once in this browser? */
export function hasSeenInstallPrompt(): boolean {
  return safeGet(KEY_SEEN) === 'true';
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

/** Mark the banner as having been shown in this browser. */
export function markInstallPromptSeen(): void {
  safeSet(KEY_SEEN, 'true');
}

/** Mark the banner as permanently dismissed by the user. */
export function markInstallDismissed(): void {
  safeSet(KEY_DISMISSED, 'true');
}

/** Mark the app as installed (call on `appinstalled` event). */
export function markInstallCompleted(): void {
  safeSet(KEY_INSTALLED, 'true');
}

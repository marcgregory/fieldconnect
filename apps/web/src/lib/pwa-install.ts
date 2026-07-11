/**
 * PWA install prompt persistence.
 *
 * The browser's `beforeinstallprompt` event can fire on every page load.
 * We persist two orthogonal signals, scoped to the correct lifetime:
 *
 *   - `fieldconnect_installed`     — set on `appinstalled`. Stored in
 *                                    localStorage. Stays forever — once
 *                                    installed, never prompt again.
 *   - `fieldconnect_install_dismissed` — set when the user clicks X.
 *                                    Stored in sessionStorage. Cleared
 *                                    when the tab/browser closes so the
 *                                    prompt can re-appear in a future
 *                                    session.
 *
 * Rules:
 *   - Show at most once per browser session.
 *   - When dismissed, do not show again during that session.
 *   - Refresh/navigation must not bring it back.
 *   - A new browser session may show it again.
 *   - If already installed (standalone mode), never show it.
 */

const KEY_INSTALLED = 'fieldconnect_installed';
const KEY_DISMISSED = 'fieldconnect_install_dismissed';

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
function safeLocalGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore.
  }
}

/**
 * Returns true if the app is currently running as an installed PWA
 * (standalone display mode). Covers Chrome, Android, and iOS Safari.
 */
export function isRunningInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneDisplay = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(standaloneDisplay || iosStandalone);
}

/** Has the user dismissed the prompt in this browser session? */
export function isInstallDismissed(): boolean {
  return safeSessionGet(KEY_DISMISSED) === 'true';
}

/** Has the app been installed (recorded by us, not the OS)? */
export function isInstallCompleted(): boolean {
  return safeLocalGet(KEY_INSTALLED) === 'true';
}

/**
 * Mark the banner as dismissed for the rest of this browser session.
 * Stored in sessionStorage so it survives refresh/navigation but is
 * cleared when the tab or browser closes.
 */
export function markInstallDismissed(): void {
  safeSessionSet(KEY_DISMISSED, 'true');
}

/** Mark the app as installed (call on `appinstalled` event). */
export function markInstallCompleted(): void {
  safeLocalSet(KEY_INSTALLED, 'true');
}

/** Clear all suppress flags. Exposed for testing / debugging. */
export function _resetInstallState(): void {
  safeSessionRemove(KEY_DISMISSED);
  safeLocalSet(KEY_INSTALLED, '');
}

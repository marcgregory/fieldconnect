/**
 * Email service configuration.
 *
 * Strategy:
 * - `EMAIL_PROVIDER` is validated at startup (unknown values fail boot).
 * - The provider instance is created lazily — first call to `getEmailService()`.
 * - Resend-specific env (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`) is only
 *   read when Resend is actually used. Missing values yield a descriptive
 *   error at send time, not a silent boot failure.
 * - In dev/test, default `EMAIL_PROVIDER` to `preview`.
 * - In production, refuse to boot in `preview` mode (it's a dev convenience).
 */

import type { EmailProvider, EmailProviderName } from './provider';
import { ResendProvider } from './resend-provider';
import { PreviewProvider } from './preview-provider';

export const VALID_PROVIDERS: EmailProviderName[] = ['resend', 'preview', 'console'];

/** Throws if `EMAIL_PROVIDER` is set to an unknown value. Call once at boot. */
export function assertEmailConfigValid(): void {
  const raw = process.env.EMAIL_PROVIDER;
  if (raw === undefined || raw === '') {
    // Missing is fine — dev default kicks in below when getEmailService() is called.
    return;
  }
  if (!VALID_PROVIDERS.includes(raw as EmailProviderName)) {
    throw new Error(
      `Invalid EMAIL_PROVIDER "${raw}". Must be one of: ${VALID_PROVIDERS.join(', ')}.`,
    );
  }
  if (process.env.NODE_ENV === 'production' && raw === 'preview') {
    throw new Error(
      'EMAIL_PROVIDER=preview is not allowed in production. Use "resend" or "console".',
    );
  }
}

function resolveProviderName(): EmailProviderName {
  const raw = process.env.EMAIL_PROVIDER;
  if (raw === undefined || raw === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'EMAIL_PROVIDER is required in production. Set it to "resend" or "console".',
      );
    }
    return 'preview';
  }
  return raw as EmailProviderName;
}

let cached: EmailProvider | null = null;

/** Returns the configured email provider, creating it on first call. */
export function getEmailService(): EmailProvider {
  if (cached) return cached;
  assertEmailConfigValid();
  const name = resolveProviderName();
  switch (name) {
    case 'resend':
      cached = new ResendProvider();
      break;
    case 'console':
    case 'preview':
      cached = new PreviewProvider({ writeFiles: name === 'preview' });
      break;
  }
  return cached;
}

export interface EmailServiceStatus {
  provider: EmailProviderName;
  configured: boolean;
  previewMode: boolean;
}

/**
 * Internal status helper. Exposes configuration state without leaking
 * secret values. Safe to log at boot.
 */
export function getEmailServiceStatus(): EmailServiceStatus {
  const name = resolveProviderName();
  const configured =
    name === 'resend'
      ? Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_URL)
      : true;
  return {
    provider: name,
    configured,
    previewMode: name === 'preview' || name === 'console',
  };
}

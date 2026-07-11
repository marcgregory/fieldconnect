/**
 * Inline HTML + plain-text email templates.
 *
 * Every template:
 * - Returns `{ subject, html, text }` so call sites stay string-free.
 * - Receives a fully-built URL (`verifyUrl`, `resetUrl`, etc.) — it does not
 *   know about `APP_URL` or query-string building. That keeps templates
 *   pure and easy to test.
 * - Shares a single visual layout via `wrap()`.
 *
 * Plain-text version is a stripped, human-readable rendering — no Markdown,
 * no HTML, no extra tooling.
 */

import type { EmailMessage, EmailCategory } from './provider';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface VerifyEmailProps {
  name: string;
  verifyUrl: string;
}

export interface PasswordResetProps {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface InvitationProps {
  name: string;
  invitedBy: string;
  acceptUrl: string;
  role: string;
}

export interface WelcomeProps {
  name: string;
  loginUrl: string;
}

export interface PasswordChangedProps {
  name: string;
  loginUrl: string;
}

// ─── Shared layout ────────────────────────────────────────────────────────

const BRAND = 'FieldConnect';
const BRAND_COLOR = '#0F4C81'; // matches office dashboard primary

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrap(bodyHtml: string, previewText: string): string {
  // previewText is hidden, shown in inbox preview
  const safePreview = escapeHtml(previewText);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(BRAND)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <span style="display:none;font-size:1px;color:#f4f6f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safePreview}</span>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f6f8;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
            <tr>
              <td style="background-color:${BRAND_COLOR};padding:24px 32px;color:#ffffff;font-size:20px;font-weight:600;letter-spacing:-0.01em;">
                ${escapeHtml(BRAND)}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:16px;line-height:1.55;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;border-top:1px solid #eef0f3;font-size:13px;color:#6b7280;line-height:1.5;">
                You received this email because you have a ${escapeHtml(BRAND)} account. If you didn't request this, you can safely ignore it.
              </td>
            </tr>
          </table>
          <div style="font-size:12px;color:#9ca3af;margin-top:16px;">
            &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND)}
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" style="background-color:${BRAND_COLOR};border-radius:6px;">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>
  <div style="font-size:13px;color:#6b7280;word-break:break-all;">
    Or paste this link into your browser:<br />
    <a href="${escapeHtml(url)}" style="color:${BRAND_COLOR};">${escapeHtml(url)}</a>
  </div>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 16px 0;">${escapeHtml(text)}</p>`;
}

// ─── Templates ────────────────────────────────────────────────────────────

export function renderVerifyEmail(props: VerifyEmailProps): RenderedEmail {
  const greeting = props.name ? `Hi ${props.name},` : 'Hi,';
  const body = [
    para(`${greeting} thanks for signing up for ${BRAND}. Please confirm your email address to finish setting up your account.`),
    ctaButton(props.verifyUrl, 'Verify my email'),
    para("This link expires in 24 hours. If you didn't create a FieldConnect account, you can ignore this email."),
  ].join('\n');

  return {
    subject: 'Verify your FieldConnect email',
    html: wrap(body, 'Verify your FieldConnect email to finish setting up your account.'),
    text:
      `${greeting}\n\n` +
      `Thanks for signing up for ${BRAND}. Please confirm your email address to finish setting up your account.\n\n` +
      `Verify your email: ${props.verifyUrl}\n\n` +
      `This link expires in 24 hours. If you didn't create a ${BRAND} account, you can ignore this email.`,
  };
}

export function renderPasswordReset(props: PasswordResetProps): RenderedEmail {
  const greeting = props.name ? `Hi ${props.name},` : 'Hi,';
  const body = [
    para(`${greeting} we received a request to reset your ${BRAND} password. Use the button below to choose a new one.`),
    ctaButton(props.resetUrl, 'Reset my password'),
    para(`This link expires in ${props.expiresInMinutes} minutes. If you didn't request a password reset, you can safely ignore this email — your password will stay the same.`),
  ].join('\n');

  return {
    subject: 'Reset your FieldConnect password',
    html: wrap(body, 'Reset your FieldConnect password.'),
    text:
      `${greeting}\n\n` +
      `We received a request to reset your ${BRAND} password. Use the link below to choose a new one.\n\n` +
      `Reset your password: ${props.resetUrl}\n\n` +
      `This link expires in ${props.expiresInMinutes} minutes. If you didn't request a password reset, you can safely ignore this email — your password will stay the same.`,
  };
}

export function renderInvitation(props: InvitationProps): RenderedEmail {
  const greeting = props.name ? `Hi ${props.name},` : 'Hi,';
  const body = [
    para(`${greeting} ${props.invitedBy} has invited you to join ${BRAND} as a ${props.role}.`),
    ctaButton(props.acceptUrl, 'Accept invitation'),
    para("If you weren't expecting this invitation, you can ignore this email."),
  ].join('\n');

  return {
    subject: "You've been invited to FieldConnect",
    html: wrap(body, `${props.invitedBy} invited you to join FieldConnect.`),
    text:
      `${greeting}\n\n` +
      `${props.invitedBy} has invited you to join ${BRAND} as a ${props.role}.\n\n` +
      `Accept the invitation: ${props.acceptUrl}\n\n` +
      `If you weren't expecting this invitation, you can ignore this email.`,
  };
}

export function renderWelcome(props: WelcomeProps): RenderedEmail {
  const greeting = props.name ? `Hi ${props.name},` : 'Hi,';
  const body = [
    para(`${greeting} welcome to ${BRAND}! Your account is ready to go.`),
    ctaButton(props.loginUrl, 'Go to FieldConnect'),
    para("If you have any questions, reach out to your project manager and we'll get you sorted."),
  ].join('\n');

  return {
    subject: 'Welcome to FieldConnect',
    html: wrap(body, 'Welcome to FieldConnect — your account is ready.'),
    text:
      `${greeting}\n\n` +
      `Welcome to ${BRAND}! Your account is ready to go.\n\n` +
      `Open FieldConnect: ${props.loginUrl}\n\n` +
      `If you have any questions, reach out to your project manager and we'll get you sorted.`,
  };
}

export function renderPasswordChanged(props: PasswordChangedProps): RenderedEmail {
  const greeting = props.name ? `Hi ${props.name},` : 'Hi,';
  const body = [
    para(`${greeting} the password for your ${BRAND} account was successfully changed.`),
    para("If this wasn't you, please contact your project manager immediately — someone else may have accessed your account."),
    ctaButton(props.loginUrl, 'Go to FieldConnect'),
  ].join('\n');

  return {
    subject: 'Your FieldConnect password was changed',
    html: wrap(body, 'Your FieldConnect password was changed.'),
    text:
      `${greeting}\n\n` +
      `The password for your ${BRAND} account was successfully changed.\n\n` +
      `If this wasn't you, please contact your project manager immediately — someone else may have accessed your account.\n\n` +
      `Open FieldConnect: ${props.loginUrl}`,
  };
}

// ─── Render → EmailMessage helper ─────────────────────────────────────────

/**
 * Render a template and return a fully-formed `EmailMessage` ready for the
 * provider. Centralizes the mapping from { template + props } to message.
 */
export function renderTemplate(
  category: EmailCategory,
  props: VerifyEmailProps | PasswordResetProps | PasswordChangedProps | InvitationProps | WelcomeProps,
): EmailMessage {
  let rendered: RenderedEmail;
  switch (category) {
    case 'verify-email':
      rendered = renderVerifyEmail(props as VerifyEmailProps);
      break;
    case 'password-reset':
      rendered = renderPasswordReset(props as PasswordResetProps);
      break;
    case 'invitation':
      rendered = renderInvitation(props as InvitationProps);
      break;
    case 'welcome':
      rendered = renderWelcome(props as WelcomeProps);
      break;
    case 'password-changed':
      rendered = renderPasswordChanged(props as PasswordChangedProps);
      break;
  }

  return {
    to: '', // Callers must set `to` before sending (kept empty here so the helper is generic).
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    category,
  };
}

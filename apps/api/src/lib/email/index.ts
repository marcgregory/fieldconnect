/**
 * Email module — public surface.
 *
 * Callers (future verification/reset routes) only import from this file.
 * Internal implementation lives in sibling modules.
 */

export type {
  EmailMessage,
  EmailProvider,
  EmailProviderName,
  EmailCategory,
  SendResult,
} from './provider';

export { getEmailService, getEmailServiceStatus, assertEmailConfigValid } from './config';

export {
  renderVerifyEmail,
  renderPasswordReset,
  renderInvitation,
  renderWelcome,
  renderTemplate,
} from './templates';

export type {
  VerifyEmailProps,
  PasswordResetProps,
  InvitationProps,
  WelcomeProps,
  RenderedEmail,
} from './templates';

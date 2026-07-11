/**
 * mapApiErrorToFormError — central parser for Fastify error replies.
 *
 * The backend returns a stable shape for known 4xx errors:
 *
 *   { success: false, code?: string, error: string, ... }
 *
 * For known `code` values we return a translated, user-facing message plus
 * the code so callers can branch on it (e.g. to render a "resend verification"
 * link on EMAIL_NOT_VERIFIED). For everything else, we fall back to the
 * server's `error` string. We never expose stack traces, SQL errors, or any
 * other internal field — the Fastify reply body is the trust boundary.
 *
 * Pure function, no React. Safe to import from any client module.
 */

export type FormErrorCode =
  | 'EMAIL_NOT_VERIFIED'
  | 'RATE_LIMITED'
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'NETWORK'
  | 'UNKNOWN';

export interface FormError {
  message: string;
  code: FormErrorCode;
  /** Optional metadata the form might use (e.g. for the resend link). */
  meta?: Record<string, unknown>;
}

interface ApiErrorBody {
  success?: boolean;
  code?: string;
  error?: string;
  // Phase 2's EMAIL_NOT_VERIFIED 403 body also returns canResend: true.
  canResend?: boolean;
}

const DEFAULT: FormError = {
  message: 'Something went wrong. Please try again.',
  code: 'UNKNOWN',
};

export function mapApiErrorToFormError(error: unknown): FormError {
  // 1. Network / fetch threw (e.g. backend down, CORS, offline). The
  //    `fetch` API rejects with a TypeError on network failure.
  if (error instanceof TypeError) {
    return {
      message: 'Unable to connect to server. Is the API running?',
      code: 'NETWORK',
    };
  }

  // 2. The caller already mapped the body to an object (e.g. .json() then
  //    threw). Pass it through to the body parser.
  if (error && typeof error === 'object') {
    return mapFromBody(error as ApiErrorBody);
  }

  return DEFAULT;
}

/**
 * Convenience wrapper for the common pattern of `await fetch()` followed
 * by `await res.json()`. Pass the Response and the parser reads the status
 * and body.
 */
export async function mapApiResponseToFormError(res: Response): Promise<FormError> {
  if (res.ok) {
    return DEFAULT; // No error — caller shouldn't be calling us.
  }
  let body: ApiErrorBody = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // Empty body or non-JSON. Fall through with empty body.
  }
  return mapFromBody(body, res.status);
}

function mapFromBody(body: ApiErrorBody, status?: number): FormError {
  const code = (body.code ?? '').toUpperCase();

  switch (code) {
    case 'EMAIL_NOT_VERIFIED':
      return {
        message: 'Please verify your email first.',
        code: 'EMAIL_NOT_VERIFIED',
        meta: { canResend: body.canResend !== false },
      };
    case 'RATE_LIMITED':
      return {
        message: 'Too many attempts. Please try again later.',
        code: 'RATE_LIMITED',
      };
    case 'EMAIL_ALREADY_EXISTS':
    case 'USER_EXISTS':
      return {
        message: 'An account with this email already exists.',
        code: 'EMAIL_ALREADY_EXISTS',
      };
    case 'INVALID_CREDENTIALS':
    case 'UNAUTHORIZED':
      return {
        message: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS',
      };
  }

  // No recognized code — fall back to the server's `error` string if it's
  // safe (plain string, not a stack trace / SQL dump). The Fastify reply
  // body is the trust boundary: handlers that throw unhandled errors
  // produce 500s with no JSON body, which lands us here with an empty
  // body and we render the generic message.
  if (typeof body.error === 'string' && body.error.length > 0) {
    return {
      message: body.error,
      code: 'UNKNOWN',
    };
  }

  if (status === 429) {
    return {
      message: 'Too many attempts. Please try again later.',
      code: 'RATE_LIMITED',
    };
  }

  if (status === 401 || status === 403) {
    return {
      message: 'Invalid email or password.',
      code: 'INVALID_CREDENTIALS',
    };
  }

  return DEFAULT;
}

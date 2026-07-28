/**
 * Environment Variable Validation
 *
 * Centralized validation for required secrets following the assertEmailConfigValid pattern.
 * Validates critical environment variables at startup before the server starts listening.
 *
 * In production, all secrets are required. In development, can be skipped with ALLOW_MISSING_SECRETS=1
 */

/**
 * Thrown when environment validation fails. Provides list of missing variables.
 */
export class EnvironmentValidationError extends Error {
  public readonly missingSecrets: string[];

  constructor(message: string, missingSecrets: string[]) {
    super(message);
    this.name = 'EnvironmentValidationError';
    this.missingSecrets = missingSecrets;
  }
}

/**
 * Environment status object (safe to log, no secrets exposed)
 */
export interface EnvironmentStatus {
  secretsConfigured: boolean;
  missingSecrets: string[];
  environment: string;
}

/**
 * Validate that all required secrets are present and non-empty.
 *
 * In production (NODE_ENV=production), all secrets are required:
 * - DATABASE_URL
 * - NEXTAUTH_SECRET
 * - JWT_SECRET
 *
 * In development, validation can be skipped with ALLOW_MISSING_SECRETS=1 for testing purposes.
 *
 * @throws EnvironmentValidationError if validation fails
 */
export function assertSecretsConfigValid(): void {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowMissing = process.env.ALLOW_MISSING_SECRETS === '1';

  // In development with explicit opt-in, allow missing secrets for testing
  if (nodeEnv !== 'production' && allowMissing) {
    return;
  }

  const requiredSecrets = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'JWT_SECRET'];
  const missingSecrets: string[] = [];

  for (const secret of requiredSecrets) {
    const value = process.env[secret];
    if (!value || value.trim() === '') {
      missingSecrets.push(secret);
    }
  }

  if (missingSecrets.length > 0) {
    const message = `Missing required environment variables: ${missingSecrets.join(', ')}. These must be set before the application can start.`;
    throw new EnvironmentValidationError(message, missingSecrets);
  }
}

/**
 * Get the current environment configuration status (safe to log).
 *
 * Returns an object with configuration state without exposing actual secret values.
 * Useful for logging environment status at startup without security risks.
 *
 * @returns EnvironmentStatus object with safe configuration information
 */
export function getEnvironmentStatus(): EnvironmentStatus {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const requiredSecrets = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'JWT_SECRET'];
  const missingSecrets: string[] = [];

  for (const secret of requiredSecrets) {
    const value = process.env[secret];
    if (!value || value.trim() === '') {
      missingSecrets.push(secret);
    }
  }

  return {
    secretsConfigured: missingSecrets.length === 0,
    missingSecrets,
    environment: nodeEnv,
  };
}

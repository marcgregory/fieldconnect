/**
 * Generate a unique idempotency key for offline queued actions.
 * Uses crypto.randomUUID() when available, falls back to a manual
 * implementation for wider compatibility.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: Math.random + timestamp (not crypto-grade, but sufficient
  // for idempotency in practice)
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

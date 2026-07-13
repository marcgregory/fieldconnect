/**
 * Vitest setup for web-component tests (jsdom).
 * Sets up @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 * and any test doubles for browser-only APIs that jsdom doesn't provide.
 */

import '@testing-library/jest-dom';

// Suppress console warnings from act() during tests unless the test explicitly
// wants to check for them.
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = (...args: unknown[]) => {
    // Suppress React act() warnings in test output — they're noisy and
    // generally non-actionable in our testing patterns.
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('inside a test was not wrapped in act')) return;
    if (msg.includes('was not wrapped in act')) return;
    originalConsoleError.call(console, ...args);
  };
});
afterEach(() => {
  console.error = originalConsoleError;
});

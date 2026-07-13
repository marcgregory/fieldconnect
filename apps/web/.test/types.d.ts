/**
 * Augment vitest's Assertion types with @testing-library/jest-dom matchers.
 * The setup file imports `@testing-library/jest-dom` which extends the runtime,
 * but TypeScript needs the type augmentation too.
 */
import '@testing-library/jest-dom';

/**
 * Negative safety test for the test-DB triple guard.
 *
 * This test PROVES that the guard rejects every unsafe configuration.
 * It is the canary that protects production from accidental drops.
 *
 * Test cases:
 *   1. Production-like URL is rejected
 *   2. Normal dev database name is rejected
 *   3. Missing ALLOW_TEST_DB is rejected
 *   4. NODE_ENV other than 'test' is rejected
 *   5. All three guards passing → no abort
 *   6. URL with non-localhost host is rejected
 *   7. Database name with wrong suffix is rejected
 *   8. Malformed URL is rejected
 *   9. Multiple failures are reported together
 *  10. parseDbUrl handles edge cases
 *
 * This test runs WITH the guard enforcement DISABLED in vitest-setup.ts
 * (via RUNNING_SAFETY_TESTS=1) so each test can exercise a specific
 * failure mode. The flag is set both via the npm script and as a
 * defense-in-depth at the top of this file.
 */

// Defense in depth: set the flag even if the npm script forgot to.
process.env.RUNNING_SAFETY_TESTS = '1';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assertTestDbSafe, parseDbUrl, TestGuardError } from '../setup/test-db';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Reset to a known-safe baseline
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_TEST_DB = '1';
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/fieldconnect_rc';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function expectGuardFailure(failures: string[]): void {
  try {
    assertTestDbSafe();
  } catch (err) {
    expect(err).toBeInstanceOf(TestGuardError);
    if (err instanceof TestGuardError) {
      for (const f of failures) {
        expect(err.failures.some((m) => m.includes(f))).toBe(true);
      }
    }
    return;
  }
  throw new Error('Expected assertTestDbSafe to throw, but it returned normally');
}

describe('Triple guard — negative cases', () => {
  it('1. Production-like URL is rejected', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@prod-db.render.com:5432/fieldconnect';
    expectGuardFailure(['host must be localhost', 'database name must end in _rc']);
  });

  it('2. Normal dev database name is rejected', () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/fieldconnect';
    expectGuardFailure(['database name must end in _rc']);
  });

  it('3. Missing ALLOW_TEST_DB is rejected', () => {
    delete process.env.ALLOW_TEST_DB;
    expectGuardFailure(['ALLOW_TEST_DB must be']);
  });

  it('4. NODE_ENV other than "test" is rejected', () => {
    process.env.NODE_ENV = 'production';
    expectGuardFailure(['NODE_ENV must be "test"']);
  });

  it('5. NODE_ENV = "development" is rejected (not just anything-but-test)', () => {
    process.env.NODE_ENV = 'development';
    expectGuardFailure(['NODE_ENV must be "test"']);
  });

  it('6. NODE_ENV = "staging" is rejected', () => {
    process.env.NODE_ENV = 'staging';
    expectGuardFailure(['NODE_ENV must be "test"']);
  });

  it('7. ALLOW_TEST_DB = "true" (boolean) is rejected — must be the string "1"', () => {
    process.env.ALLOW_TEST_DB = 'true';
    expectGuardFailure(['ALLOW_TEST_DB must be "1"']);
  });

  it('8. ALLOW_TEST_DB = "yes" is rejected', () => {
    process.env.ALLOW_TEST_DB = 'yes';
    expectGuardFailure(['ALLOW_TEST_DB must be "1"']);
  });

  it('9. Non-localhost host is rejected even if db name is correct', () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@10.0.0.5:5432/fieldconnect_rc';
    expectGuardFailure(['host must be localhost']);
  });

  it('10. Remote render host with _rc suffix is still rejected', () => {
    process.env.DATABASE_URL =
      'postgres://user:pass@dpg-abc123.render.com:5432/fieldconnect_rc';
    expectGuardFailure(['host must be localhost']);
  });

  it('11. Database name with _rcprod suffix is rejected (must END in _rc or _test)', () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/fieldconnect_rcprod';
    expectGuardFailure(['database name must end in _rc']);
  });

  it('12. Database name with _testing suffix is rejected (not _test)', () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/fieldconnect_testing';
    expectGuardFailure(['database name must end in _rc']);
  });

  it('13. Malformed URL is rejected', () => {
    process.env.DATABASE_URL = 'not-a-url';
    expectGuardFailure(['could not be parsed']);
  });

  it('14. Empty DATABASE_URL is rejected', () => {
    process.env.DATABASE_URL = '';
    expectGuardFailure(['DATABASE_URL is not set']);
  });

  it('15. Multiple failures are reported together (not just first)', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_TEST_DB;
    process.env.DATABASE_URL = 'postgres://user:pass@prod.render.com:5432/fieldconnect';

    try {
      assertTestDbSafe();
      throw new Error('Expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TestGuardError);
      if (err instanceof TestGuardError) {
        // All three guards should be reported
        expect(err.failures.length).toBeGreaterThanOrEqual(3);
        const allMsg = err.failures.join(' | ');
        expect(allMsg).toContain('NODE_ENV');
        expect(allMsg).toContain('ALLOW_TEST_DB');
        expect(allMsg).toContain('host must be localhost');
      }
    }
  });

  it('16. TestGuardError carries parsed URL on parseable input', () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@10.0.0.5:5432/fieldconnect_rc';
    try {
      assertTestDbSafe();
      throw new Error('Expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TestGuardError);
      if (err instanceof TestGuardError) {
        expect(err.parsed).not.toBeNull();
        expect(err.parsed?.host).toBe('10.0.0.5');
        expect(err.parsed?.database).toBe('fieldconnect_rc');
      }
    }
  });

  it('17. TestGuardError has parsed=null on unparseable URL', () => {
    process.env.DATABASE_URL = 'not-a-url';
    try {
      assertTestDbSafe();
      throw new Error('Expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TestGuardError);
      if (err instanceof TestGuardError) {
        expect(err.parsed).toBeNull();
      }
    }
  });
});

describe('Triple guard — positive case', () => {
  it('18. All guards satisfied → no throw', () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_DB = '1';
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/fieldconnect_rc';
    expect(() => assertTestDbSafe()).not.toThrow();
  });

  it('19. Database name ending in _test (not _rc) is also accepted', () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/fieldconnect_test';
    expect(() => assertTestDbSafe()).not.toThrow();
  });

  it('20. 127.0.0.1 is accepted as localhost equivalent', () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/fieldconnect_rc';
    expect(() => assertTestDbSafe()).not.toThrow();
  });
});

describe('parseDbUrl', () => {
  it('21. Parses standard URL', () => {
    const p = parseDbUrl('postgres://user:pass@localhost:5432/dbname');
    expect(p).toEqual({
      user: 'user',
      password: 'pass',
      host: 'localhost',
      port: '5432',
      database: 'dbname',
    });
  });

  it('22. Handles URL without port (defaults to 5432)', () => {
    const p = parseDbUrl('postgres://user:pass@localhost/dbname');
    expect(p.port).toBe('5432');
  });

  it('23. Handles URL without password', () => {
    const p = parseDbUrl('postgres://user@localhost:5432/dbname');
    expect(p.password).toBe('');
  });

  it('24. Strips query string from database name', () => {
    const p = parseDbUrl('postgres://user:pass@localhost:5432/dbname?sslmode=require');
    expect(p.database).toBe('dbname');
  });

  it('25. Throws on malformed URL', () => {
    expect(() => parseDbUrl('not-a-url')).toThrow();
  });
});

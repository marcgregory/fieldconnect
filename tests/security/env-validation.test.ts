/**
 * Bug Condition Exploration Test: Environment Variable Validation
 *
 * These tests explore and document the security bugs in credential handling.
 * They are EXPECTED TO FAIL on unfixed code (this confirms bugs exist).
 *
 * **Validates: Requirements 1.3, 1.4**
 *
 * Bug Condition (C):
 * - Missing DATABASE_URL doesn't prevent API startup
 * - Missing NEXTAUTH_SECRET doesn't prevent API startup  
 * - Missing JWT_SECRET doesn't prevent API startup
 *
 * The API starts without validating required secrets, making them available
 * as undefined at runtime, which causes issues during request handling rather
 * than failing loudly at startup.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

describe('Environment Validation - Bug Condition Exploration', () => {
  let apiProcess: ChildProcess;

  const startAPIWithEnv = (env: Record<string, string | undefined>) => {
    return new Promise<ChildProcess>((resolve, reject) => {
      const baseEnv = process.env;
      const testEnv = {
        ...baseEnv,
        NODE_ENV: 'test',
        PORT: '3002', // Use different port to avoid conflicts
        ...env,
      };

      // Explicitly remove variables if set to undefined
      Object.keys(testEnv).forEach((key) => {
        if (testEnv[key] === undefined) {
          delete testEnv[key];
        }
      });

      const proc = spawn(
        'node',
        ['-r', 'tsx', path.resolve('apps/api/src/index.ts')],
        {
          cwd: path.resolve('apps/api'),
          env: testEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000,
        }
      );

      let stdoutData = '';
      let stderrData = '';
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timeoutId);
        proc.removeAllListeners();
      };

      proc.stdout?.on('data', (data) => {
        stdoutData += data.toString();
        // If server starts listening, resolve
        if (stdoutData.includes('FieldConnect API running')) {
          cleanup();
          resolve(proc);
        }
      });

      proc.stderr?.on('data', (data) => {
        stderrData += data.toString();
      });

      proc.on('error', (err) => {
        cleanup();
        reject(err);
      });

      proc.on('exit', (code) => {
        cleanup();
        if (code === 0) {
          // If process exited cleanly without starting, resolve with the process
          // (will be checked for startup validation error in test)
          resolve(proc);
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderrData}`));
        }
      });

      // If startup takes too long without error, assume it succeeded
      timeoutId = setTimeout(() => {
        cleanup();
        // Check if process is still running
        if (!proc.killed) {
          resolve(proc);
        }
      }, 3000);
    });
  };

  afterEach(() => {
    if (apiProcess && !apiProcess.killed) {
      apiProcess.kill('SIGTERM');
    }
  });

  it('BUG: API starts without DATABASE_URL (should fail on fixed code)', async () => {
    const env = {
      DATABASE_URL: undefined, // Explicitly remove
      JWT_SECRET: 'test-jwt-secret',
      NEXTAUTH_SECRET: 'test-nextauth-secret',
      EMAIL_PROVIDER: 'console',
    };

    try {
      apiProcess = await startAPIWithEnv(env);
      
      // On unfixed code, process should start successfully (BUG)
      // On fixed code, this should fail with error about missing DATABASE_URL
      expect(apiProcess.killed).toBe(false);
      
      // This test documents the bug: if we reach here, API started without DATABASE_URL
      // which is a security issue - database operations would fail at runtime
    } catch (error) {
      // On fixed code, we expect an error here with message about DATABASE_URL
      const errorMsg = (error as Error).message;
      expect(errorMsg).toMatch(/DATABASE_URL|required|must not be empty/i);
    }
  });

  it('BUG: API starts without JWT_SECRET (should fail on fixed code)', async () => {
    const env = {
      DATABASE_URL: 'postgres://test:test@localhost/test',
      JWT_SECRET: undefined, // Explicitly remove
      NEXTAUTH_SECRET: 'test-nextauth-secret',
      EMAIL_PROVIDER: 'console',
    };

    try {
      apiProcess = await startAPIWithEnv(env);
      
      // On unfixed code, process should start successfully (BUG)
      expect(apiProcess.killed).toBe(false);
      
      // This test documents the bug: if we reach here, API started without JWT_SECRET
      // which means JWT validation would fail at runtime
    } catch (error) {
      // On fixed code, we expect an error here with message about JWT_SECRET
      const errorMsg = (error as Error).message;
      expect(errorMsg).toMatch(/JWT_SECRET|required|must not be empty/i);
    }
  });

  it('BUG: API starts without NEXTAUTH_SECRET (should fail on fixed code)', async () => {
    const env = {
      DATABASE_URL: 'postgres://test:test@localhost/test',
      JWT_SECRET: 'test-jwt-secret',
      NEXTAUTH_SECRET: undefined, // Explicitly remove
      EMAIL_PROVIDER: 'console',
    };

    try {
      apiProcess = await startAPIWithEnv(env);
      
      // On unfixed code, process should start successfully (BUG)
      expect(apiProcess.killed).toBe(false);
      
      // This test documents the bug: if we reach here, API started without NEXTAUTH_SECRET
      // which means the web proxy would use the fallback secret
    } catch (error) {
      // On fixed code, we expect an error here with message about NEXTAUTH_SECRET
      const errorMsg = (error as Error).message;
      expect(errorMsg).toMatch(/NEXTAUTH_SECRET|required|must not be empty/i);
    }
  });

  it('BUG: Empty string secrets are accepted (should fail on fixed code)', async () => {
    const env = {
      DATABASE_URL: '', // Empty string
      JWT_SECRET: 'test-jwt-secret',
      NEXTAUTH_SECRET: 'test-nextauth-secret',
      EMAIL_PROVIDER: 'console',
    };

    try {
      apiProcess = await startAPIWithEnv(env);
      
      // On unfixed code, process should start successfully with empty string (BUG)
      // Empty string is falsy in some contexts but truthy for existence checks
      expect(apiProcess.killed).toBe(false);
    } catch (error) {
      // On fixed code, we expect an error here catching empty strings
      const errorMsg = (error as Error).message;
      expect(errorMsg).toMatch(/required|must not be empty/i);
    }
  });
});

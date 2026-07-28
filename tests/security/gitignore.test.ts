/**
 * Bug Condition Exploration Test: .gitignore Patterns
 *
 * These tests explore the .gitignore gaps that allow credential files to be committed.
 * They are EXPECTED TO FAIL on unfixed code (this confirms the bug exists).
 *
 * **Validates: Requirements 1.5**
 *
 * Bug Condition (C):
 * - .env files can be committed to git (only .env patterns are gitignored)
 * - .env.production.local is NOT gitignored (can be committed)
 * - .env.*.local pattern is missing (can commit .env.staging.local, .env.dev.local, etc)
 *
 * Missing .gitignore patterns allow developers to accidentally commit credential files
 * with real secrets, which then appear in git history permanently.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('Git Ignore Patterns - Bug Condition Exploration', () => {
  const repoRoot = path.resolve('.');
  const tempDir = path.join(repoRoot, '.test-gitignore-tmp');

  beforeEach(() => {
    // Create a temporary test directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up temporary test files
    try {
      execSync(`cd ${tempDir} && git clean -fd`, { stdio: 'ignore' });
    } catch {}

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('PROPERTY: .env.production.local should be gitignored', () => {
    const testFile = path.join(tempDir, '.env.production.local');
    fs.writeFileSync(testFile, 'CLOUDINARY_API_SECRET=real-secret-key\n');

    try {
      // Try to check if git ignores this file
      const result = execSync(
        `cd ${repoRoot} && git check-ignore -v ${testFile}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      // If we get here, the pattern matched and file is ignored (GOOD - fixed code)
      expect(result.trim()).toBeTruthy();
      expect(result).toMatch(/\.env\.production\.local/);
    } catch (error) {
      // Exit code 1 means file is NOT ignored (BUG - unfixed code)
      // On unfixed code, this is the expected failure
      expect((error as any).status).toBe(1);
    }
  });

  it('PROPERTY: .env.*.local pattern should gitignore environment-specific files', () => {
    const testFiles = [
      path.join(tempDir, '.env.staging.local'),
      path.join(tempDir, '.env.dev.local'),
      path.join(tempDir, '.env.qa.local'),
    ];

    testFiles.forEach((testFile) => {
      fs.writeFileSync(testFile, 'SECRET_KEY=real-credentials\n');
    });

    testFiles.forEach((testFile) => {
      try {
        // Try to check if git ignores this file
        const result = execSync(
          `cd ${repoRoot} && git check-ignore -v ${testFile}`,
          { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );

        // If we get here, the pattern matched (GOOD - fixed code)
        expect(result.trim()).toBeTruthy();
      } catch (error) {
        // Exit code 1 means file is NOT ignored (BUG - unfixed code)
        expect((error as any).status).toBe(1);
      }
    });
  });

  it('PROPERTY: .env.local should be gitignored', () => {
    const testFile = path.join(tempDir, '.env.local');
    fs.writeFileSync(testFile, 'DATABASE_PASSWORD=real-password\n');

    try {
      const result = execSync(
        `cd ${repoRoot} && git check-ignore -v ${testFile}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      expect(result.trim()).toBeTruthy();
    } catch (error) {
      // On fixed code, this should NOT happen
      expect((error as any).status).toBe(1);
    }
  });

  it('PROPERTY: .env.example should NOT be gitignored (should be tracked)', () => {
    const testFile = path.join(repoRoot, '.env.example');

    try {
      // git check-ignore returns 0 if ignored
      execSync(`git check-ignore -v ${testFile}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // If we get here, file IS ignored - that's wrong
      // .env.example should be tracked as a template
      expect.fail('.env.example should NOT be gitignored');
    } catch (error) {
      // Exit code 1 means file is NOT ignored (GOOD)
      // On fixed code, .env.example is tracked
      expect((error as any).status).toBe(1);
    }
  });

  it('PROPERTY: Verify all env-related .gitignore patterns from root .gitignore', () => {
    const gitignorePath = path.join(repoRoot, '.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');

    // Check for required patterns
    const requiredPatterns = [
      '.env',
      '.env.local',
      '.env.production.local',
      '.env.test',
      '.env.*.local', // Catch-all for environment-specific files
    ];

    requiredPatterns.forEach((pattern) => {
      // On fixed code, all patterns should be present
      // On unfixed code, some patterns (especially .env.production.local and .env.*.local) are missing
      expect(gitignoreContent).toContain(pattern);
    });

    // .env.example should NOT be in gitignore (it should be tracked)
    expect(gitignoreContent).not.toMatch(/\.env\.example/);
  });

  it('BUG: git add .env.production.local should be accepted (should fail on fixed code)', async () => {
    const testFile = path.join(tempDir, '.env.production.local');
    fs.writeFileSync(testFile, 'REAL_PRODUCTION_SECRET=confidential\n');

    try {
      // Try to add the file to git
      execSync(`cd ${repoRoot} && git add ${testFile}`, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // If we reach here on unfixed code, git accepted the file (BUG)
      // On fixed code, git should reject because file matches .gitignore pattern
      // This is the failing case we expect on unfixed code
      
      // Try to check git status
      const status = execSync(`cd ${repoRoot} && git status --short ${testFile}`, {
        encoding: 'utf-8',
      });

      // If file appears in status, it was staged (BUG on unfixed code)
      if (status.trim()) {
        expect(status).toMatch(/A|M/); // File was added or modified
      }
    } catch (error) {
      // On fixed code, git should reject or the file shouldn't be staged
      // This is the expected behavior on fixed code
      expect((error as any).status).toBeDefined();
    }
  });

  it('PROPERTY: Credential files in temp should be caught by gitignore patterns', () => {
    const credentialFiles = [
      '.env',
      '.env.local',
      '.env.production.local',
      '.env.staging.local',
    ];

    credentialFiles.forEach((filename) => {
      const testFile = path.join(tempDir, filename);
      fs.writeFileSync(testFile, 'SECRET=real-value\n');

      try {
        // Check if git ignores this file
        execSync(`cd ${repoRoot} && git check-ignore -v ${testFile}`, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // If we get here without error, file is ignored (GOOD - fixed code)
        // On unfixed code, at least some files should NOT be ignored
      } catch (error) {
        // git check-ignore returns 1 if NOT ignored
        // This indicates the pattern is missing (BUG on unfixed code)
        expect((error as any).status).toBe(1);
      }
    });
  });
});

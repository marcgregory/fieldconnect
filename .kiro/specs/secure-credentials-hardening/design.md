# Secure Credentials Hardening - Bugfix Design

## Overview

This design addresses critical security vulnerabilities in credential handling across FieldConnect. The application currently exposes sensitive credentials (Cloudinary API keys, database passwords) in version-controlled files and documentation, lacks startup validation for required secrets, and contains a hardcoded fallback for NEXTAUTH_SECRET that could be exploited if the environment variable is missing.

The fix uses a layered approach:
1. **Environment Validation Module** - Centralized, reusable validation logic following the `assertEmailConfigValid` pattern
2. **Startup Validation** - Fail fast at boot time before server starts listening, with clear per-variable error messages
3. **Proxy Route Hardening** - Remove fallback secret from JWT signing, make NEXTAUTH_SECRET truly required
4. **Credential File Protection** - Enhanced .gitignore patterns and sanitized documentation
5. **Secure Placeholders** - Updated .env.example with guidance and placeholder syntax

This approach minimizes blast radius by validating early, keeps error messages actionable, and preserves existing authentication and file upload workflows.

## Glossary

- **Bug_Condition (C)**: The presence of hardcoded credentials, fallback secrets, or missing environment validation that creates security risks
- **Property (P)**: The desired secure behavior: credentials in environment only, validation at startup, no fallbacks, no exposed identifiers
- **Preservation**: Existing authentication, file uploads, JWT validation, and development workflows continue functioning identically
- **Credential Injection**: The practice of supplying secrets via environment variables at runtime rather than storing in files or code
- **Startup Validation**: Synchronous environment variable validation that occurs before the server binds to its port and starts accepting requests
- **Fallback Secret**: A hardcoded string used when an environment variable is missing (currently: `'fallback-secret-do-not-use-in-production'` for NEXTAUTH_SECRET)
- **Environment Scope**: Different environments (development, test, production) may have different requirements (e.g., some vars optional in dev, all required in prod)

## Bug Details

### Bug Condition

The bug manifests across multiple areas:

1. **Hardcoded Credentials in Tracked Files**: Cloudinary API keys and secrets are stored in `.env` which is committed to version control, making them permanently accessible via `git log`.

2. **Credentials Exposed in Documentation**: Real Cloudinary cloud names and identifiers appear in `docs/rc-reports/` JSON and markdown files that are version-controlled.

3. **Fallback Secret in Proxy Route**: The proxy route (`apps/web/src/app/api/proxy/[...path]/route.ts`) uses a hardcoded fallback string `'fallback-secret-do-not-use-in-production'` when `NEXTAUTH_SECRET` is missing, allowing JWT token signing to proceed with a weak predictable secret.

4. **No Startup Validation**: The API starts without validating that `DATABASE_URL`, `NEXTAUTH_SECRET`, or `JWT_SECRET` are present, resulting in undefined credential state during runtime.

5. **Incomplete .gitignore**: Environment-specific credential files (`.env.*.local`, `.env.production.local`) can be accidentally committed.

6. **Weak Default Placeholders**: `.env.example` suggests literal `"user:password"` defaults that normalize weak credential practices.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type Application Startup OR Credential Access
  OUTPUT: boolean
  
  RETURN (credentialsInTrackedFiles 
          OR credentialsInDocumentation
          OR fallbackSecretUsedForJWT
          OR (missingRequiredSecret AND noStartupValidation)
          OR (incompleteGitignorePatterns AND credentialFilesCommittable)
          OR (weakDefaultPlaceholders AND suggestedInDocumentation))
END FUNCTION
```

### Examples

**Example 1: Cloudinary Credentials Exposed**
- Current: `.env` contains real Cloudinary API credentials and secrets
- Exposed via: Git history contains credentials from version control
- Expected: Credentials only in environment variables injected at deployment time; `.env` is .gitignored

**Example 2: Fallback Secret Used for JWT**
- Current: `apps/web/src/app/api/proxy/[...path]/route.ts` line 10: `process.env.NEXTAUTH_SECRET || 'fallback-secret-do-not-use-in-production'`
- Risk: If `NEXTAUTH_SECRET` is not set, JWT tokens are signed with a predictable public string
- Expected: Application fails at startup with error: `"NEXTAUTH_SECRET environment variable is required and must not be empty"`

**Example 3: Startup Without Validation**
- Current: `apps/api/src/index.ts` validates only `EMAIL_PROVIDER`, then proceeds with potentially missing `DATABASE_URL`, `JWT_SECRET`
- Risk: Server starts listening but cannot connect to database or validate JWTs, errors surface during request handling
- Expected: Before `app.listen()`, validate all required secrets and throw specific error for each missing variable

**Example 4: Documentation Exposes Identifiers**
- Current: Documentation files contain real Cloudinary account identifiers and cloud names
- Expected: Documentation sanitized (identifiers replaced with placeholders like `<YOUR_CLOUD_NAME>`) or removed entirely

**Example 5: Incomplete .gitignore**
- Current: Missing patterns for `.env.production.local`, `.env.*.local`
- Risk: Dev accidentally runs `git add .env.production.local` and commits real production credentials
- Expected: All patterns present and verified with `git check-ignore`

**Example 6: Weak Default Placeholders**
- Current: `.env.example` shows `DATABASE_URL=postgres://user:password@localhost:5432/fieldconnect`
- Risk: Developers copy-paste the example and use `"password"` literally
- Expected: Placeholder like `postgres://YOUR_USER:YOUR_PASSWORD@host/dbname` with guidance

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Authentication flows (login, token refresh, JWT validation) continue to work identically when valid credentials are injected
- Cloudinary file uploads and storage operations function the same way with injected credentials
- JWT token generation, signing, and verification remain unchanged
- Local development workflows using `.env.local` continue to work
- Environment-specific configuration (dev vs production) respects NODE_ENV settings as before
- Database connections work with valid injected DATABASE_URL
- Existing tests and test workflows run without modification

**Scope:**
All inputs that involve valid environment variables properly injected at deployment time should be completely unaffected by this fix. This includes:
- Valid JWT token creation and validation
- Cloudinary storage operations with real credentials
- Database queries with valid connection strings
- Authentication request/response flows
- Multipart file uploads
- Token refresh operations
- Email service initialization and sending

## Hypothesized Root Cause

Based on the bug analysis, the root causes are:

1. **File-Based Credential Storage**: Credentials were stored directly in `.env` during initial development for convenience, without understanding long-term security implications. `.env` was tracked in git without realizing git history is permanent.

2. **Missing Validation Pattern**: The codebase has `assertEmailConfigValid()` for email configuration but lacked a generalized environment validation approach for secrets. Each secret is accessed directly without centralized validation.

3. **Fallback as Convenience**: The fallback secret was added to make local development easier (not requiring NEXTAUTH_SECRET to be set), but this pattern is fundamentally incompatible with production security requirements.

4. **Documentation and Examples**: During development, actual Cloudinary credentials were used in documentation (health checks, reports) as proof of functionality. These were committed to version control without sanitization.

5. **Incremental .gitignore**: `.gitignore` was updated piecemeal without comprehensive review of all credential file patterns, missing environment-specific variants.

## Correctness Properties

Property 1: Bug Condition - Missing Secrets Fail at Startup

_For any_ startup where one or more required secrets (`DATABASE_URL`, `NEXTAUTH_SECRET`, `JWT_SECRET`) are missing or empty, the fixed application SHALL fail immediately with a descriptive error message identifying which variable(s) are missing, before the server starts listening or processing requests.

**Validates: Requirements 2.3, 2.4**

Property 2: Preservation - Valid Credentials Work Identically

_For any_ application state where all required environment variables are properly injected with valid values, the fixed code SHALL produce exactly the same behavior as the original code, preserving all authentication, file upload, and database operations.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

Property 3: Credentials Never Exposed in Tracked Files

_For any_ deployment or development workflow, credentials SHALL only exist in environment variables injected at runtime, never in tracked files (.env, git history, or documentation). The fixed `.gitignore` SHALL prevent credential files from being committed, and documentation SHALL contain only placeholders.

**Validates: Requirements 2.1, 2.2, 2.5, 2.6**

Property 4: No Fallback Secrets Used

_For any_ JWT token generation or authentication operation, the fixed code SHALL use only the environment-injected `NEXTAUTH_SECRET` or `JWT_SECRET`, with no fallback to hardcoded strings. Missing secrets SHALL fail the operation with a clear error.

**Validates: Requirements 2.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File 1**: `apps/api/src/lib/env.ts` (NEW)

**Purpose**: Centralized environment validation following the `assertEmailConfigValid` pattern

**Specific Changes**:
1. **Export `assertSecretsConfigValid()` function**: Validates `DATABASE_URL`, `NEXTAUTH_SECRET`, `JWT_SECRET` at boot
   - Check each variable is defined and non-empty
   - Throw descriptive Error for each missing variable
   - In production, all three are required
   - In development, optionally allow missing via `ALLOW_MISSING_SECRETS=1` (explicit opt-in for testing)
   - Log status at boot (without exposing secret values)

2. **Export `getEnvironmentStatus()` helper**: Returns safe object with env configuration state (for logging, without leaking secrets)
   - Structure: `{ secretsConfigured: boolean, missingSecrets: string[], environment: string }`
   - Safe to log at boot without exposing sensitive values

3. **Reusable Pattern**: Design to be called once at boot (in both API and Web), mirroring `assertEmailConfigValid()`

---

**File 2**: `apps/api/src/index.ts` (MODIFY)

**Function**: `main()` async function

**Specific Changes**:
1. **Add import**: `import { assertSecretsConfigValid } from './lib/env'`

2. **Call validation before buildApp()**: Add validation immediately after `assertEmailConfigValid()`
   ```typescript
   try {
     assertEmailConfigValid();
     assertSecretsConfigValid();
   } catch (err) {
     console.error('Startup validation failed:', (err as Error).message);
     process.exit(1);
   }
   ```

3. **Effect**: Startup will fail if any required secret is missing, before routes are registered or server starts listening

---

**File 3**: `apps/web/src/app/api/proxy/[...path]/route.ts` (MODIFY)

**Function**: `JWT_SECRET` constant declaration (lines 8-10)

**Specific Changes**:
1. **Remove fallback secret**: Replace:
   ```typescript
   const JWT_SECRET = new TextEncoder().encode(
     process.env.NEXTAUTH_SECRET || 'fallback-secret-do-not-use-in-production',
   );
   ```
   
   With validation and required secret:
   ```typescript
   const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
   if (!NEXTAUTH_SECRET || NEXTAUTH_SECRET.trim() === '') {
     throw new Error('NEXTAUTH_SECRET environment variable is required and must not be empty');
   }
   const JWT_SECRET = new TextEncoder().encode(NEXTAUTH_SECRET);
   ```

2. **Effect**: JWT signing fails immediately if `NEXTAUTH_SECRET` is missing, before any request is processed

3. **Alternative (Next.js app.ts)**: Consider moving this validation to `apps/web/src/app.ts` or a root layout to catch missing secrets earlier in Next.js startup

---

**File 4**: `d:\FieldConnect\.gitignore` (MODIFY)

**Specific Changes**:
1. **Add missing pattern**: `.env.production.local`

2. **Add pattern for all env variants**: `.env.*.local` (catches `.env.staging.local`, `.env.dev.local`, etc.)

3. **Final .gitignore patterns for credentials**:
   ```
   .env
   .env.local
   .env.production
   .env.production.local
   .env.test
   .env.*.local
   ```

4. **Keep tracked**: `.env.example` (not ignored, documented template)

5. **Verification**: After changes, run:
   - `git check-ignore .env` (should be ignored)
   - `git check-ignore .env.local` (should be ignored)
   - `git check-ignore .env.production.local` (should be ignored)
   - `git check-ignore .env.staging.local` (should be ignored)
   - `git check-ignore .env.example` (should NOT be ignored — returns nothing)

---

**File 5**: `d:\FieldConnect\.env.example` (MODIFY)

**Specific Changes**:
1. **Update DATABASE_URL placeholder**:
   ```
   DATABASE_URL=postgres://YOUR_USER:YOUR_PASSWORD@localhost:5432/fieldconnect
   ```
   
   Or with render.com guidance:
   ```
   DATABASE_URL=<get-from-render-dashboard>
   ```

2. **Update JWT_SECRET and NEXTAUTH_SECRET with comments**:
   ```
   JWT_SECRET=<generate-a-random-secret>
   NEXTAUTH_SECRET=<generate-a-random-secret>
   ```

3. **Add security section at top**:
   ```
   # ⚠️  SECURITY: Never commit .env or .env.*.local to version control.
   # All credentials must be injected via environment variables at deployment time.
   # See README.md for secure credential setup instructions.
   ```

4. **Update Cloudinary section** (if present):
   ```
   # Cloudinary — get credentials from Cloudinary dashboard
   CLOUDINARY_CLOUD_NAME=<YOUR_CLOUD_NAME>
   CLOUDINARY_API_KEY=<YOUR_API_KEY>
   CLOUDINARY_API_SECRET=<YOUR_API_SECRET>
   ```

---

**File 6**: `docs/rc-reports/` directory (MODIFY/REMOVE)

**Specific Changes**:
1. **Option A (Recommended)**: Remove documentation directory if it contains real credentials and is not part of production setup
   - Run: `rm -rf docs/rc-reports/`

2. **Option B**: Sanitize if documentation is valuable for reference
   - Replace all real Cloudinary identifiers with placeholders
   - Replace database connection strings with placeholders
   - Example: `"cloud_name": "<YOUR_CLOUD_NAME>"` instead of real cloud names
   - Remove actual JSON response bodies showing real credentials

---

**File 7**: `README.md` or new `SECURITY.md` (CREATE/MODIFY)

**Specific Changes**:
1. **Add Security Setup section** with:
   - "Development credentials must be requested from the team or obtained from respective dashboards (Cloudinary, Render)"
   - Instructions: "Copy `.env.example` to `.env.local` and populate with real values"
   - Warning: "Never commit `.env` or `.env.*.local` to git"
   - Cloudinary setup: "Sign up at cloudinary.com, create a project, copy Cloud Name, API Key, and API Secret to `.env.local`"
   - Database setup: "For local development, create a Postgres database or use Render's free tier. Copy connection string to DATABASE_URL in `.env.local`"
   - Secrets generation: "`openssl rand -hex 32` for JWT_SECRET and NEXTAUTH_SECRET"

2. **Add Production Deployment checklist**:
   - Verify all required env vars are set in deployment platform (Render, Vercel, etc.)
   - Do NOT commit `.env` or any credential files
   - Rotate Cloudinary credentials if ever exposed
   - Check git history: `git log --all --source --full-history -- .env` to verify no credentials are in history

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code (startup with missing secrets), then verify the fix works correctly (validation errors thrown) and preserves existing behavior (valid credentials work identically).

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm the root causes are correct.

**Test Plan**: Run the unfixed applications without required environment variables and observe that:
1. Startup does not fail with descriptive errors
2. The proxy route allows JWT signing with a fallback secret
3. Missing secrets do not surface until runtime request handling

**Test Cases**:
1. **API Startup Without DATABASE_URL** (will succeed on unfixed code)
   - Run apps/api with `unset DATABASE_URL`
   - Observe: Server starts listening despite missing DATABASE_URL
   - Expected failure: Error message `"DATABASE_URL is required"`

2. **Web Proxy Without NEXTAUTH_SECRET** (will use fallback on unfixed code)
   - Run apps/web with `unset NEXTAUTH_SECRET`
   - Attempt to call proxy route with authenticated request
   - Observe: JWT is signed with hardcoded fallback secret `'fallback-secret-do-not-use-in-production'`
   - Expected failure: Error message `"NEXTAUTH_SECRET environment variable is required and must not be empty"`

3. **API Startup Without JWT_SECRET** (will succeed on unfixed code)
   - Run apps/api with `unset JWT_SECRET`
   - Observe: Server starts listening despite missing JWT_SECRET
   - Expected failure: Error message `"JWT_SECRET is required"`

4. **Incomplete .gitignore** (will commit on unfixed code)
   - Create `.env.production.local` with fake credentials
   - Run `git add .env.production.local`
   - Observe: Git accepts the file (pattern not in .gitignore)
   - Expected: Git rejects with pattern check

5. **.env File Committed** (already in history on unfixed code)
   - Run `git log --all --source --full-history -- .env | head -20`
   - Observe: Historical commits show real Cloudinary credentials
   - Expected: `.env` is .gitignored, not in history on fixed code

**Expected Counterexamples**:
- Server starts without failing when required secrets are missing (indicates no startup validation)
- JWT can be signed with fallback secret when NEXTAUTH_SECRET is missing (indicates fallback logic)
- Credential files can be committed to git (indicates incomplete .gitignore patterns)
- Real credentials visible in git history and documentation (indicates exposure)

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (missing secrets, no validation, exposed credentials), the fixed code produces the expected behavior (fails with clear error, no fallbacks, credentials protected).

**Pseudocode:**
```
TEST: API Startup With Missing DATABASE_URL
  SETUP: Unset DATABASE_URL, set other required vars
  CALL: buildApp() and app.listen()
  EXPECT: Throws Error with message containing "DATABASE_URL"
  ASSERT: Error is thrown before server starts listening

TEST: Proxy With Missing NEXTAUTH_SECRET
  SETUP: Unset NEXTAUTH_SECRET
  CALL: signBackendJWT() or module initialization
  EXPECT: Throws Error with message "NEXTAUTH_SECRET environment variable is required"
  ASSERT: No fallback secret is used

TEST: .gitignore Prevents Credential Files
  SETUP: Create .env.production.local with fake credentials
  CALL: git add .env.production.local
  EXPECT: Git rejects file (check-ignore returns true)
  ASSERT: File cannot be staged

FOR ALL input WHERE isBugCondition(input) DO
  result := fixedApplication(input)
  ASSERT: Error thrown with descriptive message
  ASSERT: No fallback secrets used
  ASSERT: No server listening
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (valid secrets injected, all variables present), the fixed code produces exactly the same behavior as the original code.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT: originalApplication(input with valid secrets) = fixedApplication(input with valid secrets)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (various JWT payloads, request types, file sizes)
- It catches edge cases that manual unit tests might miss (token edge cases, large uploads)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: 
1. Observe behavior on UNFIXED code with valid credentials injected
2. Write property-based tests capturing that behavior
3. Run same tests on FIXED code and verify identical results

**Test Cases**:
1. **JWT Token Generation Preservation**: Generate random JWT payloads (various sub, role, email, name values) and verify:
   - Fixed code produces same signed token as original code (given same NEXTAUTH_SECRET)
   - Token validation produces same results
   - Different payloads produce different tokens

2. **Cloudinary Upload Preservation**: Verify:
   - Files uploaded with injected credentials are stored in same locations
   - Generated URLs match original format
   - Metadata is preserved
   - Upload errors (too large, wrong type) behave identically

3. **Database Connection Preservation**: Verify:
   - Queries execute identically with valid DATABASE_URL
   - Connection pooling behaves the same
   - Transaction handling is unchanged
   - Error responses for invalid queries are identical

4. **Authentication Request Preservation**: Verify:
   - Login requests with valid credentials produce same tokens
   - Token refresh produces same updated tokens
   - Logout behavior unchanged
   - Session invalidation works identically

5. **File Upload Preservation**: Verify:
   - Multipart file uploads succeed identically
   - File metadata is preserved
   - Size limits enforced the same way
   - Error handling for invalid uploads is unchanged

6. **Environment-Specific Behavior Preservation**: Verify:
   - Development mode (EMAIL_PROVIDER=preview) continues working
   - Test mode (EMAIL_PROVIDER=console) continues working
   - Production mode with real credentials continues working

### Unit Tests

- Test `assertSecretsConfigValid()` throws for each missing variable with correct error message
- Test `getEnvironmentStatus()` returns correct `secretsConfigured` and `missingSecrets` values
- Test proxy route initialization throws if NEXTAUTH_SECRET is missing
- Test JWT signing with valid NEXTAUTH_SECRET produces valid tokens
- Test email config validation continues to work (existing tests remain green)
- Test startup validation in API main() function fails before server listening

### Property-Based Tests

- Generate random JWT payloads and verify signing/validation consistency between original and fixed code
- Generate various Cloudinary file scenarios and verify upload behavior is identical
- Generate random environment variable combinations and verify correct validation errors
- Generate random valid environment combinations and verify no changes to application behavior

### Integration Tests

- Full local development flow with `.env.local` containing test credentials
- Full login/authentication/logout flow with valid injected secrets
- Full file upload flow through proxy with Cloudinary
- Full token refresh flow maintaining JWT validity
- Deployment scenario with environment-injected secrets (simulate Render env vars)
- Verify `.gitignore` prevents credential file commits via `git add`


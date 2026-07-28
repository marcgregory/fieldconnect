# Implementation Plan

## Overview

This implementation plan follows the bugfix requirements-first workflow using the bug condition methodology. The plan is structured in three phases: exploration and preservation testing to confirm bugs exist, implementation to apply fixes, and verification to ensure bugs are fixed without regressions.

## Tasks

### Phase 1: Exploration & Preservation Testing

- [ ] 1. Write bug condition exploration test
  - Property: **Property 1: Bug Condition** - Startup Without Required Secrets Succeeds
  - Test missing DATABASE_URL: Start API without env var; observe server starts (unfixed); expect error after fix
  - Test missing NEXTAUTH_SECRET: Start Web proxy; observe fallback used (unfixed); expect error after fix  
  - Test missing JWT_SECRET: Start API without env var; observe server starts (unfixed); expect error after fix
  - Test incomplete .gitignore: Create .env.production.local; observe git accepts (unfixed); expect rejection after fix
  - Test exposed credentials: Run git log --all --source --full-history -- .env; observe real credentials (unfixed); expect .gitignore after fix
  - Document all counterexamples found on unfixed code
  - Expected result: Test FAILS on unfixed code (confirms bugs exist)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 2. Write preservation property tests
  - Property: **Property 2: Preservation** - Valid Credentials Produce Correct Behavior
  - Observe JWT generation with valid NEXTAUTH_SECRET on unfixed code
  - Observe database queries with valid DATABASE_URL on unfixed code
  - Observe file uploads with valid Cloudinary credentials on unfixed code
  - Observe authentication flows with valid credentials on unfixed code
  - Write property-based tests capturing all observed behaviors
  - Run tests on unfixed code with valid environment variables set
  - Expected result: Tests PASS on unfixed code (confirms baseline behavior)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

### Phase 2: Implementation

- [ ] 3. Implement environment validation module
  - Create: apps/api/src/lib/env.ts
  - Export assertSecretsConfigValid() function that validates DATABASE_URL, NEXTAUTH_SECRET, JWT_SECRET
  - Throw specific Error for each missing variable
  - Allow opt-in ALLOW_MISSING_SECRETS=1 in development only
  - Export getEnvironmentStatus() helper for safe logging
  - Ensure reusable pattern matching assertEmailConfigValid() approach
  - _Bug_Condition: No startup validation for required secrets (Requirements 1.4)_
  - _Expected_Behavior: Fail fast at startup with descriptive error for missing secrets_
  - _Preservation: Email validation continues working unchanged_
  - _Requirements: 2.4_

- [ ] 4. Add startup validation to API
  - Modify: apps/api/src/index.ts
  - Import assertSecretsConfigValid from lib/env
  - Call assertSecretsConfigValid() after assertEmailConfigValid() in main()
  - Add try/catch to exit process with code 1 on validation failure
  - Ensure validation occurs BEFORE buildApp() and BEFORE app.listen()
  - _Bug_Condition: No startup validation in API (Requirements 1.4)_
  - _Expected_Behavior: Fail fast at startup before server listens_
  - _Preservation: Error handling continues unchanged_
  - _Requirements: 2.4_

- [ ] 5. Remove fallback secret from Web proxy
  - Modify: apps/web/src/app/api/proxy/[...path]/route.ts
  - Remove fallback string 'fallback-secret-do-not-use-in-production'
  - Replace with validation that throws Error if NEXTAUTH_SECRET is missing or empty
  - Error message: "NEXTAUTH_SECRET environment variable is required and must not be empty"
  - Consider moving validation to apps/web/src/app.ts or root layout for earlier detection
  - _Bug_Condition: Fallback secret used when NEXTAUTH_SECRET missing (Requirements 1.3)_
  - _Expected_Behavior: Fail immediately if NEXTAUTH_SECRET unavailable_
  - _Preservation: JWT signing with valid secret works identically_
  - _Requirements: 2.3_

- [ ] 6. Enhance .gitignore with comprehensive patterns
  - Modify: d:\FieldConnect\.gitignore
  - Add patterns: .env, .env.local, .env.production, .env.production.local, .env.test, .env.*.local
  - Verify with git check-ignore: .env, .env.local, .env.production.local, .env.staging.local all return matches
  - Verify .env.example is NOT ignored (remains tracked)
  - Verify git ls-files shows only .env.example in env-related files
  - _Bug_Condition: Incomplete .gitignore patterns (Requirements 1.5)_
  - _Expected_Behavior: All credential files ignored; only .env.example tracked_
  - _Preservation: No impact on existing tracked files_
  - _Requirements: 2.5_

- [ ] 7. Update .env.example with secure placeholders
  - Modify: d:\FieldConnect\.env.example
  - Add security warning header at top (NEVER commit .env to version control)
  - Replace DATABASE_URL default: postgres://YOUR_USER:YOUR_PASSWORD@localhost:5432/fieldconnect
  - Add JWT_SECRET placeholder with openssl rand -hex 32 guidance
  - Add NEXTAUTH_SECRET placeholder with openssl rand -hex 32 guidance
  - Replace Cloudinary values with placeholders: <YOUR_CLOUD_NAME>, <YOUR_API_KEY>, <YOUR_API_SECRET>
  - Verify no real credential values remain in file
  - _Bug_Condition: Weak default credentials (Requirements 1.6)_
  - _Expected_Behavior: Placeholder format guides secure configuration_
  - _Preservation: File structure unchanged_
  - _Requirements: 2.6_

- [ ] 8. Sanitize documentation
  - Remove or sanitize: docs/rc-reports/ directory
  - Option A (recommended): Remove directory if contains real credentials and not needed
  - Option B: Sanitize if valuable documentation - replace all real identifiers with placeholders
  - Replace cloud_name dytmv00iq with <YOUR_CLOUD_NAME>
  - Replace API keys with <YOUR_API_KEY>, <YOUR_API_SECRET>
  - Remove actual response bodies showing real credentials
  - Verify no credential values visible in any docs
  - _Bug_Condition: Credentials exposed in documentation (Requirements 1.2)_
  - _Expected_Behavior: Documentation contains only placeholders_
  - _Preservation: Documentation structure unchanged_
  - _Requirements: 2.2_

- [x] 9. Add security setup documentation
  - Create/modify: README.md or new SECURITY.md
  - Add Security Setup section with credential obtaining instructions
  - Document: Cloudinary signup at cloudinary.com, copy credentials to .env.local
  - Document: Database setup for local development or Render tier
  - Document: Generate secrets with openssl rand -hex 32
  - Document: Copy .env.example to .env.local and populate with real values
  - Add warnings: Never commit .env or .env.*.local
  - Add Production Deployment checklist with env var verification
  - Add: Verify no credentials in history with git log --all --source --full-history -- .env
  - _Requirements: 2.1, 2.2, 2.6_

### Phase 3: Verification

- [ ] 10. Verify bug condition exploration test now passes
  - Re-run SAME exploration test from Task 1 on FIXED code (do not write new test)
  - API fails with error when DATABASE_URL missing
  - Web proxy fails with error when NEXTAUTH_SECRET missing
  - API fails with error when JWT_SECRET missing
  - .env.production.local cannot be added to git
  - No new credentials in git history
  - Verify error messages are descriptive
  - Expected result: Test PASSES (confirms bugs fixed)
  - _Requirements: 2.3, 2.4_

- [ ] 11. Verify preservation tests still pass
  - Re-run SAME preservation tests from Task 2 on FIXED code (do not write new tests)
  - JWT tokens with valid NEXTAUTH_SECRET validate correctly
  - Database queries with valid DATABASE_URL execute successfully
  - Cloudinary uploads with valid credentials succeed identically
  - Authentication flow produces same behavior
  - Email config validation continues working
  - Expected result: Tests PASS (confirms no regressions)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 12. Write and run unit tests
  - Create: apps/api/src/lib/env.test.ts
  - Test assertSecretsConfigValid throws for missing DATABASE_URL, NEXTAUTH_SECRET, JWT_SECRET
  - Test does NOT throw when all variables set
  - Test throws for empty strings (not just undefined)
  - Test getEnvironmentStatus returns correct object
  - Test error messages identify missing variable
  - Create: apps/web/src/app/api/proxy/[...path]/route.test.ts
  - Test proxy fails if NEXTAUTH_SECRET missing or empty
  - Test proxy works when NEXTAUTH_SECRET set
  - Test no fallback secret used
  - Create: apps/api/src/index.test.ts
  - Test API startup fails for missing DATABASE_URL, NEXTAUTH_SECRET, JWT_SECRET
  - Test API startup succeeds with all variables
  - Run: pnpm test - verify all new tests pass
  - _Requirements: 2.3, 2.4_

- [ ] 13. Write and run integration tests
  - Test full local development flow: Set .env.local, start API, verify server listens
  - Test full login/logout: Login with credentials, receive JWT, refresh, logout
  - Test full file upload: Upload through proxy, verify Cloudinary storage
  - Test full token refresh: Refresh JWT, verify new token valid
  - Test deployment simulation: Start with environment-injected secrets, verify functionality
  - Test edge cases: Start without .env.local but with environment vars; attempt API calls without NEXTAUTH_SECRET
  - Run: pnpm test:integration - verify all tests pass
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 14. Verify existing test suites still pass
  - Run: pnpm test - full test suite
  - Verify no regressions: All existing tests pass without modification
  - Run: pnpm --filter api test
  - Run: pnpm --filter web test
  - Verify email config tests pass
  - Verify authentication tests pass
  - Verify file upload tests pass
  - Verify database query tests pass
  - Ensure no new test failures introduced
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 15. Verify .gitignore patterns work
  - Create test files: .env, .env.local, .env.production.local, .env.staging.local
  - Run: git check-ignore for each file (should return matches for all except .env.example)
  - Attempt: git add .env (should be rejected)
  - Attempt: git add .env.production.local (should be rejected)
  - Attempt: git add .env.example (should succeed)
  - Verify: git ls-files shows only .env.example in env-related files
  - _Requirements: 2.5_

- [ ] 16. Checkpoint - Ensure all tests and verifications pass
  - Bug condition test passes on fixed code
  - Preservation tests pass on fixed code
  - All unit tests pass
  - All integration tests pass
  - Existing test suite passes (no regressions)
  - .gitignore patterns verified with git check-ignore
  - Documentation updated with security setup
  - .env.example contains only placeholders
  - docs/rc-reports sanitized or removed
  - Error messages are descriptive and helpful
  - Ask user if questions arise
  - _Requirements: All (2.1 - 3.5)_

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "description": "Exploration & Preservation Testing",
      "tasks": ["1", "2"]
    },
    {
      "wave": 2,
      "description": "Implementation",
      "tasks": ["3", "4", "5", "6", "7", "8", "9"]
    },
    {
      "wave": 3,
      "description": "Verification & Testing",
      "tasks": ["10", "11", "12", "13", "14", "15"]
    },
    {
      "wave": 4,
      "description": "Finalization",
      "tasks": ["16"]
    }
  ]
}
```

**Wave Execution Model**:
- **Wave 1** (Parallel): Tasks 1-2 - Explore bugs and establish preservation baselines
- **Wave 2** (Parallel): Tasks 3-9 - Implement all fixes
- **Wave 3** (Parallel): Tasks 10-15 - Verify fixes work and behavior is preserved
- **Wave 4** (Sequential): Task 16 - Final checkpoint confirming all fixes are complete

## Notes

### Bug Condition Methodology Reference

- **C(X)** (Bug Condition): Missing secrets at startup, fallback secrets, exposed credentials, incomplete .gitignore
- **P(result)** (Property): Fail fast with descriptive error, no fallbacks, credentials protected, validation at startup
- **¬C(X)** (Non-buggy inputs): Valid environment variables properly injected at deployment
- **F** (Unfixed): Current code with vulnerabilities
- **F'** (Fixed): Code with environment validation and fallback removal

### Key Testing Principles

1. **Exploration First**: Run bug condition tests on unfixed code to confirm bugs exist before implementing fix
2. **Preservation First**: Establish baseline behavior on unfixed code, then verify fix doesn't change it
3. **Descriptive Errors**: Each validation failure provides specific guidance on missing variable
4. **Early Failure**: Validation happens at startup before server listens, not during request handling
5. **No Fallbacks**: Remove all hardcoded fallback values; fail loud and clear instead

### Security Considerations

- Never log secret values, only their presence/absence
- Validate all required secrets before code that depends on them executes
- Ensure .env files are never committed to git history
- Use environment-injected secrets only at runtime
- Provide clear documentation for secure credential management

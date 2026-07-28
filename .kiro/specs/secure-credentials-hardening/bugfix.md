# Bugfix Requirements: Credential Exposure and Missing Validation

## Introduction

FieldConnect has critical security vulnerabilities related to credential handling and environment variable management. Sensitive credentials (Cloudinary API keys, database passwords) are exposed in version-controlled files and documentation. Additionally, the application lacks proper validation of required secrets at startup, and contains hardcoded fallback secrets that could be used if NEXTAUTH_SECRET is missing. These issues create significant security risks for deployments and increase the attack surface for credential theft.

## Bug Analysis

### Current Behavior (Defect)

**1.1 Cloudinary Credentials Exposed in Tracked .env**
WHEN the application is deployed THEN Cloudinary API credentials (CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_CLOUD_NAME) are exposed in tracked .env file and accessible via git version control history. Real credentials were exposed in version-controlled files.
- Acceptance Criteria: Credentials must be removed from .env and never appear in tracked files; .env must be .gitignored; .env.example must use placeholder values

**1.2 Credentials Exposed in Documentation**
WHEN deployment documentation is consulted THEN Cloudinary identifiers are exposed in version-controlled documentation files containing real Cloudinary account information and cloud names in JSON and markdown reports.
- Acceptance Criteria: Documentation must be sanitized or removed; no actual cloud names, API keys, or credential values appear in docs

**1.3 Fallback Secret Instead of Failing (Critical Auth Risk)**
WHEN NEXTAUTH_SECRET environment variable is not set THEN the proxy route (apps/web/src/app/api/proxy/[...path]/route.ts, lines 7-10) falls back to hardcoded string `'fallback-secret-do-not-use-in-production'` instead of failing loudly. This fallback is used to sign JWT tokens, meaning unsigned or weakly-signed tokens could be accepted if the env var is missing.
- Acceptance Criteria: If NEXTAUTH_SECRET is undefined, the application SHALL throw an Error at initialization with message "NEXTAUTH_SECRET environment variable is required"; NOT fall back to any hardcoded value; JWT signing MUST fail immediately before any request is processed

**1.4 No Startup Validation for Required Secrets**
WHEN the application starts without DATABASE_URL, NEXTAUTH_SECRET, JWT_SECRET, or other required environment variables THEN no validation occurs and the application proceeds with undefined or incomplete credential state. Currently, apps/api/src/index.ts validates EMAIL_PROVIDER but not DATABASE_URL or JWT_SECRET at startup.
- Acceptance Criteria: At application startup (before server listens), validate presence and non-empty state of DATABASE_URL, NEXTAUTH_SECRET, JWT_SECRET; fail fast with descriptive error message for each missing variable; differentiate between development (some optional) and production (all required); validate in both API and Web applications

**1.5 Incomplete .gitignore Patterns**
WHEN developers run git operations THEN .env files containing credentials can be committed because .gitignore (d:\FieldConnect\.gitignore) lacks comprehensive patterns. Missing patterns: `.env.*.local` (e.g., .env.production.local, .env.staging.local), `.env.production.local`. Current .gitignore has `.env`, `.env.local`, `.env.production`, `.env.test` but misses environment-specific overrides.
- Acceptance Criteria: All credential files must be .gitignored: `.env`, `.env.local`, `.env.production`, `.env.production.local`, `.env.test`, `.env.*.local`; `.env.example` must remain tracked (documentation template); verify with `git check-ignore` for each pattern

**1.6 Weak Default Database Credentials**
WHEN database credentials are configured THEN the default connection string in .env.example uses weak default credentials `postgres://user:password@localhost:5432/fieldconnect` (literal "password" placeholder). Current .env.example suggests users type this literally, normalizing weak defaults.
- Acceptance Criteria: .env.example MUST use secure placeholder format (e.g., `postgres://YOUR_USER:YOUR_PASSWORD@host/dbname` or `DATABASE_URL=<get-from-render-dashboard>`); documentation MUST advise against using default username/password in any environment

### Expected Behavior (Correct)

**2.1 Cloudinary Credentials Not Exposed**
WHEN the application is deployed THEN Cloudinary API credentials must not appear in tracked .env file; credentials must be injected via secure environment variables at runtime only. File d:\FieldConnect\.env MUST be .gitignored and removed from git history; .env.example MUST use placeholders only (no real values).
- Acceptance Criteria: `git ls-files` does not include `.env`; Cloudinary credentials are ONLY read from process.env at runtime; no hardcoded credentials exist in source code or version history; developers receive instructions to obtain credentials from secure sources (Cloudinary dashboard or team secrets manager)

**2.2 Documentation Sanitized of Credentials**
WHEN deployment documentation is consulted THEN no actual credential values or cloud names should be exposed; only placeholder documentation should exist. Docs must be either removed or fully sanitized of real identifiers.
- Acceptance Criteria: No actual Cloudinary cloud names, API keys, or sensitive identifiers appear in any docs; any references to credential placement use placeholders (e.g., `<YOUR_CLOUD_NAME>`)

**2.3 Missing NEXTAUTH_SECRET Fails Immediately**
WHEN NEXTAUTH_SECRET environment variable is not set THEN the application SHALL fail at startup with a clear error message indicating the required environment variable is missing, rather than falling back to a hardcoded value. The proxy route MUST throw an Error during initialization, before the server starts listening.
- Acceptance Criteria: If NEXTAUTH_SECRET is undefined/empty, initialization throws Error with message "NEXTAUTH_SECRET environment variable is required and must not be empty"; no fallback secret is used; error is logged and process exits with code 1; this applies to both API and Web applications

**2.4 Startup Validation for All Required Secrets**
WHEN the application starts THEN it SHALL validate that all required secrets (DATABASE_URL, NEXTAUTH_SECRET, JWT_SECRET) are present and non-empty, failing fast if any are missing. Validation happens before server starts listening, with clear per-variable error messages.
- Acceptance Criteria: Each required variable is checked; if missing or empty, throw Error with specific message (e.g., "DATABASE_URL is required"); validation occurs for both apps/api and apps/web; error messages guide users on how to set variables; in production, validation is always enforced; in development, optionally some vars can be skipped with explicit opt-in (e.g., ALLOW_MISSING_SECRETS=1)

**2.5 Comprehensive .gitignore Patterns**
WHEN developers attempt to commit THEN git operations SHALL prevent .env.*.local and .env.production.local files from being tracked via comprehensive .gitignore patterns. All environment-specific credential files are excluded, while .env.example remains tracked.
- Acceptance Criteria: .gitignore includes patterns: `.env`, `.env.local`, `.env.production`, `.env.production.local`, `.env.test`, `.env.*.local`; verify each pattern with `git check-ignore <pattern>`; `.env.example` is tracked (not ignored); attempting `git add .env.production.local` is rejected by git

**2.6 Secure Default Credential Placeholders**
WHEN database credentials are configured THEN the default connection string in .env.example SHALL use secure placeholder syntax (not literal default username/password) to prevent weak credentials. Documentation MUST advise against using generic passwords.
- Acceptance Criteria: .env.example uses placeholders like `postgres://YOUR_USER:YOUR_PASSWORD@host/dbname` OR `DATABASE_URL=<get-from-deployment-platform>`; no literal "password" or "postgres" defaults; README or setup docs explicitly warn against weak credentials; example includes comment explaining how to obtain real credentials securely

### Unchanged Behavior (Regression Prevention)

**3.1 Authentication and File Uploads Continue to Work**
WHEN the application is running with valid environment variables properly injected THEN authentication, API communication, and file uploads via Cloudinary SHALL CONTINUE TO work without changes. JWT token validation, user login flows, and Cloudinary storage operations must function identically.
- Acceptance Criteria: All existing unit and integration tests pass; authentication tokens are generated and validated correctly; Cloudinary uploads work with injected credentials; no changes to public API signatures

**3.2 Local Development Workflows Unaffected**
WHEN development workflows use .env.local or .env files for testing THEN local development SHALL CONTINUE TO function normally. Developers can still use local .env files for development without disruption.
- Acceptance Criteria: Local development setup (pnpm dev, pnpm build) works with .env.local; developers can continue using existing development workflow; no new setup steps required (documentation updates are acceptable)

**3.3 Environment-Specific Configuration Respected**
WHEN environment variables are correctly configured for different environments (development, test, production) THEN the application SHALL CONTINUE TO respect those configurations appropriately. Environment-specific behavior (EMAIL_PROVIDER=preview in dev, EMAIL_PROVIDER=resend in production) must remain unchanged.
- Acceptance Criteria: Development, test, and production environments behave as currently configured; environment detection works; conditional logic based on NODE_ENV continues functioning

**3.4 Cloudinary Storage Operations Identical**
WHEN Cloudinary storage is used with valid credentials THEN file uploads and storage operations SHALL CONTINUE TO function identically to current behavior. No changes to upload paths, URL generation, or file metadata handling.
- Acceptance Criteria: Files are stored in same Cloudinary folders; generated URLs match current format; file metadata is preserved; no changes to upload middleware or response formats

**3.5 JWT Authentication Validation Unchanged**
WHEN authorized API requests include valid JWT tokens THEN the proxy authentication SHALL CONTINUE TO validate requests correctly. Token validation logic, permission checks, and role-based access control must work exactly as before.
- Acceptance Criteria: Existing JWT tokens remain valid; token validation produces same results; permission checks are consistent; no changes to authentication middleware behavior

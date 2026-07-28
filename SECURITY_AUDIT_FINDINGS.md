# Security Audit: Hardcoded Credentials & API Keys

**Date:** 2026-07-15
**Status:** CRITICAL & MODERATE ISSUES IDENTIFIED
**Scope:** Full codebase scan for hardcoded credentials, exposed API keys, and database URLs

---

## Executive Summary

A comprehensive security audit of the FieldConnect codebase has identified **6 critical security vulnerabilities** related to credential exposure, weak validation, and insufficient git protection. These issues create significant risks for data breach, unauthorized API access, and production compromise.

### Critical Findings:
- ✗ Cloudinary API credentials exposed in tracked `.env` file
- ✗ Credentials exposed in documentation and test reports
- ✗ Hardcoded fallback secret that bypasses missing environment validation
- ✗ No startup validation for required secrets (DATABASE_URL, JWT_SECRET, NEXTAUTH_SECRET)
- ✗ Incomplete `.gitignore` patterns allowing credential files to be committed
- ✗ Weak default database credentials in `.env.example`

---

## Detailed Findings

### 1. ⛔ CRITICAL: Cloudinary API Credentials Exposed in .env

**Location:** `d:\FieldConnect\.env`

**Exposed Credentials:**
Real Cloudinary credentials were exposed in `.env` file (now removed)

**Risk Level:** CRITICAL
- API keys can be used to upload/delete/modify files in your CDN
- Cloud name reveals your Cloudinary account identifier
- If repo is public or shared, these are immediately accessible
- Complete control over all file storage operations

**Current Status:**
- ✗ File contained real credentials (removed in security fix)
- ✗ Historical commits may contain credentials
- ✓ Now using environment injection from secure platform

**Recommendation:**
1. **IMMEDIATE:** Regenerate these credentials in Cloudinary dashboard
2. Remove from git history (use `git filter-branch` or similar)
3. Move to environment-only injection via deployment platform (Render, Vercel)
4. Update `.env.example` with placeholders only

---

### 2. ⛔ CRITICAL: Credentials Exposed in Documentation

**Locations:**
- `docs/rc-reports/evidence-task4/signature-response.json`
- `docs/rc-reports/evidence-task4/upload-response.json`
- `docs/rc-reports/evidence-task5/cloudinary-health.json`
- `docs/rc-reports/rc-task-4-file-storage-and-reporting.md`
- `docs/rc-reports/rc-task-5-production-health.md`

**Exposed Data:**
- Real Cloudinary cloud names and identifiers in version-controlled files
- API credentials in tracked .env file
- Account identifiers in documentation

**Risk Level:** CRITICAL
- If documentation is shared or accessible, cloud identity is exposed
- Combined with stolen API key, enables full CDN compromise
- Exposes internal infrastructure details in reports

**Current Status:**
- ✗ Real cloud identifiers in production reports
- ✗ JSON response files contain actual URLs with cloud name
- ✗ Markdown documentation references real URLs

**Recommendation:**
1. Sanitize or remove all rc-reports documentation before sharing
2. Use generic placeholders: `<CLOUD_NAME>`, `<YOUR_ACCOUNT>`
3. For future reports, use mock/sanitized data
4. Consider if this documentation should be version-controlled at all

---

### 3. ⛔ CRITICAL: Hardcoded Fallback Secret (Authentication Risk)

**Location:** `apps/web/src/app/api/proxy/[...path]/route.ts:8`

**Code:**
```typescript
const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'fallback-secret-do-not-use-in-production'
);
```

**Risk Level:** CRITICAL (Auth Bypass)
- If NEXTAUTH_SECRET is unset, JWT tokens are signed with a public/known value
- Attacker could forge valid JWT tokens
- Silent failure—no error message if env var is missing
- Critical authentication mechanism is compromised

**Current Status:**
- ✗ Fallback secret is hardcoded
- ✗ No error thrown if NEXTAUTH_SECRET is missing
- ✗ Application continues running with weak authentication

**Affected File:**
- `apps/web/src/app/api/proxy/[...path]/route.ts` (lines 7-10)

**Recommendation:**
```typescript
// INSTEAD OF: process.env.NEXTAUTH_SECRET || 'fallback-...'
const secret = process.env.NEXTAUTH_SECRET;
if (!secret) {
  throw new Error('NEXTAUTH_SECRET environment variable is required');
}
const JWT_SECRET = new TextEncoder().encode(secret);
```

---

### 4. ⛔ CRITICAL: No Startup Validation for Required Secrets

**Location:** Multiple files lack validation:
- `apps/api/src/index.ts` (validates EMAIL_PROVIDER only)
- `apps/web/src/app/api/proxy/[...path]/route.ts` (no validation)
- `apps/web/src/app/api/auth/login/route.ts` (no validation)

**Risk Level:** CRITICAL
- Application starts with undefined credentials
- Silent failures deep in request handlers instead of at startup
- Developers may not notice missing configuration until production
- No differentiation between dev (some optional) and production (all required)

**Required Variables (Not Validated):**
- DATABASE_URL (critical)
- NEXTAUTH_SECRET (critical)
- JWT_SECRET (critical)
- CLOUDINARY_API_KEY (if using real storage)
- CLOUDINARY_API_SECRET (if using real storage)
- RESEND_API_KEY (if using real email)

**Current Status:**
- ✗ EMAIL_PROVIDER has validation (example exists in `apps/api/src/lib/email/config.ts`)
- ✗ Other secrets have NO startup validation
- ✗ Fallback defaults mask missing configuration

**Recommendation:**
Create a startup validation module:
```typescript
// lib/env-validation.ts
export function validateRequiredSecrets(nodeEnv: string) {
  const required = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'JWT_SECRET'];
  const missing = required.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

// apps/api/src/index.ts (startup)
validateRequiredSecrets(process.env.NODE_ENV || 'development');
```

---

### 5. ⚠️ MODERATE: Incomplete .gitignore Patterns

**Location:** `d:\FieldConnect\.gitignore`

**Current Patterns:**
```
.env
.env.local
.env.production
.env.test
```

**Missing Patterns:**
```
.env.*.local          # (e.g., .env.production.local, .env.staging.local)
.env.production.local # Already covered above
```

**Risk Level:** MODERATE
- Environment-specific credential overrides could be committed
- Developers might create `.env.staging.local` with real credentials
- Weak pattern matching allows credential files to slip through

**Current Status:**
- ⚠️ .gitignore exists but is incomplete
- ⚠️ `.env.example` is correctly tracked (good)
- ✗ Missing catch-all for environment-specific overrides

**Verification:**
```bash
git check-ignore .env.production.local    # ✓ should be ignored
git check-ignore .env.staging.local       # ✗ NOT currently ignored
git check-ignore .env.custom.local        # ✗ NOT currently ignored
git check-ignore .env.example             # ✗ should NOT be ignored
```

**Recommendation:**
```gitignore
# Comprehensive environment variable patterns
.env                    # Base .env file
.env.local              # Local overrides
.env.*.local            # Environment-specific local (staging.local, prod.local, etc)
.env.production.local   # Explicit production override
.env.test               # Test environment (already in file)

# Keep .env.example — it's documentation
!.env.example
```

---

### 6. ⚠️ MODERATE: Weak Database Credential Defaults

**Location:** `d:\FieldConnect\.env.example`

**Current Credentials:**
```
DATABASE_URL=postgres://user:password@localhost:5432/fieldconnect
```

**Risk Level:** MODERATE
- Template suggests using literal "user:password" format
- Encourages weak default credentials (password = "password")
- Developers may copy this and use it directly in non-local environments
- Violates principle of least privilege

**Current Status:**
- ⚠️ Example uses descriptive placeholder "user:password"
- ✓ File is not tracked in .gitignore (good, it's documentation)
- ✗ No guidance on how to obtain real credentials

**Recommendation:**
```env
# Placeholder format makes it clear these are NOT real credentials
DATABASE_URL=postgres://YOUR_DB_USER:YOUR_DB_PASSWORD@YOUR_HOST:5432/fieldconnect

# Or use service-specific instructions
# For Render: DATABASE_URL is auto-provided in dashboard
# For local: Use local PostgreSQL and your own credentials
# For production: Never use default username/password - create app-specific user
```

---

## Summary Table

| Issue | Location | Risk | Status | Fix Difficulty |
|-------|----------|------|--------|-----------------|
| Cloudinary API Key Exposed | `.env` | CRITICAL | Unfixed | Easy |
| Credentials in Docs | `docs/rc-reports/` | CRITICAL | Unfixed | Easy |
| Fallback Secret | `apps/web/.../route.ts:8` | CRITICAL | Unfixed | Easy |
| No Startup Validation | `apps/api/src/index.ts` | CRITICAL | Unfixed | Medium |
| Incomplete .gitignore | `.gitignore` | MODERATE | Unfixed | Easy |
| Weak DB Defaults | `.env.example` | MODERATE | Unfixed | Easy |

---

## Remediation Priority

### Phase 1: IMMEDIATE (Today)
- [ ] Regenerate Cloudinary credentials
- [ ] Remove credentials from `.env`
- [ ] Sanitize documentation
- [ ] Update .gitignore
- [ ] Fix fallback secret in route.ts

### Phase 2: SHORT-TERM (This Week)
- [ ] Add startup environment validation
- [ ] Update `.env.example` with better placeholders
- [ ] Add validation tests
- [ ] Document secure setup process

### Phase 3: LONG-TERM (Next Sprint)
- [ ] Implement secret linting in CI/CD
- [ ] Add pre-commit hooks
- [ ] Audit git history for leaked credentials
- [ ] Set up secrets management system (Render, GitHub Secrets, etc)

---

## Files Requiring Updates

### MUST CHANGE (Before Next Deployment):
1. `d:\FieldConnect\.env` - Remove real credentials
2. `apps/web/src/app/api/proxy/[...path]/route.ts` - Remove fallback secret
3. `d:\FieldConnect\.gitignore` - Add missing patterns
4. `d:\FieldConnect\.env.example` - Improve placeholder format
5. `docs/rc-reports/` - Sanitize or remove

### SHOULD CHANGE (This Week):
1. `apps/api/src/index.ts` - Add startup validation
2. README/setup docs - Document secure credential handling
3. Tests - Add validation for missing secrets

---

## Verification Commands

```bash
# Check git ignores credentials
git check-ignore .env
git check-ignore .env.local
git check-ignore .env.production.local

# Verify no credentials in tracked files
git log -p --all -- "*.env" | grep -E "(CLOUDINARY|SECRET|PASSWORD|KEY)"

# Scan for exposed credentials
grep -r "CLOUDINARY_API_KEY\|API_SECRET\|fallback-secret" apps/

# Check for unset critical vars
grep -r "process.env\.\w\+ ||" apps/ | grep -v "localhost"
```

---

## References

- [OWASP: Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [GitHub: Removing Sensitive Data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Render: Environment Variables](https://render.com/docs/environment-variables)
- [NIST: Credential Management](https://csrc.nist.gov/publications/fips)

---

**Status:** Ready for implementation via spec workflow
**Next Steps:** Run the `secure-credentials-hardening` bugfix spec to fix all issues systematically


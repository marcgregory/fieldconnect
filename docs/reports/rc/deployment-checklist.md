# FieldConnect v1.0.0-beta — Deployment Checklist

**Version:** v1.0.0-beta-feature-complete
**Target:** Render.com (production)
**Date:** 2026-07-14

---

## Pre-Deployment

### Environment Variables

Check all required env vars are set on Render:

| Variable | Required | Status |
|----------|----------|--------|
| `DATABASE_URL` | ✅ Yes | Render PostgreSQL auto-provided |
| `JWT_SECRET` | ✅ Yes | ✅ Should be set |
| `NEXTAUTH_SECRET` | ✅ Yes | ✅ Should be set |
| `NEXTAUTH_URL` | ✅ Yes | Set to `https://<app>.onrender.com` |
| `API_URL` | ✅ Yes | Set to `https://<api>.onrender.com` |
| `CORS_ORIGIN` | ✅ Yes | Set to frontend URL |
| `FIELDCONNECT_PROXY_SECRET` | ✅ Yes | Long random string |
| `EMAIL_PROVIDER` | ✅ Yes | `resend` for production |
| `EMAIL_FROM` | ✅ Yes | Verified sending email |
| `APP_URL` | ✅ Yes | Base URL for links in emails |
| `RESEND_API_KEY` | ✅ Yes | From Resend dashboard |
| `CLOUDINARY_CLOUD_NAME` | ⚠️ If using Cloudinary | |
| `CLOUDINARY_API_KEY` | ⚠️ If using Cloudinary | |
| `CLOUDINARY_API_SECRET` | ⚠️ If using Cloudinary | |

### Build Verification

- [ ] `pnpm lint` passes (no errors, warnings acceptable)
- [ ] `pnpm typecheck` passes (0 type errors)
- [ ] `pnpm build` passes (4/4 packages, 20 routes)
- [ ] `pnpm test` passes (all unit tests)

### Database

- [ ] Run `pnpm db:migrate` (all 31+ migrations applied)
- [ ] Verify migration count matches expected
- [ ] Run `pnpm db:seed` for initial test data (if needed)
- [ ] Verify `sessions` table exists (migration 031)
- [ ] Verify `auth_audit_logs` table exists (migration 027)
- [ ] Verify `rate_limit_events` table exists (migration 028)
- [ ] Verify `login_lockouts` table exists (migration 030)
- [ ] Verify `rework_requests` table exists (migration 018)

## Deployment Steps

### Build & Push

1. [ ] Create release commit (`git add -A && git commit -m "release: v1.0.0-beta-feature-complete"`)
2. [ ] Create annotated tag (`git tag -a v1.0.0-beta-feature-complete -m "FieldConnect feature-complete for closed beta"`)
3. [ ] Push to GitHub (`git push && git push --tags`)
4. [ ] Verify Render auto-deploy triggers (or trigger manual deploy)
5. [ ] Monitor Render build logs for success

### Post-Deployment Verification

- [ ] Health endpoint responds: `GET /api/v1/health`
- [ ] Database health endpoint responds: `GET /api/v1/health/db`
- [ ] Auth register works: `POST /api/v1/auth/register`
- [ ] Auth login works: `POST /api/v1/auth/login`
- [ ] Security headers present on API responses
- [ ] CSP headers present on frontend responses
- [ ] Login page loads without hydration errors
- [ ] Mobile page loads and shows clock-in form

## Rollback Plan

If deployment fails:

1. Identify the failing component (API/Web/Database)
2. If API fails: Check database migrations, environment variables, or API code
3. If Web fails: Check build output, ensure API URL is correct
4. If Database fails: Migration may need rollback (`pnpm db:rollback`)
5. If unrecoverable: Revert to previous commit and re-deploy

## Monitoring

- [ ] Check Render dashboard for API health
- [ ] Verify database connections are within limits
- [ ] Set up cron job for cleanup: `DRY_RUN=0 npx tsx src/scripts/cleanup.ts`

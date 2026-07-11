# FieldConnect Technical Debt

Last updated: 2026-07-05

Every item must include Priority, Reason, Impact, Planned Sprint, and Owner.

| ID | Item | Priority | Reason | Impact | Planned Sprint | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TD-001 | No automated tests yet | High | Sprints 1-3 focused on foundation, features, and field data collection. Tests remain a high priority. | Untested code increases regression risk as features grow. | Sprint 4 | Developer | Open |
| TD-002 | No CI/CD pipeline | High | Initial deploys are manual. | Risk of breaking production on manual deploy. | Sprint 4 — deployment | Developer | Open |
| TD-003 | No error monitoring service | Medium | Relying on Render logs only. No Sentry or similar. | Hard to diagnose production issues proactively. | Sprint 4 | Developer | Open |
| TD-004 | No database backup restore tested | Medium | Render does automated backups; no restore drill has been performed. | Recovery time unknown in a data loss scenario. | Sprint 5 | Developer | Open |
| TD-005 | Offline time entry not implemented | Low | Offline support is limited to action queue (notes, photos, signatures, status transitions). Time entry offline not included. | Technicians may lose time entries when connectivity drops. | Sprint 5 | Developer | Open |
| TD-006 | No Render.com account provisioned | High | Need to create Render account, PostgreSQL instance, and configure env vars. | Cannot deploy or test against real database. | Sprint 4 — deployment | Developer | Open |
| TD-007 | No GitHub repository initialized | High | Code lives only on local machine. | No version control, collaboration, or CI. | Sprint 4 — deployment | Developer | Open |
| TD-008 | Hand-rolled forms in ScheduleForm, ClockInOut, JobDetailClient still need migration to react-hook-form + zod | Medium | Sprint 6 form-architecture work migrated auth forms + ProjectForm only. The three larger forms still use the old `useState` + `FormData` + manual `safeParse` pattern, so their validation rules drift from the shared Zod schemas and they have inconsistent error UX. | Form validation drift between client and API; inconsistent user experience across the app. | Sprint 7 (post-Sprint 6) | Developer | Open |
| TD-009 | No periodic cleanup job for expired rate_limit_events and login_lockouts rows | Low | Phase 4 added inline cleanup on every lockout check, but old rate_limit_events rows for `login-ip:*` scopes accumulate. | `rate_limit_events` table grows unbounded. | Sprint 7 (post-Sprint 6) | Developer | Open |
| TD-010 | CSP `style-src 'unsafe-inline'` exception for Next.js 14 critical CSS | Low | Next.js 14 App Router emits inline `<style>` tags for critical CSS during SSR. Next.js 15+ may resolve this with content-hashed style loading. | Weakens CSP slightly — inline style injection is a limited attack surface but should be removed when possible. | Post-migration to Next.js 15/16 | Developer | Open |

## Updated Items (Sprint 3)

| ID | Item | Change |
| --- | --- | --- |
| TD-005 | Offline time entry | Updated: Offline action queue implemented for notes/photos/signatures/status. Time entry offline support still deferred. |
| TD-002 | CI/CD | Reprioritized to High — deployment sprint next. |
| TD-006 | Render account | Reprioritized to High — deployment sprint next. |
| TD-007 | GitHub repo | Reprioritized to High — deployment sprint next. |

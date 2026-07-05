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

## Updated Items (Sprint 3)

| ID | Item | Change |
| --- | --- | --- |
| TD-005 | Offline time entry | Updated: Offline action queue implemented for notes/photos/signatures/status. Time entry offline support still deferred. |
| TD-002 | CI/CD | Reprioritized to High — deployment sprint next. |
| TD-006 | Render account | Reprioritized to High — deployment sprint next. |
| TD-007 | GitHub repo | Reprioritized to High — deployment sprint next. |

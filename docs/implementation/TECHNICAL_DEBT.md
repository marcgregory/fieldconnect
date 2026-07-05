# FieldConnect Technical Debt

Last updated: 2026-07-05

Every item must include Priority, Reason, Impact, Planned Sprint, and Owner.

| ID | Item | Priority | Reason | Impact | Planned Sprint | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TD-001 | No automated tests yet | High | Sprint 1 and 2 focused on foundation and features. Tests remain a high priority for Sprint 3 before business logic grows further. | Untested code increases regression risk as features grow. | Sprint 3 | Developer | Open |
| TD-002 | No CI/CD pipeline | Medium | Initial deployments are manual via Render dashboard. No automated checks. | Risk of breaking production on manual deploy. | Sprint 3 | Developer | Open |
| TD-003 | No error monitoring service | Medium | Relying on Render logs only. No Sentry or similar. | Hard to diagnose production issues proactively. | Sprint 3 | Developer | Open |
| TD-004 | No database backup restore tested | Medium | Render does automated backups; no restore drill has been performed. | Recovery time unknown in a data loss scenario. | Sprint 4 | Developer | Open |
| TD-005 | Offline time entry not implemented | Low | Not in scope for v1, but technicians on job sites with poor connectivity will need it. | Technicians may lose time entries when connectivity drops. | Sprint 5 | Developer | Open |
| TD-006 | No Render.com account provisioned | High | Need to create Render account, PostgreSQL instance, and configure env vars for end-to-end testing. | Cannot test auth flow against real database. | Sprint 1 | Developer | Open |
| TD-007 | No GitHub repository initialized | Low | Code lives only on local machine. | No version control or collaboration. | Sprint 1 | Developer | Open |

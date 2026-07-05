# FieldConnect Project Scope

Last updated: 2026-07-05

## Scope Summary

Build a unified project management and time-tracking platform for a low voltage contracting company. The system replaces several disparate internal tools with a single platform featuring an office dashboard and an iPhone-optimized mobile interface for field technicians.

## In Scope

- User authentication and role-based access control (Admin, Office Manager, Dispatcher, Field Technician)
- Project management: create, assign, track status, archive
- Time tracking: clock in/out, manual entries, break tracking, notes, photos
- Scheduling: calendar view, technician assignments, conflict detection
- Dashboard: active projects, technician status, hours summary
- Reporting: time reports by tech/project/date, CSV/PDF export
- Real-time updates: office sees technician status changes live
- iPhone-optimized PWA for field technicians
- Integration of existing internal tool data into the unified system
- PostgreSQL database with raw SQL access (no ORM)

## Out of Scope

- Native iOS or Android app
- Public customer portal or client self-service
- Inventory management or materials tracking
- Full accounting or ERP integration
- GPS fleet tracking or vehicle routing
- Payroll processing (time data export only)
- Automated billing or invoicing
- HR functions (hiring, reviews, PTO requests)

## Assumptions

- Technicians have smartphones with internet access (cellular data)
- Offline periods are typically under 4 hours (rural job sites)
- Existing tools have exportable data (CSV, JSON, or direct DB access)
- Single company deployment — no multi-tenant requirements initially
- Desktop users have modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile users primarily use iPhone Safari (PWA compatible)

## Constraints

- No ORM — all database access via raw SQL with the `pg` driver
- Backend must be Fastify (Express rejected by user preference)
- Database: PostgreSQL hosted on Render
- Frontend: Next.js deployed on Render
- Mobile: PWA approach, not native — no App Store deployment
- Development accelerated using AI tools (Claude, Cursor, etc.)
- Single developer building and maintaining the system

## Dependencies

- Render.com account for hosting and PostgreSQL
- Node.js 20+ runtime
- pnpm package manager
- domain name (for production deployment)
- List of existing tools and their data formats (to be inventoried in Sprint 2)

## Stakeholders

- **Project Owner:** Low voltage contracting company owner
- **Office Managers:** Define reporting and project management requirements
- **Dispatchers:** Define scheduling workflow requirements
- **Field Technicians:** Primary users of the mobile interface
- **Developer:** Builds and maintains the platform

## Success Criteria

- 100% of field technicians use the mobile app for time tracking within 30 days of launch
- Office managers reduce time spent on reporting by 50%
- Zero manual data reconciliation between tools after full migration
- System uptime of 99.5% or higher
- Time entry accuracy within 1 minute of actual work time

## Risks

- Legacy data migration complexity may be underestimated
- Offline support adds significant development complexity
- Technician adoption may be slow without training
- Existing tool APIs may be undocumented or unstable
- Single developer = bus factor of 1 for the entire system

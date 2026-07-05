# FieldConnect PRD

Last updated: 2026-07-05

## Product Summary

FieldConnect is a unified project management platform for low voltage contracting companies. It brings together existing disparate tools into one system with robust time-tracking features and an iPhone-optimized mobile interface for field technicians working on-site.

## Target Users

- **Office Managers** — Create and assign projects, manage technicians, generate reports, handle billing
- **Dispatchers** — Schedule technicians to job sites, monitor real-time progress, re-assign as needed
- **Field Technicians** — Clock in/out of jobs, log time entries, submit project updates from their iPhone on-site
- **Administrators** — Manage users, roles, system configuration, audit logs

## Problem

The company has built several internal tools over time, but they are disparate and disconnected. Field technicians have no unified mobile app for time tracking and project updates. Office staff waste time reconciling data across systems. There is no single source of truth for project status or technician hours.

## Goals

1. Unify all existing internal tools into a single platform
2. Give field technicians a fast, reliable iPhone-optimized interface for time tracking
3. Provide office staff a clear dashboard for managing projects, technicians, and reporting
4. Ensure accurate, real-time data flow between the field and the office

## Non-Goals

- Native iOS/Android app development (PWA is sufficient)
- Public-facing customer portal
- Inventory management or purchasing
- Accounting/ERP integration (initially)
- GPS fleet tracking

## Personas

### Mike — Office Manager
- **Role:** Runs daily operations, assigns jobs, reviews tech hours for billing
- **Needs:** See all active jobs on one screen, know who is where, approve time entries, generate weekly reports
- **Pain:** Juggles 3 different tools to get a complete picture

### Sarah — Dispatcher
- **Role:** Schedules technicians to job sites, handles last-minute changes
- **Needs:** Drag-and-drop scheduling, real-time visibility into tech status, quick reassignment
- **Pain:** Uses spreadsheets + text messages to coordinate — error-prone

### Carlos — Field Technician
- **Role:** Installs and maintains low voltage systems at customer sites
- **Needs:** Clock in/out from his iPhone, see today's schedule, log time per task, submit job notes and photos
- **Pain:** Paper time sheets + texting his supervisor — loses time and gets paid late

### Diana — Administrator
- **Role:** Sets up the system, manages user permissions, audits data
- **Needs:** Role-based access control, user management, audit logs, system configuration

## Core Use Cases

1. **Field time tracking** — Tech clocks in/out of jobs from iPhone
2. **Project management** — Office creates and assigns projects
3. **Scheduling** — Dispatch assigns techs to jobs
4. **Reporting** — Generate time and project reports
5. **Real-time status** — Office sees live updates from the field

## Functional Requirements

### F1 — Authentication & Roles
- Email/password login with magic link option
- Role-based access: Admin, Office Manager, Dispatcher, Field Technician
- Session management with secure token handling

### F2 — Project Management
- Create, edit, archive projects
- Assign technicians to projects
- Track project status (Active, On Hold, Completed, Cancelled)
- Store job site details (address, contact, notes)

### F3 — Time Tracking (Core)
- Clock in / clock out with one tap on iPhone
- Manual time entry for past entries
- Break tracking
- GPS location stamp on clock-in (optional)
- Photo attachment to time entries
- Offline mode — entries queue and sync when connected

### F4 — Scheduling
- Calendar view of technician assignments
- Drag-and-drop rescheduling (desktop)
- Day view for technicians (mobile)
- Conflict detection

### F5 — Dashboard & Reporting
- Office dashboard: active jobs, tech status, weekly hours summary
- Time reports by technician, project, date range
- Export to CSV/PDF

### F6 — Real-time Updates
- Office sees technician clock-in/out events live
- Status changes push to dashboard without refresh

## Non-Functional Requirements

- **Mobile-first** for field tech interfaces — optimized for iPhone (390px viewport)
- **Offline support** — time entries must work with intermittent connectivity
- **Page load** under 2 seconds on mobile data (3G/4G)
- **Auth session** timeout with automatic re-authentication
- **PostgreSQL** data integrity with foreign keys and constraints
- **Backup** — automated daily database backups on Render

## User Stories

### Sprint 1 — Foundation & Auth
- As a user, I can create an account and log in
- As an admin, I can assign roles to users
- As a technician, I land on a mobile-optimized view after login

### Sprint 2 — Core Data & Time Tracking
- As a technician, I can clock in to a job with one tap
- As a technician, I can clock out and see my total hours
- As a technician, I can add a note to my time entry
- As an office manager, I can see all active time entries in real-time
- As an office manager, I can create and assign a project

### Sprint 3 — Scheduling & Reporting
- As a dispatcher, I can schedule technicians to projects
- As a technician, I can see my schedule for today
- As an office manager, I can generate a weekly time report
- As an office manager, I can export time data to CSV

### Future
- As a technician, I can attach photos to time entries
- As a technician, I can clock in without internet (offline queue)
- As an admin, I can view audit logs
- As a user, I can receive push notifications for schedule changes

## Acceptance Criteria

- A field technician can complete the full clock-in → work → clock-out flow on an iPhone in under 15 seconds
- Office dashboard loads all active projects in under 2 seconds
- Time entries are accurate to the minute and cannot be edited after manager approval
- Offline time entries sync without data loss when connectivity returns

## Metrics

- Time to complete clock-in flow (target: <15s)
- Daily active technicians using the mobile interface
- Time entry accuracy (variance vs. paper logs)
- Office manager time spent on reporting (target: <30 min/week)
- System uptime (target: 99.5%)

## Risks and Open Questions

- What existing tools need to be integrated? Inventory needed in Sprint 2.
- What data formats do existing tools use? CSV, REST API, direct DB access?
- Is there existing user data (employees, customers) to migrate?
- Do technicians have company iPhones or personal devices?
- What is the acceptable offline window before forced sync?

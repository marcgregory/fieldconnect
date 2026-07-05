# FieldConnect Release Plan

Last updated: 2026-07-05

## Release Criteria

The system is ready for production release when:
- Field technicians can complete the full clock-in → work → clock-out flow on iPhone
- Office managers can create projects, assign technicians, and view live time entries
- All time entries are accurate to the minute
- Auth and role-based access is fully functional
- The system has been tested by at least 2 field technicians in real job conditions for 1 week

## Quality Gates

| Gate | Requirement | Verification |
|---|---|---|
| Auth | Login, registration, role-based redirects work | Manual walkthrough |
| Time Tracking | Clock in/out saves correct timestamps | Compare against stopwatch test |
| Mobile UX | Clock-in flow takes <15s on iPhone | Timed test on actual iPhone |
| Dashboard | Projects load in <2s | Browser DevTools network tab |
| Real-time | Clock events deliver in <2s | Socket.io event timing |
| Data Integrity | No orphan records after CRUD operations | SQL constraint verification |
| Security | Rate limiting on auth, parameterized queries | Code review |

## Demo Checklist

- [ ] New user can register and log in
- [ ] Field technician can clock in/out on iPhone
- [ ] Office dashboard shows live clock events
- [ ] Office manager can create and assign a project
- [ ] Time report can be generated and exported
- [ ] Schedule can be created and viewed
- [ ] Offline entries sync when connection returns (when implemented)

## Performance Goals

- Clock-in API: <200ms response time
- Dashboard page load: <2s
- Mobile page load on 4G: <3s
- Lighthouse mobile score: 80+
- Real-time event delivery: <2s

## Release Decision

Decision: **Not Ready**

Reason: Foundation phase — no deployable user-facing features yet. Target release after Sprint 3.

## Blocking Issues

- Sprint 1 (Auth) must be deployed before any feature work can be tested
- Sprint 2 (Time Tracking) is the first release candidate milestone
- Sprint 3 (Scheduling & Reporting) completes the MVP feature set

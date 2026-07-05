# FieldConnect Deployment

## Target

Render.com — Web Services for Next.js frontend and Fastify API, plus managed PostgreSQL.

## Environments

| Environment | Purpose | URL |
|---|---|---|
| Production | Live system for the contracting company | `https://fieldconnect.com` (TBD) |
| Staging | Pre-release testing | `https://staging.fieldconnect.com` or Render PR preview |

Initial deployment targets a single production environment. Staging can be added via Render Blueprint previews.

## Required Services

| Service | Plan | Estimated Cost |
|---|---|---|
| Fastify API Web Service | Starter | $7/mo |
| Next.js Web Service | Starter | $7/mo |
| PostgreSQL | Starter (1GB RAM, 8GB storage) | $7/mo |
| **Total** | | **~$21/mo** |

## Environment Variables

### Fastify API (`apps/api`)
```
PORT=3001
DATABASE_URL=postgres://user:pass@host:5432/fieldconnect
JWT_SECRET=<generated-secret>
NEXTAUTH_URL=https://fieldconnect.com
CORS_ORIGIN=https://fieldconnect.com
```

### Next.js (`apps/web`)
```
PORT=3000
NEXT_PUBLIC_API_URL=https://api.fieldconnect.com
NEXTAUTH_SECRET=<generated-secret>
NEXTAUTH_URL=https://fieldconnect.com
```

## Build and Release

1. Push to `main` branch on GitHub
2. Render auto-deploys both services from the monorepo
3. Each service builds from its app directory
4. Migration runs as part of the API service start script

Build commands:
- **API:** `cd apps/api && npm install && npm run build`
- **Web:** `cd apps/web && npm install && npm run build`

Start commands:
- **API:** `npm run start`
- **Web:** `npm run start`

## Database Migrations

Migrations run automatically on API service start via `node-pg-migrate up` in the start script. Manual commands:

```bash
# Create a new migration
cd apps/api
npx node-pg-migrate create name-of-migration

# Run migrations manually
pnpm db:migrate

# Rollback last migration
pnpm db:rollback
```

Migration files live in `apps/api/src/db/migrations/` and are plain SQL files.

## Observability

- Application logs stream to Render dashboard
- Structured JSON logging via pino (Fastify default)
- Database metrics via Render PostgreSQL dashboard
- Health check endpoint: `GET /api/v1/health`

## Rollback Plan

1. Render supports instant rollback to any previous deploy from the dashboard
2. Database rollback: `pnpm db:rollback` reverts the most recent migration
3. If data migration is destructive, restore from daily backup

## Security Checklist

- [ ] HTTPS enforced at Render edge
- [ ] Database accessible only via private network (not public)
- [ ] JWT secrets generated and stored as environment variables
- [ ] Rate limiting configured on auth endpoints
- [ ] CORS restricted to the frontend domain
- [ ] SQL injection protection via parameterized queries
- [ ] Input validation on all API endpoints (Zod)
- [ ] Automated daily database backups configured
- [ ] Environment variables never committed to version control

# FieldConnect Deployment

## Target

Render.com — Web Services for Next.js frontend and Fastify API, plus managed PostgreSQL.

## Environments

| Environment | Purpose | URL |
|---|---|---|
| Production | Live system for the contracting company | `https://fieldconnect.com` (TBD) |
| Staging | Pre-release testing | Render Blueprint PR previews |

## Services

| Service | Plan | Estimated Cost |
|---|---|---|
| Fastify API Web Service | Starter | $7/mo |
| Next.js Web Service | Starter | $7/mo |
| PostgreSQL | Starter (1GB RAM, 8GB storage) | $7/mo |
| **Total** | | **~$21/mo** |

---

## Deploy with Render Blueprint

[Render Blueprint](https://render.com/docs/blueprint-spec) provisions all services from a single `render.yaml` at the repo root.

### Prerequisites

1. **Render account** — sign up at https://render.com
2. **GitHub repo** — `marcgregory/fieldconnect` should be connected to Render
3. **Two manual secrets** generated locally:

```bash
# Generate NEXTAUTH_SECRET (used by both services — must match)
openssl rand -base64 32
```

### Step 1: Connect Repository

1. Go to Render Dashboard → **New +** → **Blueprint**
2. Select the `marcgregory/fieldconnect` repository
3. Render reads `render.yaml` and creates three resources:
   - `fieldconnect-db` — PostgreSQL database
   - `fieldconnect-api` — Fastify API web service
   - `fieldconnect-web` — Next.js web service

### Step 2: Set Manual Environment Variables

After the Blueprint creates the services, set these **manually** in the Render dashboard:

#### API Service (`fieldconnect-api`)

| Variable | Value |
|---|---|
| `NEXTAUTH_SECRET` | ✅ Generated secret (must match web) |
| `NEXTAUTH_URL` | Web service URL (e.g. `https://fieldconnect-web.onrender.com`) |
| `CORS_ORIGIN` | Same as `NEXTAUTH_URL` |

#### Web Service (`fieldconnect-web`)

| Variable | Value |
|---|---|
| `NEXTAUTH_SECRET` | ✅ Same secret as API |
| `NEXTAUTH_URL` | This service's own URL (e.g. `https://fieldconnect-web.onrender.com`) |
| `API_URL` | API internal URL (e.g. `https://fieldconnect-api.onrender.com`) |
| `NEXT_PUBLIC_API_URL` | Same as `API_URL` |

### Step 3: Verify Deployment

1. Confirm both services show **Live** status in Render dashboard
2. Run the health check:
   ```bash
   curl https://fieldconnect-api.onrender.com/api/v1/health
   # → { "status": "ok", "db": "connected" }
   ```
3. Open the web service URL in a browser
4. Perform the end-to-end smoke test (see below)

### Step 4: Run Database Migrations

Render runs `preDeployCommand` automatically on deploy. If manual migration is needed:

```bash
npx node-pg-migrate up \
  --migration-file-language sql \
  --migrations-dir apps/api/src/db/migrations \
  --no-envfile
```

---

## End-to-End Smoke Test

After deployment, verify the complete workflow:

1. **Register** — Create a new account (field_technician role)
2. **Create project** — Log in as office_manager, create a project
3. **Schedule technician** — Assign technician to a project with date/time
4. **Login as technician** — Mobile view shows assigned job
5. **Clock in** — Start timer on the assigned project
6. **Status transitions** — Traveling → On Site → Complete
7. **Add note** — Technician adds a job note
8. **Upload photo** — Take/upload a before/during photo
9. **Capture signature** — Customer signs on the mobile device
10. **Office review** — Office manager sets Completed → Office Review → Closed
11. **Real-time updates** — Office dashboard shows all events live

---

## Environment Variables Reference

### API Service (`apps/api`)

| Variable | Source | Description |
|---|---|---|
| `DATABASE_URL` | Render PostgreSQL (auto-injected) | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Manual (generate locally) | JWT signing secret (shared with web) |
| `NEXTAUTH_URL` | Manual after deploy | Web service public URL |
| `CORS_ORIGIN` | Manual after deploy | Web service public URL |
| `PORT` | Render (auto-injected) or `3001` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `UPLOAD_DIR` | `/var/data/uploads` | File upload storage path |

### Web Service (`apps/web`)

| Variable | Source | Description |
|---|---|---|
| `NEXTAUTH_SECRET` | Manual (must match API) | JWT signing secret |
| `NEXTAUTH_URL` | Manual after deploy | This service's own URL |
| `API_URL` | Manual after deploy | API service URL (internal recommended) |
| `NEXT_PUBLIC_API_URL` | Manual after deploy | Same as `API_URL` (used by WebSocket) |
| `PORT` | Render (auto-injected) or `3002` | Server port |

### Render Blueprint `sync: false` Variables

Variables marked `sync: false` in `render.yaml` must be set manually in the Render dashboard.
These are never written to version control. See Step 2 above.

---

## Build & Release Process

```bash
# 1. Push to main
git push origin main

# 2. Render auto-deploys (autoDeploy: true)

# 3. Verify health
curl https://fieldconnect-api.onrender.com/api/v1/health

# 4. Tag releases
git tag v0.2.0-rc1
git push origin v0.2.0-rc1
```

### Build commands (per Render service)

**API:**
```bash
pnpm install --frozen-lockfile
pnpm --filter @fieldconnect/shared build
pnpm --filter @fieldconnect/api build
```

**Web:**
```bash
pnpm install --frozen-lockfile
pnpm --filter @fieldconnect/shared build
pnpm --filter @fieldconnect/ui build
pnpm --filter @fieldconnect/web build
```

### Start commands

- **API:** `node apps/api/dist/index.js`
- **Web:** `cd apps/web && npx next start -p $PORT`

---

## Database Migrations

Migrations run automatically via `preDeployCommand` in Render Blueprint (`npx node-pg-migrate up`).

Manual commands (local development):

```bash
# Run migrations
pnpm db:migrate

# Rollback last migration
pnpm db:rollback

# Create a new migration
cd apps/api
npx node-pg-migrate create name-of-migration \
  --migration-file-language sql \
  --migrations-dir ./src/db/migrations
```

Migration files: `apps/api/src/db/migrations/*.sql`

---

## Observability

- Application logs stream to Render dashboard
- Structured JSON logging via pino (Fastify default)
- Database metrics via Render PostgreSQL dashboard
- Health check endpoint: `GET /api/v1/health`

---

## Rollback Plan

1. **Web/API service:** Render supports instant rollback to any previous deploy from the dashboard
2. **Database:** `pnpm db:rollback` reverts the most recent migration
3. **Data migration rollback:** If destructive, restore from daily backup

---

## Security Checklist

- [ ] HTTPS enforced at Render edge (automatic)
- [ ] Database accessible only via private network (`ipAllowList: []`)
- [ ] JWT secrets generated with `openssl rand -base64 32`
- [ ] Rate limiting configured on auth endpoints
- [ ] CORS restricted to the frontend domain
- [ ] SQL injection protection via parameterized queries (pg driver)
- [ ] Input validation on all API endpoints (Zod)
- [ ] Automated daily database backups configured
- [ ] Environment variables never committed to version control

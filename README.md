# FieldConnect — Low Voltage Contracting Project Management

A unified project management platform for low voltage contracting companies. Field technicians use the iPhone-optimized mobile interface for time tracking and project updates; office staff manage jobs, scheduling, and reporting from the dashboard.

## Product

- **Target users:** Office managers, dispatchers, field technicians
- **Primary outcome:** Eliminate disparate tools and give field techs a single mobile app for time tracking and project updates
- **Current sprint:** Sprint 1 — Foundation & Auth
- **Next milestone:** Field technician mobile time tracking MVP

## Documentation Map

- `docs/PRD.md` — product behavior, users, requirements, and acceptance criteria.
- `docs/PROJECT_SCOPE.md` — scope, non-goals, assumptions, risks, and constraints.
- `docs/ARCHITECTURE.md` — system design, boundaries, data, APIs, state, and security.
- `docs/TECH_STACK.md` — selected technologies, tools, packages, and rejected options.
- `docs/DEPLOYMENT.md` — environments, release process, operations, and rollback.
- `docs/FOUNDER_OS.md` — business analysis and go-to-market strategy.
- `docs/adr/` — consequential architecture decisions.
- `docs/implementation/ROADMAP.md` — what should be built.
- `docs/implementation/BUILD_PLAN.md` — how the active and queued sprints will be built.
- `docs/implementation/PROJECT_STATUS.md` — current project snapshot.
- `docs/implementation/CHANGELOG.md` — versioned history.
- `docs/implementation/TECHNICAL_DEBT.md` — cleanup list.
- `docs/implementation/RELEASE_PLAN.md` — definition of finished.

## Commands

```bash
# Development
pnpm dev              # Start all apps in dev mode
pnpm lint             # Lint all packages and apps
pnpm format           # Format all files with Prettier

# Database
pnpm db:migrate       # Run pending migrations
pnpm db:rollback      # Rollback last migration
pnpm db:seed          # Seed development data

# Build and Deploy
pnpm build            # Build all packages and apps
pnpm deploy           # Deploy to Render
```

## Security Setup

### Development Environment

1. **Copy the template:**
   ```bash
   cp .env.example .env.local
   ```

2. **Configure Database:**
   - For local development: Create a PostgreSQL database
   - Use Render's free PostgreSQL tier: Get connection string from Render dashboard
   - Update `DATABASE_URL` in `.env.local` with your connection string

3. **Generate Secrets:**
   ```bash
   # Generate JWT_SECRET
   openssl rand -hex 32
   
   # Generate NEXTAUTH_SECRET
   openssl rand -hex 32
   ```
   Copy each output to the corresponding variable in `.env.local`

4. **Cloudinary Setup (optional for file uploads):**
   - Sign up at https://cloudinary.com
   - Get your Cloud Name, API Key, and API Secret from your Cloudinary dashboard
   - Add to `.env.local`:
     ```
     CLOUDINARY_CLOUD_NAME=your-cloud-name
     CLOUDINARY_API_KEY=your-api-key
     CLOUDINARY_API_SECRET=your-api-secret
     ```

5. **Start development:**
   ```bash
   pnpm dev
   ```

### ⚠️ Important Security Notes

- **NEVER commit `.env` or `.env.*.local` to git** — these contain secrets
- `.gitignore` prevents accidental commits of credential files
- Credentials are injected via environment variables at deployment time
- If credentials are ever exposed, rotate them immediately
- Never use default usernames/passwords (like `postgres:postgres`) in production

### Production Deployment

When deploying to Render or similar platforms:

1. Set all required environment variables in the platform's dashboard:
   - `DATABASE_URL` (auto-provided by Render PostgreSQL add-on)
   - `JWT_SECRET` (generate with `openssl rand -hex 32`)
   - `NEXTAUTH_SECRET` (generate with `openssl rand -hex 32`)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `EMAIL_PROVIDER=resend` (for production email)
   - `RESEND_API_KEY` (get from Resend dashboard)

2. Verify before deployment:
   ```bash
   # Check that no credentials are in git history
   git log --all --source --full-history -- .env | head -5
   ```

3. After deployment, verify all environment variables are set and the app starts correctly

## Current Status

Foundation phase — auth and project scaffolding in progress.

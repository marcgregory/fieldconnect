#!/usr/bin/env bash
# ─── FieldConnect RC Database Reset ──────────────────────────────────────
# Drops, recreates, migrates, and seeds the fieldconnect_rc database.
#
# SAFETY: this script is the ONLY sanctioned entry point for destructive
# DB operations against the test database. It sets the required env vars
# (NODE_ENV=test, ALLOW_TEST_DB=1) and points DATABASE_URL at the RC
# database. The triple-guard in tests/setup/test-db.ts re-verifies all
# three conditions before running DROP/CREATE.
#
# Never run the seed or migration scripts directly with this env unset.
#
# Usage:
#   pnpm rc:reset                    # reset + migrate + seed
#   pnpm rc:reset --skip-seed        # reset + migrate only
#   pnpm rc:reset --keep             # migrate + seed only (no drop)
#
# Required tools: psql, tsx, node. The script uses `npx tsx` so no global
# install is required.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# ── Step 1: Set the safety environment ───────────────────────────────────
# These three lines are the SOLE sanctioned way to set the guard env.
# Do NOT move them into a shared file. Do NOT add them to .env.
export NODE_ENV="test"
export ALLOW_TEST_DB="1"

# Default RC DB URL — override with RC_DATABASE_URL env var if needed
RC_DATABASE_URL="${RC_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/fieldconnect_rc}"
export DATABASE_URL="$RC_DATABASE_URL"

# ── Step 2: Argument parsing ─────────────────────────────────────────────
ACTION="reset"
SEED_AFTER=true
ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --skip-seed) SEED_AFTER=false ;;
    --keep)      ACTION="migrate-only" ;;
    --reset)     ACTION="reset" ;;
    --yes|-y)    ASSUME_YES=true ;;
    --help|-h)
      echo "Usage: pnpm rc:reset [--skip-seed] [--keep] [--reset] [--yes]"
      echo "  --skip-seed   Reset + migrate, do not seed"
      echo "  --keep        Migrate + seed only (do not drop)"
      echo "  --reset       Drop, recreate, migrate, seed (default)"
      echo "  --yes         Skip the confirmation prompt (for CI)"
      exit 0
      ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ── Step 3: Confirm intent ───────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  FieldConnect RC Database Reset"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Target: $DATABASE_URL"
echo "  Action: $ACTION"
echo "  Seed:   $SEED_AFTER"
echo ""
echo "  Triple-guard will verify:"
echo "    • NODE_ENV=test"
echo "    • ALLOW_TEST_DB=1"
echo "    • DATABASE_URL ends in _rc or _test and points to localhost"
echo ""

if [ "$ASSUME_YES" = true ]; then
  echo "  (--yes set, skipping confirmation)"
else
  read -p "  Continue? [y/N] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "  Aborted."
    exit 1
  fi
fi

# ── Step 4: Reset (drop + create + migrate) ─────────────────────────────
if [ "$ACTION" = "reset" ]; then
  echo ""
  echo "▶ Resetting database…"
  npx tsx tests/setup/test-db.ts reset
fi

# For "keep" mode, the DB is assumed to exist and migrations are applied
# in addition. For "reset" mode, migrations are already done by the reset.
if [ "$ACTION" = "migrate-only" ]; then
  echo ""
  echo "▶ Applying migrations (without drop)…"
  # ensureTestDatabase without the drop logic — we re-use the migrator.
  # First, verify the guard.
  npx tsx -e "
    import { assertTestDbSafe, runMigrations } from './tests/setup/test-db';
    assertTestDbSafe();
    await runMigrations();
    process.exit(0);
  "
fi

# ── Step 5: Seed (optional) ─────────────────────────────────────────────
if [ "$SEED_AFTER" = true ]; then
  echo ""
  echo "▶ Seeding RC fixtures…"
  npx tsx tests/setup/seed.ts
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ RC database is ready"
echo "  Connection: $DATABASE_URL"
echo "  Run tests:  pnpm test"
echo "═══════════════════════════════════════════════════════════"

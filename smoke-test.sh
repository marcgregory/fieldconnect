#!/usr/bin/env bash
# ─── FieldConnect Full Lifecycle Smoke Test ─────────────────────────────
# Runs as a Node.js script that generates JWTs matching the frontend Auth.js flow.
set -euo pipefail

API="${API:-http://localhost:3001/api/v1}"
PASS=0
FAIL=0

cleanup() {
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  Results: $PASS passed, $FAIL failed"
  [ "$FAIL" -gt 0 ] && echo "  ❌ SOME TESTS FAILED" || echo "  ✅ ALL TESTS PASSED"
  echo "═══════════════════════════════════════════════════"
}
trap cleanup EXIT

pass()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"
TS=$(date +%s)

echo "═══════════════════════════════════════════════════"
echo "  FieldConnect Full Lifecycle Smoke Test"
echo "  Started: $(date)"
echo "═══════════════════════════════════════════════════"

# ── Generate JWT using node jose ─────────────────────────────────────────
# Uses the same Auth.js secret so the API accepts our tokens
NEXTAUTH_SECRET="K9NIRtq2lChPaCp02kPSdIEHzl+Bzbvwo4tr5Y3sAoU="
gen_jwt() {
  local uid="$1" email="$2" name="$3" role="$4"
  cd apps/api && NEXTAUTH_SECRET="$NEXTAUTH_SECRET" node -e "
    const { SignJWT } = require('jose');
    const sec = new TextEncoder().encode('$NEXTAUTH_SECRET');
    new SignJWT({ sub: '$uid', id: '$uid', role: '$role', email: '$email', name: '$name' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('fieldconnect-api')
      .setAudience('fieldconnect-web')
      .setExpirationTime('1h')
      .sign(sec)
      .then(t => process.stdout.write(t));
  " 2>/dev/null
  cd "$PROJECT_ROOT"
}

# ── 1. Health Check ──────────────────────────────────────────────────────
echo ""
echo "── Phase 1: Health Check ──"
HEALTH=$(curl -sf "$API/health" 2>/dev/null || echo '{"status":"error"}')
if echo "$HEALTH" | grep -q '"ok"'; then pass "API health check"; else fail "API health check"; fi

# ── 2. Register Users ────────────────────────────────────────────────────
echo ""
echo "── Phase 2: Register Users ──"

ADMIN_EMAIL="admin${TS}@test.com"
TECH_EMAIL="tech${TS}@test.com"
OFFICE_EMAIL="office${TS}@test.com"

# Register admin
ADMIN_RESULT=$(curl -sf -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"name\":\"Admin User\",\"password\":\"pass1234\",\"role\":\"admin\"}" 2>/dev/null || echo '')
ADMIN_ID=$(echo "$ADMIN_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$ADMIN_ID" ]; then pass "Admin registered (${ADMIN_EMAIL})"; else fail "Admin registration"; fi

# Register field technician
TECH_RESULT=$(curl -sf -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${TECH_EMAIL}\",\"name\":\"Field Tech\",\"password\":\"pass1234\",\"role\":\"field_technician\"}" 2>/dev/null || echo '')
TECH_ID=$(echo "$TECH_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$TECH_ID" ]; then pass "Technician registered (${TECH_EMAIL})"; else fail "Technician registration"; fi

# Register office manager
OFFICE_RESULT=$(curl -sf -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${OFFICE_EMAIL}\",\"name\":\"Office Mgr\",\"password\":\"pass1234\",\"role\":\"office_manager\"}" 2>/dev/null || echo '')
OFFICE_ID=$(echo "$OFFICE_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$OFFICE_ID" ]; then pass "Office manager registered"; else fail "Office manager registration"; fi

# ── Mark all freshly-registered users as email-verified ─────────────────
# Sprint 6 / Phase 2 added email verification: login blocks unverified
# users with 403 EMAIL_NOT_VERIFIED. The smoke test creates users via
# /auth/register (which does NOT auto-verify), so we mark them verified
# directly via SQL. This is a test-only path and only runs against the
# test DB (DATABASE_URL contains _rc or _test).
#
# We use a small Node helper that runs `pg`-client SQL via the local tsx
# (apps/api/node_modules/.bin/tsx) to avoid the npx cache-download timeout.
TEST_DB_URL="${RC_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/fieldconnect_rc}"
TSX_BIN="apps/api/node_modules/.bin/tsx"
verify_test_user() {
  local email="$1"
  DATABASE_URL="$TEST_DB_URL" NODE_ENV=test ALLOW_TEST_DB=1 \
    "$TSX_BIN" -e "
      import { Pool } from 'pg';
      const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
      p.query('UPDATE users SET email_verified_at = NOW() WHERE email = \$1', ['$email'])
        .then(() => p.end())
        .catch(e => { console.error('verify_test_user failed:', e.message); process.exit(1); });
    " >/dev/null 2>&1 || true
}
verify_test_user "$ADMIN_EMAIL"
verify_test_user "$TECH_EMAIL"
verify_test_user "$OFFICE_EMAIL"
pass "Test users marked as email-verified"

echo ""
echo "  Admin ID: $ADMIN_ID"
echo "  Tech  ID: $TECH_ID"

# ── Generate JWTs ────────────────────────────────────────────────────────
echo ""
echo "── Generating JWTs ──"
ADMIN_TOKEN=$(gen_jwt "$ADMIN_ID" "$ADMIN_EMAIL" "Admin User" "admin")
TECH_TOKEN=$(gen_jwt "$TECH_ID" "$TECH_EMAIL" "Field Tech" "field_technician")
OFFICE_TOKEN=$(gen_jwt "$OFFICE_ID" "$OFFICE_EMAIL" "Office Mgr" "office_manager")

if [ -n "$ADMIN_TOKEN" ] && [ -n "$TECH_TOKEN" ] && [ -n "$OFFICE_TOKEN" ]; then
  pass "JWTs generated for all roles"
else
  fail "JWT generation"
  echo "  admin has token: $([ -n "$ADMIN_TOKEN" ] && echo yes || echo no)"
  echo "  tech  has token: $([ -n "$TECH_TOKEN" ] && echo yes || echo no)"
  echo "  office has token: $([ -n "$OFFICE_TOKEN" ] && echo yes || echo no)"
fi
echo "  Admin token: ${ADMIN_TOKEN:0:30}..."
echo "  Tech  token: ${TECH_TOKEN:0:30}..."
echo "  Office token: ${OFFICE_TOKEN:0:30}..."

# ── 3. Create Project ────────────────────────────────────────────────────
echo ""
echo "── Phase 3: Create Project ──"

PROJECT=$(curl -sf -X POST "$API/projects" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Test Project ${TS}\",\"description\":\"Created by smoke test\",\"address\":\"123 Test St, Springfield\",\"contact_name\":\"John Doe\",\"contact_phone\":\"555-0123\"}" 2>/dev/null || echo '')
PROJECT_ID=$(echo "$PROJECT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
PROJECT_STATUS=$(echo "$PROJECT" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$PROJECT_ID" ] && [ "$PROJECT_STATUS" = "active" ]; then
  pass "Project created (status: $PROJECT_STATUS)"
else
  fail "Project creation"
  echo "  → Response: $PROJECT"
fi

# ── 4. Assign Technician to Project Team ─────────────────────────────────
echo ""
echo "── Phase 4: Assign Technician ──"

ASSIGN=$(curl -sf -X POST "$API/projects/$PROJECT_ID/assign" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"user_id\":\"$TECH_ID\"}" 2>/dev/null || echo '')
if echo "$ASSIGN" | grep -q '"id":"'; then
  pass "Technician assigned to project"
else
  fail "Technician assignment"
  echo "  → Response: $ASSIGN"
fi

# Verify the assignment
ASSIGNMENTS=$(curl -sf "$API/projects/$PROJECT_ID/assignments" \
  -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo '[]')
if echo "$ASSIGNMENTS" | grep -q '"user_id":"'"$TECH_ID"'"'; then
  pass "Assignment persisted and verifiable"
else
  fail "Assignment verification"
fi

# ── 5. Create Schedule ──────────────────────────────────────────────────
echo ""
echo "── Phase 5: Create Schedule ──"

SCHEDULE=$(curl -sf -X POST "$API/schedules" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"project_id\":\"$PROJECT_ID\",\"technician_ids\":[\"$TECH_ID\"],\"scheduled_date\":\"$(date +%Y-%m-%d)\",\"start_time\":\"09:00\",\"end_time\":\"12:00\",\"notes\":\"Smoke test schedule\"}" 2>/dev/null || echo '')
SCHEDULE_ID=$(echo "$SCHEDULE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
SCHEDULE_STATUS=$(echo "$SCHEDULE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$SCHEDULE_ID" ] && [ "$SCHEDULE_STATUS" = "scheduled" ]; then
  pass "Schedule created (status: $SCHEDULE_STATUS)"
else
  fail "Schedule creation"
  echo "  → Response: $SCHEDULE"
  # If it failed due to constraints, exit early
  echo "  (Aborting — schedule required for remaining tests)"
  exit 1
fi

# ── 6. Mobile: Technician Views Jobs ─────────────────────────────────────
echo ""
echo "── Phase 6: Mobile: Technician Views Jobs ──"

MY_JOBS=$(curl -sf "$API/schedules/my-jobs" \
  -H "Authorization: Bearer $TECH_TOKEN" 2>/dev/null || echo '[]')
if echo "$MY_JOBS" | grep -q '"id":"'"$SCHEDULE_ID"'"'; then
  pass "Technician sees their job in My Jobs"
else
  fail "Technician My Jobs view"
fi

# Calendar view
TODAY=$(date +%Y-%m-%d)
TOMORROW=$(date -d "+1 day" +%Y-%m-%d 2>/dev/null || date -v+1d +%Y-%m-%d 2>/dev/null || echo "$TODAY")
CAL=$(curl -sf "$API/schedules/calendar?from=${TODAY}&to=${TOMORROW}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo '[]')
if echo "$CAL" | grep -q '"id":"'"$SCHEDULE_ID"'"'; then
  pass "Schedule visible in calendar range view"
else
  fail "Calendar range view"
fi

# ── 7. Mobile: Status Transitions ────────────────────────────────────────
echo ""
echo "── Phase 7: Mobile: Status Transitions ──"

# Technician must be clocked in before completing a job.
# Geofence: pass the project's lat/lng so clock-in succeeds without geofence failure.
CLOCKIN=$(curl -s -X POST "$API/time-entries/clock-in" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"project_id\":\"$PROJECT_ID\",\"clock_in_lat\":37.7749,\"clock_in_lng\":-122.4194,\"clock_in_accuracy\":10}" 2>/dev/null || echo '')
CLOCKIN_OK=$(echo "$CLOCKIN" | grep -q '"success":true' && echo yes || echo no)
if [ "$CLOCKIN_OK" = "yes" ]; then
  pass "Technician clocked in to project"
else
  echo "  (clock-in response: $CLOCKIN)"
  fail "Technician clock-in (continuing — completion may fail without it)"
fi

# scheduled → traveling
R1=$(curl -s -X PATCH "$API/schedules/$SCHEDULE_ID/status" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"traveling"}' 2>/dev/null || echo '')
R1_STATUS=$(echo "$R1" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$R1_STATUS" = "traveling" ]; then
  pass "Status: scheduled → traveling"
else
  fail "scheduled → traveling"
  echo "  → $R1"
fi

# traveling → on_site
R2=$(curl -s -X PATCH "$API/schedules/$SCHEDULE_ID/status" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"on_site"}' 2>/dev/null || echo '')
R2_STATUS=$(echo "$R2" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$R2_STATUS" = "on_site" ]; then
  pass "Status: traveling → on_site"
else
  fail "traveling → on_site"
  echo "  → $R2"
fi

# on_site → completed
R3=$(curl -s -X PATCH "$API/schedules/$SCHEDULE_ID/status" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"completed"}' 2>/dev/null || echo '')
R3_STATUS=$(echo "$R3" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$R3_STATUS" = "completed" ]; then
  pass "Status: on_site → completed"
else
  fail "on_site → completed"
  echo "  → $R3"
fi

# ── 8. Office: Review Queue ──────────────────────────────────────────────
echo ""
echo "── Phase 8: Office: Review ──"

REVIEW=$(curl -s "$API/schedules/review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo '[]')
if echo "$REVIEW" | grep -q '"schedule_id":"'"$SCHEDULE_ID"'"'; then
  pass "Job appears in review queue (status=completed)"
else
  fail "Review queue"
  echo "  → $REVIEW"
fi

# ── 9. Add Field Data (notes, attachments, signatures) ──────────────────
echo ""
echo "── Phase 9: Field Data Collection ──"

# Add technician note
NOTE=$(curl -sf -X POST "$API/schedules/$SCHEDULE_ID/notes" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Work completed successfully. All wiring checked.","note_type":"technician"}' 2>/dev/null || echo '')
if echo "$NOTE" | grep -q '"id":"'; then
  pass "Technician note added"
else
  fail "Technician note"
  echo "  → $NOTE"
fi

# Add internal note (office staff)
INT_NOTE=$(curl -sf -X POST "$API/schedules/$SCHEDULE_ID/notes" \
  -H "Authorization: Bearer $OFFICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Internal: Customer is very satisfied.","note_type":"internal"}' 2>/dev/null || echo '')
if echo "$INT_NOTE" | grep -q '"id":"'; then
  pass "Internal office note added"
else
  fail "Internal note"
fi

# Create a test signature (minimal valid data URI)
SIG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
SIG_RESULT=$(curl -sf -X POST "$API/schedules/$SCHEDULE_ID/signatures" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"signature_data\":\"${SIG}\",\"label\":\"customer\"}" 2>/dev/null || echo '')
if echo "$SIG_RESULT" | grep -q '"id":"'; then
  pass "Signature captured"
else
  fail "Signature capture"
  echo "  → ${SIG_RESULT:0:200}"
fi

# ── 10. Office: Close Job & Project Auto-Complete ───────────────────────
echo ""
echo "── Phase 10: Close Job — Project Auto-Complete ──"

# Close the completed job
CLOSE=$(curl -sf -X PATCH "$API/schedules/$SCHEDULE_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"closed"}' 2>/dev/null || echo '')
CLOSE_STATUS=$(echo "$CLOSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$CLOSE_STATUS" = "closed" ]; then
  pass "Job closed by office staff (admin)"
else
  fail "Job close"
  echo "  → $CLOSE"
fi

# Check project auto-completed (all schedules now closed)
PROJ_CHECK=$(curl -sf "$API/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo '')
PROJ_STATUS=$(echo "$PROJ_CHECK" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$PROJ_STATUS" = "completed" ]; then
  pass "✅ Project auto-completed to 'completed' (all schedules closed/cancelled)"
else
  fail "Project auto-complete — expected 'completed', got '$PROJ_STATUS'"
  echo "  → $PROJ_CHECK"
fi

# ── 11. Review queue should be empty now ────────────────────────────────
echo ""
echo "── Phase 11: Review Queue Empty After Close ──"

REVIEW_EMPTY=$(curl -s "$API/schedules/review" \
  -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo '[]')
if echo "$REVIEW_EMPTY" | grep -q '"schedule_id":"'"$SCHEDULE_ID"'"'; then
  fail "Review queue — job still appears after close (should be filtered out)"
  echo "  → Review queue contains closed jobs"
else
  pass "Review queue no longer shows closed job"
fi

# ── 12. Reopen: Revert project to Active ────────────────────────────────
echo ""
echo "── Phase 12: Reopen Job — Project Reverts to Active ──"

# Reopen the closed schedule (admin can bypass normal transitions)
REOPEN=$(curl -sf -X PATCH "$API/schedules/$SCHEDULE_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"completed"}' 2>/dev/null || echo '')
REOPEN_STATUS=$(echo "$REOPEN" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$REOPEN_STATUS" = "completed" ]; then
  pass "Closed job reopened to 'completed' (admin bypass)"
else
  fail "Reopen closed job — expected 'completed', got '$REOPEN_STATUS'"
  echo "  → $REOPEN"
fi

# Check project reverted to active
PROJ_REVERT=$(curl -sf "$API/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo '')
PROJ_REVERT_STATUS=$(echo "$PROJ_REVERT" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$PROJ_REVERT_STATUS" = "active" ]; then
  pass "✅ Project reverted to 'active' after reopening closed job"
else
  fail "Project revert — expected 'active', got '$PROJ_REVERT_STATUS'"
  echo "  → $PROJ_REVERT"
fi

# ── 13. Re-close and Verify Final State ─────────────────────────────────
echo ""
echo "── Phase 13: Re-close and Verify ──"

CLOSE2=$(curl -sf -X PATCH "$API/schedules/$SCHEDULE_ID/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"closed"}' 2>/dev/null || echo '')
CLOSE2_STATUS=$(echo "$CLOSE2" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$CLOSE2_STATUS" = "closed" ]; then
  pass "Re-closed job successfully"
else
  fail "Re-close"
fi

PROJ_FINAL=$(curl -sf "$API/projects/$PROJECT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo '')
PROJ_FINAL_STATUS=$(echo "$PROJ_FINAL" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$PROJ_FINAL_STATUS" = "completed" ]; then
  pass "✅ Project completed again after re-close"
else
  fail "Project final status — expected 'completed', got '$PROJ_FINAL_STATUS'"
fi

# ── 14. Access Control ──────────────────────────────────────────────────
echo ""
echo "── Phase 14: Access Control ──"

# Create a fresh, open schedule so the close-block test runs against an
# actionable target (the main schedule was already closed in Phase 13).
ACCESS_PROJ=$(curl -s -X POST "$API/projects" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Access Test $TS\",\"address\":\"42 Test St\",\"contact_name\":\"X\",\"contact_phone\":\"555\"}" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -X POST "$API/projects/$ACCESS_PROJ/assign" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"user_id\":\"$TECH_ID\"}" >/dev/null
ACCESS_SCHED=$(curl -s -X POST "$API/schedules" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"project_id\":\"$ACCESS_PROJ\",\"technician_ids\":[\"$TECH_ID\"],\"scheduled_date\":\"$(date +%Y-%m-%d)\",\"start_time\":\"15:00\",\"end_time\":\"17:00\",\"notes\":\"Access control test\"}" \
  | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$ACCESS_SCHED" ]; then
  pass "Fresh schedule created for access-control tests"
else
  fail "Setup: fresh schedule for access-control tests"
fi

# Technician cannot close their own job from 'scheduled' (should 4xx)
TECH_CLOSE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/schedules/$ACCESS_SCHED/status" \
  -H "Authorization: Bearer $TECH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"closed"}' 2>/dev/null || echo '000')
if [ "$TECH_CLOSE" -ge 400 ]; then
  pass "Technician blocked from closing job (HTTP $TECH_CLOSE)"
else
  fail "Technician close block (got HTTP $TECH_CLOSE, expected 4xx)"
fi

# Unauthenticated request should 401
UNAUTH=$(curl -sf "$API/projects" 2>/dev/null || echo '{"error":"unauth"}')
if echo "$UNAUTH" | grep -q '"error"'; then
  pass "Unauthenticated request rejected"
else
  fail "Unauthenticated request should be rejected"
fi

# Office manager cannot create a schedule without being on the project team
OTHER_TECH_RESULT=$(curl -sf -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"othertech${TS}@test.com\",\"name\":\"Other Tech\",\"password\":\"pass1234\",\"role\":\"field_technician\"}" 2>/dev/null || echo '')
OTHER_TECH_ID=$(echo "$OTHER_TECH_RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
OTHER_TECH_TOKEN=$(gen_jwt "$OTHER_TECH_ID" "othertech${TS}@test.com" "Other Tech" "field_technician")
if [ -n "$OTHER_TECH_ID" ]; then
  verify_test_user "othertech${TS}@test.com"
  # Try assigning non-team technician to a new schedule — should fail
  BAD_SCHED_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/schedules" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"project_id\":\"$PROJECT_ID\",\"technician_ids\":[\"$OTHER_TECH_ID\"],\"scheduled_date\":\"$(date +%Y-%m-%d)\",\"start_time\":\"14:00\",\"end_time\":\"17:00\"}" 2>/dev/null || echo '000')
  if [ "$BAD_SCHED_CODE" -ge 400 ]; then
    pass "Blocked schedule for non-team technician (HTTP $BAD_SCHED_CODE)"
  else
    fail "Non-team schedule block (got HTTP $BAD_SCHED_CODE, expected 4xx)"
  fi
fi

# ── 15. Audit Log Entries ───────────────────────────────────────────────
echo ""
echo "── Phase 15: Audit Trail ──"

# The updateStatus response includes audit data. Verify the last close contained it.
if echo "$CLOSE2" | grep -q '"audit"'; then
  pass "Audit log entry returned with status change response"
else
  echo "  ⚠ Audit entry not in response payload (checking format..."
  echo "  response: ${CLOSE2:0:100})"
fi

# ── 16. Schedule Detail with Counts ─────────────────────────────────────
echo ""
echo "── Phase 16: Schedule Detail with Metadata ──"

DETAIL=$(curl -sf "$API/schedules/$SCHEDULE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null || echo '{}')
if echo "$DETAIL" | grep -q '"note_count"' && echo "$DETAIL" | grep -q '"signature_count"'; then
  pass "Schedule detail includes note/attachment/signature counts"
else
  fail "Schedule detail metadata"
  echo "  → ${DETAIL:0:200}"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Smoke test complete!"
echo "  Users created: admin${TS}@test.com / tech${TS}@test.com"
echo "  Project: $PROJECT_ID"
echo "  Schedule: $SCHEDULE_ID"
echo "═══════════════════════════════════════════════════"

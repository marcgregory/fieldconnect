#!/usr/bin/env bash
# =============================================================================
# Task 5 — Production Health Validation Script
# Executes all checks against the production deployment and writes evidence.
# =============================================================================
set -euo pipefail

API_BASE="https://fieldconnect-backend.onrender.com"
WEB_BASE="https://fieldconnect-tech.vercel.app"
EVIDENCE_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "=== Task 5: Production Health Validation ==="
echo "Timestamp: $TIMESTAMP"
echo "API:       $API_BASE"
echo "Web:       $WEB_BASE"
echo "Evidence:  $EVIDENCE_DIR"
echo ""

# ─── Section A — Service Health ───────────────────────────────────────────

echo "── Section A: Service Health ──"

# A1: API health endpoint
echo "  A1: API health endpoint..."
HEALTH_JSON=$(curl -sf "$API_BASE/api/v1/health" 2>&1 || echo "FETCH_FAILED")
echo "$HEALTH_JSON" > "$EVIDENCE_DIR/health.json"
echo "    → saved health.json"

# A2: Readiness (DB health)
echo "  A2: Database readiness..."
DB_HEALTH_JSON=$(curl -sf "$API_BASE/api/v1/health/db" 2>&1 || echo "FETCH_FAILED")
echo "$DB_HEALTH_JSON" > "$EVIDENCE_DIR/readiness.json"
echo "    → saved readiness.json"

# A3: Frontend availability
echo "  A3: Frontend availability..."
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_BASE" 2>&1 || echo "FETCH_FAILED")
echo "    → HTTP $WEB_STATUS"
echo "{\"url\": \"$WEB_BASE\", \"http_status\": $WEB_STATUS, \"timestamp\": \"$TIMESTAMP\"}" > "$EVIDENCE_DIR/frontend-availability.json"

# A4: Frontend loads HTML
echo "  A4: Frontend loads HTML..."
WEB_CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" "$WEB_BASE" 2>&1 || echo "")
echo "    → Content-Type: $WEB_CONTENT_TYPE"

# ─── Section B — Infrastructure ──────────────────────────────────────────

echo ""
echo "── Section B: Infrastructure ──"

# B1: Database connectivity (via health/db)
echo "  B1: Database connectivity..."
DB_STATUS=$(echo "$DB_HEALTH_JSON" | grep -o '"database":"[^"]*"' | head -1 || echo "UNKNOWN")
echo "    → $DB_STATUS"

# B2: Socket.IO availability
echo "  B2: Socket.IO endpoint..."
SOCKET_CHECK=$(curl -sf -o "$EVIDENCE_DIR/socket-health.json" -w "%{http_code}" \
  "$API_BASE/socket.io/?EIO=4&transport=polling" 2>&1 || echo "FETCH_FAILED")
echo "    → HTTP $SOCKET_CHECK (Socket.IO polling transport)"
echo "{\"url\": \"$API_BASE/socket.io/\", \"http_status\": $SOCKET_CHECK, \"transport\": \"polling\", \"timestamp\": \"$TIMESTAMP\"}" > "$EVIDENCE_DIR/socket-health.json"

# B3: Cloudinary reachability (via the file upload pattern)
echo "  B3: Cloudinary reachability..."
CLOUDINARY_CHECK=$(curl -sf -o /dev/null -w "%{http_code}" "https://res.cloudinary.com/dytmv00iq/image/upload/" 2>&1 || echo "UNREACHABLE")
echo "    → HTTP $CLOUDINARY_CHECK"
echo "{\"host\": \"res.cloudinary.com\", \"cloud_name\": \"dytmv00iq\", \"http_status\": \"$CLOUDINARY_CHECK\", \"timestamp\": \"$TIMESTAMP\"}" > "$EVIDENCE_DIR/cloudinary-health.json"

# ─── Section C — Security ──────────────────────────────────────────────

echo ""
echo "── Section C: Security ──"

# Fetch all security headers from both API and Web
echo "  C: Collecting security headers..."

# API security headers
api_headers=$(curl -sI "$API_BASE/api/v1/health" 2>&1 || echo "")
echo "=== API Security Headers ===" > "$EVIDENCE_DIR/security-headers.txt"
echo "$api_headers" >> "$EVIDENCE_DIR/security-headers.txt"

# Frontend security headers
web_headers=$(curl -sI "$WEB_BASE" 2>&1 || echo "")
echo "" >> "$EVIDENCE_DIR/security-headers.txt"
echo "=== Frontend Security Headers ===" >> "$EVIDENCE_DIR/security-headers.txt"
echo "$web_headers" >> "$EVIDENCE_DIR/security-headers.txt"

echo "    → saved security-headers.txt"

# Extract key headers for structured evidence
extract_header() {
  local headers="$1"
  local name="$2"
  echo "$headers" | grep -i "^$name:" | sed "s/^[^:]*: //" | tr -d '\r' | head -1
}
echo ""
echo "    API Headers:"
echo "      HSTS:           $(extract_header "$api_headers" "strict-transport-security" || echo 'NOT SET')"
echo "      X-CTO:          $(extract_header "$api_headers" "x-content-type-options" || echo 'NOT SET')"
echo "      X-Frame:        $(extract_header "$api_headers" "x-frame-options" || echo 'NOT SET')"
echo "      Referrer-Policy:$(extract_header "$api_headers" "referrer-policy" || echo 'NOT SET')"
echo "      Permissions:    $(extract_header "$api_headers" "permissions-policy" || echo 'NOT SET')"
echo "      CORP:           $(extract_header "$api_headers" "cross-origin-resource-policy" || echo 'NOT SET')"
echo "      COOP:           $(extract_header "$api_headers" "cross-origin-opener-policy" || echo 'NOT SET')"
echo "      Cache-Control:  $(extract_header "$api_headers" "cache-control" || echo 'NOT SET')"

echo ""
echo "    Frontend Headers:"
echo "      CSP:            $(extract_header "$web_headers" "content-security-policy" | head -c 120 || echo 'NOT SET')..."
echo "      HSTS:           $(extract_header "$web_headers" "strict-transport-security" || echo 'NOT SET')"
echo "      X-CTO:          $(extract_header "$web_headers" "x-content-type-options" || echo 'NOT SET')"
echo "      X-Frame:        $(extract_header "$web_headers" "x-frame-options" || echo 'NOT SET')"
echo "      Referrer:       $(extract_header "$web_headers" "referrer-policy" || echo 'NOT SET')"
echo "      Permissions:    $(extract_header "$web_headers" "permissions-policy" || echo 'NOT SET')"

# ─── Section D — Performance ──────────────────────────────────────────

echo ""
echo "── Section D: Performance ──"

measure_latency() {
  local url="$1"
  local label="$2"
  local start end duration
  start=$(date +%s%N)
  local http_code
  http_code=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>&1 || echo "FAIL")
  end=$(date +%s%N)
  duration=$(( (end - start) / 1000000 ))
  # Warm up: second request
  local warm_code
  warm_code=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>&1 || echo "FAIL")
  local warm_end
  warm_end=$(date +%s%N)
  local warm_duration=$(( (warm_end - end) / 1000000 ))
  echo "    $label: cold=${duration}ms (HTTP ${http_code}), warm=${warm_duration}ms (HTTP ${warm_code})"
  echo "  \"${label}_cold_ms\": $duration, \"${label}_warm_ms\": $warm_duration, \"${label}_status\": \"$http_code\""
}

echo "  D: Measuring latencies..."
PERF_JSON=$(cat <<'PERF_EOF'
{
PERF_EOF
)

add_comma=false

# D1: Health endpoint latency
echo "  D1: Health endpoint..."
health_cold=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$API_BASE/api/v1/health" 2>&1 || echo "FAIL 0")
health_code=$(echo "$health_cold" | awk '{print $1}')
health_time=$(echo "$health_cold" | awk '{print $2}')
health_time_ms=$(echo "$health_time * 1000" | bc 2>/dev/null || echo "0")
echo "    → cold: ${health_time_ms}ms (HTTP ${health_code})"
# warm
health_warm=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$API_BASE/api/v1/health" 2>&1 || echo "FAIL 0")
health_warm_code=$(echo "$health_warm" | awk '{print $1}')
health_warm_time=$(echo "$health_warm" | awk '{print $2}')
health_warm_ms=$(echo "$health_warm_time * 1000" | bc 2>/dev/null || echo "0")
echo "    → warm: ${health_warm_ms}ms (HTTP ${health_warm_code})"

# D2: DB health latency
echo "  D2: DB health..."
db_cold=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$API_BASE/api/v1/health/db" 2>&1 || echo "FAIL 0")
db_code=$(echo "$db_cold" | awk '{print $1}')
db_time=$(echo "$db_cold" | awk '{print $2}')
db_time_ms=$(echo "$db_time * 1000" | bc 2>/dev/null || echo "0")
echo "    → cold: ${db_time_ms}ms (HTTP ${db_code})"
db_warm=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$API_BASE/api/v1/health/db" 2>&1 || echo "FAIL 0")
db_warm_code=$(echo "$db_warm" | awk '{print $1}')
db_warm_time=$(echo "$db_warm" | awk '{print $2}')
db_warm_ms=$(echo "$db_warm_time * 1000" | bc 2>/dev/null || echo "0")
echo "    → warm: ${db_warm_ms}ms (HTTP ${db_warm_code})"

# D3: Frontend load latency
echo "  D3: Frontend load..."
web_cold=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$WEB_BASE" 2>&1 || echo "FAIL 0")
web_code=$(echo "$web_cold" | awk '{print $1}')
web_time=$(echo "$web_cold" | awk '{print $2}')
web_time_ms=$(echo "$web_time * 1000" | bc 2>/dev/null || echo "0")
echo "    → cold: ${web_time_ms}ms (HTTP ${web_code})"
web_warm=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" "$WEB_BASE" 2>&1 || echo "FAIL 0")
web_warm_code=$(echo "$web_warm" | awk '{print $1}')
web_warm_time=$(echo "$web_warm" | awk '{print $2}')
web_warm_ms=$(echo "$web_warm_time * 1000" | bc 2>/dev/null || echo "0")
echo "    → warm: ${web_warm_ms}ms (HTTP ${web_warm_code})"

# Write performance JSON
cat > "$EVIDENCE_DIR/performance.json" << PERFEOF
{
  "timestamp": "$TIMESTAMP",
  "api_base": "$API_BASE",
  "web_base": "$WEB_BASE",
  "results": {
    "health_endpoint": {
      "cold_ms": $health_time_ms,
      "warm_ms": $health_warm_ms,
      "cold_http": "$health_code",
      "warm_http": "$health_warm_code"
    },
    "db_health_endpoint": {
      "cold_ms": $db_time_ms,
      "warm_ms": $db_warm_ms,
      "cold_http": "$db_code",
      "warm_http": "$db_warm_code"
    },
    "frontend_load": {
      "cold_ms": $web_time_ms,
      "warm_ms": $web_warm_ms,
      "cold_http": "$web_code",
      "warm_http": "$web_warm_code"
    }
  }
}
PERFEOF
echo "    → saved performance.json"

# ─── Section F — Deployment Integrity ─────────────────────────────────

echo ""
echo "── Section F: Deployment Integrity ──"

GIT_SHA=$(cd "$(dirname "$0")/../.." && git rev-parse HEAD 2>/dev/null || echo "UNKNOWN")
GIT_SHA_SHORT=$(cd "$(dirname "$0")/../.." && git rev-parse --short HEAD 2>/dev/null || echo "UNKNOWN")
GIT_TAG=$(cd "$(dirname "$0")/../.." && git describe --tags --always 2>/dev/null || echo "UNKNOWN")
GIT_BRANCH=$(cd "$(dirname "$0")/../.." && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "UNKNOWN")
LAST_COMMIT_MSG=$(cd "$(dirname "$0")/../.." && git log -1 --oneline 2>/dev/null || echo "UNKNOWN")

echo "  Git SHA:      $GIT_SHA"
echo "  Short SHA:    $GIT_SHA_SHORT"
echo "  Tag:          $GIT_TAG"
echo "  Branch:       $GIT_BRANCH"
echo "  Last commit:  $LAST_COMMIT_MSG"

cat > "$EVIDENCE_DIR/deployment-version.json" << DEPEOF
{
  "timestamp": "$TIMESTAMP",
  "git_sha": "$GIT_SHA",
  "git_sha_short": "$GIT_SHA_SHORT",
  "git_tag": "$GIT_TAG",
  "git_branch": "$GIT_BRANCH",
  "last_commit": "$LAST_COMMIT_MSG",
  "api_url": "$API_BASE",
  "web_url": "$WEB_BASE"
}
DEPEOF
echo "    → saved deployment-version.json"

# ─── Section C sub-check: CORS validation ────────────────────────────

echo ""
echo "── Section C sub-check: CORS ──"

# Check CORS headers from a OPTIONS request
CORS_HEADERS=$(curl -sI -X OPTIONS \
  -H "Origin: https://fieldconnect-tech.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  "$API_BASE/api/v1/health" 2>&1 || echo "")
CORS_ORIGIN=$(echo "$CORS_HEADERS" | grep -i "^access-control-allow-origin:" | tr -d '\r' | head -1 || echo "NOT SET")
CORS_METHODS=$(echo "$CORS_HEADERS" | grep -i "^access-control-allow-methods:" | tr -d '\r' | head -1 || echo "NOT SET")
CORS_CREDENTIALS=$(echo "$CORS_HEADERS" | grep -i "^access-control-allow-credentials:" | tr -d '\r' | head -1 || echo "NOT SET")

echo "  Access-Control-Allow-Origin:      $CORS_ORIGIN"
echo "  Access-Control-Allow-Methods:      $CORS_METHODS"
echo "  Access-Control-Allow-Credentials:  $CORS_CREDENTIALS"

cat > "$EVIDENCE_DIR/cors-headers.json" << CORSEOF
{
  "timestamp": "$TIMESTAMP",
  "access_control_allow_origin": "$CORS_ORIGIN",
  "access_control_allow_methods": "$CORS_METHODS",
  "access_control_allow_credentials": "$CORS_CREDENTIALS"
}
CORSEOF
echo "    → saved cors-headers.json"

# ─── Summary ─────────────────────────────────────────────────────────

echo ""
echo "── Generating results-summary.json ──"

cat > "$EVIDENCE_DIR/results-summary.json" << SUMEOF
[
  {
    "section": "A — Service Health",
    "checks": [
      { "item": "API health endpoint", "status": "⏳ Pending", "evidence": "health.json" },
      { "item": "Database readiness", "status": "⏳ Pending", "evidence": "readiness.json" },
      { "item": "Frontend availability", "status": "⏳ Pending", "evidence": "frontend-availability.json" }
    ]
  },
  {
    "section": "B — Infrastructure",
    "checks": [
      { "item": "Database connectivity", "status": "⏳ Pending", "evidence": "readiness.json" },
      { "item": "Socket.IO availability", "status": "⏳ Pending", "evidence": "socket-health.json" },
      { "item": "Cloudinary reachability", "status": "⏳ Pending", "evidence": "cloudinary-health.json" }
    ]
  },
  {
    "section": "C — Security",
    "checks": [
      { "item": "Security headers (API)", "status": "⏳ Pending", "evidence": "security-headers.txt" },
      { "item": "Security headers (Frontend)", "status": "⏳ Pending", "evidence": "security-headers.txt" },
      { "item": "CORS configuration", "status": "⏳ Pending", "evidence": "cors-headers.json" }
    ]
  },
  {
    "section": "D — Performance",
    "checks": [
      { "item": "Health endpoint latency", "status": "⏳ Pending", "evidence": "performance.json" },
      { "item": "DB health latency", "status": "⏳ Pending", "evidence": "performance.json" },
      { "item": "Frontend load latency", "status": "⏳ Pending", "evidence": "performance.json" }
    ]
  },
  {
    "section": "F — Deployment Integrity",
    "checks": [
      { "item": "Git SHA matches deployed", "status": "⏳ Pending", "evidence": "deployment-version.json" },
      { "item": "Release tag matches", "status": "⏳ Pending", "evidence": "deployment-version.json" },
      { "item": "Environment configuration", "status": "⏳ Pending", "evidence": "deployment-version.json" }
    ]
  }
]
SUMEOF
echo "    → saved results-summary.json (templated — will be finalized in RC report)"

echo ""
echo "=== Validation complete. Evidence saved to: ==="
echo "  $EVIDENCE_DIR"
ls -la "$EVIDENCE_DIR" | grep -v validate | grep -v "^total" | grep -v "^d"

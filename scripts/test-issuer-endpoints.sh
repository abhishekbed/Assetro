#!/usr/bin/env bash
# =============================================================
# Assetro – Issuer Endpoint Test Suite
# Tests every API endpoint relevant to the Issuer role
# Usage: bash scripts/test-issuer-endpoints.sh
# =============================================================

BASE="http://localhost:3000/api/v1"
PASS=0; FAIL=0; SKIP=0
JWT=""
USER_ID=""
TOKEN_ID=""
RULE_ID=""
NOTIF_ID=""
KYC_ID=""

# colours
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

hr()  { echo -e "${CYAN}$(printf '─%.0s' {1..62})${NC}"; }
hdr() { echo ""; hr; echo -e "${BOLD}${CYAN}  $1${NC}"; hr; }

# run_curl METHOD URL json_file [extra_headers...]
run_curl() {
  local method="$1" url="$2" jfile="${3:-}"
  shift 3
  local extra_headers=("$@")
  local args=(-s -o /tmp/tcbody -w "%{http_code}" -X "$method" "$url")
  [[ -n "$JWT" ]] && args+=(-H "Authorization: Bearer $JWT")
  [[ -n "$USER_ID" ]] && args+=(-H "x-user-id: $USER_ID")
  for h in "${extra_headers[@]}"; do args+=(-H "$h"); done
  if [[ -n "$jfile" ]]; then
    args+=(-H "Content-Type: application/json" --data-binary "@$jfile")
  fi
  curl "${args[@]}" 2>/dev/null
}

assert() {
  local label="$1" status="$2" expected="$3"
  local body
  body=$(cat /tmp/tcbody 2>/dev/null | head -c 300)
  if echo "$status" | grep -qE "^(${expected})$"; then
    echo -e "  ${GREEN}✓ PASS${NC}  [${status}]  ${label}"
    ((PASS++))
    return 0
  else
    echo -e "  ${RED}✗ FAIL${NC}  [${status}]  ${label}"
    echo -e "         ${YELLOW}→ ${body}${NC}"
    ((FAIL++))
    return 1
  fi
}

skip() { echo -e "  ${YELLOW}⊘ SKIP${NC}  $1"; ((SKIP++)); }

json_file() {
  local f; f=$(mktemp /tmp/tc.XXXXXXXX)
  mv "$f" "${f}.json"
  echo "$1" > "${f}.json"; echo "${f}.json"
}

# ═══════════════════════════════════════════════════════════════
hdr "0. HEALTH CHECK"
# ═══════════════════════════════════════════════════════════════
S=$(curl -s -o /tmp/tcbody -w "%{http_code}" http://localhost:3000/health 2>/dev/null)
assert "API Gateway /health" "$S" "200"

# ═══════════════════════════════════════════════════════════════
hdr "1. AUTH – Register & Login as Issuer"
# ═══════════════════════════════════════════════════════════════
TS=$(date +%s)
ISSUER_EMAIL="issuer_test_${TS}@assetro.com"
ISSUER_PASS='Test@12345!'

# 1a — Register
J=$(json_file "{\"email\":\"${ISSUER_EMAIL}\",\"password\":\"${ISSUER_PASS}\",\"name\":\"Test Issuer\",\"role\":\"issuer\"}")
S=$(run_curl POST "$BASE/auth/register" "$J")
assert "POST /auth/register" "$S" "201|200"

# 1b — Login
J=$(json_file "{\"email\":\"${ISSUER_EMAIL}\",\"password\":\"${ISSUER_PASS}\"}")
S=$(run_curl POST "$BASE/auth/login" "$J")
assert "POST /auth/login" "$S" "200|201"
BODY=$(cat /tmp/tcbody)
JWT=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
t = d.get('tokens',{}).get('accessToken','') or d.get('data',{}).get('accessToken','') or d.get('accessToken','')
print(t)
" 2>/dev/null)
USER_ID=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
uid = d.get('user',{}).get('id','') or d.get('data',{}).get('id','') or d.get('id','')
print(uid)
" 2>/dev/null)
if [[ -n "$JWT" ]]; then
  echo -e "       ${GREEN}JWT obtained — user $USER_ID${NC}"
else
  echo -e "       ${RED}⚠  No JWT extracted — protected routes may fail${NC}"
fi

# 1c — Refresh token
REFRESH=$(echo "$BODY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r = d.get('tokens',{}).get('refreshToken','') or d.get('data',{}).get('refreshToken','') or d.get('refreshToken','')
print(r)
" 2>/dev/null)
if [[ -n "$REFRESH" ]]; then
  J=$(json_file "{\"refreshToken\":\"${REFRESH}\"}")
  S=$(run_curl POST "$BASE/auth/refresh" "$J")
  assert "POST /auth/refresh" "$S" "200|201"
fi

# ═══════════════════════════════════════════════════════════════
hdr "2. TOKEN SERVICE – CRUD"
# ═══════════════════════════════════════════════════════════════

# 2a — Create
J=$(json_file '{
  "name":"Test Real Estate Token",
  "symbol":"TRET",
  "total_supply":"1000000",
  "decimals":18,
  "asset_type":"real_estate",
  "description":"Issuer test token",
  "chain_id":1337
}')
S=$(run_curl POST "$BASE/tokens" "$J")
assert "POST /tokens (create)" "$S" "201|200"
TOKEN_ID=$(cat /tmp/tcbody | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('data') or d).get('id',''))" 2>/dev/null)
[[ -n "$TOKEN_ID" ]] && echo -e "       ${GREEN}Token ID: $TOKEN_ID${NC}"

# 2b — List
S=$(run_curl GET "$BASE/tokens")
assert "GET /tokens (list)" "$S" "200"

# 2c — Get by ID
if [[ -n "$TOKEN_ID" ]]; then
  S=$(run_curl GET "$BASE/tokens/$TOKEN_ID")
  assert "GET /tokens/:id" "$S" "200"
else skip "GET /tokens/:id"; fi

# 2d — Update
if [[ -n "$TOKEN_ID" ]]; then
  J=$(json_file '{"description":"Updated description via test"}')
  S=$(run_curl PATCH "$BASE/tokens/$TOKEN_ID" "$J")
  assert "PATCH /tokens/:id (update)" "$S" "200"
else skip "PATCH /tokens/:id"; fi

# ═══════════════════════════════════════════════════════════════
hdr "3. TOKEN LIFECYCLE"
# ═══════════════════════════════════════════════════════════════

if [[ -n "$TOKEN_ID" ]]; then
  WALLET1="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  WALLET2="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  WALLET3="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"

  # 3a — Deploy
  J=$(json_file '{"chainId":"1337","network":"localhost"}')
  S=$(run_curl POST "$BASE/tokens/$TOKEN_ID/deploy" "$J")
  assert "POST /tokens/:id/deploy" "$S" "200|201|202"

  sleep 1

  # 3b — Deployment status
  S=$(run_curl GET "$BASE/tokens/$TOKEN_ID/deployment-status")
  assert "GET /tokens/:id/deployment-status" "$S" "200"

  # 3c — Mint
  J=$(json_file "{\"to\":\"${WALLET1}\",\"amount\":\"5000\"}")
  S=$(run_curl POST "$BASE/tokens/$TOKEN_ID/mint" "$J")
  assert "POST /tokens/:id/mint" "$S" "200|201"

  # 3d — Batch mint
  J=$(json_file "{\"recipients\":[{\"address\":\"${WALLET2}\",\"amount\":\"1000\"},{\"address\":\"${WALLET3}\",\"amount\":\"2000\"}]}")
  S=$(run_curl POST "$BASE/tokens/$TOKEN_ID/batch-mint" "$J")
  assert "POST /tokens/:id/batch-mint" "$S" "200|201"

  # 3e — Burn
  J=$(json_file '{"amount":"100"}')
  S=$(run_curl POST "$BASE/tokens/$TOKEN_ID/burn" "$J")
  assert "POST /tokens/:id/burn" "$S" "200|201"

  # 3f — Pause
  J=$(json_file '{}')
  S=$(run_curl POST "$BASE/tokens/$TOKEN_ID/pause" "$J")
  assert "POST /tokens/:id/pause" "$S" "200|201"

  # 3g — Unpause
  S=$(run_curl POST "$BASE/tokens/$TOKEN_ID/unpause" "$J")
  assert "POST /tokens/:id/unpause" "$S" "200|201"

  # 3h — Freeze address
  S=$(run_curl POST "$BASE/tokens/$TOKEN_ID/freeze/$WALLET2" "$J")
  assert "POST /tokens/:id/freeze/:address" "$S" "200|201"

  # 3i — Unfreeze address
  S=$(run_curl POST "$BASE/tokens/$TOKEN_ID/unfreeze/$WALLET2" "$J")
  assert "POST /tokens/:id/unfreeze/:address" "$S" "200|201"
else
  for t in deploy deployment-status mint batch-mint burn pause unpause "freeze/addr" "unfreeze/addr"; do
    skip "Token lifecycle: $t"
  done
fi

# ═══════════════════════════════════════════════════════════════
hdr "4. CAP TABLE"
# ═══════════════════════════════════════════════════════════════

if [[ -n "$TOKEN_ID" ]]; then
  # Cap table is nested under /tokens/ prefix (token-service routes)
  S=$(run_curl GET "$BASE/tokens/cap-table/tokens/$TOKEN_ID")
  assert "GET /cap-table/tokens/:tokenId" "$S" "200"

  J=$(json_file '{}')
  S=$(run_curl POST "$BASE/tokens/cap-table/tokens/$TOKEN_ID/sync" "$J")
  assert "POST /cap-table/tokens/:tokenId/sync" "$S" "200|201"

  S=$(run_curl GET "$BASE/tokens/cap-table/tokens/$TOKEN_ID/export")
  assert "GET /cap-table/tokens/:tokenId/export" "$S" "200"
else
  skip "Cap table (no token id)"
fi

# ═══════════════════════════════════════════════════════════════
hdr "5. COMPLIANCE – Rules"
# ═══════════════════════════════════════════════════════════════

if [[ -n "$TOKEN_ID" ]]; then
  # 5a — Create rule (snake_case fields!)
  J=$(json_file "{
    \"token_id\":\"${TOKEN_ID}\",
    \"rule_type\":\"country_restriction\",
    \"description\":\"Restrict sanctioned countries\",
    \"parameters\":{\"blockedCountries\":[\"IR\",\"KP\",\"CU\"]},
    \"is_active\":true
  }")
  S=$(run_curl POST "$BASE/compliance/rules" "$J")
  assert "POST /compliance/rules (create)" "$S" "201|200"
  RULE_ID=$(cat /tmp/tcbody | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('data') or d).get('id',''))" 2>/dev/null)
  [[ -n "$RULE_ID" ]] && echo -e "       ${GREEN}Rule ID: $RULE_ID${NC}"

  # 5b — List rules (requires token_id query param)
  S=$(run_curl GET "$BASE/compliance/rules?token_id=${TOKEN_ID}")
  assert "GET /compliance/rules" "$S" "200"

  # 5c — Get rule
  if [[ -n "$RULE_ID" ]]; then
    S=$(run_curl GET "$BASE/compliance/rules/$RULE_ID")
    assert "GET /compliance/rules/:id" "$S" "200"

    # 5d — Update rule
    J=$(json_file '{"is_active":false}')
    S=$(run_curl PATCH "$BASE/compliance/rules/$RULE_ID" "$J")
    assert "PATCH /compliance/rules/:id" "$S" "200"
  else skip "GET+PATCH /compliance/rules/:id"; fi

  # 5e — Check transfer (snake_case fields!)
  J=$(json_file "{
    \"token_id\":\"${TOKEN_ID}\",
    \"from_address\":\"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\",
    \"to_address\":\"0x70997970C51812dc3A010C7d01b50e0d17dc79C8\",
    \"amount\":\"100\"
  }")
  S=$(run_curl POST "$BASE/compliance/check-transfer" "$J")
  assert "POST /compliance/check-transfer" "$S" "200|201"
else
  skip "Compliance rules (no token id)"
fi

# ═══════════════════════════════════════════════════════════════
hdr "6. COMPLIANCE – Whitelist"
# ═══════════════════════════════════════════════════════════════

if [[ -n "$TOKEN_ID" ]]; then
  WALLET="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

  # 6a — Add (snake_case fields!)
  J=$(json_file "{\"token_id\":\"${TOKEN_ID}\",\"wallet_address\":\"${WALLET}\"}")
  S=$(run_curl POST "$BASE/compliance/whitelist" "$J")
  assert "POST /compliance/whitelist (add)" "$S" "201|200"

  # 6b — Batch (snake_case fields!)
  J=$(json_file "{\"token_id\":\"${TOKEN_ID}\",\"entries\":[
    {\"wallet_address\":\"0x70997970C51812dc3A010C7d01b50e0d17dc79C8\"},
    {\"wallet_address\":\"0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC\"}
  ]}")
  S=$(run_curl POST "$BASE/compliance/whitelist/batch" "$J")
  assert "POST /compliance/whitelist/batch" "$S" "200|201"

  # 6c — List (snake_case query param)
  S=$(run_curl GET "$BASE/compliance/whitelist?token_id=${TOKEN_ID}")
  assert "GET /compliance/whitelist" "$S" "200"

  # 6d — Check (snake_case query params)
  S=$(run_curl GET "$BASE/compliance/whitelist/check?token_id=${TOKEN_ID}&wallet_address=${WALLET}")
  assert "GET /compliance/whitelist/check" "$S" "200"

  # 6e — Delete
  S=$(run_curl DELETE "$BASE/compliance/whitelist/${TOKEN_ID}/${WALLET}")
  assert "DELETE /compliance/whitelist/:tokenId/:wallet" "$S" "200|204"
else
  skip "Whitelist (no token id)"
fi

# ═══════════════════════════════════════════════════════════════
hdr "7. KYC – Submit & View"
# ═══════════════════════════════════════════════════════════════

# 7a — Submit KYC
if [[ -n "$USER_ID" ]]; then
  J=$(json_file '{
    "full_name":"Test Issuer Name",
    "date_of_birth":"1990-01-15",
    "nationality":"US",
    "country":"US",
    "address_line1":"123 Main Street",
    "city":"New York",
    "postal_code":"10001",
    "investor_type":"individual",
    "accreditation":"none"
  }')
  S=$(run_curl POST "$BASE/kyc/submit" "$J")
  assert "POST /kyc/submit" "$S" "201|200|409"
  KYC_ID=$(cat /tmp/tcbody | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('data') or d).get('id',''))" 2>/dev/null)
else skip "POST /kyc/submit (no user id)"; fi

# 7b — My submission
if [[ -n "$USER_ID" ]]; then
  S=$(run_curl GET "$BASE/kyc/my-submission")
  assert "GET /kyc/my-submission" "$S" "200|404"
else skip "GET /kyc/my-submission"; fi

# 7c — All submissions (issuer/admin)
S=$(run_curl GET "$BASE/kyc/submissions")
assert "GET /kyc/submissions (list)" "$S" "200"

# 7d — KYC stats
S=$(run_curl GET "$BASE/kyc/stats")
assert "GET /kyc/stats" "$S" "200"

# 7e — Get specific submission
if [[ -n "$KYC_ID" ]]; then
  S=$(run_curl GET "$BASE/kyc/submissions/$KYC_ID")
  assert "GET /kyc/submissions/:id" "$S" "200"

  # 7f — Get submission documents
  S=$(run_curl GET "$BASE/kyc/submissions/$KYC_ID/documents")
  assert "GET /kyc/submissions/:id/documents" "$S" "200"

  # 7g — Review submission
  if [[ -n "$USER_ID" ]]; then
    J=$(json_file '{"status":"approved","review_notes":"All documents verified"}')
    S=$(run_curl PATCH "$BASE/kyc/submissions/$KYC_ID/review" "$J")
    assert "PATCH /kyc/submissions/:id/review" "$S" "200"
  fi
else
  skip "GET /kyc/submissions/:id (no kyc id)"
  skip "GET /kyc/submissions/:id/documents"
  skip "PATCH /kyc/submissions/:id/review"
fi

# ═══════════════════════════════════════════════════════════════
hdr "8. PAYMENTS"
# ═══════════════════════════════════════════════════════════════

# 8a — Checkout
if [[ -n "$TOKEN_ID" && -n "$USER_ID" ]]; then
  J=$(json_file "{\"token_id\":\"${TOKEN_ID}\",\"token_amount\":\"100\",\"currency\":\"USD\"}")
  S=$(run_curl POST "$BASE/payments/checkout" "$J")
  assert "POST /payments/checkout" "$S" "200|201"
  PAYMENT_ID=$(cat /tmp/tcbody | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('data') or d).get('id',''))" 2>/dev/null)
else skip "POST /payments/checkout"; fi

# 8b — Payment history
S=$(run_curl GET "$BASE/payments/history")
assert "GET /payments/history" "$S" "200"

# 8c — Get payment by id
if [[ -n "$PAYMENT_ID" ]]; then
  S=$(run_curl GET "$BASE/payments/$PAYMENT_ID")
  assert "GET /payments/:id" "$S" "200"
else skip "GET /payments/:id"; fi

# ═══════════════════════════════════════════════════════════════
hdr "9. NOTIFICATIONS"
# ═══════════════════════════════════════════════════════════════

# 9a — Create notification
if [[ -n "$USER_ID" ]]; then
  J=$(json_file "{\"user_id\":\"${USER_ID}\",\"title\":\"Token Deployed\",\"message\":\"Your token is live\",\"type\":\"success\"}")
  S=$(run_curl POST "$BASE/notifications" "$J")
  assert "POST /notifications (create)" "$S" "201|200"
  NOTIF_ID=$(cat /tmp/tcbody | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('data') or d).get('id',''))" 2>/dev/null)
else skip "POST /notifications"; fi

# 9b — List
S=$(run_curl GET "$BASE/notifications")
assert "GET /notifications" "$S" "200"

# 9c — Unread count
S=$(run_curl GET "$BASE/notifications/unread-count")
assert "GET /notifications/unread-count" "$S" "200"

# 9d — Mark one read
if [[ -n "$NOTIF_ID" && -n "$USER_ID" ]]; then
  J=$(json_file '{}')
  S=$(run_curl PATCH "$BASE/notifications/$NOTIF_ID/read" "$J")
  assert "PATCH /notifications/:id/read" "$S" "200"
else skip "PATCH /notifications/:id/read"; fi

# 9e — Mark all read
J=$(json_file '{}')
S=$(run_curl PATCH "$BASE/notifications/read-all" "$J")
assert "PATCH /notifications/read-all" "$S" "200"

# ═══════════════════════════════════════════════════════════════
hdr "10. CLEANUP"
# ═══════════════════════════════════════════════════════════════

if [[ -n "$RULE_ID" ]]; then
  S=$(run_curl DELETE "$BASE/compliance/rules/$RULE_ID")
  assert "DELETE /compliance/rules/:id (cleanup)" "$S" "200|204"
fi

# Token was deployed (active), so we can't delete — just verify it exists
if [[ -n "$TOKEN_ID" ]]; then
  S=$(run_curl GET "$BASE/tokens/$TOKEN_ID")
  assert "GET /tokens/:id (verify still exists)" "$S" "200"
fi

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════
TOTAL=$((PASS + FAIL))
echo ""; hr
echo -e "${BOLD}  ISSUER ENDPOINT TEST RESULTS${NC}"; hr
echo -e "  ${GREEN}✓ Passed  : $PASS${NC}"
echo -e "  ${RED}✗ Failed  : $FAIL${NC}"
echo -e "  ${YELLOW}⊘ Skipped : $SKIP${NC}"
echo -e "  ${BOLD}  Total    : $TOTAL${NC}"
echo ""
if [[ $FAIL -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}All tests passed! ✓${NC}"
else
  echo -e "  ${RED}${BOLD}$FAIL test(s) failed — see responses above${NC}"
fi
hr; echo ""

# clean up temp json files
rm -f /tmp/tc.*.json /tmp/tcbody

exit $FAIL

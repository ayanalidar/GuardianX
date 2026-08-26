# GuardianX API Integration Guide

This guide walks through everything an integrator needs to start calling the
GuardianX REST API: authentication, rate limits, common workflows, webhook
setup, error handling, and a copy-paste Python + curl SDK example.

> **Interactive docs:** Browse the live OpenAPI 3.0 spec at
> [`/api-doc`](https://www.guardianx.in/api-doc) (Swagger UI, no login required).
> The raw JSON is served at [`/api/openapi.json`](https://www.guardianx.in/api/openapi.json).

---

## Table of contents

1. [Base URL](#1-base-url)
2. [Authentication](#2-authentication)
3. [Rate limits](#3-rate-limits)
4. [Common workflows](#4-common-workflows)
5. [Webhook setup](#5-webhook-setup)
6. [Error codes](#6-error-codes)
7. [SDK example (Python + curl)](#7-sdk-example-python--curl)

---

## 1. Base URL

| Environment | Base URL |
| --- | --- |
| Production | `https://www.guardianx.in` |
| Local dev | `http://localhost:3000` |

All routes documented below are prefixed with `/api`. The OpenAPI spec uses
relative paths (e.g. `/api/clients`) so the same spec works against any host.

---

## 2. Authentication

GuardianX uses **JWT bearer tokens** issued by `POST /api/auth/login`. Tokens
are valid for **7 days** and are also stored in an HTTP-only cookie named
`guardianx-token` (so the dashboard works without re-sending the header).

### 2.1 Signup → verify → approve flow

Before you can log in, three things must be true:

1. Your account exists (created via `POST /api/auth/signup`).
2. You have clicked the verification link in the signup email (sets
   `emailVerified = true`). The link expires after 24 hours.
3. An admin has approved your account (sets `approved = true`). The **first**
   user on a fresh install is auto-approved; everyone else must wait.

If you try to log in before #2 or #3 you'll get a `403` with a helpful
`code` field — see [Error codes](#6-error-codes).

### 2.2 Plain login

```bash
curl -X POST https://www.guardianx.in/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

**200 response (success):**

```json
{
  "user": { "id": "…", "email": "you@example.com", "name": "You", "role": "admin" },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…",
  "message": "Login successful"
}
```

The `token` is your bearer token. Send it on every authenticated request:

```bash
curl https://www.guardianx.in/api/clients \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…"
```

### 2.3 Two-factor login (TOTP)

If the user has TOTP 2FA enabled, `POST /api/auth/login` returns a step-up
token instead of a session JWT:

```json
{
  "requiresTwoFactor": true,
  "twoFactorToken": "<5-minute step-up JWT>",
  "email": "you@example.com",
  "message": "2FA required. Enter the 6-digit code from your authenticator."
}
```

Complete the flow by POSTing the step-up token + a 6-digit TOTP code:

```bash
curl -X POST https://www.guardianx.in/api/auth/2fa/login \
  -H "Content-Type: application/json" \
  -d '{"twoFactorToken":"<step-up-token>","token":"123456"}'
```

A successful response has the same shape as the plain-login success response
— pick the `token` field out and continue.

### 2.4 Logout / session revocation

`POST /api/auth/logout` clears the cookie AND bumps the user's `tokenVersion`
in the DB, so the just-logged-out JWT is rejected everywhere (closes the
stolen-token-replay hole). The token stops working immediately, not after
the 7-day TTL.

For programmatic revoke of *another* user's sessions (admin only):

```bash
curl -X POST https://www.guardianx.in/api/auth/revoke-sessions \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<target-user-id>"}'
```

---

## 3. Rate limits

Rate limiting is enforced in `src/middleware.ts` (Edge runtime). Each
`(IP, endpoint)` pair has its own bucket; the limit headers are sent on
every response.

| Endpoint bucket | Limit | Window |
| --- | --- | --- |
| `POST /api/auth/login` | 10 | 15 min |
| `POST /api/auth/signup` | 5 | 60 min |
| `POST /api/auth/forgot-password` | 5 | 60 min |
| `POST /api/auth/reset-password` | 10 | 15 min |
| `POST /api/auth/verify-email` | 10 | 15 min |
| Other `/api/auth/*` (session, logout, 2fa/*, revoke-sessions) | 20 | 15 min |
| All other `/api/*` (clients, scans, patches, …) | 300 | 60 s |

> **Note:** the dashboard fires many concurrent fetches on mount plus a
> 10-second auto-refresh poll, so the generic 300/min bucket is sized for
> legitimate UI traffic. A script doing a tight loop will be throttled at
> ~5 req/sec per IP — back off when you see a 429.

When you exceed a limit, the response is `429 Too Many Requests` with:

```json
{
  "error": "Too many login attempts. Rate limit exceeded. Please try again in 142 seconds.",
  "retry_after": 142,
  "limit": "login"
}
```

The `Retry-After` header (seconds) is also set. Sleep for `retry_after`
seconds, then retry.

---

## 4. Common workflows

### 4.1 Create a client → upload codebase → run scan → get findings → approve patch

This is the primary end-to-end workflow. ~5 API calls.

```bash
TOKEN="<your-bearer-token>"
BASE="https://www.guardianx.in"

# 1. Create a client
CLIENT_RESP=$(curl -sX POST "$BASE/api/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Corp","contactEmail":"sec@acme.example","scope":"Production web app"}')
CLIENT_ID=$(echo "$CLIENT_RESP" | jq -r .id)
echo "Created client: $CLIENT_ID"

# 2. Upload a codebase under that client
CB_RESP=$(curl -sX POST "$BASE/api/codebases" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg cid "$CLIENT_ID" --rawfile src ./my-app.js \
        '{name:"my-app.js", language:"javascript", clientId:$cid, sourceCode:$src}')")
CB_ID=$(echo "$CB_RESP" | jq -r .id)
echo "Uploaded codebase: $CB_ID"

# 3. Kick off a scan (returns 202 immediately with scanId)
SCAN_RESP=$(curl -sX POST "$BASE/api/scans" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"codebaseId\":\"$CB_ID\"}")
SCAN_ID=$(echo "$SCAN_RESP" | jq -r .scanId)
echo "Scan queued: $SCAN_ID"

# 4. Poll the codebase detail until the scan completes (status=completed)
#    In production, subscribe to the socket.io stream instead of polling.
until [ "$(curl -s "$BASE/api/codebases/$CB_ID" -H "Authorization: Bearer $TOKEN" \
          | jq -r ".scans[0].status")" = "completed" ]; do
  echo "  scan still running…"
  sleep 5
done

# 5. Fetch pending patches (sorted by severity)
PATCHES=$(curl -s "$BASE/api/patches/pending?limit=10" \
  -H "Authorization: Bearer $TOKEN")
echo "$PATCHES" | jq '.patches[] | {patch_id, title, severity, codebase_name}'

# 6. Approve the first patch (this applies the fix + creates a cryptographic attestation)
PATCH_ID=$(echo "$PATCHES" | jq -r '.patches[0].patch_id')
curl -sX POST "$BASE/api/patches/$PATCH_ID/approve" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 4.2 Incident response: create → contain → close

```bash
# Open a critical incident
INC=$(curl -sX POST "$BASE/api/incidents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"SQL injection in /api/search","severity":"critical","category":"sqli"}')
INC_ID=$(echo "$INC" | jq -r .id)

# Mark contained (auto-stamps containedAt, appends a timeline event)
curl -sX PATCH "$BASE/api/incidents/$INC_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"contained"}' | jq

# Close after post-mortem (auto-stamps closedAt + containedAt + eradicatedAt
# if any were missing)
curl -sX PATCH "$BASE/api/incidents/$INC_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"closed","rootCause":"Unparameterized string concat in SQL","lessonsLearned":"Migrate to prepared statements; add SAST gate in CI"}' | jq
```

### 4.3 Threat intel: add + query IOCs

```bash
# Add a malicious IP seen on a honeypot
curl -sX POST "$BASE/api/iocs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"iocType":"ip","value":"203.0.113.42","confidence":"high","source":"honeypot","tags":["brute-force","ssh"]}' | jq

# Query all active high-confidence IOCs
curl -s "$BASE/api/iocs?active=true" -H "Authorization: Bearer $TOKEN" \
  | jq '.iocs[] | select(.confidence=="high") | {value,iocType,hitCount,lastSeen}'
```

---

## 5. Webhook setup

GuardianX can push security events to your HTTP endpoint so you don't have to
poll. Configure a webhook via `POST /api/webhooks`.

### 5.1 Create a webhook

```bash
WH=$(curl -sX POST "$BASE/api/webhooks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SOC ingest",
    "url": "https://soc.my-company.example/guardianx",
    "events": ["critical_finding", "incident_created", "canary_triggered", "patch_ready"],
    "isActive": true
  }')
echo "$WH" | jq

# IMPORTANT: copy the secret out of the response — it is never readable again.
WH_SECRET=$(echo "$WH" | jq -r .secret)
```

If you omit `secret`, a 32-byte hex secret is auto-generated and returned
ONCE. Use `events: ["*"]` to subscribe to every event type.

Supported event types:

| Event type | Fired when |
| --- | --- |
| `critical_finding` | A scan produces a critical-severity finding. |
| `incident_created` | A new incident case is opened (manual or auto). |
| `canary_triggered` | A canary token fires (e.g. honeypot credential used). |
| `patch_ready` | A patch transitions to the `pending` review queue. |
| `test` | Synthetic event sent via the test-mode endpoint. |

### 5.2 Receive + verify the webhook

Each delivery is a `POST` to your `url` with:

```
Content-Type: application/json
X-GuardianX-Event: <event.type>
X-GuardianX-Signature: sha256=<hex-hmac-sha256-of-body-event-json>
```

Body shape:

```json
{
  "event": {
    "type": "incident_created",
    "severity": "critical",
    "title": "SQL injection in /api/search",
    "description": "Manual incident case opened by analyst@example.com.",
    "clientId": "…",
    "metadata": { "incidentId": "…", "category": "sqli" }
  },
  "timestamp": "2024-08-01T12:34:56.789Z",
  "signature": "<hex hmac>"
}
```

Verify the signature before processing (fail closed on mismatch):

```python
import hmac, hashlib, json

def verify(body_bytes: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header.startswith("sha256="):
        return False
    expected = signature_header.removeprefix("sha256=")
    # Signature is computed over the `event` JSON, not the wrapping body.
    body = json.loads(body_bytes)
    event_json = json.dumps(body["event"])  # canonical string used by sender
    computed = hmac.new(secret.encode(), event_json.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, computed)
```

> **Note:** the signature is computed over `JSON.stringify(event)` on the
> sender side. JSON key ordering in JavaScript serialisation is stable for
> plain objects (insertion order), so re-serialising the parsed `event`
> field on your side will match — but if your language reorders keys, you
> may need to preserve the original byte sequence. The `signature` field
> in the body is provided as a convenience but you should always recompute
> from the event payload for true verification.

### 5.3 Test a webhook

```bash
WH_ID="<webhook-id-from-step-5.1>"
curl -sX POST "$BASE/api/webhooks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"test\":true,\"id\":\"$WH_ID\"}" | jq
# → { "ok": true, "matched": 1, "succeeded": 1, "failed": 0, … }
```

### 5.4 Rotate / delete

- **Rotate secret:** `PATCH /api/webhooks` with `{id, secret: ""}` (empty
  string signals "generate a new one"). The new secret is returned once.
- **Delete:** `DELETE /api/webhooks?id=<id>`.

---

## 6. Error codes

All errors return JSON with at least an `error` field (human-readable) and
optionally a `code` field (machine-readable). Standard HTTP status codes
apply.

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `INVALID_TOKEN` | Reset/verify token is malformed. |
| 400 | `TOKEN_NOT_FOUND` | Reset/verify token doesn't exist in the DB. |
| 400 | `TOKEN_USED` | Reset/verify token was already consumed. |
| 400 | `TOKEN_EXPIRED` | Reset (1h) / verify (24h) token expired. |
| 400 | `NO_PENDING_SECRET` | Called `/api/auth/2fa/verify` without first calling `/setup`. |
| 400 | — | Generic validation error (missing/invalid input). |
| 401 | — | Missing/invalid/expired Bearer token. |
| 401 | `SESSION_REVOKED` | Your `tokenVersion` was bumped (logout / revoke-sessions). |
| 401 | `TWO_FACTOR_SESSION_EXPIRED` | The 5-minute step-up token expired; log in again. |
| 401 | `ACCOUNT_NOT_ELIGIBLE` | During 2FA login: account no longer approved or email no longer verified. |
| 403 | `PENDING_APPROVAL` | Account exists but admin hasn't approved it yet. |
| 403 | `EMAIL_NOT_VERIFIED` | Account exists but email hasn't been verified yet. |
| 403 | — | Viewer trying to access another user's client; or admin-only route hit by non-admin. |
| 404 | — | Resource not found. |
| 409 | — | Conflict (duplicate email, scan already running, patch already approved, …). |
| 429 | — | Rate limit exceeded. `retry_after` (seconds) is in the body and `Retry-After` header. |
| 503 | `DB_NOT_INITIALIZED` | Supabase tables don't exist yet — run the SQL migration. |

### 429 example

```json
{
  "error": "Too many login attempts. Rate limit exceeded. Please try again in 142 seconds.",
  "retry_after": 142,
  "limit": "login"
}
```

---

## 7. SDK example (Python + curl)

A minimal Python client that logs in, fetches clients, and prints them.
Requires Python 3.10+ and `requests` (`pip install requests`).

```python
#!/usr/bin/env python3
"""guardianx_demo.py — minimal GuardianX API client.

Usage:
  GUARDIANX_BASE_URL=https://www.guardianx.in \
  GUARDIANX_EMAIL=you@example.com \
  GUARDIANX_PASSWORD='…' \
  python3 guardianx_demo.py
"""
from __future__ import annotations

import os
import sys
import requests


class GuardianXClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.token: str | None = None

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def login(self, email: str, password: str) -> None:
        resp = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"email": email, "password": password},
            timeout=30,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"login failed: {resp.status_code} {resp.text}")
        body = resp.json()
        # If the account has 2FA enabled, the response carries `requiresTwoFactor`
        # and a `twoFactorToken` instead of a session JWT — handle that here in
        # a real client.
        if body.get("requiresTwoFactor"):
            two_factor_token = body["twoFactorToken"]
            code = input("Enter the 6-digit code from your authenticator: ").strip()
            resp = requests.post(
                f"{self.base_url}/api/auth/2fa/login",
                json={"twoFactorToken": two_factor_token, "token": code},
                timeout=30,
            )
            if resp.status_code != 200:
                raise RuntimeError(f"2fa login failed: {resp.status_code} {resp.text}")
            body = resp.json()
        self.token = body["token"]
        print(f"[ok] logged in as {body['user']['email']} ({body['user']['role']})", file=sys.stderr)

    def list_clients(self) -> list[dict]:
        resp = self.session.get(
            f"{self.base_url}/api/clients",
            headers=self._headers(),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def list_pending_patches(self, limit: int = 10) -> dict:
        resp = self.session.get(
            f"{self.base_url}/api/patches/pending",
            params={"limit": limit},
            headers=self._headers(),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


def main() -> int:
    base = os.environ.get("GUARDIANX_BASE_URL", "https://www.guardianx.in")
    email = os.environ.get("GUARDIANX_EMAIL")
    password = os.environ.get("GUARDIANX_PASSWORD")
    if not email or not password:
        print("Set GUARDIANX_EMAIL and GUARDIANX_PASSWORD env vars.", file=sys.stderr)
        return 1

    client = GuardianXClient(base)
    client.login(email, password)

    clients = client.list_clients()
    print(f"\n=== {len(clients)} client(s) ===")
    for c in clients:
        stats = c.get("stats", {})
        print(
            f"- {c['name']}  (id={c['id']}, status={c.get('status')}, "
            f"patches={stats.get('patches', 0)}, "
            f"pending={stats.get('pending_patches', 0)}, "
            f"critical={stats.get('critical_findings', 0)})"
        )

    pending = client.list_pending_patches(limit=5)
    print(f"\n=== {pending['total']} pending patch(es) (showing first {len(pending['patches'])}) ===")
    for p in pending["patches"]:
        print(f"- [{p['severity']}] {p['title']}  (patch_id={p['patch_id']}, cb={p['codebase_name']})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

### Equivalent one-liner (curl + jq)

```bash
# Log in and stash the token, then list clients in one shot.
TOKEN=$(curl -sX POST https://www.guardianx.in/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$GUARDIANX_EMAIL\",\"password\":\"$GUARDIANX_PASSWORD\"}" \
  | jq -r .token)

curl -s https://www.guardianx.in/api/clients \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.[] | {name, status, patches: .stats.patches, pending: .stats.pending_patches}'
```

---

## Reference

- **OpenAPI spec (JSON):** [`/api/openapi.json`](https://www.guardianx.in/api/openapi.json)
- **Interactive Swagger UI:** [`/api-doc`](https://www.guardianx.in/api-doc)
- **Source for the spec:** `src/app/api/openapi.json/route.ts`
- **Source for the UI page:** `src/app/api-doc/page.tsx`
- **Auth library:** `src/lib/auth.ts`
- **Rate-limit config:** `src/lib/rate-limit.ts` and `src/middleware.ts`
- **Webhook dispatcher:** `src/lib/webhook-dispatcher.ts`

Questions? Email **hello@guardianx.in**.

# GuardianX Monitoring & Observability Guide

This document explains how the GuardianX observability stack is wired up, and how to provision the third-party pieces (Sentry, UptimeRobot, alert routing, log aggregation) that complete the picture.

---

## 1. Architecture overview

GuardianX ships with three built-in observability primitives:

| Primitive              | File                                | Purpose                                                          |
| ---------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| Structured logger      | `src/lib/logger.ts`                 | One JSON object per log line to stdout (prod) or pretty console (dev). |
| Sentry helper          | `src/lib/sentry.ts`                 | `captureError(err, ctx?)` for programmatic error capture.        |
| API error wrapper      | `src/lib/api-handler.ts`            | `withErrorHandler(handler)` HOC that catches throws, logs, captures, and stamps an `X-Request-ID` on every response. |
| Sentry config (3 files)| `sentry.{client,server,edge}.config.ts` | Initialises Sentry in each Next.js runtime, only when `SENTRY_DSN` is set. |
| Health endpoint        | `src/app/api/health/route.ts`       | Returns `{ status, version, uptime, memory, db }`. 503 if DB is unreachable. |

All five are **opt-in** by default. They each gracefully no-op when their required env vars are missing, so dev / preview deployments work without any extra setup.

### Request correlation

Every wrapped API route gets a per-request UUID (`X-Request-ID`). The wrapper:

1. Honors an incoming `X-Request-ID` header (if it matches `^[A-Za-z0-9_-]{1,128}$`).
2. Otherwise mints a fresh `crypto.randomUUID()`.
3. Stamps the value on the outgoing response.
4. Attaches a child logger to `req.log` so every `req.log.info(...)` / `req.log.error(...)` call inside the handler is auto-correlated.

When something breaks, the user-visible 500 response includes `requestId`. Operators can grep logs and Sentry for that single id to find every log line + the captured exception for that exact request.

---

## 2. Setting up Sentry (free tier: 5,000 errors / month)

### 2.1 Create the Sentry project

1. Sign up at <https://sentry.io/signup/> (free Developer plan, 5K events / month, 1 user).
2. From the dashboard, **Create Project** → Platform: **Next.js** → Name it `guardianx`.
3. Sentry will display a DSN that looks like `https://<key>@o<org>.ingest.sentry.io/<project>`. Copy it.

### 2.2 Configure GuardianX

Add the following env vars (in your hosting platform's dashboard, NOT in the public `.env.example` if you don't want the DSN exposed):

```bash
# Server-side DSN — used by sentry.server.config.ts + sentry.edge.config.ts.
# This is the ONLY var strictly required to enable Sentry.
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>

# Client-side DSN — must be NEXT_PUBLIC_* so the browser bundle can read it.
# Set this to the SAME value as SENTRY_DSN if you want client-side capture.
NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>

# Optional: enable performance tracing (consumes a separate 10K-transaction quota).
SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1

# Optional: enable Session Replay (DOM snapshots on error).
NEXT_PUBLIC_SENTRY_REPLAY=1

# Optional: source-map upload on build (requires a Sentry auth token from
# https://sentry.io/settings/account/api/ — needs org:read + project:releases).
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=guardianx
SENTRY_AUTH_TOKEN=sntrys_eyJpYX...
```

On Vercel: set them in **Project Settings → Environment Variables** for the `Production` environment. The next deploy will rebuild with Sentry enabled.

### 2.3 Verify

1. Trigger a test error from a server route, e.g. add `throw new Error("sentry smoke test")` to any wrapped route (or call `captureError(new Error("sentry smoke test"))` from any code path).
2. Within a few seconds, the error should appear in Sentry's **Issues** view.
3. Click into the issue → **Stack Trace** tab. With source-map upload enabled, you'll see the original TypeScript source, not the minified bundle.

### 2.4 Sentry in dev

Sentry is **disabled** in `NODE_ENV !== "production"` (see `enabled: process.env.NODE_ENV === "production"` in all three config files). To force-enable for local testing, temporarily set `NODE_ENV=production` in `.env.local` and run `bun run build && bun run start` — but never commit that change.

---

## 3. Setting up UptimeRobot (free, pings every 5 min)

UptimeRobot's free tier monitors 50 endpoints at 5-minute intervals and emails you when they go down.

### 3.1 Create the monitor

1. Sign up at <https://uptimerobot.com/>.
2. **Add New Monitor** → Monitor Type: **HTTP(s)**.
3. Friendly Name: `GuardianX Health`.
4. URL: `https://YOUR_DOMAIN/api/health` (e.g. `https://app.guardianx.in/api/health`).
5. Monitoring Interval: **5 minutes**.
6. (Optional but recommended) **Advanced Settings**:
   - **Timeout**: 30 seconds (the health endpoint returns in <500ms normally; 30s leaves headroom for cold starts).
   - **HTTP Keyword Monitoring**: enable, keyword = `"ok"`. This makes UptimeRobot alert only when the response contains `"status":"ok"` — so a 503 with `status: "degraded"` correctly counts as a downtime even though HTTP returned a body.
   - **Alert Contacts**: leave defaults (email to your signup address). See §4 below for Slack.

### 3.2 Status pages

UptimeRobot's free tier includes a public status page. From the dashboard:

1. **Status Pages** → **Add New Status Page**.
2. Add the monitor from §3.1.
3. Publish the page (e.g. `https://stats.uptimerobot.com/XYZabc`) and link to it from your marketing site footer.

### 3.3 What "down" actually means

The health endpoint returns:

- **200** + `{ status: "ok", ... }` — process is up, DB is reachable. UptimeRobot counts this as up.
- **503** + `{ status: "degraded", db: { reachable: false, ... } }` — process is up, DB is unreachable. With keyword monitoring set to `"ok"`, this counts as down (you'll get an alert).
- **No response** — the container/lambda is dead or unreachable. Counts as down.

The 503 distinction matters: it lets you tell at a glance whether to restart the app (no response) or check Supabase (degraded).

---

## 4. Reading Sentry error reports

When Sentry captures an error (via `withErrorHandler`'s try/catch or a direct `captureError(err, ctx)` call), each event includes:

### 4.1 The Issue page

- **Title**: the error class + message (e.g. `Error: connect ECONNREFUSED 127.0.0.1:5432`).
- **First seen / Last seen**: when this issue started firing and when it last fired.
- **Events**: total count + a sparkline showing frequency over time. A spike = a regression.
- **Users affected**: how many distinct user ids saw this error.
- **Level**: `error` (default) or `fatal`.
- **Status**: Unresolved / Resolved / Ignored. Resolve from the dropdown once you ship a fix; Sentry auto-resolves if no new events arrive for 30 days.

### 4.2 The Event detail page

Click an individual event to see:

- **Stack Trace**: the original TypeScript source (if source-map upload is enabled). Click any frame to expand the surrounding lines.
- **Breadcrumbs**: everything that happened in the same request BEFORE the error. With `withErrorHandler`, every log line `logger.info/warn/error` from the GuardianX logger is also emitted as a Sentry breadcrumb via the structured logger hook (see `src/lib/sentry.ts`).
- **Request**: URL, method, headers (all values redacted — see `beforeSend` in `sentry.server.config.ts`). Cookies, query string, and body are stripped.
- **User**: `id` = the JWT's `userId`; `username` = the `requestId`. Use the request id to cross-reference logs.
- **Tags**: indexed, searchable. GuardianX tags include:
  - `route` — the API pathname (e.g. `/api/auth/login`).
  - `feature` — logical area (set explicitly when calling `captureError`).
  - `subsystem` — set by the health-check probe.
- **Extra**: non-indexed additional context. Includes `requestId`, `userId`, `method`, `url`.

### 4.3 Search

Sentry's search bar supports:
- `is:unresolved` — only open issues.
- `level:error` — only errors (excludes warnings / info).
- `release:1.0.0` — issues introduced in a specific release.
- `environment:production` — GuardianX explicitly sets the environment.
- `user.id:abc-123` — everything a specific user saw.
- `tag:route:/api/auth/login` — every error from one route.

### 4.4 Releases

If you set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`, the Next.js build will auto-detect the version from `package.json` and upload source maps tagged with that release. Sentry then shows:
- Which release **introduced** each issue (yellow "First seen in release X").
- Which release **resolved** each issue (green "Resolved in release Y").
- Suspect commits — Sentry links issues to the Git commit that likely caused them.

To cut a release: bump `version` in `package.json`, commit, deploy. The next build will create the Sentry release automatically.

---

## 5. Alert routing

### 5.1 Email

Sentry and UptimeRobot both email your signup address by default. For team distribution, add additional emails in:
- Sentry: **Settings → Notification Settings → Email**.
- UptimeRobot: **Settings → Alert Contacts → Add Alert Contact**.

### 5.2 Slack

#### Sentry → Slack

1. Sentry dashboard → **Settings → Integrations → Slack → Enable**.
2. Choose your Slack workspace + channel.
3. Configure rule: **Notify when** = `A new issue is created` (don't notify on every event — you'll burn out).
4. Optionally add a second rule: `An issue is seen more than X times in 1 hour` for regression alerts.

#### UptimeRobot → Slack

UptimeRobot's free tier doesn't have native Slack, but supports a generic **Webhook** alert contact:

1. Create a Slack Incoming Webhook: <https://api.slack.com/messaging/webhooks> → choose channel → copy URL.
2. UptimeRobot → **Settings → Alert Contacts → Add Alert Contact → Webhook**.
3. URL: the Slack webhook URL.
4. Custom HTTP headers (optional): leave default.
5. POST value (Slack requires a specific JSON shape):

```json
{
  "text": "*UptimeRobot alert*\nMonitor: *%monitorname%*\nURL: %monitorurl%\nStatus: %alerttype%"
}
```

### 5.3 PagerDuty (for paging on-call engineers)

Out of scope for the free Sentry tier — but the same `captureError` calls power any future PagerDuty integration. Configure it at **Settings → Integrations → PagerDuty** once you upgrade.

### 5.4 Alert fatigue: tuning the rules

GuardianX's `withErrorHandler` captures every uncaught throw. On a noisy route, this can mean hundreds of events for the same root cause. Sentry deduplicates by stack trace, but you can further reduce noise:

- **Resolve + Ignore** transient issues (network blips, race-condition reads) from the issue page once you've confirmed they're not real bugs.
- **Set a release health threshold** (Sentry → **Settings → Projects → GuardianX → Alerts**) — only page when the error rate exceeds, say, 1% of total requests in 5 minutes.
- **Use `captureError`'s `fingerprint` field** (see `src/lib/sentry.ts`) to group similar errors manually when the stack trace differs but the root cause is the same.

---

## 6. Log aggregation

The GuardianX logger writes to stdout in production (one JSON object per line). Anything that ingests stdout works — pick whichever fits your hosting platform.

### 6.1 Vercel logs (zero-config, included free)

If you deploy to Vercel:

1. **Project → Observability → Logs** shows live tail + search.
2. Filter by `requestId` by typing `requestId:"<uuid>"` in the search bar.
3. Free tier retains logs for 1 hour; Pro for 7 days; Enterprise for 30 days. Set up a sink (below) if you need longer retention.

### 6.2 Logtail / BetterStack (recommended for self-hosted)

[Logtail](https://betterstack.com/logtail) (now BetterStack) ingests via HTTP, has a generous free tier (1 GB / month), and gives you a Grafana-like query UI.

1. Sign up → **Create source** → Platform: **Node.js** → copy the source token.
2. Set `LOGTAIL_SOURCE_TOKEN` in your env.
3. We don't ship a Logtail transport inside the logger (to keep it dependency-free), but you can add a thin shim:

```ts
// src/lib/logger-logtail.ts (optional — not included by default)
import { Logtail } from "@logtail/node";
const logtail = process.env.LOGTAIL_SOURCE_TOKEN
  ? new Logtail(process.env.LOGTAIL_SOURCE_TOKEN)
  : null;

// Inside src/lib/logger.ts emit():
if (logtail) void logtail.log(line);
```

Then `bun add @logtail/node`.

### 6.3 Datadog (enterprise)

Datadog has a [Next.js integration](https://docs.datadoghq.com/integrations/nextjs/) that auto-collects:
- Server logs (via the Datadog Agent or log-forwarding from Vercel).
- RUM (Real User Monitoring) on the client.
- APM traces (overlaps with Sentry Performance — pick one, don't run both).

To enable: set `DD_API_KEY` + `DD_SITE` in your env, install the Datadog Next.js integration per their docs, and rebuild. The GuardianX logger's JSON output is already in Datadog's expected format (one JSON object per line, with `level` and `message` fields).

### 6.4 ELK / Loki / Fluent Bit (self-hosted)

If you self-host on a VM / k8s, point your existing log collector at the container's stdout. The GuardianX logger emits:

```json
{"timestamp":"2024-01-15T12:34:56.789Z","level":"info","message":"client created","requestId":"abc-123","userId":"def-456","meta":{"clientId":"ghi-789"}}
```

This is directly ingestable by:
- **Fluent Bit** — add a `tail` input reading `/var/log/containers/guardianx*.log`, parse as JSON, ship to Elasticsearch / Loki / S3.
- **Promtail** (for Grafana Loki) — `pipeline_stages: [json: {expressions: {level: level, requestId: requestId}}]` then `labels: {level:, requestId:}`.

---

## 7. Operating runbook

### 7.1 "User reports 500 error"

1. Get the `requestId` from the user (it's in the response body under `requestId`, and in the `X-Request-ID` response header).
2. Grep Vercel logs / your log aggregator for `requestId:<value>`.
3. The matching `level:error` line shows the error message + stack. If Sentry is enabled, the same `requestId` is also attached as the Sentry `user.username` field — search Sentry for it.
4. If no log lines match, the request never reached the app — check the CDN / reverse proxy (Caddy / Vercel) for a 5xx before the request hit the runtime.

### 7.2 "UptimeRobot says the site is down"

1. Open the monitor URL in a browser — do you get a response body?
2. If you see `{"status":"degraded","db":{"reachable":false,"error":"..."}}` → DB issue. Check Supabase status page (<https://status.supabase.com>), then the Supabase dashboard for your project.
3. If you see a 502 / 504 / no response → the app itself is down. Check the hosting platform's dashboard (Vercel / Railway / your VM).
4. If you see `{"status":"ok"}` but UptimeRobot still says down → either UptimeRobot is having its own outage (check <https://status.uptimerobot.com>) or your keyword monitor is misconfigured.

### 7.3 "Sentry is flooded with errors"

1. Sort issues by **Events** descending. The top one is usually the root cause — fix it first, others will often resolve themselves.
2. If the top issue is genuinely a transient/network error (Supabase timeout, Redis disconnect), use the **Ignore** action with a regex match to suppress future occurrences.
3. Check the **Release** tab — did a recent deploy cause the spike? Roll back if so.

### 7.4 "Sentry quota exhausted"

The free tier is 5,000 events / month. When you hit it:
- Sentry stops accepting new events until the next month.
- The GuardianX logger keeps writing to stdout, so you don't lose visibility.
- Either upgrade Sentry, or temporarily set `SENTRY_DSN=` to empty to disable the integration cleanly (the `captureError` helper short-circuits when `SENTRY_ENABLED` is false).

---

## 8. File reference

| File                              | What it does                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `src/lib/logger.ts`               | Structured logger: `info`/`warn`/`error`/`debug`, `child()`, `newRequestId()`, `getOrNewRequestId()`. |
| `src/lib/sentry.ts`               | `captureError(err, ctx?)`, `setSentryUser(user)`, `isSentryEnabled()`.         |
| `src/lib/api-handler.ts`          | `withErrorHandler(handler)` HOC.                                              |
| `sentry.client.config.ts`         | Browser runtime init. Reads `NEXT_PUBLIC_SENTRY_DSN`.                          |
| `sentry.server.config.ts`         | Node.js runtime init. Reads `SENTRY_DSN`.                                      |
| `sentry.edge.config.ts`           | Edge runtime init. Reads `SENTRY_DSN`.                                         |
| `next.config.ts`                  | Wraps `nextConfig` with `withSentryConfig` (no-op when `SENTRY_DSN` is unset). |
| `src/app/api/health/route.ts`     | Deep health: process + DB + memory. 503 on DB failure.                         |
| `.env.example`                    | Documents `SENTRY_DSN` and friends.                                            |

### Routes wrapped with `withErrorHandler`

Critical routes wrapped as examples (the wrapper is opt-in; the other ~150 routes keep their existing try/catch patterns):

- `POST /api/auth/login` — `src/app/api/auth/login/route.ts`
- `POST /api/auth/signup` — `src/app/api/auth/signup/route.ts`
- `GET /api/clients` — `src/app/api/clients/route.ts`
- `POST /api/clients` — `src/app/api/clients/route.ts` (bonus — same file)
- `POST /api/settings` — `src/app/api/settings/route.ts`

To wrap additional routes, replace `export async function POST(req) { ... }` with `export const POST = withErrorHandler(async (req) => { ... });` and add `import { withErrorHandler } from "@/lib/api-handler";`. The wrapper preserves the existing try/catch inside the handler — it adds an outer safety net for any throw that escapes the handler's own catch (e.g. a throw before `try` opens, or a thrown `await` after the catch returns).

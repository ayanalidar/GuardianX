import { NextResponse } from "next/server";
import { requireAdmin, enforceSessionRevocation } from "@/lib/auth";
import { supabase } from "@/lib/db";
import { randomUUID } from "@/lib/crypto";
import { auditLog } from "@/lib/audit";
import { sanitizeText, sanitizeEmail } from "@/lib/sanitize";
import { withErrorHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

// ── Settings are stored in the Integration table with type = "platform_settings" ──
// Each setting group is a single row with config = JSON string.

const SETTINGS_TYPE = "platform_settings";
const SETTING_KEYS = [
  "email_smtp",      // SMTP server config for sending emails
  "whatsapp",        // WhatsApp Business Cloud API config
  "telegram",        // Telegram Bot config
  "sms",             // SMS provider config (Twilio/MSG91)
  "general",         // General platform settings (org name, logo URL, etc.)
  "notifications",   // Notification routing rules (which events go to which channels)
];

// Known email-shaped fields inside a settings config object. These get full
// email validation/canonicalization (lowercase, format check) instead of the
// generic text sanitizer.
const CONFIG_EMAIL_FIELDS = new Set([
  "fromEmail",
  "orgEmail",
  "testTarget",
]);

// Known URL-shaped fields. These get a longer length cap (2048) but still
// go through the generic text sanitizer (strip control chars + null bytes).
const CONFIG_URL_FIELDS = new Set([
  "orgWebsite",
  "logoUrl",
  "platformUrl",
]);

/**
 * Recursively sanitize a settings config object.
 *
 * - String values in known email fields are passed through `sanitizeEmail`.
 * - String values in known URL fields are passed through `sanitizeText` with
 *   a 2048-char limit.
 * - All other string values are passed through `sanitizeText` with a 4096-char
 *   limit (generous enough for SMTP passwords, API tokens, bot tokens, etc.).
 * - Numbers, booleans, and null pass through unchanged.
 * - Arrays and nested objects are walked recursively.
 *
 * This is defense-in-depth: even if a stored XSS payload somehow survives
 * into a rendered email template, the `esc()` helper in the template will
 * neutralize it. Sanitizing at storage time prevents the payload from
 * reaching the template in the first place and keeps the DB clean.
 */
function sanitizeConfig(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (key && CONFIG_EMAIL_FIELDS.has(key)) {
      // sanitizeEmail returns "" for invalid; we preserve the empty string
      // so the admin sees the field as cleared (rather than silently
      // storing the original invalid value).
      return sanitizeEmail(value);
    }
    if (key && CONFIG_URL_FIELDS.has(key)) {
      return sanitizeText(value, 2048);
    }
    // Default cap for secrets, tokens, hosts, names, etc.
    return sanitizeText(value, 4096);
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeConfig(v));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = sanitizeConfig(v, k);
    }
    return result;
  }
  // number, boolean, null, undefined — pass through.
  return value;
}

// GET /api/settings — returns all platform settings (admin only)
// Optional: ?key=email_smtp to get a specific setting
export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  // Session-revocation check: settings contain SMTP credentials, so a
  // revoked admin must not be able to read them.
  const revoked = await enforceSessionRevocation(req);
  if (revoked) return revoked;

  const url = new URL(req.url);
  const filterKey = url.searchParams.get("key");

  try {
    const { data, error } = await supabase
      .from("Integration")
      .select("id, type, config, isActive, createdAt")
      .eq("type", SETTINGS_TYPE)
      .order("createdAt", { ascending: true });

    if (error) throw new Error(error.message);

    const settings: Record<string, { id: string; config: Record<string, unknown>; isActive: boolean; createdAt: string }> = {};

    for (const row of data || []) {
      // The "isActive" column was repurposed — we store the setting key in a
      // JSON field inside config called _key. This way one row = one setting group.
      let config: Record<string, unknown> = {};
      const rawConfig = (row as Record<string, unknown>).config;
      if (typeof rawConfig === "string") {
        try {
          const parsed = JSON.parse(rawConfig);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            config = parsed as Record<string, unknown>;
          }
        } catch {
          /* leave config = {} */
        }
      } else if (rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)) {
        // Some Supabase configurations return JSONB as a parsed object
        config = rawConfig as Record<string, unknown>;
      }

      const key = (config._key as string) || "unknown";
      if (filterKey && key !== filterKey) continue;

      const { _key: _omit, ...configWithoutKey } = config;
      void _omit;

      settings[key] = {
        id: (row as Record<string, unknown>).id as string,
        config: configWithoutKey,
        isActive: (row as Record<string, unknown>).isActive as boolean,
        createdAt: ((row as Record<string, unknown>).createdAt as string) || new Date().toISOString(),
      };
    }

    // Fill in defaults for missing keys
    const defaults: Record<string, Record<string, unknown>> = {
      email_smtp: { host: "", port: "587", user: "", password: "", fromEmail: "", fromName: "GuardianX", enabled: false },
      whatsapp: { phoneNumberId: "", accessToken: "", recipientPhone: "", enabled: false },
      telegram: { botToken: "", chatId: "", enabled: false },
      sms: { provider: "twilio", toNumber: "", accountSid: "", authToken: "", fromNumber: "", apiKey: "", sender: "", enabled: false },
      general: { orgName: "GuardianX", orgEmail: "hello@guardianx.in", orgPhone: "+91 70067 12347", orgWebsite: "https://www.guardianx.in", logoUrl: "/guardianx-logo.png" },
      notifications: {
        critical_findings: { email: true, whatsapp: false, telegram: false, sms: false },
        scan_completed: { email: true, whatsapp: false, telegram: true, sms: false },
        incident_created: { email: true, whatsapp: true, telegram: true, sms: true },
        canary_triggered: { email: true, whatsapp: true, telegram: true, sms: true },
        patch_ready: { email: true, whatsapp: false, telegram: false, sms: false },
        daily_digest: { email: true, whatsapp: false, telegram: false, sms: false },
      },
    };

    for (const key of SETTING_KEYS) {
      if (!settings[key]) {
        settings[key] = { id: "", config: defaults[key] || {}, isActive: false, createdAt: "" };
      }
    }

    return NextResponse.json({ settings, keys: SETTING_KEYS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

// POST /api/settings — save a setting group (admin only)
// Body: { key: "email_smtp", config: { host: "...", port: "587", ... }, isActive: true }
export const POST = withErrorHandler(async (req: Request) => {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const revoked = await enforceSessionRevocation(req);
  if (revoked) return revoked;

  const body = await req.json().catch(() => ({}));
  const { key, config, isActive } = body;

  if (!key || !SETTING_KEYS.includes(key)) {
    return NextResponse.json(
      { error: `key must be one of: ${SETTING_KEYS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // Fetch all platform_settings rows and find by _key inside the JSON config.
    // (Supabase's .contains() JSONB filter is unreliable on text columns, so we
    // do the lookup client-side after fetching all rows.)
    const { data: allSettings } = await supabase
      .from("Integration")
      .select("id, config")
      .eq("type", SETTINGS_TYPE);

    let existingId: string | null = null;
    for (const row of allSettings || []) {
      const raw = (row as Record<string, unknown>).config;
      let c: Record<string, unknown> = {};
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            c = parsed as Record<string, unknown>;
          }
        } catch {
          /* skip */
        }
      } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        c = raw as Record<string, unknown>;
      }
      if (c._key === key) {
        existingId = (row as Record<string, unknown>).id as string;
        break;
      }
    }

    // Sanitize the config object before persisting. This strips control
    // chars, null bytes, and applies email/URL canonicalization to known
    // fields. Operates on a deep clone so the original `body.config`
    // reference is not mutated. Cast to Record<string, unknown> because
    // sanitizeConfig returns `unknown` (it walks arbitrary nested shapes).
    const cleanConfig = sanitizeConfig(config) as Record<string, unknown>;

    const configWithKey = JSON.stringify({ ...cleanConfig, _key: key });

    if (existingId) {
      // Update existing
      const { error } = await supabase
        .from("Integration")
        .update({
          config: configWithKey,
          isActive: isActive !== false,
        })
        .eq("id", existingId);

      if (error) throw new Error(error.message);
    } else {
      // Create new
      const { error } = await supabase
        .from("Integration")
        .insert({
          id: randomUUID(),
          type: SETTINGS_TYPE,
          config: configWithKey,
          isActive: isActive !== false,
        });

      if (error) throw new Error(error.message);
    }

    // Invalidate the SMTP config cache so the next email send picks up the
    // new credentials immediately (instead of waiting up to 60s for the
    // TTL to expire).
    if (key === "email_smtp") {
      try {
        const { invalidateSmtpConfigCache } = await import("@/lib/email");
        invalidateSmtpConfigCache();
      } catch { /* non-fatal */ }
    }

    // Audit AFTER the save succeeds. Only log { key, isActive } — never the
    // config body, which can contain SMTP passwords / API tokens.
    await auditLog("settings.updated", "settings", auth.user.email, {
      key,
      isActive: isActive !== false,
    });

    return NextResponse.json({
      ok: true,
      key,
      message: `${key} settings saved successfully`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
});

// POST /api/settings?action=test — test a notification channel
// Body: { channel: "email" | "whatsapp" | "telegram" | "sms", config: {...}, testTarget: "email@example.com" }
export async function PATCH(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const revoked = await enforceSessionRevocation(req);
  if (revoked) return revoked;

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === "test") {
    const { channel, config, testTarget } = body;

    try {
      let result: { success: boolean; message: string; detail?: string };

      switch (channel) {
        case "email": {
          // Use the new one-off transporter helpers so the test ALWAYS uses
          // the form values the user just typed. No process.env mutation,
          // no cached transporter poisoning.
          const { buildSmtpConfigFromForm, testSmtpConnection, sendEmailWithConfig } =
            await import("@/lib/email");
          const cfg = buildSmtpConfigFromForm({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            fromEmail: config.fromEmail,
            fromName: config.fromName,
          });
          if (!cfg) {
            result = {
              success: false,
              message: "Missing required SMTP fields. Please fill in Host, Username, and Password.",
            };
            break;
          }

          const recipient = (testTarget || config.fromEmail || "").trim();
          if (!recipient) {
            result = {
              success: false,
              message: "No recipient address. Enter a test target email.",
            };
            break;
          }

          // Step 1: verify the SMTP connection (cheap, fast-fails auth/port issues)
          const verifyResult = await testSmtpConnection(cfg);
          if (!verifyResult.ok) {
            result = {
              success: false,
              message: `Connection check failed — ${verifyResult.message}`,
              detail: verifyResult.detail,
            };
            break;
          }

          // Step 2: actually send a test email
          const sendResult = await sendEmailWithConfig(
            cfg,
            recipient,
            "GuardianX Test Email",
            `<div style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; color: #18181b; max-width: 560px; margin: 0 auto; padding: 24px;">
              <h2 style="margin: 0 0 12px; color: #18181b; font-size: 20px;">GuardianX Email Test</h2>
              <p style="margin: 0 0 12px;">If you received this email, your SMTP configuration is working correctly.</p>
              <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-top: 8px;">
                <tr><td style="padding: 4px 0; color: #71717a; width: 120px;">SMTP Host</td><td style="padding: 4px 0;">${cfg.host}</td></tr>
                <tr><td style="padding: 4px 0; color: #71717a;">Port</td><td style="padding: 4px 0;">${cfg.port} (${cfg.secure ? "SSL/TLS" : "STARTTLS"})</td></tr>
                <tr><td style="padding: 4px 0; color: #71717a;">From</td><td style="padding: 4px 0;">${cfg.from}</td></tr>
                <tr><td style="padding: 4px 0; color: #71717a;">Sent at</td><td style="padding: 4px 0;">${new Date().toISOString()}</td></tr>
              </table>
              <hr style="margin: 20px 0; border: 0; border-top: 1px solid #e4e4e7;" />
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">This is an automated test message from GuardianX. Do not reply.</p>
            </div>`,
            "smtpTest"
          );
          if (sendResult.ok) {
            result = {
              success: true,
              message: `Test email delivered to ${recipient}. Message ID: ${sendResult.messageId || "n/a"}`,
            };
          } else {
            result = {
              success: false,
              message: sendResult.error || "Email send failed (check SMTP config)",
            };
          }
          break;
        }

        case "whatsapp": {
          if (!config.accessToken || !config.phoneNumberId) {
            result = { success: false, message: "Missing accessToken or phoneNumberId" };
            break;
          }
          const res = await fetch(
            `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: testTarget || config.recipientPhone || "",
                type: "text",
                text: { body: "GuardianX Test: WhatsApp integration working!" },
              }),
              signal: AbortSignal.timeout(10_000),
            }
          );
          result = {
            success: res.ok,
            message: res.ok ? "WhatsApp message sent" : `WhatsApp API returned ${res.status}`,
          };
          break;
        }

        case "telegram": {
          if (!config.botToken) {
            result = { success: false, message: "Missing botToken" };
            break;
          }
          const res = await fetch(
            `https://api.telegram.org/bot${config.botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: testTarget || config.chatId,
                text: "GuardianX Test: Telegram integration working!",
              }),
              signal: AbortSignal.timeout(10_000),
            }
          );
          result = {
            success: res.ok,
            message: res.ok ? "Telegram message sent" : `Telegram API returned ${res.status}`,
          };
          break;
        }

        case "sms": {
          if (config.provider === "twilio") {
            if (!config.accountSid || !config.authToken) {
              result = { success: false, message: "Missing Twilio accountSid or authToken" };
              break;
            }
            const auth_str = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
            const res = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
              {
                method: "POST",
                headers: {
                  Authorization: `Basic ${auth_str}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  From: config.fromNumber || "",
                  To: testTarget || config.toNumber || "",
                  Body: "GuardianX Test: SMS integration working!",
                }),
                signal: AbortSignal.timeout(10_000),
              }
            );
            result = {
              success: res.ok,
              message: res.ok ? "SMS sent via Twilio" : `Twilio returned ${res.status}`,
            };
          } else {
            result = { success: false, message: "SMS provider not supported in test mode" };
          }
          break;
        }

        default:
          result = { success: false, message: `Unknown channel: ${channel}` };
      }

      // Audit SMTP tests — captures host/port (non-secret) + success/failure
      // so admins can see who probed which SMTP server and when. Only logged
      // for the email channel; other channel tests are out of scope here.
      if (channel === "email") {
        const cfgObj = (config || {}) as Record<string, unknown>;
        await auditLog("settings.smtp_tested", "settings", auth.user.email, {
          host: typeof cfgObj.host === "string" ? cfgObj.host : "",
          port: cfgObj.port != null ? String(cfgObj.port) : "",
          success: result.success === true,
        });
      }

      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json(
        { success: false, message: err instanceof Error ? err.message : "Test failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

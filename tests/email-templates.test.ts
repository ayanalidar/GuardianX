// Email template XSS tests.
//
// Every lifecycle email template (welcomeAdmin, welcomePending,
// accountApproved, accountRejected, passwordReset, emailVerification)
// must HTML-escape user-supplied fields (name, email, reset link,
// verification link) so a malicious user can't inject script tags,
// on* handlers, or javascript: URLs into the rendered HTML.
//
// These tests import the REAL template functions from
// `src/lib/email-templates/welcome.ts` — no mocks. Each test feeds a
// hostile payload into a user-controlled field and asserts the rendered
// HTML contains the escaped form, NOT the raw payload.

import { describe, test, expect } from "vitest";
import {
  welcomeAdminHtml,
  welcomePendingHtml,
  accountApprovedHtml,
  accountRejectedHtml,
  passwordResetHtml,
  emailVerificationHtml,
} from "@/lib/email-templates/welcome";

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * The OWASP-recommended HTML-escape set used by the templates' internal
 * `esc()` helper. `<script>` becomes `&lt;script&gt;` etc.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const XSS_NAME = `<script>alert(1)</script>`;
const XSS_EMAIL = `"><script>alert(document.cookie)</script>`;
const XSS_LINK_WITH_MARKUP = `https://evil.example/?x=<script>alert(1)</script>`;

// ── Tests ──────────────────────────────────────────────────────────────────

describe("email templates: XSS payloads in the NAME field are escaped", () => {
  test("welcomeAdminHtml escapes <script> in name", () => {
    const html = welcomeAdminHtml({ name: XSS_NAME, email: "ok@example.com" });
    // Raw payload must NOT appear verbatim anywhere in the HTML body.
    expect(html).not.toContain(XSS_NAME);
    // Escaped form MUST appear.
    expect(html).toContain(esc(XSS_NAME));
  });

  test("welcomePendingHtml escapes <script> in name", () => {
    const html = welcomePendingHtml({ name: XSS_NAME, email: "ok@example.com" });
    expect(html).not.toContain(XSS_NAME);
    expect(html).toContain(esc(XSS_NAME));
  });

  test("accountApprovedHtml escapes <script> in name", () => {
    const html = accountApprovedHtml({ name: XSS_NAME, email: "ok@example.com" });
    expect(html).not.toContain(XSS_NAME);
    expect(html).toContain(esc(XSS_NAME));
  });

  test("accountRejectedHtml escapes <script> in name", () => {
    const html = accountRejectedHtml({ name: XSS_NAME, email: "ok@example.com" });
    expect(html).not.toContain(XSS_NAME);
    expect(html).toContain(esc(XSS_NAME));
  });

  test("passwordResetHtml escapes <script> in name", () => {
    const html = passwordResetHtml({
      name: XSS_NAME,
      email: "ok@example.com",
      resetLink: "https://guardianx.in/reset?token=abc",
    });
    expect(html).not.toContain(XSS_NAME);
    expect(html).toContain(esc(XSS_NAME));
  });

  test("emailVerificationHtml escapes <script> in name", () => {
    const html = emailVerificationHtml({
      name: XSS_NAME,
      email: "ok@example.com",
      verificationLink: "https://guardianx.in/verify?token=abc",
    });
    expect(html).not.toContain(XSS_NAME);
    expect(html).toContain(esc(XSS_NAME));
  });
});

describe("email templates: XSS payloads in the EMAIL field are escaped", () => {
  test("welcomeAdminHtml escapes script-injection in email", () => {
    const html = welcomeAdminHtml({ name: "Alice", email: XSS_EMAIL });
    expect(html).not.toContain(XSS_EMAIL);
    expect(html).toContain(esc(XSS_EMAIL));
  });

  test("welcomePendingHtml escapes script-injection in name (email not rendered in body)", () => {
    // NOTE: welcomePendingHtml is the only template that doesn't echo the
    // user's email into the body (it only references the platform-wide
    // support address). So the XSS guarantee for THIS template is solely
    // about the name field.
    const html = welcomePendingHtml({ name: XSS_NAME, email: XSS_EMAIL });
    expect(html).not.toContain(XSS_NAME);
    expect(html).toContain(esc(XSS_NAME));
    // The hostile email payload must ALSO not appear (since the template
    // doesn't render it, there's no surface for it).
    expect(html).not.toContain(XSS_EMAIL);
  });

  test("accountApprovedHtml escapes script-injection in email", () => {
    const html = accountApprovedHtml({ name: "Carol", email: XSS_EMAIL });
    expect(html).not.toContain(XSS_EMAIL);
    expect(html).toContain(esc(XSS_EMAIL));
  });

  test("accountRejectedHtml escapes script-injection in email", () => {
    const html = accountRejectedHtml({ name: "Dave", email: XSS_EMAIL });
    expect(html).not.toContain(XSS_EMAIL);
    expect(html).toContain(esc(XSS_EMAIL));
  });

  test("passwordResetHtml escapes script-injection in email", () => {
    const html = passwordResetHtml({
      name: "Eve",
      email: XSS_EMAIL,
      resetLink: "https://guardianx.in/reset?token=abc",
    });
    expect(html).not.toContain(XSS_EMAIL);
    expect(html).toContain(esc(XSS_EMAIL));
  });

  test("emailVerificationHtml escapes script-injection in email", () => {
    const html = emailVerificationHtml({
      name: "Frank",
      email: XSS_EMAIL,
      verificationLink: "https://guardianx.in/verify?token=abc",
    });
    expect(html).not.toContain(XSS_EMAIL);
    expect(html).toContain(esc(XSS_EMAIL));
  });
});

describe("email templates: hostile URL payloads in resetLink / verificationLink are HTML-escaped", () => {
  // The templates' `esc()` helper HTML-escapes `<`, `>`, `"`, `'`, `&`
  // so a hostile link can't break out of the href attribute or inject
  // markup. It does NOT neutralize `javascript:` URLs — that's the
  // caller's responsibility (the signup + forgot-password routes build
  // the link server-side from `req.url.origin`, which is always https).
  // We assert the actual guarantee the template provides.

  test("passwordResetHtml escapes angle brackets + quotes in a hostile reset link", () => {
    const hostile = `https://evil.example/?x=\"<script>alert(1)</script>`;
    const html = passwordResetHtml({
      name: "Alice",
      email: "alice@example.com",
      resetLink: hostile,
    });
    // Raw hostile payload must NOT appear anywhere.
    expect(html).not.toContain(hostile);
    // The `<script>` substring must NOT appear verbatim.
    expect(html).not.toContain("<script>alert(1)</script>");
    // The escaped form MUST appear (in both the button href + the
    // plain-text fallback block).
    expect(html).toContain(esc(hostile));
  });

  test("emailVerificationHtml escapes angle brackets + quotes in a hostile verification link", () => {
    const hostile = `https://evil.example/?x=\"<script>alert(1)</script>`;
    const html = emailVerificationHtml({
      name: "Bob",
      email: "bob@example.com",
      verificationLink: hostile,
    });
    expect(html).not.toContain(hostile);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(esc(hostile));
  });

  test("passwordResetHtml escapes <script> embedded in a legit-looking reset link", () => {
    const html = passwordResetHtml({
      name: "Alice",
      email: "alice@example.com",
      resetLink: XSS_LINK_WITH_MARKUP,
    });
    // The raw <script> substring must NOT appear verbatim.
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(esc("<script>alert(1)</script>"));
  });

  test("emailVerificationHtml escapes <script> embedded in a legit-looking verification link", () => {
    const html = emailVerificationHtml({
      name: "Bob",
      email: "bob@example.com",
      verificationLink: XSS_LINK_WITH_MARKUP,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(esc("<script>alert(1)</script>"));
  });
});

describe("email templates: accountRejectedHtml escapes the reason field", () => {
  test("reason with <script> is escaped", () => {
    const reason = `<script>alert("xss")</script>`;
    const html = accountRejectedHtml({
      name: "Dave",
      email: "dave@example.com",
      reason,
    });
    expect(html).not.toContain(reason);
    expect(html).toContain(esc(reason));
  });

  test("reason with an on* event handler attribute is escaped", () => {
    const reason = `<img src=x onerror=alert(1)>`;
    const html = accountRejectedHtml({
      name: "Dave",
      email: "dave@example.com",
      reason,
    });
    expect(html).not.toContain(reason);
    expect(html).toContain(esc(reason));
  });
});

describe("email templates: an attacker can't break out of the href attribute", () => {
  test("resetLink with a double-quote can't close the href attribute", () => {
    // An attacker might try:  https://ok?" onmouseover="alert(1)
    // to inject an event handler on the <a> tag.
    const hostile = `https://guardianx.in/reset?token=abc" onmouseover="alert(1)`;
    const html = passwordResetHtml({
      name: "Alice",
      email: "alice@example.com",
      resetLink: hostile,
    });
    // The hostile substring must NOT appear verbatim (it would if `esc`
    // didn't escape `"` to `&quot;`).
    expect(html).not.toContain(hostile);
    // The escaped double-quote must appear in place of the literal `"`
    // inside the href value.
    expect(html).toContain("&quot;");
  });

  test("verificationLink with a single-quote can't break out of the href attribute", () => {
    const hostile = `https://guardianx.in/verify?token=abc' onmouseover='alert(1)`;
    const html = emailVerificationHtml({
      name: "Bob",
      email: "bob@example.com",
      verificationLink: hostile,
    });
    expect(html).not.toContain(hostile);
    // `esc` escapes `'` to `&#x27;`.
    expect(html).toContain("&#x27;");
  });
});

describe("email templates: structural sanity (legit inputs render without surprises)", () => {
  test("welcomeAdminHtml produces a non-empty HTML document", () => {
    const html = welcomeAdminHtml({ name: "Alice", email: "alice@example.com" });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<title>GuardianX</title>");
    expect(html).toContain("Welcome to");
  });

  test("passwordResetHtml includes the raw reset link in escaped form", () => {
    const link = "https://guardianx.in/reset?token=abc123";
    const html = passwordResetHtml({
      name: "Alice",
      email: "alice@example.com",
      resetLink: link,
    });
    // The link itself is HTML-safe (no chars to escape), so it appears verbatim.
    expect(html).toContain(link);
  });

  test("emailVerificationHtml includes the raw verification link in escaped form", () => {
    const link = "https://guardianx.in/verify?token=abc123";
    const html = emailVerificationHtml({
      name: "Bob",
      email: "bob@example.com",
      verificationLink: link,
    });
    expect(html).toContain(link);
  });
});

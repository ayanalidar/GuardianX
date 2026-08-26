// GuardianX onboarding / lifecycle email templates.
//
// These are the emails sent to USERS (people who create accounts on the
// GuardianX platform), as opposed to CLIENT contacts (who receive digests).
//
// Lifecycle:
//   1. signup           -> welcome email (admin auto-approved OR pending approval)
//   2. admin approves   -> "your account is approved, you can log in"
//   3. admin rejects    -> "your application was declined"
//
// All templates share the same branded header/footer so users recognise the
// sender at a glance.

interface BrandingInfo {
  orgName?: string;
  orgEmail?: string;
  orgPhone?: string;
  orgWebsite?: string;
  platformUrl?: string;
}

const DEFAULT_BRANDING: Required<BrandingInfo> = {
  orgName: "GuardianX",
  orgEmail: "hello@guardianx.in",
  orgPhone: "+91 70067 12347",
  orgWebsite: "https://www.guardianx.in",
  platformUrl: "https://www.guardianx.in",
};

// HTML-escapes a string for safe interpolation into HTML text content or
// double-quoted attribute values. Escapes the OWASP-recommended set of
// characters: & < > " '. Order matters — & must be escaped first to avoid
// double-encoding the entities we emit.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function shell(opts: {
  preheader: string;
  headerLabel: string;
  bodyHtml: string;
  branding: Required<BrandingInfo>;
}): string {
  const { preheader, headerLabel, bodyHtml, branding } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GuardianX</title></head>
<body style="margin: 0; padding: 0; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${esc(preheader)}</div>
    <div style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);">
      <div style="background: linear-gradient(135deg, #064e3b 0%, #047857 100%); padding: 20px 28px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: #10b981; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #fff; font-size: 16px;">G</div>
          <div>
            <div style="color: #ffffff; font-size: 17px; font-weight: 700;">${esc(branding.orgName)}</div>
            <div style="color: #a7f3d0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;">${headerLabel}</div>
          </div>
        </div>
      </div>
      <div style="padding: 28px;">
        ${bodyHtml}
      </div>
      <div style="padding: 16px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #475569;">
          Need help? Reply to this email or contact <a href="mailto:${esc(branding.orgEmail)}" style="color: #047857; text-decoration: none;">${esc(branding.orgEmail)}</a>${branding.orgPhone ? ` &middot; ${esc(branding.orgPhone)}` : ""}
        </p>
        <p style="margin: 0; font-size: 11px; color: #94a3b8;">
          &copy; ${new Date().getFullYear()} ${esc(branding.orgName)}. Sent from an automated mailbox, please do not reply directly.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

const FEATURE_LIST = `
  <ul style="margin: 0 0 20px; padding-left: 18px; font-size: 14px; line-height: 1.8; color: #1e293b;">
    <li><strong>RedAgent VAPT Engine</strong> &mdash; autonomous vulnerability assessment &amp; penetration testing</li>
    <li><strong>AI Remediation Copilot</strong> &mdash; generate &amp; review security patches with AI</li>
    <li><strong>SIEM Console</strong> &mdash; real-time security event monitoring &amp; log search</li>
    <li><strong>DFIR Command</strong> &mdash; incident response, evidence vault, playbooks</li>
    <li><strong>Compliance Dashboard</strong> &mdash; DPDPA, ISO 27001, SOC 2 tracking</li>
    <li><strong>Patch Attestation</strong> &mdash; cryptographic proof of every remediation</li>
    <li><strong>Dark Web Monitoring</strong> &mdash; alerts when your assets appear in breaches</li>
    <li><strong>Client Portal</strong> &mdash; share live posture reports with your clients</li>
  </ul>`;

/**
 * Welcome email for the FIRST user (auto-approved admin).
 */
export function welcomeAdminHtml(opts: {
  name: string;
  email: string;
  branding?: BrandingInfo;
}): string {
  const b = { ...DEFAULT_BRANDING, ...opts.branding };
  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; color: #0f172a; font-weight: 700;">Welcome to ${esc(b.orgName)}, ${esc(opts.name)}!</h1>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">Your admin account is ready. As the first user on this ${esc(b.orgName)} tenant, you have full administrative access.</p>

    <div style="margin: 0 0 20px; padding: 14px 16px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px;">
      <p style="margin: 0; font-size: 13px; color: #065f46;"><strong>Account confirmed</strong> &mdash; email ${esc(opts.email)}, role: Administrator. Before you can sign in, <strong>verify your email address</strong> by clicking the verification link we just sent you.</p>
    </div>

    <h2 style="margin: 24px 0 8px; font-size: 15px; color: #0f172a; font-weight: 600;">What you can do</h2>
    ${FEATURE_LIST}

    <div style="margin: 24px 0;">
      <a href="${esc(b.platformUrl)}" style="display: inline-block; padding: 12px 28px; background: #047857; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Enter the Console &rarr;</a>
    </div>

    <h2 style="margin: 24px 0 8px; font-size: 15px; color: #0f172a; font-weight: 600;">Recommended first steps</h2>
    <ol style="margin: 0 0 20px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #1e293b;">
      <li>Add your first client &amp; codebase under <strong>All Clients</strong></li>
      <li>Run a RedAgent VAPT scan to get a baseline posture score</li>
      <li>Review the <strong>Compliance</strong> tab and map your frameworks (DPDPA, ISO 27001, etc.)</li>
      <li>Invite team members under <strong>User Management</strong> (you approve all sign-ups)</li>
      <li>Configure alert routing under <strong>Platform Settings &rarr; Routing</strong></li>
    </ol>`;
  return shell({
    preheader: "Your GuardianX admin account is ready. Verify your email, then sign in.",
    headerLabel: "Welcome &mdash; Admin Access",
    bodyHtml: body,
    branding: b,
  });
}

/**
 * Welcome email for non-first users (pending admin approval).
 */
export function welcomePendingHtml(opts: {
  name: string;
  email: string;
  branding?: BrandingInfo;
}): string {
  const b = { ...DEFAULT_BRANDING, ...opts.branding };
  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; color: #0f172a; font-weight: 700;">Welcome to ${esc(b.orgName)}, ${esc(opts.name)}!</h1>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">Thanks for creating an account. Your request has been received and is now <strong>pending administrator approval</strong>.</p>

    <div style="margin: 0 0 20px; padding: 14px 16px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px;">
      <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Two steps to activate your account:</strong> First, <strong>verify your email address</strong> by clicking the verification link we just sent you. Then, wait for an administrator to approve your access. You will receive a second email the moment your access is approved. Until both steps are complete, you cannot sign in.</p>
    </div>

    <h2 style="margin: 24px 0 8px; font-size: 15px; color: #0f172a; font-weight: 600;">What you will get once approved</h2>
    ${FEATURE_LIST}

    <p style="margin: 20px 0 0; font-size: 13px; line-height: 1.6; color: #475569;">
      In a hurry? Reply to this email or reach out to <a href="mailto:${esc(b.orgEmail)}" style="color: #047857; text-decoration: none;">${esc(b.orgEmail)}</a> and we will expedite your approval.
    </p>`;
  return shell({
    preheader: "Verify your email, then wait for admin approval. We will email you once approved.",
    headerLabel: "Welcome &mdash; Pending Approval",
    bodyHtml: body,
    branding: b,
  });
}

/**
 * Approval notification email — sent when an admin approves a pending user.
 */
export function accountApprovedHtml(opts: {
  name: string;
  email: string;
  branding?: BrandingInfo;
}): string {
  const b = { ...DEFAULT_BRANDING, ...opts.branding };
  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; color: #0f172a; font-weight: 700;">Your account is approved, ${esc(opts.name)}!</h1>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">Good news &mdash; an administrator has approved your ${esc(b.orgName)} account. You can now sign in and start using the platform.</p>

    <div style="margin: 0 0 20px; padding: 14px 16px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px;">
      <p style="margin: 0; font-size: 13px; color: #065f46;"><strong>Access granted</strong> &mdash; email ${esc(opts.email)}. Your role is Viewer by default; an admin can elevate it as needed.</p>
    </div>

    <div style="margin: 24px 0;">
      <a href="${esc(b.platformUrl)}" style="display: inline-block; padding: 12px 28px; background: #047857; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Sign in to ${esc(b.orgName)} &rarr;</a>
    </div>

    <h2 style="margin: 24px 0 8px; font-size: 15px; color: #0f172a; font-weight: 600;">Start here</h2>
    <ol style="margin: 0 0 20px; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #1e293b;">
      <li>Explore the <strong>Command Overview</strong> dashboard for a live threat picture</li>
      <li>Open a client under <strong>All Clients</strong> to view findings &amp; patches</li>
      <li>Check the <strong>SIEM Console</strong> for recent security events</li>
      <li>Download a VAPT report from any engagement</li>
    </ol>`;
  return shell({
    preheader: "Your GuardianX account has been approved. You can now sign in.",
    headerLabel: "Access Approved",
    bodyHtml: body,
    branding: b,
  });
}

/**
 * Rejection notification email — sent when an admin rejects a pending user.
 */
export function accountRejectedHtml(opts: {
  name: string;
  email: string;
  reason?: string;
  branding?: BrandingInfo;
}): string {
  const b = { ...DEFAULT_BRANDING, ...opts.branding };
  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; color: #0f172a; font-weight: 700;">Update on your ${esc(b.orgName)} account</h1>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">Hello ${esc(opts.name)},</p>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">We are writing about the account you registered with <strong>${esc(opts.email)}</strong>. After review, we were unable to approve this access request at this time.</p>

    ${opts.reason ? `<div style="margin: 0 0 20px; padding: 14px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;"><p style="margin: 0; font-size: 13px; color: #991b1b;"><strong>Reason:</strong> ${esc(opts.reason)}</p></div>` : ""}

    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">
      If you believe this was in error, or if you would like to re-apply with additional context, please reply to this email or contact <a href="mailto:${esc(b.orgEmail)}" style="color: #047857; text-decoration: none;">${esc(b.orgEmail)}</a> and our team will assist you.
    </p>`;
  return shell({
    preheader: "An update on your GuardianX account registration.",
    headerLabel: "Account Update",
    bodyHtml: body,
    branding: b,
  });
}

export const ONBOARDING_SUBJECTS = {
  welcomeAdmin: "Welcome to GuardianX \u2014 your admin account is ready",
  welcomePending: "Welcome to GuardianX \u2014 your account is pending approval",
  approved: "Your GuardianX account has been approved",
  rejected: "Update on your GuardianX account",
  passwordReset: "Reset your GuardianX password",
  passwordResetSuccess: "Your GuardianX password was changed",
  emailVerification: "Verify your email address",
};

/**
 * Password reset email — contains the one-time reset link.
 */
export function passwordResetHtml(opts: {
  name: string;
  email: string;
  resetLink: string;
  branding?: BrandingInfo;
}): string {
  const b = { ...DEFAULT_BRANDING, ...opts.branding };
  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; color: #0f172a; font-weight: 700;">Reset your password, ${esc(opts.name)}?</h1>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">We received a request to reset the password for your ${esc(b.orgName)} account (${esc(opts.email)}). Click the button below to choose a new password.</p>

    <div style="margin: 24px 0;">
      <a href="${esc(opts.resetLink)}" style="display: inline-block; padding: 12px 28px; background: #047857; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Reset Password &rarr;</a>
    </div>

    <div style="margin: 0 0 20px; padding: 14px 16px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px;">
      <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>This link expires in 1 hour.</strong> If you did not request a password reset, you can safely ignore this email &mdash; your password will not be changed.</p>
    </div>

    <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: #475569;">
      If the button above does not work, copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 16px; padding: 10px 12px; background: #f1f5f9; border-radius: 6px; font-size: 12px; color: #1e293b; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">
      ${esc(opts.resetLink)}
    </p>`;
  return shell({
    preheader: "Reset your GuardianX password. This link expires in 1 hour.",
    headerLabel: "Password Reset",
    bodyHtml: body,
    branding: b,
  });
}

/**
 * Password reset confirmation email — sent after a successful reset.
 */
export function passwordResetSuccessHtml(opts: {
  name: string;
  email: string;
  branding?: BrandingInfo;
}): string {
  const b = { ...DEFAULT_BRANDING, ...opts.branding };
  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; color: #0f172a; font-weight: 700;">Your password was changed</h1>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">Hello ${esc(opts.name)},</p>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">Your ${esc(b.orgName)} account password (${esc(opts.email)}) was successfully changed on ${new Date().toUTCString()}.</p>

    <div style="margin: 0 0 20px; padding: 14px 16px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px;">
      <p style="margin: 0; font-size: 13px; color: #065f46;"><strong>Security tip:</strong> If you did NOT make this change, your account may have been compromised. Reset your password again immediately and contact <a href="mailto:${esc(b.orgEmail)}" style="color: #047857; text-decoration: none;">${esc(b.orgEmail)}</a>.</p>
    </div>

    <div style="margin: 24px 0;">
      <a href="${esc(b.platformUrl)}" style="display: inline-block; padding: 12px 28px; background: #047857; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Sign in &rarr;</a>
    </div>`;
  return shell({
    preheader: "Your GuardianX account password was successfully changed.",
    headerLabel: "Security Alert",
    bodyHtml: body,
    branding: b,
  });
}

/**
 * Email verification email — sent at signup. Contains the one-time
 * verification link that the user must click before they can log in.
 */
export function emailVerificationHtml(opts: {
  name: string;
  email: string;
  verificationLink: string;
  branding?: BrandingInfo;
}): string {
  const b = { ...DEFAULT_BRANDING, ...opts.branding };
  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; color: #0f172a; font-weight: 700;">Verify your email, ${esc(opts.name)}!</h1>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #475569;">Welcome to ${esc(b.orgName)}. Click the button below to verify your email address (${esc(opts.email)}) and activate your account.</p>

    <div style="margin: 24px 0;">
      <a href="${esc(opts.verificationLink)}" style="display: inline-block; padding: 12px 28px; background: #047857; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Verify Email Address &rarr;</a>
    </div>

    <div style="margin: 0 0 20px; padding: 14px 16px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px;">
      <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>This link expires in 24 hours.</strong> If you did not create an account, you can safely ignore this email &mdash; no account will be created on your behalf.</p>
    </div>

    <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: #475569;">
      If the button above does not work, copy and paste this link into your browser:
    </p>
    <p style="margin: 0 0 16px; padding: 10px 12px; background: #f1f5f9; border-radius: 6px; font-size: 12px; color: #1e293b; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">
      ${esc(opts.verificationLink)}
    </p>`;
  return shell({
    preheader: "Verify your email address to activate your GuardianX account. This link expires in 24 hours.",
    headerLabel: "Email Verification",
    bodyHtml: body,
    branding: b,
  });
}

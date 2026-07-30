import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/breach-notification — auto-draft a DPDPA §8(6) breach notification
// for any confirmed data exposure findings. DPDPA requires notification to the
// Data Protection Board within 72 hours of becoming aware of a breach.

export async function GET() {
  // Find exposure-type findings (sensitive data / PII exposure)
  const exposureFindings = await db.finding.findMany({
    where: {
      OR: [
        { category: { contains: "Exposure" } },
        { category: { contains: "Disclosure" } },
        { title: { contains: ".env" } },
        { title: { contains: "Secret" } },
        { title: { contains: "SSN" } },
        { title: { contains: "Credit" } },
      ],
    },
    include: { engagement: { include: { target: { select: { name: true, baseUrl: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  if (exposureFindings.length === 0) {
    return NextResponse.json({
      breach_detected: false,
      notification_required: false,
      message: "No personal data breaches detected. No DPDPA §8(6) notification required at this time.",
    });
  }

  // Group findings by target
  const byTarget = new Map<string, typeof exposureFindings>();
  for (const f of exposureFindings) {
    const key = f.engagement.target.name;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key)!.push(f);
  }

  const notifications = Array.from(byTarget.entries()).map(([targetName, findings]) => {
    const firstDetected = findings[findings.length - 1].createdAt;
    const hoursSinceDetection = Math.floor((Date.now() - firstDetected.getTime()) / 3600000);
    const hoursRemaining = Math.max(0, 72 - hoursSinceDetection);
    const isOverdue = hoursSinceDetection > 72;

    // Classify the breach severity under DPDPA
    const hasCritical = findings.some((f) => f.severity === "critical");
    const breachSeverity = hasCritical ? "severe" : "moderate";

    // Identify types of personal data compromised
    const dataTypes = new Set<string>();
    for (const f of findings) {
      const text = `${f.title} ${f.description} ${f.proofResponse}`.toLowerCase();
      if (text.includes("password") || text.includes("pwd")) dataTypes.add("Authentication credentials");
      if (text.includes("ssn") || text.includes("social security")) dataTypes.add("Social Security Numbers");
      if (text.includes("email")) dataTypes.add("Email addresses");
      if (text.includes("credit") || text.includes("card")) dataTypes.add("Payment card data");
      if (text.includes("api_key") || text.includes("stripe") || text.includes("aws")) dataTypes.add("API keys / cloud credentials");
      if (text.includes("jwt") || text.includes("token")) dataTypes.add("Authentication tokens");
      if (text.includes("private key")) dataTypes.add("Cryptographic private keys");
      if (text.includes("db_password") || text.includes("database")) dataTypes.add("Database credentials");
    }

    const notification = {
      target: targetName,
      target_url: findings[0].engagement.target.baseUrl,
      breach_detected: true,
      notification_required: true,
      first_detected: firstDetected.toISOString(),
      hours_since_detection: hoursSinceDetection,
      hours_remaining: hoursRemaining,
      is_overdue: isOverdue,
      breach_severity: breachSeverity,
      finding_count: findings.length,
      data_types_compromised: Array.from(dataTypes),
      // DPDPA §8(6) notification draft
      notification_draft: {
        to: "Data Protection Board of India",
        subject: `NOTIFICATION OF PERSONAL DATA BREACH — ${targetName} — DPDPA §8(6)`,
        date: new Date().toISOString().slice(0, 10),
        body: [
          `Dear Sir/Madam,`,
          ``,
          `This is a notification of a personal data breach as required under Section 8(6) of the Digital Personal Data Protection Act, 2023 (DPDPA).`,
          ``,
          `1. NATURE OF BREACH:`,
          `   A ${breachSeverity} personal data breach was detected affecting ${targetName} (${findings[0].engagement.target.baseUrl}).`,
          `   The breach involves ${findings.length} confirmed exposure(s) of sensitive data.`,
          ``,
          `2. TYPES OF PERSONAL DATA COMPROMISED:`,
          ...Array.from(dataTypes).map((d) => `   • ${d}`),
          ``,
          `3. TIME OF BREACH:`,
          `   First detected: ${firstDetected.toISOString()}`,
          `   Notification filed: ${new Date().toISOString()}`,
          `   Time elapsed: ${hoursSinceDetection} hours (${isOverdue ? "OVERDUE — exceeds 72h limit" : `${hoursRemaining} hours remaining within 72h window`})`,
          ``,
          `4. AFFECTED DATA PRINCIPALS:`,
          `   The number of affected data principals is being assessed. Based on the exposed endpoints, the breach may affect all users whose data is stored in the affected systems.`,
          ``,
          `5. MITIGATION MEASURES TAKEN:`,
          `   • Affected systems have been identified and documented.`,
          `   • Recommendations for remediation have been generated.`,
          `   • All exposed credentials must be rotated immediately.`,
          `   • Access to exposed files has been blocked.`,
          ``,
          `6. RECOMMENDATIONS TO AFFECTED DATA PRINCIPALS:`,
          `   • Change passwords immediately if credentials were exposed.`,
          `   • Monitor accounts for unauthorized activity.`,
          `   • Be alert to phishing attempts using exposed email addresses.`,
          ``,
          `This notification is generated by the GuardianX Autonomous Security Operations Platform based on confirmed vulnerability assessment findings.`,
          ``,
          `Sincerely,`,
          `GuardianX Security Operations`,
          `hello@guardianx.in | +91 70067 12347`,
        ].join("\n"),
      },
    };
    return notification;
  });

  return NextResponse.json({
    breach_detected: true,
    notification_required: true,
    notification_count: notifications.length,
    any_overdue: notifications.some((n) => n.is_overdue),
    notifications,
  });
}

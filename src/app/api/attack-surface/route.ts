import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchUrl } from "@/lib/sentinel/engine/http-attacker";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Known service probes: path + expected indicator
const SERVICE_PROBES = [
  { path: "/", label: "Web Server", port: 80, indicator: /html|HTTP/i },
  { path: "/api", label: "API Endpoint", port: 80, indicator: /json|api|endpoint/i },
  { path: "/admin", label: "Admin Panel", port: 80, indicator: /admin|login|dashboard/i },
  { path: "/login", label: "Login Page", port: 80, indicator: /form|password|login|sign/i },
  { path: "/api-docs", label: "API Documentation", port: 80, indicator: /swagger|openapi|api/i },
  { path: "/swagger.json", label: "Swagger Spec", port: 80, indicator: /swagger|openapi/i },
  { path: "/.env", label: "Environment File", port: 80, indicator: /=/ },
  { path: "/.git/HEAD", label: "Git Repository", port: 80, indicator: /ref:/ },
  { path: "/robots.txt", label: "Robots.txt", port: 80, indicator: /user-agent|disallow/i },
  { path: "/server-status", label: "Server Status", port: 80, indicator: /server-status|apache/i },
  { path: "/wp-admin", label: "WordPress Admin", port: 80, indicator: /wordpress|wp-login/i },
  { path: "/phpmyadmin", label: "phpMyAdmin", port: 80, indicator: /phpmyadmin|mysql/i },
  { path: "/graphql", label: "GraphQL Endpoint", port: 80, indicator: /graphql|query/i },
  { path: "/actuator", label: "Spring Actuator", port: 80, indicator: /actuator|health/i },
  { path: "/health", label: "Health Check", port: 80, indicator: /ok|healthy|status/i },
  { path: "/metrics", label: "Metrics Endpoint", port: 80, indicator: /# HELP|prometheus|metric/i },
];

const COMMON_PORTS = [
  { port: 22, label: "SSH" },
  { port: 80, label: "HTTP" },
  { port: 443, label: "HTTPS" },
  { port: 3000, label: "Node.js App" },
  { port: 3004, label: "Alt HTTP" },
  { port: 3306, label: "MySQL" },
  { port: 5432, label: "PostgreSQL" },
  { port: 6379, label: "Redis" },
  { port: 8080, label: "HTTP Alt" },
  { port: 9200, label: "Elasticsearch" },
  { port: 27017, label: "MongoDB" },
];

// GET /api/attack-surface?targetId=xxx, discover the attack surface of a target.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const targetId = url.searchParams.get("targetId");

  let baseUrl: string;
  let targetName: string;

  if (targetId) {
    const target = await db.target.findUnique({ where: { id: targetId } });
    if (!target) return NextResponse.json({ error: "target not found" }, { status: 404 });
    baseUrl = target.baseUrl;
    targetName = target.name;
  } else {
    // Use the built-in vuln target as default
    baseUrl = "http://localhost:3004";
    targetName = "VulnShop (built-in)";
  }

  const base = baseUrl.replace(/\/$/, "");

  // 1. Probe services
  const services: Array<{ path: string; label: string; status: number; found: boolean; responseSize: number }> = [];
  for (const probe of SERVICE_PROBES) {
    try {
      const res = await fetchUrl(`${base}${probe.path}`, { timeoutMs: 4000 });
      const found = res.status === 200 && (!probe.indicator || probe.indicator.test(res.body));
      services.push({
        path: probe.path,
        label: probe.label,
        status: res.status,
        found,
        responseSize: res.body.length,
      });
    } catch {
      services.push({ path: probe.path, label: probe.label, status: 0, found: false, responseSize: 0 });
    }
  }

  const exposedServices = services.filter((s) => s.found);

  // 2. Check common ports (simulated, we can't open raw TCP sockets, so we
  // check if the port responds to HTTP)
  const portScans = await Promise.all(
    COMMON_PORTS.map(async (p) => {
      try {
        const host = new URL(base).hostname;
        const res = await fetchUrl(`http://${host}:${p.port}/`, { timeoutMs: 2000 });
        return { ...p, open: res.status > 0, status: res.status };
      } catch {
        return { ...p, open: false, status: 0 };
      }
    })
  );
  const openPorts = portScans.filter((p) => p.open);

  // 3. Security headers check
  let headers: Record<string, string> = {};
  try {
    const res = await fetchUrl(base, { timeoutMs: 4000 });
    headers = res.headers;
  } catch { /* ignore */ }

  const securityHeaders = [
    { header: "Strict-Transport-Security", present: !!headers["strict-transport-security"], label: "HSTS" },
    { header: "Content-Security-Policy", present: !!headers["content-security-policy"], label: "CSP" },
    { header: "X-Frame-Options", present: !!headers["x-frame-options"], label: "X-Frame-Options" },
    { header: "X-Content-Type-Options", present: !!headers["x-content-type-options"], label: "X-Content-Type-Options" },
    { header: "Referrer-Policy", present: !!headers["referrer-policy"], label: "Referrer-Policy" },
    { header: "Access-Control-Allow-Origin", present: !!headers["access-control-allow-origin"], label: "CORS (check if *)" },
  ];

  const missingHeaders = securityHeaders.filter((h) => !h.present).map((h) => h.label);

  return NextResponse.json({
    target: targetName,
    base_url: base,
    scan_time: new Date().toISOString(),
    exposed_services: exposedServices.length,
    open_ports: openPorts.length,
    missing_security_headers: missingHeaders.length,
    services: exposedServices,
    all_services: services,
    open_ports_list: openPorts,
    security_headers: securityHeaders,
    risk_level: exposedServices.length > 5 ? "critical" : exposedServices.length > 2 ? "high" : exposedServices.length > 0 ? "medium" : "low",
    summary: `${exposedServices.length} exposed service(s), ${openPorts.length} open port(s), ${missingHeaders.length} missing security header(s)`,
  });
}

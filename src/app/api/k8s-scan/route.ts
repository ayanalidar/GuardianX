import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/k8s-scan, scan Kubernetes manifests for security misconfigurations.
// Body: { manifest }, YAML/JSON k8s manifest string
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const manifest = body.manifest || "";
  const manifestLower = manifest.toLowerCase();

  const checks = [
    { id: "privileged_container", check: () => manifestLower.includes("privileged: true"), severity: "critical", title: "Privileged Container", description: "Container runs in privileged mode, full host access.", fix: "Set privileged: false or remove the field." },
    { id: "run_as_root", check: () => !manifestLower.includes("runasnonroot: true") && manifestLower.includes("containers:"), severity: "high", title: "Running as Root", description: "Container may run as root user.", fix: "Add securityContext.runAsNonRoot: true." },
    { id: "no_resource_limits", check: () => !manifestLower.includes("resources:") && manifestLower.includes("containers:"), severity: "medium", title: "No Resource Limits", description: "No CPU/memory limits set, DoS risk.", fix: "Add resources.limits and resources.requests." },
    { id: "host_network", check: () => manifestLower.includes("hostnetwork: true"), severity: "high", title: "Host Network Access", description: "Pod uses host network namespace.", fix: "Set hostNetwork: false." },
    { id: "host_pid", check: () => manifestLower.includes("hostpid: true"), severity: "high", title: "Host PID Namespace", description: "Pod shares host PID namespace, can see host processes.", fix: "Set hostPID: false." },
    { id: "no_readonly_fs", check: () => !manifestLower.includes("readonlyrootfilesystem: true") && manifestLower.includes("containers:"), severity: "medium", title: "Writable Root Filesystem", description: "Container root filesystem is writable.", fix: "Add securityContext.readOnlyRootFilesystem: true." },
    { id: "image_latest_tag", check: () => manifestLower.includes(":latest"), severity: "low", title: "Using :latest Tag", description: "Image uses :latest tag, non-reproducible builds.", fix: "Pin to a specific image version." },
    { id: "no_liveness_probe", check: () => !manifestLower.includes("livenessprobe:") && manifestLower.includes("containers:"), severity: "low", title: "No Liveness Probe", description: "No liveness probe configured.", fix: "Add livenessProbe for automatic restart on hang." },
    { id: "cap_add_all", check: () => manifestLower.includes("add: ['*']") || manifestLower.includes("add: [\"*\"]"), severity: "critical", title: "All Capabilities Added", description: "Container has ALL Linux capabilities.", fix: "Remove capAdd or specify only needed capabilities." },
    { id: "image_pull_policy", check: () => !manifestLower.includes("imagepullpolicy:") && manifestLower.includes("containers:"), severity: "low", title: "No Image Pull Policy", description: "No imagePullPolicy specified.", fix: "Set imagePullPolicy: Always or IfNotPresent." },
  ];

  const findings = checks.filter(c => c.check()).map(c => ({ id: c.id, title: c.title, severity: c.severity, description: c.description, fix: c.fix }));
  const critical = findings.filter(f => f.severity === "critical").length;
  const high = findings.filter(f => f.severity === "high").length;

  return NextResponse.json({
    total_checks: checks.length,
    findings: findings.length,
    critical,
    high,
    k8s_score: Math.max(0, 100 - critical * 25 - high * 10),
    findings_list: findings,
    summary: `${findings.length} misconfiguration(s) found, ${critical} critical, ${high} high`,
  });
}

// GET /api/k8s-scan, return example manifest for testing
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({
    example_manifest: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: vuln-app
spec:
  template:
    spec:
      hostNetwork: true
      containers:
      - name: app
        image: myapp:latest
        securityContext:
          privileged: true
        # Missing: runAsNonRoot, readOnlyRootFilesystem, resources`,
  });
}

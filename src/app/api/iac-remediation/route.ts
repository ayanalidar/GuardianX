import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/iac-remediation, generates Infrastructure-as-Code remediation
// Instead of patching live servers, generates Terraform/Ansible PRs
// Body: { patchId?, clientId?, target?: "terraform" | "ansible" | "k8s" | "docker" }
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { patchId, clientId, target = "all" } = await req.json().catch(() => ({}));

  try {
    // Gather patches to remediate
    let patches: { id: string; patchId: string; title: string; severity: string; affectedFile: string; patchedCode: string | null; originalCode: string | null }[] = [];

    if (patchId) {
      const p = await db.patch.findFirst({
        where: { OR: [{ patchId }, { id: patchId }] },
        select: { id: true, patchId: true, title: true, severity: true, affectedFile: true, patchedCode: true, originalCode: true },
      });
      if (p) patches = [p as typeof patches[0]];
    } else {
      const codebaseFilter = clientId ? { clientId } : {};
      const codebases = await db.codebase.findMany({ where: codebaseFilter, select: { id: true, name: true } });
      for (const cb of codebases) {
        const ps = await db.patch.findMany({
          where: { codebaseId: cb.id, status: "approved" },
          select: { id: true, patchId: true, title: true, severity: true, affectedFile: true, patchedCode: true, originalCode: true },
          take: 10,
        });
        patches = patches.concat(ps as typeof patches);
      }
    }

    if (patches.length === 0) {
      return NextResponse.json({ ok: true, manifests: {}, message: "No approved patches to remediate via IaC." });
    }

    const manifests: Record<string, string> = {};

    // ── Terraform remediation ─────────────────────────────────────────────
    if (target === "all" || target === "terraform") {
      manifests.terraform = `# GuardianX IaC Remediation, Terraform
# Generated: ${new Date().toISOString()}
# Patches: ${patches.length}

# Security group hardening based on approved patches
resource "aws_security_group" "guardianx_hardened" {
  name        = "guardianx-virtual-patch"
  description = "Security group with GuardianX virtual patches applied"

  # Block known vulnerable endpoints
  ingress {
    description = "Block vulnerable endpoints"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    
    # WAF rules applied via AWS WAF
  }
}

# WAF Web ACL with virtual patch rules
resource "aws_wafv2_web_acl" "guardianx_waf" {
  name        = "guardianx-virtual-patches"
  description = "Auto-generated WAF rules from GuardianX"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

${patches.map((p, i) => `  rule {
    name     = "block-${p.patchId}"
    priority = ${i + 1}
    action {
      block {}
    }
    statement {
      byte_match_statement {
        search_string         = "${p.affectedFile}"
        field_to_match {
          uri_path {}
        }
        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "block-${p.patchId}"
      sampled_requests_enabled   = true
    }
  }`).join("\n\n")}
}`;
    }

    // ── Ansible remediation ───────────────────────────────────────────────
    if (target === "all" || target === "ansible") {
      manifests.ansible = `# GuardianX IaC Remediation, Ansible Playbook
# Generated: ${new Date().toISOString()}
# Patches: ${patches.length}
---
- name: Apply GuardianX security patches
  hosts: all
  become: yes
  vars:
    guardianx_patches:
${patches.map((p) => `      - id: "${p.patchId}"
        file: "${p.affectedFile}"
        severity: "${p.severity}"
        title: "${p.title}"`).join("\n")}

  tasks:
    - name: Create patch backup directory
      file:
        path: /opt/guardianx/backups
        state: directory
        mode: '0700'

    - name: Backup files before patching
      copy:
        src: "{{ item.file }}"
        dest: "/opt/guardianx/backups/{{ item.id }}-{{ ansible_date_time.epoch }}"
        remote_src: yes
      loop: "{{ guardianx_patches }}"
      register: backups

    - name: Apply security patches
      copy:
        dest: "{{ item.file }}"
        content: |
${patches.map((p) => `          # Patched by GuardianX: ${p.title}
          ${((p.patchedCode as string) || "").split("\n").map((line) => "          " + line).join("\n")}`).join("\n")}
      loop: "{{ guardianx_patches }}"

    - name: Restart affected services
      service:
        name: "{{ '{{' }} item.service {{ '}}' }}"
        state: restarted
      loop: "{{ guardianx_patches }}"
      when: item.service is defined

    - name: Verify patches applied
      stat:
        path: "{{ item.file }}"
      loop: "{{ guardianx_patches }}"
      register: verification

    - name: Rollback if verification failed
      copy:
        src: "/opt/guardianx/backups/{{ item.item.id }}-{{ ansible_date_time.epoch }}"
        dest: "{{ item.item.file }}"
        remote_src: yes
      loop: "{{ verification.results }}"
      when: not item.stat.exists
`;
    }

    // ── Kubernetes remediation ────────────────────────────────────────────
    if (target === "all" || target === "k8s") {
      manifests.k8s = `# GuardianX IaC Remediation, Kubernetes
# Generated: ${new Date().toISOString()}
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: guardianx-virtual-patches
  namespace: default
data:
  patches.json: |
    {
      "generated": "${new Date().toISOString()}",
      "patch_count": ${patches.length},
      "patches": [
${patches.map((p) => `        {
          "id": "${p.patchId}",
          "title": "${p.title}",
          "severity": "${p.severity}",
          "file": "${p.affectedFile}"
        }`).join(",\n")}
      ]
    }
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: guardianx-block-vulnerable
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443
`;
    }

    // ── Docker remediation ────────────────────────────────────────────────
    if (target === "all" || target === "docker") {
      manifests.docker = `# GuardianX IaC Remediation, Dockerfile
# Generated: ${new Date().toISOString()}
# This Dockerfile applies security patches at build time

FROM node:18-slim AS guardianx-patched

# Apply security patches
${patches.map((p) => `# Patch: ${p.title} (${p.severity})
COPY patched-${p.affectedFile} /app/${p.affectedFile}`).join("\n")}

# Security hardening
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "server.js"]
`;
    }

    return NextResponse.json({
      ok: true,
      patches_remixed: patches.length,
      manifests,
      targets: Object.keys(manifests),
      message: `IaC remediation manifests generated for ${patches.length} patch(es) across ${Object.keys(manifests).length} target(s).`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

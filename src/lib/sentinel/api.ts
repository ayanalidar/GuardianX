// Shared types and API client for the GuardianX autonomous pipeline.

export type Severity = "critical" | "high" | "medium" | "low";
export type PatchStatus = "pending" | "approved" | "rejected";

export interface Codebase {
  id: string;
  name: string;
  language: string;
  description: string | null;
  created_at: string;
  patch_count: number;
}

export interface CodebaseDetail extends Codebase {
  source_code: string;
  scans: {
    id: string;
    status: string;
    stage_label: string | null;
    started_at: string;
    completed_at: string | null;
    patch_count: number;
  }[];
  patches: {
    patchId: string;
    title: string;
    severity: Severity;
    status: PatchStatus;
    sandboxPassed: boolean;
  }[];
}

export interface Scan {
  id: string;
  status: string;
  stage_label: string | null;
  started_at: string;
  completed_at: string | null;
  codebase: { id: string; name: string };
  patch_count: number;
}

export interface PatchSummary {
  patch_id: string;
  internal_id: string;
  codebase_name: string;
  title: string;
  severity: Severity;
  cve: string | null;
  affected_file: string;
  ai_explanation: string;
  confidence: number;
  sandbox_passed: boolean;
  has_exploit: boolean;
  exploit_confirmed: boolean;
  adversarial_rounds: number;
  adversarial_won: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ExploitRunResult {
  success: boolean;
  blocked: boolean;
  detail: string;
  logs: string;
  durationMs?: number;
}

export interface AdversarialRound {
  round: number;
  attackerTechnique: string;
  attackerReasoning: string;
  bypassFound: boolean;
  bypassResult: {
    success: boolean;
    detail: string;
    logs: string;
  } | null;
  defender: {
    technique: string;
    reasoning: string;
    patchedCode: string;
  } | null;
  defenseVerification: {
    originalBlocked: boolean;
    bypassBlocked: boolean;
    originalLogs: string | null;
    bypassLogs: string;
  } | null;
  outcome:
    | "attacker-conceded"
    | "bypass-unconfirmed"
    | "defender-won-round"
    | "defender-partial";
}

export interface PatchDetail extends PatchSummary {
  codebase: { id: string; name: string };
  ai_reasoning: string;
  original_code: string;
  patched_code: string;
  diff_payload: string;
  test_code: string;
  sandbox_logs: string;
  status: PatchStatus;
  approved_at: string | null;
  // exploit playground
  exploit_code: string | null;
  exploit_original_result: ExploitRunResult | null;
  exploit_patched_result: ExploitRunResult | null;
  // adversarial arena
  adversarial_rounds: number;
  adversarial_won: boolean;
  adversarial_transcript: AdversarialRound[];
  chat: ChatMessage[];
}

export interface RunExploitResponse {
  target: "original" | "patched";
  success: boolean;
  blocked: boolean;
  detail: string;
  exit_code: number | null;
  duration_ms: number;
  timed_out: boolean;
  stdout: string;
  stderr: string;
  logs: string;
}

// ── Credentials ────────────────────────────────────────────────────────────
export interface Credential {
  id: string;
  label: string;
  kind: "github" | "gitlab" | "git";
  target: string;
  username: string | null;
  created_at: string;
  last_used_at: string | null;
  audit_count: number;
}

export interface GitFile {
  path: string;
  size: number;
}

export interface ExploreResult {
  repo_url: string;
  file_count: number;
  files: GitFile[];
}

// ── RedAgent VAPT ───────────────────────────────────────────────────────────
export interface Target {
  id: string;
  name: string;
  base_url: string;
  auth_header_set: boolean;
  notes: string | null;
  authorized: boolean;
  created_at: string;
  engagement_count: number;
}

export interface Engagement {
  id: string;
  status: string;
  stage_label: string | null;
  started_at: string;
  completed_at: string | null;
  target: { name: string; baseUrl: string };
  finding_count: number;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity | "info";
  category: string;
  owasp: string | null;
  endpoint: string;
  method: string;
  description: string;
  proof_request: string;
  proof_response: string;
  payload: string | null;
  confidence: number;
  remediation: string | null;
  created_at: string;
}

export interface RedAgentEvent {
  engagementId: string;
  stage: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  meta?: Record<string, unknown> | null;
  ts: string;
}

// ── PostureScore ────────────────────────────────────────────────────────────
export interface CodebaseScore {
  codebase_id: string;
  codebase_name: string;
  score: number;
  grade: string;
  color: string;
  total_patches: number;
  pending: number;
  approved: number;
  pending_critical: number;
  pending_high: number;
  sandbox_pass_rate: number;
  adversarial_win_rate: number;
}
export interface PostureScore {
  overall: number;
  overall_grade: string;
  codebases: CodebaseScore[];
}

// ── Attestations ────────────────────────────────────────────────────────────
export interface Attestation {
  id: string;
  patch_id: string;
  title: string;
  severity: string;
  prev_hash: string;
  hash: string;
  hash_ok: boolean;
  link_ok: boolean;
  created_at: string;
  data: { patchId: string; codebase: string; title: string; severity: string; approvedAt: string; patchedCodeHash: string; selfHealed?: boolean };
}
export interface AttestationLedger {
  chain_valid: boolean;
  count: number;
  genesis_hash: string | null;
  latest_hash: string | null;
  attestations: Attestation[];
}

// ── Threat Intel ────────────────────────────────────────────────────────────
export interface ThreatItem {
  title: string;
  url: string;
  source: string;
  date: string;
  snippet: string;
  cve: string | null;
  related_codebases: string[];
  relevance: "high" | "info";
}
export interface ThreatIntel {
  threat_count: number;
  high_relevance: number;
  fetched_at: string;
  threats: ThreatItem[];
}

// ── AI Copilot ──────────────────────────────────────────────────────────────
export interface CopilotResult {
  action: string;
  code: string | null;
  explanation: string;
  suggestions: string[];
}

// ── Runtime Monitor ─────────────────────────────────────────────────────────
export interface RuntimeFunction {
  patch_id: string;
  title: string;
  severity: string;
  codebase: string;
  affected_file: string;
  runtime_status: "healed" | "vulnerable";
  sandbox_passed: boolean;
  exploit_proven: boolean;
  attack_attempts: number;
  blocked_attacks: number;
  last_incident: string | null;
}
export interface RuntimeStatus {
  runtime_health: "secure" | "at-risk" | "critical";
  monitored_functions: number;
  vulnerable_functions: number;
  healed_functions: number;
  total_attack_attempts: number;
  total_attacks_blocked: number;
  auto_heal_enabled: boolean;
  functions: RuntimeFunction[];
}

export interface PatchStats {
  pending: number;
  approved: number;
  rejected: number;
  critical_pending: number;
  total: number;
  codebases: number;
  scans: number;
}

export interface PipelineEvent {
  scanId: string;
  stage: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  meta?: Record<string, unknown> | null;
  ts: string;
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const sentinelApi = {
  // codebases
  listCodebases: () => http<Codebase[]>("/api/codebases"),
  getCodebase: (id: string) => http<CodebaseDetail>(`/api/codebases/${id}`),
  createCodebase: (data: {
    name: string;
    sourceCode: string;
    language?: string;
    description?: string;
  }) =>
    http<Codebase>("/api/codebases", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteCodebase: (id: string) =>
    http<{ ok: boolean }>(`/api/codebases/${id}`, { method: "DELETE" }),

  // scans
  listScans: () => http<Scan[]>("/api/scans"),
  startScan: (codebaseId: string) =>
    http<{ scanId: string; status: string }>("/api/scans", {
      method: "POST",
      body: JSON.stringify({ codebaseId }),
    }),
  getScanEvents: (scanId: string) =>
    http<PipelineEvent[]>(`/api/scans/${scanId}/events`),

  // patches
  listPending: () => http<PatchSummary[]>("/api/patches/pending"),
  getPatch: (patchId: string) =>
    http<PatchDetail>(`/api/patches/${encodeURIComponent(patchId)}`),
  approve: (patchId: string) =>
    http<{ patch_id: string; status: string; message: string }>(
      `/api/patches/${encodeURIComponent(patchId)}/approve`,
      { method: "POST" }
    ),
  reject: (patchId: string) =>
    http<{ patch_id: string; status: string; message: string }>(
      `/api/patches/${encodeURIComponent(patchId)}/reject`,
      { method: "POST" }
    ),
  chat: (patchId: string, message: string) =>
    http<{ role: "assistant"; content: string; created_at: string }>(
      `/api/patches/${encodeURIComponent(patchId)}/chat`,
      { method: "POST", body: JSON.stringify({ message }) }
    ),
  runExploit: (patchId: string, target: "original" | "patched") =>
    http<RunExploitResponse>(
      `/api/patches/${encodeURIComponent(patchId)}/run-exploit`,
      { method: "POST", body: JSON.stringify({ target }) }
    ),

  // credentials (metadata only — secrets never leave the server)
  listCredentials: () => http<Credential[]>("/api/credentials"),
  addCredential: (data: {
    label: string;
    kind: "github" | "gitlab" | "git";
    target: string;
    token: string;
    username?: string;
  }) =>
    http<{ id: string; message: string }>("/api/credentials", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteCredential: (id: string) =>
    http<{ ok: boolean; message: string }>(`/api/credentials/${id}`, {
      method: "DELETE",
    }),

  // git integration
  exploreRepo: (credentialId: string, repoUrl: string) =>
    http<ExploreResult>("/api/git/explore", {
      method: "POST",
      body: JSON.stringify({ credentialId, repoUrl }),
    }),
  importFile: (
    credentialId: string,
    repoUrl: string,
    filePath: string,
    name?: string
  ) =>
    http<{ id: string; name: string; message: string; source_lines: number }>(
      "/api/git/import",
      {
        method: "POST",
        body: JSON.stringify({ credentialId, repoUrl, filePath, name }),
      }
    ),

  // stats
  stats: () => http<PatchStats>("/api/stats"),

  // RedAgent VAPT — targets
  listTargets: () => http<Target[]>("/api/targets"),
  addTarget: (data: {
    name: string;
    baseUrl: string;
    authHeader?: string;
    notes?: string;
    authorized?: boolean;
  }) =>
    http<{ id: string; message: string }>("/api/targets", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  authorizeTarget: (id: string) =>
    http<{ id: string; authorized: boolean }>(`/api/targets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ authorized: true }),
    }),
  deleteTarget: (id: string) =>
    http<{ ok: boolean }>(`/api/targets/${id}`, { method: "DELETE" }),

  // RedAgent — engagements
  listEngagements: () => http<Engagement[]>("/api/engagements"),
  startEngagement: (targetId: string) =>
    http<{ engagementId: string; status: string }>("/api/engagements", {
      method: "POST",
      body: JSON.stringify({ targetId }),
    }),
  getEngagementEvents: (engagementId: string) =>
    http<RedAgentEvent[]>(`/api/engagements/${engagementId}/events`),
  getFindings: (engagementId: string) =>
    http<Finding[]>(`/api/engagements/${engagementId}/findings`),
  reportUrl: (engagementId: string) =>
    `/api/engagements/${engagementId}/report`,

  // PostureScore
  postureScore: () => http<PostureScore>("/api/posture-score"),

  // Attestations
  attestations: () => http<AttestationLedger>("/api/attestations"),

  // Threat Intel
  threatIntel: () => http<ThreatIntel>("/api/threat-intel"),

  // AI Remediation Copilot
  copilot: (patchId: string, action: "generate-fix" | "explain" | "hardened-fix", instruction?: string) =>
    http<CopilotResult>(`/api/patches/${encodeURIComponent(patchId)}/copilot`, {
      method: "POST",
      body: JSON.stringify({ action, instruction }),
    }),

  // Self-Healing Runtime
  runtimeMonitor: () => http<RuntimeStatus>("/api/runtime-monitor"),
  runtimeHeal: (patchId: string) =>
    http<{ patch_id: string; runtime_status: string; message: string }>(
      `/api/runtime-monitor/${encodeURIComponent(patchId)}/heal`,
      { method: "POST" }
    ),
};

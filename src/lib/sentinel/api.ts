// Shared types and API client for the SentinelPatch autonomous pipeline.

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
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
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
  chat: ChatMessage[];
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

  // stats
  stats: () => http<PatchStats>("/api/stats"),
};

// Shared types and API client for the SentinelPatch dashboard.

export type Severity = "critical" | "high" | "medium" | "low";

export type PatchStatus = "pending" | "approved" | "rejected";

export interface PatchSummary {
  patch_id: string;
  internal_id: string;
  title: string;
  severity: Severity;
  cve: string | null;
  affected_file: string;
  ai_explanation: string;
  sandbox_passed: boolean;
  created_at: string;
}

export interface PatchDetail extends PatchSummary {
  diff_payload: string;
  sandbox_logs: string;
  status: PatchStatus;
  approved_at: string | null;
}

export interface PatchStats {
  pending: number;
  approved: number;
  rejected: number;
  critical_pending: number;
  total: number;
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const sentinelApi = {
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
  stats: () => http<PatchStats>("/api/patches/stats"),
};

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  User,
  Users,
} from "lucide-react";

interface OrgSwitcherProps {
  currentUser?: { id: string; email: string; name: string; role: string } | null;
  /** Rendered inside the sidebar header — sets the workspace header on switch. */
  onWorkspaceChange?: (workspace: { id: string; name: string; kind: "personal" | "org" }) => void;
  compact?: boolean;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
}

const WORKSPACE_HEADER = "x-guardianx-workspace";
const LS_KEY = "guardianx-workspace";

export function OrgSwitcher({ currentUser, onWorkspaceChange, compact }: OrgSwitcherProps) {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<{ id: string; name: string; kind: "personal" | "org" }>({
    id: "personal",
    name: "My Workspace",
    kind: "personal",
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Hydrate from localStorage (so the header persists across reloads) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.id && parsed?.name) setCurrent(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Load orgs list (admin only — viewers get just their personal workspace) ──
  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orgs");
      if (!res.ok) {
        // Non-admins get 403 — that's fine, fall back to personal workspace.
        setOrgs([]);
        return;
      }
      const data = await res.json();
      setOrgs(Array.isArray(data) ? data : []);
    } catch {
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  // ── Switch workspace: set header on localStorage + notify parent ──
  const switchTo = (workspace: { id: string; name: string; kind: "personal" | "org" }) => {
    setCurrent(workspace);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(workspace));
    } catch { /* ignore */ }
    // Apply the x-guardianx-workspace header to all future fetches.
    applyWorkspaceHeader(workspace);
    onWorkspaceChange?.(workspace);
    toast({
      title: "Workspace switched",
      description: `Now in ${workspace.name}.`,
    });
  };

  // ── Create org ──
  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create org");
      toast({
        title: "Organization created",
        description: `${data.name} is ready. Invite teammates from Settings → Organization.`,
      });
      setNewName("");
      setNewSlug("");
      setCreateOpen(false);
      await loadOrgs();
      switchTo({ id: data.id, name: data.name, kind: "org" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setCreating(false);
    }
  };

  // ── Slug auto-generation ──
  useEffect(() => {
    if (newName && !newSlug) {
      setNewSlug(
        newName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40)
      );
    }
  }, [newName, newSlug]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group flex w-full items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
            aria-label="Switch workspace"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/30">
              {current.kind === "personal" ? (
                <User className="size-3.5 text-emerald-400" />
              ) : (
                <Building2 className="size-3.5 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-semibold text-zinc-100">
                {current.name}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-emerald-500/60">
                {current.kind === "personal" ? "Personal" : "Org Workspace"}
              </div>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-zinc-500 transition-colors group-hover:text-emerald-300" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-64 border-zinc-800 bg-zinc-950/95 p-1 text-zinc-200 backdrop-blur-md"
        >
          <DropdownMenuLabel className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-500/70">
            <Building2 className="size-3" /> Workspaces
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-800" />

          {/* Personal workspace */}
          <DropdownMenuItem
            onClick={() =>
              switchTo({ id: "personal", name: "My Workspace", kind: "personal" })
            }
            className="flex items-center gap-2 rounded-md text-sm focus:bg-emerald-500/10 focus:text-emerald-300"
          >
            <User className="size-4 text-emerald-400" />
            <div className="flex-1">
              <div className="text-sm">My Workspace</div>
              <div className="text-[10px] text-zinc-500">
                {currentUser?.email ?? "Signed out"}
              </div>
            </div>
            {current.kind === "personal" && <Check className="size-3.5 text-emerald-400" />}
          </DropdownMenuItem>

          {/* Org workspaces */}
          {loading ? (
            <div className="px-2 py-1.5">
              <Skeleton className="h-5 w-full bg-zinc-800" />
            </div>
          ) : orgs.length > 0 ? (
            <>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuLabel className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-500/70">
                <Users className="size-3" /> Organizations
              </DropdownMenuLabel>
              {orgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => switchTo({ id: org.id, name: org.name, kind: "org" })}
                  className="flex items-center gap-2 rounded-md text-sm focus:bg-emerald-500/10 focus:text-emerald-300"
                >
                  <Building2 className="size-4 text-emerald-400" />
                  <div className="flex-1">
                    <div className="truncate text-sm">{org.name}</div>
                    <div className="text-[10px] text-zinc-500">
                      {org.memberCount} member{org.memberCount === 1 ? "" : "s"} · {org.slug}
                    </div>
                  </div>
                  {current.id === org.id && <Check className="size-3.5 text-emerald-400" />}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}

          <DropdownMenuSeparator className="bg-zinc-800" />

          {/* Create org */}
          <DropdownMenuItem
            onClick={() => setCreateOpen(true)}
            disabled={currentUser?.role !== "admin"}
            className="flex items-center gap-2 rounded-md text-sm focus:bg-emerald-500/10 focus:text-emerald-300 data-[disabled]:opacity-50"
          >
            <Plus className="size-4 text-emerald-400" />
            Create Organization
          </DropdownMenuItem>
          {currentUser?.role !== "admin" && (
            <div className="px-2 pb-1 text-[9px] text-zinc-500">
              Only admins can create orgs.
            </div>
          )}

          {!compact && (
            <div className="px-2 pb-1 pt-2 text-[9px] text-zinc-600">
              Sends{" "}
              <code className="rounded bg-zinc-800 px-1 font-mono text-[10px] text-zinc-300">
                {WORKSPACE_HEADER}
              </code>{" "}
              on all API requests.
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create org dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-emerald-400" /> Create Organization
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Organizations let multiple teammates share clients, codebases, and findings under one
              workspace. You become the org owner.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-zinc-400">Organization name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme Security"
                className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                maxLength={80}
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Slug</Label>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-xs text-zinc-500">/orgs/</span>
                <Input
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="acme-security"
                  className="flex-1 border-zinc-700 bg-zinc-900/60 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                  maxLength={40}
                />
              </div>
              <p className="mt-1 text-[10px] text-zinc-500">
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newSlug.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Building2 className="size-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Helper: patch fetch() so every outgoing request carries the workspace ──
// header. We monkey-patch once on first mount so the rest of the app doesn't
// have to know about workspaces.
let headerPatched = false;
let currentWorkspace: { id: string; name: string; kind: "personal" | "org" } = {
  id: "personal",
  name: "My Workspace",
  kind: "personal",
};

function applyWorkspaceHeader(workspace: {
  id: string;
  name: string;
  kind: "personal" | "org";
}) {
  currentWorkspace = workspace;
  if (headerPatched) return;
  headerPatched = true;
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      // Don't attach to third-party requests — only relative GuardianX paths.
      const url = typeof input === "string" ? input : (input as URL).toString?.() ?? "";
      const isRelative = url.startsWith("/") || url.startsWith(window.location.origin);
      if (isRelative && init) {
        const headers = new Headers(init.headers || {});
        if (!headers.has(WORKSPACE_HEADER)) {
          headers.set(WORKSPACE_HEADER, currentWorkspace.id);
        }
        init = { ...init, headers };
      }
    } catch {
      /* ignore — fail open */
    }
    return origFetch(input, init);
  }) as typeof fetch;
}

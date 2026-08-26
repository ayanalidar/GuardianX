"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  ChevronDown,
  Plus,
  User as UserIcon,
  Users,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  sentinelApi,
  setWorkspaceMode,
  getWorkspaceMode,
  type WorkspaceMode,
} from "@/lib/sentinel/api";

// ── Types ──────────────────────────────────────────────────────────────────
interface OrgMember {
  id: string;
  email: string;
  role: string;
  invitedAt: string | null;
  joinedAt: string | null;
  isCreator: boolean;
}

interface CurrentOrg {
  id: string;
  name: string;
  slug: string;
  members: OrgMember[];
  memberCount: number;
}

interface OrgSwitcherProps {
  /** Called whenever the user changes their workspace context. The parent
   *  typically uses this to trigger a data refetch so the new filter takes
   *  effect immediately. */
  onWorkspaceChange?: (mode: WorkspaceMode) => void;
}

// ── Component ──────────────────────────────────────────────────────────────
/**
 * OrgSwitcher — sidebar header widget for organization-level multi-tenancy.
 *
 * Behavior:
 *   - Solo users (no org): shows a "Create Organization" button. Clicking it
 *     opens a modal with name + optional slug.
 *   - Org members: shows the org name + a workspace-context dropdown
 *     ("My Workspace" vs. "Org Workspace"). The selected mode is sent on
 *     every subsequent API request via the `x-guardianx-workspace` header
 *     (handled in `src/lib/sentinel/api.ts`).
 *
 * The current workspace mode is persisted to localStorage so it survives
 * page refresh.
 */
export function OrgSwitcher({ onWorkspaceChange }: OrgSwitcherProps) {
  const { toast } = useToast();
  const [org, setOrg] = useState<CurrentOrg | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceMode>(getWorkspaceMode());

  // Create-org modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const loadOrg = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sentinelApi.getCurrentOrganization();
      setOrg(result.organization);
    } catch (err) {
      // Non-fatal — the switcher just renders the "create" CTA.
      console.warn("[OrgSwitcher] failed to load current org:", err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  const handleCreateOrg = async () => {
    if (!createName.trim()) {
      toast({ variant: "destructive", title: "Name required", description: "Enter an organization name." });
      return;
    }
    setCreating(true);
    try {
      await sentinelApi.createOrganization({ name: createName.trim(), slug: createSlug.trim() || undefined });
      toast({
        title: "Organization created!",
        description: "You are now the admin. Invite teammates from Settings → Organization.",
      });
      setCreateOpen(false);
      setCreateName("");
      setCreateSlug("");
      // Auto-switch to org workspace so the user immediately sees org data.
      setWorkspaceMode("org");
      setWorkspace("org");
      onWorkspaceChange?.("org");
      await loadOrg();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to create organization",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleSwitchWorkspace = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    setWorkspace(mode);
    onWorkspaceChange?.(mode);
    toast({
      title: mode === "org" ? "Org Workspace" : "My Workspace",
      description:
        mode === "org"
          ? "Showing all clients shared with your organization."
          : "Showing only the clients you own.",
    });
  };

  // ── Render: solo user (no org) ──────────────────────────────────────────
  if (!loading && !org) {
    return (
      <>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
          <Building2 className="size-4 shrink-0 text-zinc-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-zinc-300">Solo workspace</div>
            <div className="truncate text-[9px] text-zinc-500">No organization</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            className="h-7 shrink-0 border-emerald-500/30 bg-emerald-500/5 px-2 text-[10px] text-emerald-300 hover:bg-emerald-500/15"
          >
            <Plus className="size-3" />
            Create Org
          </Button>
        </div>
        <CreateOrgDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          name={createName}
          slug={createSlug}
          onNameChange={setCreateName}
          onSlugChange={setCreateSlug}
          onSubmit={handleCreateOrg}
          creating={creating}
        />
      </>
    );
  }

  // ── Render: loading skeleton ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
        <Loader2 className="size-4 shrink-0 animate-spin text-zinc-500" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium text-zinc-400">Loading workspace…</div>
        </div>
      </div>
    );
  }

  // ── Render: org member with workspace switcher ──────────────────────────
  const isOrgMode = workspace === "org";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-left transition-colors hover:bg-zinc-800/60"
          >
            <Building2 className={`size-4 shrink-0 ${isOrgMode ? "text-emerald-400" : "text-zinc-500"}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-zinc-100">{org?.name}</div>
              <div className="truncate text-[9px] text-zinc-500">
                {isOrgMode ? "Org Workspace" : "My Workspace"} · {org?.memberCount ?? 0} member{(org?.memberCount ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
            <ChevronDown className="size-3 shrink-0 text-zinc-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 border-zinc-800 bg-zinc-950/95 backdrop-blur-xl">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-zinc-500">
            Switch context
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem
            onClick={() => handleSwitchWorkspace("org")}
            className="flex items-start gap-2 py-2 focus:bg-emerald-500/10"
          >
            <Users className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                Org Workspace
                {isOrgMode && <CheckCircle2 className="size-3 text-emerald-400" />}
              </div>
              <div className="text-[10px] text-zinc-500">All clients shared with your organization</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleSwitchWorkspace("personal")}
            className="flex items-start gap-2 py-2 focus:bg-emerald-500/10"
          >
            <UserIcon className="mt-0.5 size-4 shrink-0 text-sky-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                My Workspace
                {!isOrgMode && <CheckCircle2 className="size-3 text-emerald-400" />}
              </div>
              <div className="text-[10px] text-zinc-500">Only clients you own</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-zinc-800" />
          <div className="px-2 py-1.5 text-[10px] text-zinc-500">
            <Badge variant="outline" className="mr-1 border-emerald-500/30 text-[9px] text-emerald-300">
              {org?.slug}
            </Badge>
            Manage members in Settings → Organization
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrgDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        name={createName}
        slug={createSlug}
        onNameChange={setCreateName}
        onSlugChange={setCreateSlug}
        onSubmit={handleCreateOrg}
        creating={creating}
      />
    </>
  );
}

// ── Create-org dialog (extracted so the same widget is reused) ─────────────
function CreateOrgDialog({
  open,
  onOpenChange,
  name,
  slug,
  onNameChange,
  onSlugChange,
  onSubmit,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  slug: string;
  onNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onSubmit: () => void;
  creating: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-50">
            <Building2 className="size-5 text-emerald-400" />
            Create Organization
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Organizations let your team share clients, scans, and findings. You
            become the organization admin and can invite teammates by email.
          </DialogDescription>
        </DialogHeader>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 py-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="org-name" className="text-xs text-zinc-300">
              Organization name
            </Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Acme Security"
              maxLength={120}
              className="border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-slug" className="text-xs text-zinc-300">
              Slug <span className="text-zinc-500">(optional)</span>
            </Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="acme-security"
              maxLength={60}
              className="border-zinc-800 bg-zinc-900 font-mono text-zinc-100 placeholder:text-zinc-600"
            />
            <p className="text-[10px] text-zinc-500">
              Lowercase letters, numbers, and hyphens. Auto-derived from the name if blank.
            </p>
          </div>
        </motion.div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating} className="border-zinc-700 bg-zinc-900 text-zinc-300">
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={creating || !name.trim()} className="bg-emerald-600 text-white hover:bg-emerald-500">
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

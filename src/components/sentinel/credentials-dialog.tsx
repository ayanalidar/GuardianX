"use client";

import { useCallback, useEffect, useState } from "react";
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
import { sentinelApi, type Credential } from "@/lib/sentinel/api";
import { formatRelativeTime } from "@/lib/sentinel/utils";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function CredentialsDialog({
  open,
  onOpenChange,
  onChanged,
}: CredentialsDialogProps) {
  const { toast } = useToast();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  // add form
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"github" | "gitlab" | "git">("github");
  const [target, setTarget] = useState("");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await sentinelApi.listCredentials();
      setCreds(list);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load credentials",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const resetForm = () => {
    setLabel("");
    setKind("github");
    setTarget("");
    setToken("");
    setUsername("");
    setShowToken(false);
  };

  const handleAdd = async () => {
    if (!label.trim() || !target.trim() || !token) return;
    setSaving(true);
    try {
      const r = await sentinelApi.addCredential({
        label: label.trim(),
        kind,
        target: target.trim(),
        token,
        username: username.trim() || undefined,
      });
      toast({ title: "Credential added", description: r.message });
      resetForm();
      setShowAdd(false);
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to add credential",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    setDeleting(id);
    try {
      const r = await sentinelApi.deleteCredential(id);
      toast({ title: "Credential deleted", description: r.message });
      await load();
      onChanged?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setDeleting(null);
    }
    void label;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-2xl">
        <DialogHeader className="gap-2 border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-50">
            <KeyRound className="size-4 text-emerald-400" />
            Git Credentials
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Lock className="size-3 text-emerald-500" />
            Tokens are AES-256-GCM encrypted at rest and never shown again after saving.
          </DialogDescription>
        </DialogHeader>

        <div className="custom-scrollbar max-h-[calc(92vh-9rem)] overflow-y-auto px-5 py-4">
          {/* Security note */}
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-zinc-400">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            <div>
              Credentials are used only to clone repos for scanning. The decrypted
              token never enters the AI prompts, sandbox, or any API response.
              Each use is recorded in an audit log.
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-zinc-800" />
              ))}
            </div>
          ) : creds.length === 0 && !showAdd ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-10 text-center">
              <KeyRound className="size-8 text-zinc-600" />
              <p className="mt-3 text-sm text-zinc-400">No credentials yet.</p>
              <p className="mt-1 text-xs text-zinc-500">
                Add a GitHub/GitLab token to clone private repos for scanning.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {creds.map((c) => (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50">
                      <KeyRound className="size-4 text-zinc-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-zinc-100">
                          {c.label}
                        </span>
                        <Badge
                          variant="outline"
                          className="border-zinc-700 bg-zinc-800/50 text-[10px] text-zinc-400"
                        >
                          {c.kind}
                        </Badge>
                        <span className="font-mono text-[11px] text-zinc-500">
                          {c.target}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-[11px] text-zinc-500">
                        <span>added {formatRelativeTime(c.created_at)}</span>
                        {c.last_used_at && (
                          <span>used {formatRelativeTime(c.last_used_at)}</span>
                        )}
                        {c.audit_count > 0 && (
                          <span>{c.audit_count} audit events</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(c.id, c.label)}
                      disabled={deleting === c.id}
                      className="size-8 shrink-0 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                    >
                      {deleting === c.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Add form */}
          {showAdd && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
            >
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                New Credential
              </div>
              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-zinc-400">Label</Label>
                    <Input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Acme Corp GitHub"
                      className="mt-1 border-zinc-800 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">Type</Label>
                    <div className="mt-1 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
                      {(["github", "gitlab", "git"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setKind(k)}
                          className={`flex-1 rounded-md px-2 py-1.5 font-medium capitalize transition-colors ${
                            kind === k
                              ? "bg-zinc-800 text-zinc-100"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-zinc-400">
                      {kind === "git" ? "Host" : "Target (e.g. github.com)"}
                    </Label>
                    <Input
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder={kind === "git" ? "gitlab.example.com" : "github.com"}
                      className="mt-1 border-zinc-800 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                    />
                  </div>
                  {kind === "git" && (
                    <div>
                      <Label className="text-xs text-zinc-400">Username (optional)</Label>
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="oauth2"
                        className="mt-1 border-zinc-800 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">
                    Token / Personal Access Token
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="ghp_… / glpat-… / <token>"
                      className="border-zinc-800 bg-zinc-900/60 pr-10 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showToken ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Encrypted before storage. Recommend a read-only, scoped token.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setShowAdd(false);
                  }}
                  className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={saving || !label.trim() || !target.trim() || !token}
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Save & Encrypt
                </Button>
              </div>
            </motion.div>
          )}
        </div>

        <DialogFooter className="border-t border-zinc-800 bg-zinc-950/80 px-5 py-3">
          {!showAdd && (
            <Button
              onClick={() => setShowAdd(true)}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <Plus className="size-4" />
              Add Credential
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

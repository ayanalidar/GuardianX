"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { sentinelApi, type Codebase, type CodebaseDetail, type Credential, type GitFile } from "@/lib/sentinel/api";
import { formatRelativeTime } from "@/lib/sentinel/utils";
import {
  Database,
  FileCode2,
  GitBranch,
  KeyRound,
  Loader2,
  Plus,
  ScanLine,
  Search,
} from "lucide-react";

interface CodebaseViewerProps {
  codebase: Codebase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (cb: Codebase) => void;
}

export function CodebaseViewer({
  codebase,
  open,
  onOpenChange,
  onScan,
}: CodebaseViewerProps) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<CodebaseDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !codebase) {
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    sentinelApi
      .getCodebase(codebase.id)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
      })
      .catch((e: Error) =>
        toast({
          variant: "destructive",
          title: "Failed to load codebase",
          description: e.message,
        })
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, codebase, toast]);

  // Reset stale detail when the viewer closes or switches codebase.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetail(null);
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-2xl">
        <SheetHeader className="gap-2 border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-sky-400" />
            <SheetTitle className="font-mono text-base text-zinc-50">
              {codebase?.name}
            </SheetTitle>
            {codebase && (
              <Badge
                variant="outline"
                className="border-zinc-700 bg-zinc-800/50 text-[10px] text-zinc-400"
              >
                {codebase.language}
              </Badge>
            )}
          </div>
          <SheetDescription className="text-xs text-zinc-400">
            {codebase?.description ?? "No description"}
          </SheetDescription>
        </SheetHeader>

        <div className="custom-scrollbar h-[calc(100vh-8rem)] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-24 bg-zinc-800" />
              <Skeleton className="h-64 w-full bg-zinc-800" />
            </div>
          ) : detail ? (
            <div className="space-y-5">
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <FileCode2 className="size-3.5 text-emerald-400" />
                  Source Code
                </div>
                <pre className="custom-scrollbar max-h-80 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
                  {detail.source_code}
                </pre>
              </section>

              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Scan History ({detail.scans.length})
                </div>
                {detail.scans.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 p-4 text-center text-xs text-zinc-500">
                    No scans yet. Run one to find vulnerabilities.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detail.scans.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <StatusDot status={s.status} />
                          <span className="text-zinc-300">
                            {s.stage_label ?? s.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-zinc-500">
                          <span>{s.patch_count} patches</span>
                          <span>{formatRelativeTime(s.started_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-zinc-500">
              Unable to load.
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex justify-end gap-2 border-t border-zinc-800 bg-zinc-950/90 px-5 py-3 backdrop-blur">
          <Button
            onClick={() => codebase && onScan(codebase)}
            disabled={!codebase}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <ScanLine className="size-4" />
            Run AI Scan
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-400"
      : status === "failed"
        ? "bg-red-400"
        : status === "queued"
          ? "bg-zinc-500"
          : "bg-amber-400 animate-pulse";
  return <span className={`size-2 rounded-full ${color}`} />;
}

// ── Add Codebase Dialog (Paste Source OR Clone from Git) ────────────────────

interface AddCodebaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (cb: Codebase) => void;
  onOpenCredentials?: () => void;
  clientId?: string;
}

export function AddCodebaseDialog({
  open,
  onOpenChange,
  onCreated,
  onOpenCredentials,
  clientId,
}: AddCodebaseDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"paste" | "git">("paste");

  // paste mode
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);

  // git mode
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credId, setCredId] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [exploring, setExploring] = useState(false);
  const [files, setFiles] = useState<GitFile[]>([]);
  const [fileQuery, setFileQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<GitFile | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setSource("");
    setCredId("");
    setRepoUrl("");
    setFiles([]);
    setFileQuery("");
    setSelectedFile(null);
  };

  // Load credentials when switching to git mode
  useEffect(() => {
    if (open && mode === "git") {
      sentinelApi
        .listCredentials()
        .then(setCredentials)
        .catch(() => null);
    }
  }, [open, mode]);

  const handleCreate = async () => {
    if (!name.trim() || !source.trim()) return;
    setSaving(true);
    try {
      const cb = await sentinelApi.createCodebase({
        name: name.trim(),
        description: description.trim() || undefined,
        sourceCode: source,
        clientId: clientId,
      });
      toast({ title: "Codebase added", description: cb.name });
      onCreated(cb);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to add codebase",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExplore = async () => {
    if (!credId || !repoUrl.trim()) return;
    setExploring(true);
    setFiles([]);
    setSelectedFile(null);
    try {
      const r = await sentinelApi.exploreRepo(credId, repoUrl.trim());
      setFiles(r.files);
      if (r.files.length === 0) {
        toast({
          variant: "destructive",
          title: "No scannable files",
          description: "No .js/.ts/.py/etc source files found in this repo.",
        });
      } else {
        toast({
          title: "Repo cloned",
          description: `Found ${r.files.length} scannable file(s).`,
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Clone failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setExploring(false);
    }
  };

  const handleImport = async () => {
    if (!credId || !repoUrl.trim() || !selectedFile) return;
    setImporting(true);
    try {
      const r = await sentinelApi.importFile(
        credId,
        repoUrl.trim(),
        selectedFile.path
      );
      toast({ title: "Codebase imported", description: r.message });
      onCreated({ id: r.id, name: r.name } as Codebase);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setImporting(false);
    }
  };

  const filteredFiles = fileQuery.trim()
    ? files.filter((f) =>
        f.path.toLowerCase().includes(fileQuery.trim().toLowerCase())
      )
    : files;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-2xl">
        <DialogHeader className="gap-2 border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-50">
            <Plus className="size-4 text-emerald-400" />
            Add Codebase
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Paste source code or clone a file from a Git repository for the AI
            to scan.
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-1 border-b border-zinc-800 bg-zinc-900/40 px-5 py-2">
          <ModeToggle active={mode === "paste"} onClick={() => setMode("paste")}>
            <FileCode2 className="size-3.5" />
            Paste Source
          </ModeToggle>
          <ModeToggle active={mode === "git"} onClick={() => setMode("git")}>
            <GitBranch className="size-3.5" />
            Clone from Git
          </ModeToggle>
        </div>

        <div className="custom-scrollbar max-h-[calc(92vh-12rem)] overflow-y-auto px-5 py-4">
          {mode === "paste" ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="cb-name" className="text-xs text-zinc-400">
                  Filename
                </Label>
                <Input
                  id="cb-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. payment-handler.js"
                  className="border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cb-desc" className="text-xs text-zinc-400">
                  Description (optional)
                </Label>
                <Input
                  id="cb-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short summary of what this module does"
                  className="border-zinc-800 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cb-source" className="text-xs text-zinc-400">
                  Source Code
                </Label>
                <Textarea
                  id="cb-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="// Paste your JavaScript / Node.js source here…"
                  className="custom-scrollbar min-h-[16rem] resize-y border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* credential selector */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-zinc-400">Credential</Label>
                  <button
                    type="button"
                    onClick={onOpenCredentials}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300"
                  >
                    <KeyRound className="mr-1 inline size-3" />
                    Manage credentials
                  </button>
                </div>
                {credentials.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 px-3 py-3 text-xs text-zinc-500">
                    <KeyRound className="size-4 text-zinc-600" />
                    <span>
                      No credentials yet.
                    </span>
                    <button
                      type="button"
                      onClick={onOpenCredentials}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      Add one →
                    </button>
                  </div>
                ) : (
                  <select
                    value={credId}
                    onChange={(e) => setCredId(e.target.value)}
                    className="h-9 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="">Select a credential…</option>
                    {credentials.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} ({c.kind} · {c.target})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* repo url + explore */}
              <div className="grid gap-2">
                <Label className="text-xs text-zinc-400">Repository URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                  />
                  <Button
                    onClick={handleExplore}
                    disabled={!credId || !repoUrl.trim() || exploring}
                    className="shrink-0 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                    variant="outline"
                  >
                    {exploring ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                    Explore
                  </Button>
                </div>
              </div>

              {/* file list */}
              {files.length > 0 && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-400">
                      Select a file to scan ({files.length})
                    </Label>
                    <span className="text-[11px] text-zinc-500">
                      {selectedFile ? `→ ${selectedFile.path}` : "none selected"}
                    </span>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
                    <Input
                      value={fileQuery}
                      onChange={(e) => setFileQuery(e.target.value)}
                      placeholder="Filter files…"
                      className="border-zinc-800 bg-zinc-900/60 pl-9 text-xs text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="custom-scrollbar max-h-56 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950">
                    {filteredFiles.map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => setSelectedFile(f)}
                        className={`flex w-full items-center gap-2 border-b border-zinc-800/60 px-3 py-2 text-left text-xs transition-colors last:border-b-0 ${
                          selectedFile?.path === f.path
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "text-zinc-300 hover:bg-zinc-800/40"
                        }`}
                      >
                        <FileCode2 className="size-3.5 shrink-0 text-zinc-500" />
                        <span className="min-w-0 flex-1 truncate font-mono">
                          {f.path}
                        </span>
                        <span className="shrink-0 text-[10px] text-zinc-600">
                          {f.size < 1024
                            ? `${f.size}B`
                            : `${Math.round(f.size / 1024)}KB`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-zinc-800 bg-zinc-950/80 px-5 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          >
            Cancel
          </Button>
          {mode === "paste" ? (
            <Button
              onClick={handleCreate}
              disabled={saving || !name.trim() || !source.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {saving ? "Adding…" : "Add & Make Scannable"}
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importing || !credId || !repoUrl.trim() || !selectedFile}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <GitBranch className="size-4" />
              )}
              {importing ? "Importing…" : "Import & Scan"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

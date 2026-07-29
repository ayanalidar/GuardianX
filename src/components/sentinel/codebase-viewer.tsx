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
import { sentinelApi, type Codebase, type CodebaseDetail } from "@/lib/sentinel/api";
import { formatRelativeTime } from "@/lib/sentinel/utils";
import { Database, FileCode2, Plus, ScanLine } from "lucide-react";

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

// ── Add Codebase Dialog ──────────────────────────────────────────────────────

interface AddCodebaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (cb: Codebase) => void;
}

export function AddCodebaseDialog({
  open,
  onOpenChange,
  onCreated,
}: AddCodebaseDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setSource("");
  };

  const handleCreate = async () => {
    if (!name.trim() || !source.trim()) return;
    setSaving(true);
    try {
      const cb = await sentinelApi.createCodebase({
        name: name.trim(),
        description: description.trim() || undefined,
        sourceCode: source,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-2xl">
        <DialogHeader className="gap-2 border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-50">
            <Plus className="size-4 text-emerald-400" />
            Add Codebase
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Paste vulnerable source code for the AI to scan. The pipeline will
            analyze it, generate patches, and sandbox-test them.
          </DialogDescription>
        </DialogHeader>

        <div className="custom-scrollbar max-h-[calc(92vh-9rem)] space-y-4 overflow-y-auto px-5 py-4">
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

        <DialogFooter className="border-t border-zinc-800 bg-zinc-950/80 px-5 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={saving || !name.trim() || !source.trim()}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {saving ? "Adding…" : "Add & Make Scannable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

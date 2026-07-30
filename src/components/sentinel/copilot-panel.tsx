"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { sentinelApi, type CopilotResult } from "@/lib/sentinel/api";
import {
  Code2,
  Lightbulb,
  Loader2,
  Shield,
  Wand2,
  Check,
  Copy,
} from "lucide-react";

interface CopilotPanelProps {
  patchId: string;
}

export function CopilotPanel({ patchId }: CopilotPanelProps) {
  const { toast } = useToast();
  const [result, setResult] = useState<CopilotResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async (action: "explain" | "generate-fix" | "hardened-fix") => {
    setLoading(action);
    setResult(null);
    try {
      const r = await sentinelApi.copilot(patchId, action, instruction || undefined);
      setResult(r);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Copilot failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setLoading(null);
    }
  };

  const copyCode = () => {
    if (!result?.code) return;
    navigator.clipboard.writeText(result.code);
    setCopied(true);
    toast({ title: "Code copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => run("explain")}
          disabled={!!loading}
          className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
        >
          {loading === "explain" ? <Loader2 className="size-3.5 animate-spin" /> : <Lightbulb className="size-3.5" />}
          Explain Fix
        </Button>
        <Button
          size="sm"
          onClick={() => run("generate-fix")}
          disabled={!!loading}
          className="bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {loading === "generate-fix" ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
          Generate Improved Fix
        </Button>
        <Button
          size="sm"
          onClick={() => run("hardened-fix")}
          disabled={!!loading}
          className="bg-cyan-600 text-white hover:bg-cyan-500"
        >
          {loading === "hardened-fix" ? <Loader2 className="size-3.5 animate-spin" /> : <Shield className="size-3.5" />}
          Hardened Fix
        </Button>
      </div>

      {/* Optional instruction */}
      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Optional: give the copilot a specific instruction (e.g. 'add rate limiting', 'use allowlist validation')…"
        className="min-h-[2.5rem] resize-none border-zinc-800 bg-zinc-900/60 text-xs text-zinc-200 placeholder:text-zinc-600"
      />

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Explanation */}
          {result.explanation && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                <Lightbulb className="size-3" /> Copilot Analysis
              </div>
              <p className="text-xs leading-relaxed text-zinc-300">{result.explanation}</p>
            </div>
          )}

          {/* Generated code */}
          {result.code && (
            <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <Code2 className="size-3 text-emerald-400" />
                  <span className="font-mono">improved-fix.js</span>
                </div>
                <Button size="icon" variant="ghost" onClick={copyCode} className="size-6 text-zinc-500 hover:text-emerald-400">
                  {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                </Button>
              </div>
              <pre className="custom-scrollbar max-h-72 overflow-auto p-3 font-mono text-[10px] leading-relaxed text-emerald-300">
                {result.code}
              </pre>
            </div>
          )}

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Hardening Suggestions
              </div>
              <ul className="space-y-1">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-400">
                    <span className="mt-0.5 size-1 shrink-0 rounded-full bg-emerald-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Wand2 className="size-8 text-zinc-700" />
          <p className="mt-2 text-xs text-zinc-500">
            Ask the AI copilot to explain the fix, generate an improved version, or produce a hardened defense-in-depth variant.
          </p>
        </div>
      )}
    </div>
  );
}

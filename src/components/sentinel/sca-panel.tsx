"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { sentinelApi, type ScaScanResult } from "@/lib/sentinel/api";
import { Box, Loader2, Package, RefreshCw, ShieldX, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

export function ScaPanel() {
  const { toast } = useToast();
  const [result, setResult] = useState<ScaScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    try { setResult(await sentinelApi.scaScan()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scanAll = async () => {
    setScanning(true);
    try {
      const codebases = result?.codebases || [];
      const allVulns: ScaScanResult[] = [];
      for (const cb of codebases) {
        const r = await sentinelApi.scaScan(cb.codebase_id);
        allVulns.push(r);
      }
      if (allVulns.length > 0) {
        setResult(allVulns[0]);
        toast({ title: "SCA scan complete", description: `${allVulns.reduce((s, r) => s + (r.vulnerabilities_found || 0), 0)} vulnerabilities found across dependencies.` });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "SCA scan failed", description: err instanceof Error ? err.message : "unknown" });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
          Dependency / SCA Scanner
        </span>
        <div className="flex items-center gap-2">
          {result?.vulnerabilities_found ? (
            <Badge className="border border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
              {result.vulnerabilities_found} vulns
            </Badge>
          ) : null}
          <Button size="icon" variant="ghost" onClick={scanAll} disabled={scanning} className="size-6 text-zinc-500 hover:text-amber-400">
            {scanning ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 bg-amber-500/10" />)}</div>
      ) : !result || (result.vulnerabilities?.length === 0 && !result.codebases?.length) ? (
        <div className="flex items-center justify-center py-6 text-xs text-zinc-500">
          <CheckCircle2 className="mr-2 size-4 text-emerald-400" /> No vulnerable dependencies detected.
        </div>
      ) : result.vulnerabilities && result.vulnerabilities.length > 0 ? (
        <>
          {/* SCA score */}
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
            <div className="font-mono text-2xl font-bold" style={{ color: (result.sca_score || 100) >= 80 ? "#10b981" : (result.sca_score || 100) >= 50 ? "#f59e0b" : "#ef4444" }}>
              {result.sca_score ?? 100}
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase text-zinc-500">SCA Score — {result.codebase}</div>
              <div className="text-[9px] text-zinc-600">{result.total_dependencies} deps · {result.scanned_dependencies} scanned</div>
            </div>
            {(result.critical || 0) > 0 && <Badge className="border border-red-500/40 bg-red-500/10 text-[8px] text-red-300">{result.critical} CRITICAL</Badge>}
            {(result.high || 0) > 0 && <Badge className="border border-orange-500/40 bg-orange-500/10 text-[8px] text-orange-300">{result.high} HIGH</Badge>}
          </div>

          {/* Vulnerability list */}
          <div className="custom-scrollbar max-h-48 space-y-1.5 overflow-y-auto">
            {result.vulnerabilities.map((v, i) => (
              <a key={i} href={v.url} target="_blank" rel="noopener noreferrer"
                className={`block rounded-lg border p-2 transition-colors ${
                  v.severity === "critical" ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10" :
                  v.severity === "high" ? "border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10" :
                  "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
                }`}>
                <div className="flex items-center gap-2">
                  <Package className={`size-3 shrink-0 ${v.severity === "critical" ? "text-red-400" : "text-orange-400"}`} />
                  <span className="font-mono text-[10px] text-zinc-300">{v.dependency}</span>
                  {v.cve && <Badge className="border border-red-500/40 bg-red-500/10 text-[8px] text-red-300">{v.cve}</Badge>}
                  {v.fixed_in && <span className="text-[8px] text-emerald-400">fix: v{v.fixed_in}</span>}
                  <ExternalLink className="ml-auto size-2.5 text-zinc-600" />
                </div>
                <p className="mt-0.5 line-clamp-1 text-[9px] text-zinc-500">{v.title}</p>
              </a>
            ))}
          </div>
        </>
      ) : result.codebases && result.codebases.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[10px] text-zinc-500">{result.codebases.length} codebases with dependencies. Click scan to check for CVEs.</div>
          {result.codebases.map((cb) => (
            <div key={cb.codebase_id} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
              <Box className="size-3 text-sky-400" />
              <span className="text-[10px] text-zinc-300">{cb.codebase_name}</span>
              <span className="ml-auto text-[9px] text-zinc-500">{cb.dependencies.length} deps</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

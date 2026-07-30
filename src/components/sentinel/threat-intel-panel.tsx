"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { sentinelApi, type ThreatIntel } from "@/lib/sentinel/api";
import { Globe, Loader2, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";

export function ThreatIntelPanel() {
  const [intel, setIntel] = useState<ThreatIntel | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    sentinelApi.threatIntel().then(setIntel).catch(() => null).finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">
          Threat Intel Feed
        </span>
        <div className="flex items-center gap-2">
          {intel && intel.high_relevance > 0 && (
            <Badge className="border border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
              {intel.high_relevance} high relevance
            </Badge>
          )}
          <Button size="icon" variant="ghost" onClick={load} disabled={loading} className="size-6 text-zinc-500 hover:text-emerald-400">
            {loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-emerald-500/10" />)}
        </div>
      ) : !intel || intel.threats.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-xs text-zinc-500">
          <Globe className="mr-2 size-4 text-zinc-600" /> No recent threats detected.
        </div>
      ) : (
        <div className="custom-scrollbar max-h-64 space-y-2 overflow-y-auto">
          {intel.threats.slice(0, 8).map((t, i) => (
            <a
              key={i}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`block rounded-lg border p-2.5 transition-colors ${
                t.relevance === "high"
                  ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
                  : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-start gap-2">
                {t.relevance === "high" && <AlertTriangle className="mt-0.5 size-3 shrink-0 text-red-400" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {t.cve && (
                      <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
                        {t.cve}
                      </Badge>
                    )}
                    {t.related_codebases.length > 0 && (
                      <span className="text-[9px] font-medium text-red-400">
                        ⚠ {t.related_codebases.join(", ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-300">{t.title}</p>
                  <p className="mt-0.5 truncate text-[9px] text-zinc-600">{t.source} · {t.date}</p>
                </div>
                <ExternalLink className="size-3 shrink-0 text-zinc-600" />
              </div>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

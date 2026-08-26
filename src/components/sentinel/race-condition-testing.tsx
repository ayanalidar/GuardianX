"use client";

import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Zap,
  Crosshair,
  Activity,
  AlertTriangle,
  ShieldCheck,
  ShieldX,
  Loader2,
  Flame,
  Clock,
  CheckCircle2,
  Gauge,
  Target,
  RotateCw,
  CircleAlert,
} from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";

// ── Types (mirror the API response shape) ────────────────────────────────────

interface TimelinePoint {
  index: number;
  durationMs: number;
  status: number;
  testName: string;
}

interface RaceTestResult {
  name: string;
  cwe: string;
  concurrency: number;
  fired: number;
  succeeded: number;
  failed: number;
  blocked: number;
  detected: boolean;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
  threshold: string;
  timeline: TimelinePoint[];
}

interface FindingSummary {
  id: string;
  title: string;
  severity: string;
  category: string;
  cwe: string;
  endpoint: string;
  method: string;
}

interface RaceResult {
  engagementId: string;
  testsRun: number;
  raceConditionsFound: number;
  findings: FindingSummary[];
  tests: RaceTestResult[];
  distribution: { ok: number; "4xx": number; "5xx": number; timeout: number };
  totalFired: number;
  totalSucceeded: number;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

// ── Style maps (amber / red accents — no indigo/blue) ────────────────────────

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-red-500/50 bg-red-500/15 text-red-300",
  high: "border-orange-500/50 bg-orange-500/15 text-orange-300",
  medium: "border-amber-500/50 bg-amber-500/15 text-amber-300",
  low: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  info: "border-zinc-700 bg-zinc-800/40 text-zinc-400",
};

const DISTRO_COLORS: Record<string, string> = {
  ok: "#10b981", // emerald
  "4xx": "#f59e0b", // amber
  "5xx": "#ef4444", // red
  timeout: "#71717a", // zinc
};

const TEST_COLORS: Record<string, string> = {
  "Double-Spend Test": "#ef4444",
  "Duplicate Submission": "#f97316",
  "Concurrent Balance Deduction": "#dc2626",
  "Rate-Limit Race": "#f59e0b",
  "Coupon Abuse": "#fb923c",
};

// ── Component ────────────────────────────────────────────────────────────────

export function RaceConditionTesting() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("");
  const [method, setMethod] = useState<HttpMethod>("POST");
  const [reqBody, setReqBody] = useState(
    '{\n  "amount": 100,\n  "accountId": "demo",\n  "transactionId": "tx-001"\n}'
  );
  const [headersText, setHeadersText] = useState(
    "Authorization: Bearer demo-token\nContent-Type: application/json"
  );
  const [concurrency, setConcurrency] = useState(50);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({
    fired: 0,
    completed: 0,
    successful: 0,
  });
  const [result, setResult] = useState<RaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canFire = useMemo(
    () => targetUrl.trim().length > 0 && !running,
    [targetUrl, running]
  );

  const fire = useCallback(async () => {
    if (!targetUrl.trim()) {
      toast({
        title: "Target URL required",
        description: "Enter a target URL before firing concurrent requests.",
        variant: "destructive",
      });
      return;
    }

    // Parse headers
    const headers: Record<string, string> = {};
    for (const line of headersText.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) headers[key] = val;
    }

    setRunning(true);
    setError(null);
    setResult(null);
    setProgress({ fired: 0, completed: 0, successful: 0 });

    // Optimistic live counter — animate toward expected concurrency totals
    const expectedTotal = concurrency * 5; // 5 tests
    let fired = 0;
    const counter = setInterval(() => {
      fired = Math.min(expectedTotal, fired + Math.ceil(expectedTotal / 30));
      setProgress({
        fired,
        completed: Math.floor(fired * 0.85),
        successful: Math.floor(fired * 0.5),
      });
    }, 100);

    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("guardianx-token")
          : null;
      const res = await fetch("/api/vapt/race-condition", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          targetUrl: targetUrl.trim(),
          method,
          body: reqBody,
          headers,
          concurrency,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as RaceResult & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      setResult(data);
      setProgress({
        fired: data.totalFired,
        completed: data.totalFired,
        successful: data.totalSucceeded,
      });

      toast({
        title: "Race-condition scan complete",
        description: `${data.testsRun} tests run · ${data.raceConditionsFound} race condition(s) detected.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast({
        title: "Race-condition scan failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      clearInterval(counter);
      setRunning(false);
    }
  }, [targetUrl, method, reqBody, headersText, concurrency, toast]);

  // ── Derived chart data ──────────────────────────────────────────────────

  const timelineData = useMemo(() => {
    if (!result) return [] as { name: string; data: TimelinePoint[] }[];
    return result.tests.map((t) => ({ name: t.name, data: t.timeline }));
  }, [result]);

  const pieData = useMemo(() => {
    if (!result) return [] as { name: string; value: number }[];
    return [
      { name: "200 OK", value: result.distribution.ok },
      { name: "4xx", value: result.distribution["4xx"] },
      { name: "5xx", value: result.distribution["5xx"] },
      { name: "Timeout", value: result.distribution.timeout },
    ].filter((d) => d.value > 0);
  }, [result]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="hud-corners border-b border-amber-500/20 bg-gradient-to-r from-amber-950/30 via-zinc-950 to-red-950/30 px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex size-11 items-center justify-center rounded-md border border-amber-500/40 bg-amber-500/10">
              <Zap className="size-5 text-amber-400" />
              <span className="absolute inset-0 animate-ping rounded-md border border-amber-400/30" />
            </div>
            <div>
              <h1 className="font-mono text-base font-bold tracking-[0.2em] text-amber-300 sm:text-lg">
                RACE CONDITION TESTING
              </h1>
              <p className="text-[11px] text-zinc-500 sm:text-xs">
                Concurrent request firing · TOCTOU · Double-spend · Duplicate
                submission
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/5 font-mono text-[10px] text-amber-300"
            >
              <Crosshair className="size-2.5" />
              CWE-362
            </Badge>
            <Badge
              variant="outline"
              className="border-red-500/30 bg-red-500/5 font-mono text-[10px] text-red-300"
            >
              <Flame className="size-2.5" />
              CWE-770
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* ── Input form ──────────────────────────────────────────────────────── */}
        <section className="hud-corners rounded-md border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Target className="size-4 text-amber-400" />
            <h2 className="text-sm font-semibold tracking-wide text-zinc-200">
              TARGET CONFIGURATION
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* URL */}
            <div className="lg:col-span-2">
              <Label
                htmlFor="target-url"
                className="mb-1.5 block text-xs font-medium text-zinc-400"
              >
                Target URL <span className="text-red-400">*</span>
              </Label>
              <Input
                id="target-url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://target.example.com/api/transfer"
                className="border-zinc-700 bg-zinc-950 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
              />
            </div>

            {/* Method */}
            <div>
              <Label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Method
              </Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as HttpMethod)}
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-950 font-mono text-xs text-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-950">
                  {(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as HttpMethod[]).map(
                    (m) => (
                      <SelectItem
                        key={m}
                        value={m}
                        className="font-mono text-xs text-zinc-200 focus:bg-amber-500/10 focus:text-amber-300"
                      >
                        {m}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Body */}
            <div className="md:col-span-2">
              <Label
                htmlFor="req-body"
                className="mb-1.5 block text-xs font-medium text-zinc-400"
              >
                Request Body (JSON)
              </Label>
              <Textarea
                id="req-body"
                value={reqBody}
                onChange={(e) => setReqBody(e.target.value)}
                placeholder="{}"
                rows={5}
                className="custom-scrollbar border-zinc-700 bg-zinc-950 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
              />
            </div>

            {/* Headers */}
            <div>
              <Label
                htmlFor="headers"
                className="mb-1.5 block text-xs font-medium text-zinc-400"
              >
                Headers (one per line)
              </Label>
              <Textarea
                id="headers"
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                placeholder="Authorization: Bearer ..."
                rows={5}
                className="custom-scrollbar border-zinc-700 bg-zinc-950 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
              />
            </div>
          </div>

          {/* Concurrency slider */}
          <div className="mt-5 rounded-md border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                <Gauge className="size-3.5 text-amber-400" />
                Concurrency
              </Label>
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 font-mono text-xs text-amber-300"
              >
                {concurrency} requests
              </Badge>
            </div>
            <Slider
              value={[concurrency]}
              onValueChange={(v) => setConcurrency(v[0] ?? 50)}
              min={10}
              max={200}
              step={5}
              className="[&_[role=slider]]:border-amber-400 [&_[role=slider]]:bg-amber-500 [&_[role=slider]]:ring-amber-500/30"
            />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-zinc-600">
              <span>10</span>
              <span>50</span>
              <span>100</span>
              <span>200</span>
            </div>
          </div>

          {/* Fire button */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-zinc-500">
              Fires {concurrency * 5} total requests across 5 race-condition
              tests. SSRF-guarded. 10s per-request timeout.
            </p>
            <Button
              onClick={fire}
              disabled={!canFire}
              className="group relative overflow-hidden border border-amber-500/40 bg-amber-500/10 font-mono text-xs font-bold tracking-wider text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  FIRING…
                </>
              ) : (
                <>
                  <Zap className="size-3.5" />
                  FIRE CONCURRENT REQUESTS
                </>
              )}
            </Button>
          </div>
        </section>

        {/* ── Live counter (during run) ─────────────────────────────────────── */}
        <AnimatePresence>
          {running && (
            <motion.section
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="hud-corners rounded-md border border-amber-500/30 bg-amber-950/20 p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <Activity className="size-4 animate-pulse text-amber-400" />
                <span className="font-mono text-xs font-semibold tracking-wider text-amber-300">
                  LIVE FIRE — IN PROGRESS
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <LiveStat
                  label="FIRED"
                  value={progress.fired}
                  icon={<Crosshair className="size-3.5 text-amber-400" />}
                  color="amber"
                />
                <LiveStat
                  label="COMPLETED"
                  value={progress.completed}
                  icon={<Clock className="size-3.5 text-zinc-400" />}
                  color="zinc"
                />
                <LiveStat
                  label="SUCCESSFUL"
                  value={progress.successful}
                  icon={<CheckCircle2 className="size-3.5 text-emerald-400" />}
                  color="emerald"
                />
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Error ─────────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {error && !running && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-400" />
              <div>
                <span className="font-semibold text-red-300">Scan failed:</span>{" "}
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results ────────────────────────────────────────────────────────── */}
        {result && !running && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Big number tiles */}
            <section className="grid gap-3 sm:grid-cols-3">
              <BigTile
                label="REQUESTS FIRED"
                value={result.totalFired}
                icon={<Crosshair className="size-5 text-amber-400" />}
                accent="amber"
              />
              <BigTile
                label="SUCCESSFUL RESPONSES"
                value={result.totalSucceeded}
                icon={<CheckCircle2 className="size-5 text-emerald-400" />}
                accent="emerald"
              />
              <BigTile
                label="RACE CONDITIONS DETECTED"
                value={result.raceConditionsFound}
                icon={
                  result.raceConditionsFound > 0 ? (
                    <ShieldX className="size-5 text-red-400" />
                  ) : (
                    <ShieldCheck className="size-5 text-emerald-400" />
                  )
                }
                accent={result.raceConditionsFound > 0 ? "red" : "emerald"}
              />
            </section>

            {/* Timeline scatter chart */}
            <section className="hud-corners rounded-md border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Activity className="size-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-200">
                  Response Time Timeline
                </h3>
                <Badge
                  variant="outline"
                  className="ml-auto border-zinc-700 bg-zinc-900 font-mono text-[10px] text-zinc-400"
                >
                  {timelineData.reduce((a, t) => a + t.data.length, 0)} samples
                </Badge>
              </div>
              <div className="h-64 w-full sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart
                    margin={{ top: 10, right: 20, bottom: 25, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#27272a"
                      strokeOpacity={0.4}
                    />
                    <XAxis
                      type="number"
                      dataKey="index"
                      name="Request #"
                      stroke="#52525b"
                      tick={{ fill: "#71717a", fontSize: 10, fontFamily: "monospace" }}
                      label={{
                        value: "Request Index",
                        position: "insideBottom",
                        offset: -15,
                        fill: "#71717a",
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="durationMs"
                      name="Latency (ms)"
                      stroke="#52525b"
                      tick={{ fill: "#71717a", fontSize: 10, fontFamily: "monospace" }}
                      label={{
                        value: "Latency (ms)",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#71717a",
                        fontSize: 11,
                      }}
                    />
                    <ZAxis range={[60, 60]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3", stroke: "#f59e0b" }}
                      contentStyle={{
                        background: "#0a0a0a",
                        border: "1px solid #3f3f46",
                        borderRadius: "4px",
                        fontSize: "11px",
                        color: "#e4e4e7",
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === "Latency (ms)") return [`${value} ms`, name];
                        return [value, name];
                      }}
                    />
                    <ReferenceLine y={10000} stroke="#ef4444" strokeDasharray="4 4">
                    </ReferenceLine>
                    {timelineData.map((series) => (
                      <Scatter
                        key={series.name}
                        name={series.name}
                        data={series.data}
                        fill={TEST_COLORS[series.name] || "#f59e0b"}
                        fillOpacity={0.7}
                      />
                    ))}
                    <Legend
                      wrapperStyle={{
                        fontSize: "10px",
                        color: "#a1a1aa",
                        fontFamily: "monospace",
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[10px] text-zinc-500">
                Red dashed line = 10s timeout threshold. Points clustered near
                the bottom indicate fast (cached / rejected) responses; spread
                vertically indicates contention.
              </p>
            </section>

            {/* Findings table + pie chart side by side */}
            <section className="grid gap-4 lg:grid-cols-3">
              {/* Findings table */}
              <div className="hud-corners rounded-md border border-zinc-800 bg-zinc-900/40 p-4 lg:col-span-2 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Race-Condition Test Results
                  </h3>
                  <Badge
                    variant="outline"
                    className="ml-auto border-zinc-700 bg-zinc-900 font-mono text-[10px] text-zinc-400"
                  >
                    {result.tests.length} tests
                  </Badge>
                </div>
                <div className="custom-scrollbar max-h-96 overflow-auto rounded border border-zinc-800">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 bg-zinc-950/60 hover:bg-zinc-950/60">
                        <TableHead className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                          Test
                        </TableHead>
                        <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                          Concurrency
                        </TableHead>
                        <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                          Successes
                        </TableHead>
                        <TableHead className="text-center font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                          Detected
                        </TableHead>
                        <TableHead className="text-center font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                          Severity
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.tests.map((t) => (
                        <TableRow
                          key={t.name}
                          className="border-zinc-800/80 hover:bg-zinc-800/30"
                        >
                          <TableCell className="py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs font-semibold text-zinc-200">
                                {t.name}
                              </span>
                              <span className="font-mono text-[10px] text-zinc-600">
                                {t.cwe} · {t.description}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-zinc-300">
                            {t.concurrency}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span
                              className={
                                t.succeeded > 1 && t.detected
                                  ? "text-red-400"
                                  : "text-zinc-300"
                              }
                            >
                              {t.succeeded}
                            </span>
                            <span className="text-zinc-600">/{t.fired}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            {t.detected ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-red-300">
                                <ShieldX className="size-3" />
                                YES
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-300">
                                <ShieldCheck className="size-3" />
                                NO
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`font-mono text-[10px] uppercase ${SEVERITY_STYLE[t.severity]}`}
                            >
                              {t.severity}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Pie chart */}
              <div className="hud-corners rounded-md border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Gauge className="size-4 text-amber-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Response Distribution
                  </h3>
                </div>
                {pieData.length > 0 ? (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          innerRadius={36}
                          stroke="#0a0a0a"
                          strokeWidth={2}
                        >
                          {pieData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={DISTRO_COLORS[entry.name] || "#71717a"}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#0a0a0a",
                            border: "1px solid #3f3f46",
                            borderRadius: "4px",
                            fontSize: "11px",
                            color: "#e4e4e7",
                          }}
                        />
                        <Legend
                          wrapperStyle={{
                            fontSize: "10px",
                            color: "#a1a1aa",
                            fontFamily: "monospace",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center text-xs text-zinc-600">
                    No response data
                  </div>
                )}
              </div>
            </section>

            {/* Findings detail list */}
            {result.findings.length > 0 && (
              <section className="hud-corners rounded-md border border-red-500/30 bg-red-950/10 p-4 sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Flame className="size-4 text-red-400" />
                  <h3 className="text-sm font-semibold text-red-300">
                    Confirmed Findings ({result.findings.length})
                  </h3>
                </div>
                <ul className="space-y-2">
                  {result.findings.map((f) => (
                    <li
                      key={f.id}
                      className="flex flex-col gap-1 rounded border border-zinc-800 bg-zinc-950/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs font-semibold text-zinc-200">
                          {f.title}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-600">
                          {f.method} {f.endpoint.replace(/\?.*$/, "")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] uppercase ${SEVERITY_STYLE[f.severity]}`}
                        >
                          {f.severity}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-zinc-700 bg-zinc-900 font-mono text-[10px] text-zinc-400"
                        >
                          {f.cwe}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <RotateCw className="size-3" />
                  Engagement{" "}
                  <span className="font-mono text-zinc-400">
                    {result.engagementId}
                  </span>{" "}
                  saved — review findings in the RedAgent VAPT tab.
                </p>
              </section>
            )}

            {/* All clear message */}
            {result.raceConditionsFound === 0 && (
              <section className="hud-corners flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-950/10 p-4 sm:p-6">
                <ShieldCheck className="size-5 shrink-0 text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-emerald-300">
                    No race conditions detected
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    The endpoint properly serializes concurrent access. All
                    tests passed without TOCTOU vulnerabilities.
                  </p>
                </div>
              </section>
            )}
          </motion.div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {!result && !running && !error && (
          <section className="hud-corners flex flex-col items-center justify-center rounded-md border border-dashed border-zinc-800 bg-zinc-900/20 px-6 py-16 text-center">
            <div className="relative mb-3">
              <Zap className="size-10 text-zinc-700" />
              <span className="absolute -right-1 -top-1 flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400/40" />
                <span className="relative inline-flex size-3 rounded-full bg-amber-500" />
              </span>
            </div>
            <p className="text-sm font-semibold text-zinc-300">
              Ready to fire concurrent requests
            </p>
            <p className="mt-1 max-w-md text-xs text-zinc-500">
              Configure your target endpoint above, then click{" "}
              <span className="font-mono text-amber-400">FIRE</span> to send
              concurrent requests across 5 race-condition test scenarios:
              double-spend, duplicate submission, balance deduction, rate-limit
              race, and coupon abuse.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {[
                "Double-Spend (CWE-362)",
                "Duplicate Submission",
                "Balance Deduction",
                "Rate-Limit (CWE-770)",
                "Coupon Abuse",
              ].map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="border-zinc-700 bg-zinc-900 font-mono text-[10px] text-zinc-400"
                >
                  {t}
                </Badge>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function BigTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: "amber" | "emerald" | "red";
}) {
  const accentBorder =
    accent === "amber"
      ? "border-amber-500/30"
      : accent === "emerald"
        ? "border-emerald-500/30"
        : "border-red-500/30";
  const accentBg =
    accent === "amber"
      ? "bg-amber-950/20"
      : accent === "emerald"
        ? "bg-emerald-950/20"
        : "bg-red-950/20";
  const valueColor =
    accent === "amber"
      ? "text-amber-300"
      : accent === "emerald"
        ? "text-emerald-300"
        : "text-red-300";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`hud-corners relative overflow-hidden rounded-md border ${accentBorder} ${accentBg} p-5`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        {icon}
      </div>
      <div
        className={`font-mono text-3xl font-bold tabular-nums sm:text-4xl ${valueColor}`}
      >
        {value.toLocaleString()}
      </div>
    </motion.div>
  );
}

function LiveStat({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "amber" | "emerald" | "zinc";
}) {
  const textColor =
    color === "amber"
      ? "text-amber-300"
      : color === "emerald"
        ? "text-emerald-300"
        : "text-zinc-300";
  return (
    <div className="rounded border border-zinc-800/60 bg-zinc-950/60 p-3 text-center">
      <div className="mb-1 flex items-center justify-center gap-1.5">
        {icon}
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      </div>
      <div
        className={`font-mono text-2xl font-bold tabular-nums ${textColor}`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

"use client";

// GuardianX — Deepfake Phishing Simulator
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen admin tab. Sends deepfake-style phishing simulations to
// employees: the target receives an email linking to /phishing/sim?id=...
// which plays a TTS audio of the phishing message (CEO impersonation) using
// the Web Speech API. The simulator tracks who clicked + who trained.
//
// Layout:
//   1. Summary tiles: simulations sent · click rate · trained
//   2. Create-simulation form: target email/name + persona + message
//   3. Click-rate donut chart (sent / clicked / trained / dismissed)
//   4. Campaigns table: target · persona · sent · clicked · trained · status
//
// Dark theme, red/amber accents, hud-corners. No indigo/blue.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  Send,
  Target,
  TrendingUp,
  Users,
  VenetianMask,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────
interface SimRow {
  id: string;
  targetEmail: string;
  targetName: string;
  personaName: string;
  personaRole: string;
  message: string;
  sentAt: string;
  clickedAt: string | null;
  clicked: boolean;
  trainedAt: string | null;
  status: string;
  campaignId: string | null;
}

interface ListResponse {
  sims: SimRow[];
  totalSent: number;
  totalClicked: number;
  totalTrained: number;
  clickRate: number;
  trainedRate: number;
}

interface SendResponse {
  ok: boolean;
  simulationId: string;
  sent?: boolean;
  skipped?: boolean;
  simLink?: string;
  error?: string;
}

// ── Persona presets ────────────────────────────────────────────────────────
const PERSONAS = [
  {
    name: "Ayan Ali",
    role: "Founder & CEO",
    message:
      "Hi {name}, it's Ayan. I'm in a board meeting and need you to action an urgent wire transfer of ₹47 lakhs to close the Series B escrow today. Please don't Slack me — I'll explain after. Just process it now and confirm by reply email.",
  },
  {
    name: "Priya Menon",
    role: "Chief Financial Officer",
    message:
      "Hi {name}, Priya here. I need you to send a one-time payment of ₹12 lakhs to vendor HDFC-9321 before close of business. The CEO approved it verbally — just process and send me the confirmation. Don't loop in accounting, it's time-sensitive.",
  },
  {
    name: "Rahul Iyer",
    role: "Chief Technology Officer",
    message:
      "Hi {name}, it's Rahul. I need the production AWS root keys texted to my personal number +91-98xxx-xxxxx right away — there's a P0 incident and I can't access my YubiKey. Don't log this in the secrets vault yet, I'll do it once we're back up.",
  },
  {
    name: "Meera Nair",
    role: "Chief Operating Officer",
    message:
      "Hi {name}, Meera here. I need you to buy 50 Apple gift cards of ₹10,000 each for client onboarding gifts. Send me the redemption codes scanned to my personal email — meera.nair.personal@gmail.com. The procurement system is down so just expense it on your corporate card.",
  },
] as const;

function getToken(): string | null {
  return typeof window !== "undefined"
    ? localStorage.getItem("guardianx-token")
    : null;
}

// ── Component ────────────────────────────────────────────────────────────────
export function DeepfakeSimulator() {
  const { toast } = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Form state
  const [targetEmail, setTargetEmail] = useState("");
  const [targetName, setTargetName] = useState("");
  const [personaIdx, setPersonaIdx] = useState<string>("0");
  const [message, setMessage] = useState("");

  const persona = PERSONAS[parseInt(personaIdx, 10) % PERSONAS.length];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/deepfake-phishing/list", {
        headers: {
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
      });
      const json = (await res.json().catch(() => ({}))) as
        | ListResponse
        | { error?: string };
      if (res.ok && (json as ListResponse).sims) {
        setData(json as ListResponse);
      }
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  const onPersonaChange = (val: string) => {
    setPersonaIdx(val);
    const p = PERSONAS[parseInt(val, 10)];
    if (!message || message === PERSONAS[0].message || PERSONAS.some((pp) => pp.message === message)) {
      // Auto-fill message from persona template if user hasn't customized.
      setMessage(p.message.replace("{name}", targetName || "there"));
    }
  };

  const onTargetNameChange = (val: string) => {
    setTargetName(val);
    // Re-template the message with the new name if it still contains the placeholder.
    if (message.includes("{name}") || PERSONAS.some((p) => p.message === message)) {
      setMessage(persona.message.replace("{name}", val || "there"));
    }
  };

  const send = useCallback(async () => {
    if (!targetEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail.trim())) {
      toast({
        variant: "destructive",
        title: "Invalid email",
        description: "Enter a valid target email address.",
      });
      return;
    }
    if (!targetName.trim()) {
      toast({
        variant: "destructive",
        title: "Name required",
        description: "Enter the target's name (used in the message).",
      });
      return;
    }
    if (message.trim().length < 8) {
      toast({
        variant: "destructive",
        title: "Message too short",
        description: "The phishing message should be at least 8 characters.",
      });
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/deepfake-phishing/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({
          targetEmail: targetEmail.trim(),
          targetName: targetName.trim(),
          personaName: persona.name,
          personaRole: persona.role,
          message: message.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as SendResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Send failed (${res.status})`);
      }
      toast({
        title: json.skipped ? "Simulation queued (SMTP skipped)" : "Simulation sent",
        description: json.skipped
          ? "SMTP not configured — share the sim link manually for testing."
          : `Deepfake phishing email dispatched to ${targetEmail}.`,
      });
      // Reset the form (keep target blank so it can't be re-sent accidentally).
      setTargetEmail("");
      setTargetName("");
      setMessage("");
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Send failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSending(false);
    }
  }, [targetEmail, targetName, message, persona, toast, load]);

  // Donut chart data
  const donutData = useMemo(() => {
    if (!data) return [];
    const clicked = data.totalClicked;
    const trained = data.totalTrained;
    const dismissed = data.totalSent - clicked;
    return [
      { name: "Clicked (not trained)", value: Math.max(0, clicked - trained), color: "#dc2626" },
      { name: "Trained", value: trained, color: "#10b981" },
      { name: "Not clicked", value: Math.max(0, dismissed), color: "#52525b" },
    ].filter((d) => d.value > 0);
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return { sent: 0, clicked: 0, trained: 0, clickRate: 0, trainedRate: 0 };
    return {
      sent: data.totalSent,
      clicked: data.totalClicked,
      trained: data.totalTrained,
      clickRate: data.clickRate,
      trainedRate: data.trainedRate,
    };
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-rose-400/70">
          <span className="size-1.5 rounded-full bg-rose-500 pulse-dot" />
          guardianx@deepfake-sim:~$
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50 neon-emerald">
          <VenetianMask className="size-5 text-rose-400" />
          Deepfake Phishing Simulator
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Send CEO-impersonation phishing simulations. Track who clicks, who
          completes training. Defends against the fastest-growing attack vector
          of 2026 — AI-cloned voice fraud.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Simulations Sent"
          value={stats.sent}
          icon={<Send className="size-4 text-rose-400" />}
          tone="rose"
        />
        <StatCard
          label="Click Rate"
          value={`${stats.clickRate}%`}
          icon={<TrendingUp className="size-4 text-amber-400" />}
          tone={stats.clickRate > 30 ? "critical" : stats.clickRate > 0 ? "amber" : "emerald"}
        />
        <StatCard
          label="Clicked"
          value={stats.clicked}
          icon={<Target className="size-4 text-rose-400" />}
          tone={stats.clicked > 0 ? "rose" : "zinc"}
        />
        <StatCard
          label="Trained"
          value={`${stats.trainedRate}%`}
          icon={<CheckCircle2 className="size-4 text-emerald-400" />}
          tone="emerald"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Create form */}
        <Card className="holo-card hud-corners gap-0 rounded-xl p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-rose-400/70">
              Create Simulation
            </span>
            <Badge className="border border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">
              CEO impersonation
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-zinc-400">Target Email</Label>
                <Input
                  type="email"
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  placeholder="employee@yourcompany.com"
                  disabled={sending}
                  className="mt-1 border-zinc-700 bg-zinc-900/60 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Target Name</Label>
                <Input
                  value={targetName}
                  onChange={(e) => onTargetNameChange(e.target.value)}
                  placeholder="Jordan Singh"
                  disabled={sending}
                  className="mt-1 border-zinc-700 bg-zinc-900/60 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-zinc-400">Persona (deepfake identity)</Label>
              <Select value={personaIdx} onValueChange={onPersonaChange} disabled={sending}>
                <SelectTrigger className="mt-1 border-zinc-700 bg-zinc-900/60 font-mono text-sm text-zinc-100">
                  <SelectValue placeholder="Select a persona" />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-100">
                  {PERSONAS.map((p, i) => (
                    <SelectItem key={i} value={String(i)} className="font-mono text-xs">
                      {p.name} — {p.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-zinc-400">Phishing Message (will be spoken by TTS)</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={persona.message}
                rows={5}
                disabled={sending}
                className="mt-1 border-zinc-700 bg-zinc-900/60 font-mono text-xs text-zinc-100 placeholder:text-zinc-600"
              />
              <p className="mt-1 text-[10px] text-zinc-500">
                Use <code className="text-rose-400">{`{name}`}</code> for the target's name. The message
                will be synthesized via the Web Speech API when the target opens the sim link.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                onClick={send}
                disabled={sending}
                className="border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 hover:text-rose-100"
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Send Simulation
              </Button>
              <span className="font-mono text-[10px] text-zinc-500">
                an email will be dispatched with a link to /phishing/sim?id=...
              </span>
            </div>
          </div>
        </Card>

        {/* Donut chart */}
        <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400/70">
            Click-Rate Breakdown
          </span>
          {loading ? (
            <div className="mt-4 flex h-48 items-center justify-center">
              <Loader2 className="size-8 animate-spin text-amber-400" />
            </div>
          ) : donutData.length === 0 ? (
            <div className="mt-4 flex h-48 flex-col items-center justify-center text-center">
              <Target className="size-10 text-zinc-700" />
              <p className="mt-2 text-xs text-zinc-500">No simulations sent yet.</p>
            </div>
          ) : (
            <>
              <div className="relative mt-3 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={3}
                      stroke="rgba(0,0,0,0.4)"
                      strokeWidth={1}
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "rgba(9,9,11,0.95)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        fontSize: 11,
                        color: "#e4e4e7",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-2xl font-bold text-rose-400">
                    {stats.clickRate}%
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                    click rate
                  </span>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {donutData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span
                      className="size-2 rounded-sm"
                      style={{ background: d.color }}
                    />
                    <span className="text-zinc-400">{d.name}</span>
                    <span className="ml-auto font-mono font-bold text-zinc-200">
                      {d.value}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Campaigns table */}
      <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            Campaigns · {data?.sims.length ?? 0} simulations
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <Loader2 className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading && (!data || data.sims.length === 0) ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-800/40" />
            ))}
          </div>
        ) : !data || data.sims.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Mail className="size-10 text-zinc-700" />
            <p className="mt-2 text-xs text-zinc-500">
              No simulations yet. Send one using the form above.
            </p>
          </div>
        ) : (
          <div className="custom-scrollbar max-h-[28rem] overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead className="sticky top-0 bg-zinc-900/95 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Target</th>
                  <th className="px-2 py-2">Persona</th>
                  <th className="px-2 py-2">Sent</th>
                  <th className="px-2 py-2">Clicked</th>
                  <th className="px-2 py-2">Trained</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="text-[11px] text-zinc-300">
                <AnimatePresence>
                  {data.sims.map((s, i) => (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="border-t border-zinc-800/60 hover:bg-zinc-800/30"
                    >
                      <td className="px-2 py-2">
                        <div className="font-medium text-zinc-200">{s.targetName}</div>
                        <div className="font-mono text-[9px] text-zinc-500">{s.targetEmail}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-rose-200">{s.personaName}</div>
                        <div className="text-[9px] text-zinc-500">{s.personaRole}</div>
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] text-zinc-400">
                        <div className="flex items-center gap-1">
                          <Clock className="size-2.5 text-zinc-600" />
                          {new Date(s.sentAt).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {s.clicked ? (
                          <div className="flex items-center gap-1 font-mono text-[10px] text-rose-400">
                            <XCircle className="size-3" />
                            {s.clickedAt ? new Date(s.clickedAt).toLocaleString() : "yes"}
                          </div>
                        ) : (
                          <span className="font-mono text-[10px] text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {s.status === "trained" ? (
                          <div className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                            <CheckCircle2 className="size-3" />
                            {s.trainedAt ? new Date(s.trainedAt).toLocaleString() : "trained"}
                          </div>
                        ) : (
                          <span className="font-mono text-[10px] text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={s.status} clicked={s.clicked} />
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "rose" | "amber" | "critical" | "emerald" | "zinc";
}) {
  const toneClasses: Record<typeof tone, string> = {
    rose: "border-rose-500/40 text-rose-400",
    amber: "border-amber-500/40 text-amber-400",
    critical: "border-rose-500/60 text-rose-500",
    emerald: "border-emerald-500/40 text-emerald-400",
    zinc: "border-zinc-700 text-zinc-400",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`holo-card hud-corners rounded-xl border bg-zinc-900/40 p-3 ${toneClasses[tone]}`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      </div>
      <div className="mt-1 font-mono text-2xl font-bold tabular-nums">{value}</div>
    </motion.div>
  );
}

function StatusBadge({ status, clicked }: { status: string; clicked: boolean }) {
  if (status === "trained") {
    return (
      <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">
        <CheckCircle2 className="mr-1 size-2.5" /> TRAINED
      </Badge>
    );
  }
  if (status === "clicked" || clicked) {
    return (
      <Badge className="border border-rose-500/40 bg-rose-500/10 text-[9px] text-rose-300">
        <XCircle className="mr-1 size-2.5" /> CLICKED
      </Badge>
    );
  }
  if (status === "dismissed") {
    return (
      <Badge className="border border-zinc-700 bg-zinc-800/40 text-[9px] text-zinc-400">
        DISMISSED
      </Badge>
    );
  }
  return (
    <Badge className="border border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">
      <Clock className="mr-1 size-2.5" /> SENT
    </Badge>
  );
}

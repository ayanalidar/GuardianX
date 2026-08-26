"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AdversarialRound } from "@/lib/sentinel/api";
import {
  Bot,
  Crosshair,
  Shield,
  ShieldCheck,
  Skull,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";

interface AdversarialArenaProps {
  rounds: AdversarialRound[];
  won: boolean;
  totalRounds: number;
}

export function AdversarialArena({ rounds, won, totalRounds }: AdversarialArenaProps) {
  if (totalRounds === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
        <Swords className="size-8 text-zinc-600" />
        <p className="mt-3 text-sm text-zinc-500">
          The adversarial arena did not run for this patch.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Verdict banner */}
      <div
        className={`flex items-center gap-3 rounded-lg border p-4 ${
          won
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-amber-500/40 bg-amber-500/10"
        }`}
      >
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
            won ? "bg-emerald-500/20" : "bg-amber-500/20"
          }`}
        >
          {won ? (
            <Trophy className="size-5 text-emerald-400" />
          ) : (
            <Shield className="size-5 text-amber-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold ${
                won ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {won ? "Defender Victory" : "Inconclusive"}
            </span>
            <Badge
              variant="outline"
              className="border-zinc-700 bg-zinc-800/50 text-[10px] text-zinc-400"
            >
              {totalRounds} round{totalRounds === 1 ? "" : "s"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            {won
              ? "The attacker could not bypass the defender's patch, the fix held against all attempts."
              : "The arena ended without a clear defender win. Review the rounds carefully before approving."}
          </p>
        </div>
      </div>

      {/* Round-by-round timeline */}
      <div className="space-y-3">
        {rounds.map((r, i) => (
          <RoundCard key={r.round} round={r} isLast={i === rounds.length - 1} />
        ))}
      </div>
    </div>
  );
}

function RoundCard({
  round,
  isLast,
}: {
  round: AdversarialRound;
  isLast: boolean;
}) {
  const attackerWon = round.outcome === "attacker-won";
  const defenderWon = round.outcome === "defender-won";
  const conceded = round.outcome === "attacker-conceded";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: round.round * 0.05 }}
    >
      <Card className="gap-0 border-zinc-800 bg-zinc-900/40 py-0">
        {/* Round header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-300">
              {round.round}
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Round {round.round}
            </span>
            {round.strategyId && (
              <Badge variant="outline" className="border-zinc-700 bg-zinc-800/40 text-[9px] text-violet-300">
                {round.strategyId}
              </Badge>
            )}
          </div>
          <OutcomeBadge outcome={round.outcome} />
        </div>

        <div className="grid divide-zinc-800 sm:grid-cols-2 sm:divide-x">
          {/* Attacker */}
          <div className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Skull className="size-3.5 text-red-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
                Attacker
              </span>
            </div>
            <div className="mb-2">
              <span className="text-xs font-medium text-zinc-300">
                {round.attackerTechnique || "no technique"}
              </span>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
              {round.attackerReasoning}
            </p>
            {round.bypassResult ? (
              <div
                className={`rounded border px-2 py-1.5 text-[11px] ${
                  round.bypassResult.success
                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                    : "border-zinc-700 bg-zinc-800/40 text-zinc-400"
                }`}
              >
                {round.bypassResult.success ? (
                  <span className="flex items-center gap-1">
                    <Crosshair className="size-3" /> Bypass confirmed -{" "}
                    {round.bypassResult.detail}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Shield className="size-3" /> Bypass did not confirm -{" "}
                    {round.bypassResult.detail}
                  </span>
                )}
              </div>
            ) : (
              <div className="rounded border border-zinc-700 bg-zinc-800/40 px-2 py-1.5 text-[11px] text-zinc-400">
                Attacker conceded, no bypass found.
              </div>
            )}
          </div>

          {/* Defender */}
          <div className="p-4">
            {round.defender ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                    Defender
                  </span>
                </div>
                <div className="mb-2">
                  <span className="text-xs font-medium text-zinc-300">
                    {round.defender.technique}
                  </span>
                </div>
                <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
                  {round.defender.reasoning}
                </p>
                {round.defenseVerification && (
                  <div className="flex flex-wrap gap-1.5">
                    <VerifyChip
                      ok={round.defenseVerification.originalBlocked}
                      label="original exploit"
                    />
                    <VerifyChip
                      ok={round.defenseVerification.bypassBlocked}
                      label="new bypass"
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[6rem] flex-col items-center justify-center gap-2 text-center">
                <Bot className="size-6 text-zinc-700" />
                <p className="text-[11px] text-zinc-600">
                  Defender did not need to act this round.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function OutcomeBadge({
  outcome,
}: {
  outcome: AdversarialRound["outcome"];
}) {
  switch (outcome) {
    case "attacker-conceded":
      return (
        <Badge className="border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
          <Trophy className="size-3" />
          Defender wins
        </Badge>
      );
    case "defender-won":
      return (
        <Badge className="border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
          <ShieldCheck className="size-3" />
          Patch held
        </Badge>
      );
    case "attacker-won":
      return (
        <Badge className="border border-red-500/40 bg-red-500/10 text-red-300">
          <Skull className="size-3" />
          Attacker won
        </Badge>
      );
    case "partial":
      return (
        <Badge className="border border-amber-500/40 bg-amber-500/10 text-amber-300">
          <Zap className="size-3" />
          Partial fix
        </Badge>
      );
    case "bypass-unconfirmed":
      return (
        <Badge className="border border-zinc-600 bg-zinc-700/40 text-zinc-300">
          Bypass unconfirmed
        </Badge>
      );
    case "inconclusive":
      return (
        <Badge className="border border-zinc-600 bg-zinc-700/40 text-zinc-300">
          Inconclusive
        </Badge>
      );
    default:
      return null;
  }
}

function VerifyChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/40 bg-red-500/10 text-red-300"
      }`}
    >
      {ok ? <ShieldCheck className="size-2.5" /> : <Skull className="size-2.5" />}
      {label} {ok ? "blocked" : "leaked"}
    </span>
  );
}

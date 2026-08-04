import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  verifyAttestationChain,
  parseAttestationData,
  type AttestationRow,
} from "@/lib/sentinel/attestation";
import { CheckCircle2, ShieldAlert, ArrowLeft, ExternalLink, Copy, FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Public attestation verification page.
// URL: /attestations/<patchId-or-internal-id>
//
// This is shareable with clients as proof of remediation. It shows:
//   • the patch details (title, severity, CWE if available, codebase, approvedAt)
//   • the cryptographic attestation (hash, prevHash, patchedCodeHash)
//   • the chain verification result (valid, chainLength, tamperedAt?)
//   • a link to download the full chain export for compliance audits

export default async function AttestationPage({ params }: PageProps) {
  const { id } = await params;

  // Resolve the patch by human-readable patchId OR internal id.
  const patch = (await db.patch.findFirst({
    where: { OR: [{ patchId: id }, { id }] },
    include: {
      codebase: { select: { name: true } },
      attestations: { orderBy: { createdAt: "asc" } },
    },
  })) as {
    id: string;
    patchId: string;
    title: string;
    severity: string;
    cve: string | null;
    affectedFile: string;
    status: string;
    approvedAt: Date | null;
    createdAt: Date;
    codebase: { name: string };
    attestations: Array<{
      id: string;
      patchId: string;
      prevHash: string;
      hash: string;
      data: string;
      createdAt: Date;
    }>;
  } | null;

  if (!patch) {
    notFound();
  }

  // Walk the entire chain (genesis → latest) to verify integrity.
  const allRows = (await db.attestation.findMany({
    orderBy: { createdAt: "asc" },
  })) as unknown as AttestationRow[];

  const verification = verifyAttestationChain(allRows);

  // Find this patch's specific link in the chain.
  const thisAttestation = patch.attestations[0] ?? null;
  const thisLink = thisAttestation
    ? verification.links.find((l) => l.attestationId === thisAttestation.id) ?? null
    : null;
  const thisData = thisAttestation ? parseAttestationData(thisAttestation.data) : null;
  const isThisPatchValid = thisLink ? thisLink.hashOk && thisLink.linkOk : false;
  const chainUpToThisValid = verification.tamperedAt === null
    || (thisAttestation && (allRows.findIndex((r) => r.patchId === thisAttestation.patchId)
        < allRows.findIndex((r) => r.patchId === verification.tamperedAt)));

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="size-3.5" />
          Back to GuardianX
        </Link>

        {/* Header */}
        <div className="mt-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <ShieldAlert className="size-4" />
            Cryptographic Patch Attestation
          </div>
          <h1 className="mt-2 text-2xl font-bold text-zinc-50 sm:text-3xl">
            {patch.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Verifiable, tamper-evident proof that this security patch was
            issued by GuardianX and has not been modified since approval.
          </p>
        </div>

        {/* Verdict banner */}
        <div
          className={`mt-6 rounded-lg border p-5 ${
            isThisPatchValid
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-red-500/30 bg-red-500/5"
          }`}
        >
          <div className="flex items-start gap-3">
            {isThisPatchValid ? (
              <CheckCircle2 className="size-6 text-emerald-400" />
            ) : (
              <ShieldAlert className="size-6 text-red-400" />
            )}
            <div className="flex-1">
              <div
                className={`text-base font-semibold ${
                  isThisPatchValid ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {isThisPatchValid
                  ? "Attestation verified — chain intact"
                  : "Attestation FAILED verification — chain tampered"}
              </div>
              <p className="mt-1 text-xs text-zinc-400">
                {isThisPatchValid
                  ? `The hash chain from genesis to this patch is intact. Recomputed hash matches the stored value, and the prevHash linkage is unbroken.`
                  : `Chain verification detected tampering. Reason: ${verification.tamperReason ?? "unknown"}.`}
              </p>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Chain Length" value={`${verification.chainLength}`} />
          <Stat
            label="Patch Status"
            value={patch.status}
            accent={patch.status === "approved" ? "text-emerald-300" : "text-amber-300"}
          />
          <Stat
            label="Severity"
            value={patch.severity}
            accent={
              patch.severity === "critical" || patch.severity === "high"
                ? "text-red-300"
                : "text-amber-300"
            }
          />
          <Stat
            label="Approved At"
            value={patch.approvedAt ? new Date(patch.approvedAt).toLocaleString() : "—"}
          />
        </div>

        {/* Patch details */}
        <Section title="Patch Details">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Detail label="Patch ID" value={patch.patchId} mono />
            <Detail label="Codebase" value={patch.codebase.name} />
            <Detail label="Affected File" value={patch.affectedFile || "—"} mono />
            <Detail label="CVE" value={patch.cve || "—"} mono />
          </dl>
        </Section>

        {/* Attestation details */}
        {thisAttestation && thisLink && (
          <Section title="Cryptographic Attestation">
            <dl className="space-y-3 text-sm">
              <HashRow label="prevHash" value={thisLink.prevHash} ok={thisLink.linkOk} />
              <HashRow label="hash (stored)" value={thisLink.hash} ok={thisLink.hashOk} />
              <HashRow label="hash (recomputed)" value={thisLink.recomputedHash} ok={thisLink.hashOk} />
              {thisData?.patchedCodeHash && (
                <HashRow label="patchedCodeHash" value={thisData.patchedCodeHash} />
              )}
              {thisData?.approvedAt && (
                <Detail label="approvedAt (timestamp)" value={thisData.approvedAt} mono />
              )}
            </dl>
            <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-[11px] text-zinc-400">
              <strong className="text-zinc-300">Hash formula:</strong>{" "}
              <code className="font-mono text-emerald-300">
                SHA-256(prevHash + patchInternalId + patchedCodeHash + approvedAtIso)
              </code>
              . Each attestation's hash depends on the previous one — modifying
              any historical patch breaks every subsequent hash in the chain.
            </div>
          </Section>
        )}

        {/* Chain table */}
        {verification.links.length > 0 && (
          <Section title={`Hash Chain (${verification.links.length} attestations)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Patch</th>
                    <th className="py-2 pr-3 font-medium">Hash (first 16)</th>
                    <th className="py-2 pr-3 font-medium">prevHash (first 16)</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {verification.links.map((link, idx) => (
                    <tr
                      key={link.attestationId}
                      className={`border-b border-zinc-900 ${
                        link.attestationId === thisAttestation?.id ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 text-zinc-500">{idx + 1}</td>
                      <td className="py-2 pr-3 font-mono text-zinc-300">
                        {link.patchHumanId ?? link.patchInternalId.slice(0, 8)}
                        {link.attestationId === thisAttestation?.id && (
                          <span className="ml-1 text-emerald-400">← this</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-zinc-400">{link.hash.slice(0, 16)}…</td>
                      <td className="py-2 pr-3 font-mono text-zinc-500">{link.prevHash.slice(0, 16)}…</td>
                      <td className="py-2 pr-3">
                        {link.hashOk && link.linkOk ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-red-400">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Footer / actions */}
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="/api/attestations/export"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            <FileDown className="size-3.5" />
            Export full chain (JSON)
          </a>
          <a
            href="/api/attestations/verify"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            <ExternalLink className="size-3.5" />
            Verify via API
          </a>
          {thisAttestation && (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(thisAttestation.hash)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              <Copy className="size-3.5" />
              Copy hash
            </button>
          )}
        </div>

        <p className="mt-8 text-[10px] leading-relaxed text-zinc-600">
          GuardianX Autonomous Security Operations Platform — cryptographic
          patch attestation. The hash chain is recomputed on every page load;
          any modification to a historical patch (or its attestation row)
          breaks every subsequent hash. Share this URL with clients as proof
          of remediation.
        </p>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 truncate text-sm ${accent ?? "text-zinc-200"}`} title={value}>
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className={`mt-0.5 break-all text-sm text-zinc-200 ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function HashRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-32 shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <code
        className={`flex-1 break-all rounded bg-zinc-900/60 p-2 font-mono text-[11px] ${
          ok === undefined
            ? "text-zinc-300"
            : ok
              ? "text-emerald-300"
              : "text-red-300"
        }`}
      >
        {value}
      </code>
    </div>
  );
}

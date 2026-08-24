"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Loader2,
  KeyRound,
  Mail,
  Building2,
  Users,
  UserPlus,
  Trash2,
  History,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Send,
} from "lucide-react";

interface SettingsPanelProps {
  currentUser?: { id: string; email: string; name: string; role: string } | null;
}

interface TwoFactorState {
  enabled: boolean;
  loading: boolean;
  setup?: { secret: string; qrCode: string; otpauthUrl: string };
  verifying: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  entity: string | null;
  actor: string;
  details: unknown;
  timestamp: string;
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  members: { id: string; email: string; role: string; joinedAt: string | null }[];
  memberCount: number;
}

interface MailEntry {
  id: string;
  to: string;
  subject: string;
  status: string;
  error: string | null;
  timestamp: string;
}

export function SettingsPanel({ currentUser }: SettingsPanelProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"security" | "organization" | "email">("security");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-50">Settings</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your account security, organization, and email delivery.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="bg-zinc-900/60">
          <TabsTrigger value="security" className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
            <ShieldCheck className="size-3.5" /> Security
          </TabsTrigger>
          <TabsTrigger value="organization" className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
            <Building2 className="size-3.5" /> Organization
          </TabsTrigger>
          {currentUser?.role === "admin" && (
            <TabsTrigger value="email" className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300">
              <Mail className="size-3.5" /> Email Delivery
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="security" className="mt-4">
          <SecurityTab currentUser={currentUser} />
        </TabsContent>
        <TabsContent value="organization" className="mt-4">
          <OrganizationTab currentUser={currentUser} />
        </TabsContent>
        {currentUser?.role === "admin" && (
          <TabsContent value="email" className="mt-4">
            <EmailTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY TAB — 2FA setup + login history
// ─────────────────────────────────────────────────────────────────────────────
function SecurityTab({ currentUser }: { currentUser?: SettingsPanelProps["currentUser"] }) {
  const { toast } = useToast();
  const [state, setState] = useState<TwoFactorState>({
    enabled: false,
    loading: true,
    verifying: false,
  });
  const [token, setToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Load 2FA status
  const loadStatus = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      });
      const data = await res.json();
      setState({ enabled: data?.enabled === true, loading: false, verifying: false });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  // Load login history
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/login-history");
      const data = await res.json();
      setHistory(data.entries || []);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    loadStatus();
    loadHistory();
  }, [loadStatus, loadHistory]);

  const startSetup = async () => {
    setState((s) => ({ ...s, verifying: true }));
    try {
      const res = await fetch("/api/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState((s) => ({ ...s, setup: data, verifying: true }));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "2FA setup failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
      setState((s) => ({ ...s, verifying: false }));
    }
  };

  const verify = async () => {
    if (!state.setup?.secret || !token) return;
    try {
      const res = await fetch("/api/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          token: token.replace(/\s/g, ""),
          secret: state.setup.secret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBackupCodes(data.backupCodes || []);
      setToken("");
      setState({ enabled: true, loading: false, verifying: false });
      toast({
        title: "2FA enabled! 🎉",
        description: "Save your backup codes somewhere safe.",
      });
      loadHistory();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: err instanceof Error ? err.message : "Invalid code.",
      });
    }
  };

  const disable = async () => {
    if (!confirm("Disable 2FA? This reduces your account security.")) return;
    try {
      await fetch("/api/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable" }),
      });
      setState({ enabled: false, loading: false, verifying: false });
      toast({ title: "2FA disabled", description: "Re-enable it anytime from Settings." });
      loadHistory();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  };

  const cancelSetup = () => {
    setState((s) => ({ ...s, setup: undefined, verifying: false }));
    setToken("");
  };

  return (
    <div className="space-y-4">
      {/* 2FA card */}
      <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Two-Factor Authentication</h3>
          </div>
          {state.loading ? (
            <Skeleton className="h-5 w-16 bg-zinc-800" />
          ) : state.enabled ? (
            <Badge className="border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
              <CheckCircle2 className="size-2.5" /> Enabled
            </Badge>
          ) : (
            <Badge className="border border-amber-500/40 bg-amber-500/10 text-amber-300">
              <ShieldAlert className="size-2.5" /> Not enabled
            </Badge>
          )}
        </div>

        {!state.setup && !state.enabled && !state.loading && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              Add a second factor (Google Authenticator, Authy, 1Password) so a stolen password
              can&apos;t be used to access your account. After enabling, you&apos;ll get 10 backup
              codes — store them somewhere safe.
            </p>
            <Button
              onClick={startSetup}
              disabled={state.verifying}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {state.verifying ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Set up 2FA
            </Button>
          </div>
        )}

        {/* Setup form */}
        {state.setup && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-zinc-300">
              1. Scan the QR code with your authenticator app.
              <br />
              2. Enter the 6-digit code it shows you below.
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <img
                  src={state.setup.qrCode}
                  alt="2FA QR code"
                  className="size-40 rounded"
                />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <Label className="text-[10px] text-zinc-500">Manual entry key</Label>
                  <code className="block w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-[10px] text-emerald-300">
                    {state.setup.secret}
                  </code>
                </div>
                <div>
                  <Label className="text-[10px] text-zinc-500">6-digit code</Label>
                  <Input
                    value={token}
                    onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    inputMode="numeric"
                    className="font-mono tracking-[0.4em] text-zinc-100"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") verify();
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={verify}
                    disabled={token.length !== 6}
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    Verify & enable
                  </Button>
                  <Button
                    onClick={cancelSetup}
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Backup codes reveal */}
        {backupCodes && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
          >
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300">
              <AlertCircle className="size-3.5" /> Save these backup codes
            </div>
            <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-zinc-300 sm:grid-cols-5">
              {backupCodes.map((c, i) => (
                <div key={i} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center">
                  {c}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-zinc-500">
              Each code can be used once. Treat them like passwords.
            </p>
          </motion.div>
        )}

        {/* Disable */}
        {state.enabled && (
          <div className="mt-4 border-t border-zinc-800 pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={disable}
              className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
            >
              Disable 2FA
            </Button>
          </div>
        )}
      </Card>

      {/* Login history */}
      <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Login history</h3>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={loadHistory}
            className="text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
          >
            <Clock className="size-3.5" /> Refresh
          </Button>
        </div>
        {historyLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full bg-zinc-800" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No login events recorded yet. Future logins, logouts, password changes, and 2FA
            enable/disable events will show up here.
          </p>
        ) : (
          <div className="custom-scrollbar max-h-96 space-y-1.5 overflow-y-auto">
            {history.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px]"
              >
                <Badge
                  className={`border px-1.5 py-0 text-[9px] ${
                    /login|success/i.test(e.action)
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : /fail|invalid|reject/i.test(e.action)
                        ? "border-red-500/40 bg-red-500/10 text-red-300"
                        : "border-zinc-700 bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {e.action}
                </Badge>
                {typeof e.details === "string" && (
                  <span className="text-zinc-500">{e.details}</span>
                )}
                <span className="ml-auto font-mono text-[10px] text-zinc-500">
                  {new Date(e.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORGANIZATION TAB — manage orgs + invite members (admin-only creation)
// ─────────────────────────────────────────────────────────────────────────────
function OrganizationTab({ currentUser }: { currentUser?: SettingsPanelProps["currentUser"] }) {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [inviteOrgId, setInviteOrgId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orgs");
      if (!res.ok) {
        setOrgs([]);
        return;
      }
      const data = await res.json();
      setOrgs(Array.isArray(data) ? data : []);
    } catch {
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createOrg = async () => {
    if (!name.trim() || !slug.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Organization created", description: data.name });
      setName("");
      setSlug("");
      setShowCreate(false);
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    if (!inviteOrgId || !inviteEmail.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: inviteOrgId, email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Invitation sent", description: `${inviteEmail} added as ${inviteRole}` });
      setInviteEmail("");
      setInviteOrgId(null);
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = currentUser?.role === "admin";

  return (
    <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Organizations</h3>
          {!loading && (
            <Badge className="border border-zinc-700 bg-zinc-800 text-[9px] text-zinc-300">
              {orgs.length} total
            </Badge>
          )}
        </div>
        {isAdmin && (
          <Button
            size="sm"
            onClick={() => setShowCreate((v) => !v)}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <Building2 className="size-3.5" /> New Organization
          </Button>
        )}
      </div>

      {showCreate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[10px] text-zinc-500">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-zinc-700 bg-zinc-900/60 text-zinc-200"
                placeholder="Acme Security"
              />
            </div>
            <div>
              <Label className="text-[10px] text-zinc-500">Slug</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="border-zinc-700 bg-zinc-900/60 font-mono text-zinc-200"
                placeholder="acme-security"
              />
            </div>
          </div>
          <Button
            onClick={createOrg}
            disabled={busy || !name || !slug}
            className="mt-2 bg-emerald-600 text-white hover:bg-emerald-500"
            size="sm"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Building2 className="size-3.5" />}
            Create
          </Button>
        </motion.div>
      )}

      {!isAdmin && (
        <p className="mb-3 text-[11px] text-zinc-500">
          You can see organizations but only admins can create new ones or invite members.
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 bg-zinc-800" />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-8 text-center text-sm text-zinc-500">
          <Building2 className="mx-auto size-6 text-zinc-700" />
          <p className="mt-2">No organizations yet.</p>
          {isAdmin && <p className="text-[10px]">Create one to invite teammates.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {orgs.map((org) => (
            <div
              key={org.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30">
                    <Building2 className="size-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{org.name}</div>
                    <div className="font-mono text-[10px] text-zinc-500">/orgs/{org.slug}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="border border-sky-500/40 bg-sky-500/10 text-[9px] text-sky-300">
                    <Users className="size-2.5" /> {org.memberCount} members
                  </Badge>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setInviteOrgId(inviteOrgId === org.id ? null : org.id)}
                      className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                    >
                      <UserPlus className="size-3.5" /> Invite
                    </Button>
                  )}
                </div>
              </div>

              {/* Invite form */}
              <AnimatePresence>
                {inviteOrgId === org.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mb-2 flex flex-col gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-2 sm:flex-row sm:items-center">
                      <Mail className="size-3.5 shrink-0 text-zinc-500" />
                      <Input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="teammate@company.com"
                        className="border-zinc-700 bg-zinc-900/60 text-sm text-zinc-200"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="h-9 rounded-md border border-zinc-700 bg-zinc-900/60 px-2 text-sm text-zinc-200"
                      >
                        <option value="admin">Admin</option>
                        <option value="analyst">Analyst</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <Button
                        onClick={invite}
                        disabled={busy || !inviteEmail}
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        Send invite
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Member list */}
              <div className="space-y-1">
                {org.members.length === 0 ? (
                  <p className="text-[10px] text-zinc-500">No members yet.</p>
                ) : (
                  org.members.slice(0, 8).map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded border border-zinc-800/60 bg-zinc-900/40 px-2 py-1 text-[10px]"
                    >
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[9px] font-bold text-emerald-400">
                        {m.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate text-zinc-300">{m.email}</span>
                      <Badge className="ml-auto border border-zinc-700 bg-zinc-800 px-1 py-0 text-[8px] text-zinc-300">
                        {m.role}
                      </Badge>
                      {m.joinedAt && (
                        <span className="font-mono text-[9px] text-zinc-500">
                          {new Date(m.joinedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL DELIVERY TAB — admin-only email log monitor
// ─────────────────────────────────────────────────────────────────────────────
function EmailTab() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<MailEntry[]>([]);
  const [summary, setSummary] = useState<{ sent: number; failed: number; pending: number; total: number } | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/email-delivery");
      const data = await res.json();
      setEntries(data.entries || []);
      setSummary(data.summary || null);
      setTableMissing(data.tableMissing === true);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load email log",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Send className="size-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Email delivery monitor</h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={load}
          disabled={loading}
          className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
          Refresh
        </Button>
      </div>

      {tableMissing && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-zinc-400">
          <AlertCircle className="mb-1 size-3.5 text-amber-400" />
          The <code className="rounded bg-zinc-800 px-1 font-mono text-[10px] text-zinc-300">MailLog</code>{" "}
          table doesn&apos;t exist on this instance. Outbound emails are still sent, but they aren&apos;t
          being logged. Run a Supabase migration to enable email logging.
        </div>
      )}

      {summary && !tableMissing && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Sent" value={summary.sent} color="emerald" icon={CheckCircle2} />
          <StatTile label="Failed" value={summary.failed} color="red" icon={XCircle} />
          <StatTile label="Pending" value={summary.pending} color="amber" icon={Clock} />
          <StatTile label="Total" value={summary.total} color="zinc" icon={Mail} />
        </div>
      )}

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 bg-zinc-800" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-zinc-500">
          No emails sent recently. Trigger an alert or invite a teammate to populate this log.
        </p>
      ) : (
        <div className="custom-scrollbar max-h-96 space-y-1.5 overflow-y-auto">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px]"
            >
              <Badge
                className={`border px-1.5 py-0 text-[9px] ${
                  e.status === "sent"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : e.status === "failed"
                      ? "border-red-500/40 bg-red-500/10 text-red-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                }`}
              >
                {e.status}
              </Badge>
              <span className="truncate text-zinc-300">{e.subject}</span>
              <span className="ml-auto font-mono text-[10px] text-zinc-500">
                {new Date(e.timestamp).toLocaleString()}
              </span>
              {e.error && (
                <div className="w-full text-[10px] text-red-400">↳ {e.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StatTile({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: "emerald" | "red" | "amber" | "zinc";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const map = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    red: "border-red-500/40 bg-red-500/10 text-red-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    zinc: "border-zinc-700 bg-zinc-800 text-zinc-300",
  } as const;
  return (
    <div className={`rounded-lg border p-2 ${map[color]}`}>
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider opacity-80">
        <Icon className="size-2.5" /> {label}
      </div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

// Suppress unused-import warnings for icons imported for future use.
void Fragment;
void Trash2;

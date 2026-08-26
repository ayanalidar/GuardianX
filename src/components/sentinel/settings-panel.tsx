"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, Mail, MessageSquare, Phone, Send, Save, Eye, EyeOff,
  Loader2, Building2, Bell, ShieldCheck, Globe, AlertCircle,
  CheckCircle2, Server, Hash, KeyRound, User, Smartphone,
  Network, FileText, Sparkles, RefreshCw, History, Clock, Monitor, MapPin,
  Users, Trash2,
} from "lucide-react";
import { sentinelApi } from "@/lib/sentinel/api";

// ── Types ────────────────────────────────────────────────────────────────────
type SettingKey =
  | "email_smtp"
  | "whatsapp"
  | "telegram"
  | "sms"
  | "general"
  | "notifications";

interface SettingGroup {
  id: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

type SettingsMap = Record<SettingKey, SettingGroup>;

interface EmailConfig {
  host: string;
  port: string;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
}

interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  recipientPhone: string;
  enabled: boolean;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

interface SmsConfig {
  provider: "twilio" | "msg91";
  toNumber: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  apiKey: string;
  sender: string;
  enabled: boolean;
}

interface GeneralConfig {
  orgName: string;
  orgEmail: string;
  orgPhone: string;
  orgWebsite: string;
  logoUrl: string;
}

type ChannelKey = "email" | "whatsapp" | "telegram" | "sms";
type EventTypeKey =
  | "critical_findings"
  | "scan_completed"
  | "incident_created"
  | "canary_triggered"
  | "patch_ready"
  | "daily_digest";

interface NotificationsConfig {
  critical_findings: Record<ChannelKey, boolean>;
  scan_completed: Record<ChannelKey, boolean>;
  incident_created: Record<ChannelKey, boolean>;
  canary_triggered: Record<ChannelKey, boolean>;
  patch_ready: Record<ChannelKey, boolean>;
  daily_digest: Record<ChannelKey, boolean>;
}

const DEFAULTS: SettingsMap = {
  email_smtp: {
    id: "",
    isActive: false,
    createdAt: "",
    config: {
      host: "",
      port: "587",
      user: "",
      password: "",
      fromEmail: "",
      fromName: "GuardianX",
      enabled: false,
    } as EmailConfig,
  },
  whatsapp: {
    id: "",
    isActive: false,
    createdAt: "",
    config: {
      phoneNumberId: "",
      accessToken: "",
      recipientPhone: "",
      enabled: false,
    } as WhatsAppConfig,
  },
  telegram: {
    id: "",
    isActive: false,
    createdAt: "",
    config: {
      botToken: "",
      chatId: "",
      enabled: false,
    } as TelegramConfig,
  },
  sms: {
    id: "",
    isActive: false,
    createdAt: "",
    config: {
      provider: "twilio",
      toNumber: "",
      accountSid: "",
      authToken: "",
      fromNumber: "",
      apiKey: "",
      sender: "",
      enabled: false,
    } as SmsConfig,
  },
  general: {
    id: "",
    isActive: false,
    createdAt: "",
    config: {
      orgName: "GuardianX",
      orgEmail: "hello@guardianx.in",
      orgPhone: "+91 70067 12347",
      orgWebsite: "https://www.guardianx.in",
      logoUrl: "/guardianx-logo.png",
    } as GeneralConfig,
  },
  notifications: {
    id: "",
    isActive: false,
    createdAt: "",
    config: {
      critical_findings: { email: true, whatsapp: false, telegram: false, sms: false },
      scan_completed: { email: true, whatsapp: false, telegram: true, sms: false },
      incident_created: { email: true, whatsapp: true, telegram: true, sms: true },
      canary_triggered: { email: true, whatsapp: true, telegram: true, sms: true },
      patch_ready: { email: true, whatsapp: false, telegram: false, sms: false },
      daily_digest: { email: true, whatsapp: false, telegram: false, sms: false },
    } as NotificationsConfig,
  },
};

// ── Main component ──────────────────────────────────────────────────────────
export function SettingsPanel({ currentUser }: { currentUser?: { role?: string } | null }) {
  const [tab, setTab] = useState<
    "email" | "whatsapp" | "telegram" | "sms" | "general" | "notifications" | "security" | "organization"
  >("email");

  const TABS = [
    { id: "email", label: "Email (SMTP)", icon: Mail, color: "emerald" },
    { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "emerald" },
    { id: "telegram", label: "Telegram", icon: Send, color: "cyan" },
    { id: "sms", label: "SMS", icon: Phone, color: "amber" },
    { id: "general", label: "General", icon: Building2, color: "emerald" },
    { id: "notifications", label: "Routing", icon: Bell, color: "amber" },
    { id: "organization", label: "Organization", icon: Building2, color: "cyan" },
    { id: "security", label: "Security", icon: ShieldCheck, color: "violet" },
  ] as const;

  const colorClasses: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 neon-border-emerald",
    cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 neon-border-cyan",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/40 neon-border-amber",
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
          admin@guardianx:~$ settings --configure
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <Settings className="size-5 text-emerald-400" />
          Platform Settings
          <span className="font-mono text-sm text-zinc-500">{"// Centralized channel & org config"}</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Configure outbound notification channels, organization profile, and per-event routing rules.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="holo-card-sharp hud-corners flex flex-wrap gap-1 p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? colorClasses[t.color]
                  : "border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {tab === "email" && <EmailTab />}
          {tab === "whatsapp" && <WhatsAppTab />}
          {tab === "telegram" && <TelegramTab />}
          {tab === "sms" && <SmsTab />}
          {tab === "general" && <GeneralTab />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "organization" && <OrganizationTab currentUser={currentUser} />}
          {tab === "security" && <SecurityTab currentUser={currentUser} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Hook: load all settings once on mount ───────────────────────────────────
function useSettingsLoader() {
  const [settings, setSettings] = useState<SettingsMap>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load settings");
      const next: SettingsMap = { ...DEFAULTS };
      const incoming = (data.settings || {}) as Partial<SettingsMap>;
      (Object.keys(DEFAULTS) as SettingKey[]).forEach((k) => {
        const row = incoming[k];
        if (row && row.config && typeof row.config === "object") {
          // Strip the internal _key marker if it slipped through
          const clean = { ...row.config };
          delete (clean as Record<string, unknown>)._key;
          next[k] = {
            id: row.id || "",
            isActive: !!row.isActive,
            createdAt: row.createdAt || "",
            config: { ...(DEFAULTS[k].config as Record<string, unknown>), ...clean },
          };
        }
      });
      setSettings(next);
    } catch {
      // silently fall back to defaults
      setSettings(DEFAULTS);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { settings, loaded, reload: load, setSettings };
}

// ── Shared building blocks ──────────────────────────────────────────────────
function SettingsCard({
  icon: Icon,
  title,
  description,
  accent = "emerald",
  children,
  footer,
}: {
  icon: typeof Settings;
  title: string;
  description?: string;
  accent?: "emerald" | "cyan" | "amber" | "violet";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const accentMap: Record<string, string> = {
    emerald: "text-emerald-400 border-emerald-500/20",
    cyan: "text-cyan-400 border-cyan-500/20",
    amber: "text-amber-400 border-amber-500/20",
    violet: "text-violet-400 border-violet-500/20",
  };
  return (
    <div className={`holo-card-sharp hud-corners border ${accentMap[accent]} p-5 sm:p-6`}>
      <div className="mb-4 flex items-start gap-3">
        <div className={`flex size-9 items-center justify-center rounded-md border bg-zinc-900/60 ${accentMap[accent]}`}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-zinc-100">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-zinc-400">{description}</p>}
        </div>
      </div>
      {children}
      {footer && <div className="mt-4 border-t border-zinc-800/60 pt-4">{footer}</div>}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
  hint,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-zinc-400">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[10px] text-zinc-500">{hint}</p>}
    </div>
  );
}

function PasswordField({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="border-zinc-800 bg-zinc-900/60 pr-10 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-200"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function EnabledRow({
  checked,
  onChange,
  label = "Enabled",
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5">
      <div>
        <div className="text-sm font-medium text-zinc-200">{label}</div>
        {description && <div className="text-[10px] text-zinc-500">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SaveButton({
  onClick,
  loading,
  label = "Save",
}: {
  onClick: () => void;
  loading: boolean;
  label?: string;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={loading}
      className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border-emerald"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
      {label}
    </Button>
  );
}

function TestButton({
  onClick,
  loading,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={loading}
      variant="outline"
      className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      {label}
    </Button>
  );
}

const inputCls =
  "border-zinc-800 bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50";
const selectCls =
  "w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none";

// ── Save & test helpers ─────────────────────────────────────────────────────
async function saveSetting(key: SettingKey, config: Record<string, unknown>, isActive: boolean) {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, config, isActive }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Failed to save ${key}`);
  return data;
}

async function testChannel(channel: string, config: Record<string, unknown>, testTarget: string) {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "test", channel, config, testTarget }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Test failed");
  }
  return data as { success?: boolean; message?: string; detail?: string };
}

// ════════════════════════════════════════════════════════════════════════════
// EMAIL TAB
// ════════════════════════════════════════════════════════════════════════════
function EmailTab() {
  const { toast } = useToast();
  const { settings, loaded } = useSettingsLoader();

  const cfg = settings.email_smtp.config as EmailConfig;
  const [form, setForm] = useState<EmailConfig>(cfg);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    detail?: string;
  } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setForm(cfg);
  }, [loaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting("email_smtp", { ...form }, form.enabled);
      toast({ title: "Email settings saved", description: "SMTP configuration stored successfully." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail.trim()) {
      toast({
        variant: "destructive",
        title: "Test target required",
        description: "Enter a recipient email address to send the test to.",
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testChannel("email", { ...form }, testEmail.trim());
      if (result.success) {
        setTestResult({
          success: true,
          message: result.message || `Delivered to ${testEmail}`,
        });
        toast({
          title: "Test email sent",
          description: result.message || `Delivered to ${testEmail}`,
        });
      } else {
        setTestResult({
          success: false,
          message: result.message || "SMTP rejected the send.",
          detail: result.detail,
        });
        toast({
          variant: "destructive",
          title: "Test email failed",
          description: result.message || "SMTP rejected the send.",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      setTestResult({ success: false, message: msg });
      toast({
        variant: "destructive",
        title: "Test email failed",
        description: msg,
      });
    } finally {
      setTesting(false);
    }
  };

  // Apply a provider preset (Hostinger, Gmail, etc.) — fills host/port and
  // leaves username/password blank for the user to fill in.
  const applyPreset = (preset: "hostinger465" | "hostinger587" | "gmail" | "outlook") => {
    const presets: Record<string, Partial<EmailConfig>> = {
      hostinger465: { host: "smtp.hostinger.com", port: "465", fromName: "GuardianX" },
      hostinger587: { host: "smtp.hostinger.com", port: "587", fromName: "GuardianX" },
      gmail: { host: "smtp.gmail.com", port: "465", fromName: "GuardianX" },
      outlook: { host: "smtp.office365.com", port: "587", fromName: "GuardianX" },
    };
    setForm({ ...form, ...presets[preset] });
    setTestResult(null);
    toast({
      title: "Preset applied",
      description: `${presets[preset].host}:${presets[preset].port} — fill in your mailbox username and password.`,
    });
  };

  if (!loaded) return <SettingsSkeleton />;

  return (
    <div className="space-y-5">
    <SettingsCard
      icon={Mail}
      title="Email (SMTP)"
      description="Outbound mail server used for incident digests, patch alerts, and daily reports."
      accent="emerald"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 sm:max-w-xs">
            <Field label="Send test email to" htmlFor="email-test-target">
              <Input
                id="email-test-target"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="user@example.com"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <TestButton onClick={handleTest} loading={testing} label="Send Test Email" />
            <SaveButton onClick={handleSave} loading={saving} />
          </div>
        </div>
      }
    >
      {/* Preset chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Presets:
        </span>
        <button
          type="button"
          onClick={() => applyPreset("hostinger465")}
          className="rounded-md border border-emerald-700/60 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-900/50"
        >
          Hostinger (465 SSL)
        </button>
        <button
          type="button"
          onClick={() => applyPreset("hostinger587")}
          className="rounded-md border border-emerald-700/60 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-900/50"
        >
          Hostinger (587 STARTTLS)
        </button>
        <button
          type="button"
          onClick={() => applyPreset("gmail")}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800"
        >
          Gmail
        </button>
        <button
          type="button"
          onClick={() => applyPreset("outlook")}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800"
        >
          Outlook 365
        </button>
        <button
          type="button"
          onClick={() => setShowHelp((s) => !s)}
          className="ml-auto rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800"
        >
          {showHelp ? "Hide help" : "Need help?"}
        </button>
      </div>

      {/* Inline test result banner */}
      {testResult && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            testResult.success
              ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-200"
              : "border-red-800/70 bg-red-950/40 text-red-200"
          }`}
        >
          <div className="flex items-start gap-2">
            {testResult.success ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {testResult.success ? "Success" : "Failed"}
              </p>
              <p className="mt-0.5 break-words text-[13px] leading-relaxed">
                {testResult.message}
              </p>
              {testResult.detail && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200">
                    Show technical detail
                  </summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-zinc-950/60 p-2 text-[11px] text-zinc-400">
                    {testResult.detail}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help / guidance panel */}
      {showHelp && (
        <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-4 text-[12px] leading-relaxed text-zinc-300">
          <h4 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-zinc-100">
            <Server className="size-3.5 text-emerald-400" /> Hostinger mailbox setup
          </h4>
          <ul className="space-y-1.5">
            <li>
              <span className="text-zinc-500">Host:</span>{" "}
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-emerald-300">smtp.hostinger.com</code>
            </li>
            <li>
              <span className="text-zinc-500">Port:</span>{" "}
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-emerald-300">465</code> (SSL, recommended) or{" "}
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-emerald-300">587</code> (STARTTLS)
            </li>
            <li>
              <span className="text-zinc-500">Username:</span> your FULL mailbox email (e.g.{" "}
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-emerald-300">alerts@yourdomain.com</code>)
            </li>
            <li>
              <span className="text-zinc-500">Password:</span> the mailbox password itself (NOT an app password — Hostinger uses the real mailbox password for SMTP)
            </li>
            <li>
              <span className="text-zinc-500">From Email:</span> must match the authenticated mailbox — Hostinger rejects mismatched From addresses with a 553 error.
            </li>
            <li>
              <span className="text-zinc-500">Tip:</span> if your domain&apos;s DNS uses Hostinger&apos;s default MX records, SMTP will work out of the box. If you use a third-party mail provider (e.g. Zoho, Google Workspace) on the same domain, use that provider&apos;s SMTP instead.
            </li>
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="SMTP Host" htmlFor="smtp-host">
          <Input
            id="smtp-host"
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            placeholder="smtp.hostinger.com"
            className={inputCls}
          />
        </Field>
        <Field label="Port" htmlFor="smtp-port">
          <Input
            id="smtp-port"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: e.target.value })}
            placeholder="465"
            className={inputCls}
          />
        </Field>
        <Field label="Username" htmlFor="smtp-user">
          <Input
            id="smtp-user"
            value={form.user}
            onChange={(e) => setForm({ ...form, user: e.target.value })}
            placeholder="alerts@yourdomain.com"
            className={inputCls}
          />
        </Field>
        <Field label="Password" htmlFor="smtp-pass">
          <PasswordField
            id="smtp-pass"
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            placeholder="mailbox password"
          />
        </Field>
        <Field label="From Email" htmlFor="smtp-from-email">
          <Input
            id="smtp-from-email"
            type="email"
            value={form.fromEmail}
            onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
            placeholder="alerts@yourdomain.com"
            className={inputCls}
          />
        </Field>
        <Field label="From Name" htmlFor="smtp-from-name">
          <Input
            id="smtp-from-name"
            value={form.fromName}
            onChange={(e) => setForm({ ...form, fromName: e.target.value })}
            placeholder="GuardianX Alerts"
            className={inputCls}
          />
        </Field>
        <div className="sm:col-span-2">
          <EnabledRow
            checked={form.enabled}
            onChange={(v) => setForm({ ...form, enabled: v })}
            label="Enable Email Channel"
            description="When off, no emails will be dispatched regardless of routing rules."
          />
        </div>
      </div>
    </SettingsCard>

    {/* Email Delivery sub-panel — recent send health (Task #14-email-monitoring).
        Fetches /api/email-logs?limit=20 on mount + every 60s. Independent of
        the SMTP form above so it works whether or not SMTP is configured. */}
    <EmailDeliveryPanel />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EMAIL DELIVERY PANEL — recent send health
// ════════════════════════════════════════════════════════════════════════════
//
// A sub-section mounted inside the Email (SMTP) tab. Fetches the last 20
// EmailLog rows from /api/email-logs and surfaces:
//   - A summary row: total sent, total failed, success rate (last 50).
//   - A scrollable table of the last 20 emails with status badges
//     (green=sent, red=failed). Failed rows are expandable to reveal the
//     error message.
//
// Auto-refreshes every 60s (NOT 10s — avoids memory pressure / DB load).
// A manual "Refresh" button is also provided. The panel degrades gracefully
// when the API is unreachable: it shows an inline error banner instead of
// crashing the rest of the tab.

interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  status: "sent" | "failed";
  messageId: string | null;
  error: string | null;
  template: string | null;
  timestamp: string;
}

interface EmailLogSummary {
  total: number;
  sent: number;
  failed: number;
  successRate: number | null; // 0–100 (one decimal) or null when no logs
}

function EmailDeliveryPanel() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<EmailLogEntry[]>([]);
  const [summary, setSummary] = useState<EmailLogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/email-logs?limit=20");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setEntries((data.entries || []) as EmailLogEntry[]);
      setSummary((data.summary || null) as EmailLogSummary | null);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load email logs";
      // Only show a toast for manual refreshes — background poll failures
      // should be silent (otherwise a transient network blip would spam
      // the admin with toasts every 60s).
      if (isManual) {
        toast({
          variant: "destructive",
          title: "Failed to refresh email logs",
          description: msg,
        });
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load(false);
    // Auto-refresh every 60s — not 10s, to avoid memory pressure / DB load.
    const interval = setInterval(() => load(false), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleManualRefresh = () => load(true);

  // ── Render ───────────────────────────────────────────────────────────────
  const totalSent = summary?.sent ?? 0;
  const totalFailed = summary?.failed ?? 0;
  const rate = summary?.successRate;
  const rateLabel = rate === null || rate === undefined ? "—" : `${rate}%`;
  const rateColor =
    rate === null || rate === undefined
      ? "text-zinc-400"
      : rate >= 95
      ? "text-emerald-400"
      : rate >= 80
      ? "text-amber-400"
      : "text-red-400";

  return (
    <SettingsCard
      icon={RefreshCw}
      title="Email Delivery"
      description="Recent outgoing email health — every send is logged with its outcome."
      accent="cyan"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            auto-refresh: 60s
          </span>
          <Button
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            variant="outline"
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          >
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      }
    >
      {/* Summary row */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label="Sent (last 50)"
          value={totalSent.toString()}
          accent="emerald"
          icon={<CheckCircle2 className="size-4" />}
        />
        <SummaryTile
          label="Failed (last 50)"
          value={totalFailed.toString()}
          accent="red"
          icon={<AlertCircle className="size-4" />}
        />
        <SummaryTile
          label="Success rate"
          value={rateLabel}
          accent="cyan"
          valueClassName={rateColor}
        />
        <SummaryTile
          label="Last 20 shown"
          value={entries.length.toString()}
          accent="zinc"
        />
      </div>

      {/* Error banner — only shown for background-poll failures */}
      {error && !refreshing && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-700/60 bg-amber-950/40 p-3 text-[12px] text-amber-200">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Live refresh unavailable</p>
            <p className="mt-0.5 break-words text-amber-100/80">
              {error}. The table below shows the last successfully-loaded snapshot.
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-zinc-800/60" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Mail className="size-8 text-zinc-700" />
          <p className="text-sm font-medium text-zinc-400">No emails sent yet</p>
          <p className="max-w-xs text-[11px] text-zinc-500">
            As soon as the platform sends an email (signup, password reset,
            daily digest, or an SMTP test from the form above), it will appear
            here with its delivery status.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-800">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-zinc-900/60 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">To</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Template</th>
                <th className="px-3 py-2 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {entries.map((e) => {
                const isFailed = e.status === "failed";
                const isExpanded = expandedId === e.id;
                const canExpand = isFailed && !!e.error;
                return (
                  <Fragment key={e.id}>
                    <tr
                      className={`transition-colors ${
                        isFailed
                          ? "bg-red-950/15 hover:bg-red-950/25"
                          : "hover:bg-zinc-800/30"
                      } ${canExpand ? "cursor-pointer" : ""}`}
                      onClick={() =>
                        canExpand &&
                        setExpandedId((cur) => (cur === e.id ? null : e.id))
                      }
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-zinc-400">
                        {formatLogTimestamp(e.timestamp)}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-zinc-200" title={e.to}>
                        {e.to}
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2 text-zinc-200" title={e.subject}>
                        {e.subject}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {e.template ? (
                          <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-cyan-300">
                            {e.template}
                          </code>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                    {canExpand && isExpanded && (
                      <tr className="bg-red-950/20">
                        <td colSpan={5} className="px-3 py-3">
                          <div className="rounded-md border border-red-900/50 bg-zinc-950/60 p-3">
                            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-red-300">
                              <AlertCircle className="size-3" />
                              Error detail
                            </div>
                            <p className="break-words text-[12px] leading-relaxed text-red-100/90">
                              {e.error}
                            </p>
                            {e.messageId && (
                              <p className="mt-2 font-mono text-[10px] text-zinc-500">
                                messageId: {e.messageId}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SettingsCard>
  );
}

function SummaryTile({
  label,
  value,
  accent = "zinc",
  icon,
  valueClassName,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "red" | "cyan" | "zinc";
  icon?: React.ReactNode;
  valueClassName?: string;
}) {
  const borderMap: Record<string, string> = {
    emerald: "border-emerald-500/30",
    red: "border-red-500/30",
    cyan: "border-cyan-500/30",
    zinc: "border-zinc-700/60",
  };
  const textMap: Record<string, string> = {
    emerald: "text-emerald-300",
    red: "text-red-300",
    cyan: "text-cyan-300",
    zinc: "text-zinc-200",
  };
  return (
    <div
      className={`rounded-md border ${borderMap[accent]} bg-zinc-900/40 px-3 py-2.5`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${valueClassName || textMap[accent]}`}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "sent" | "failed" }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
        <CheckCircle2 className="size-3" />
        Sent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
      <AlertCircle className="size-3" />
      Failed
    </span>
  );
}

function formatLogTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    // "MMM d, HH:mm" — compact + sortable. Year omitted (these are recent).
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const m = months[d.getMonth()];
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${m} ${day}, ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// WHATSAPP TAB
// ════════════════════════════════════════════════════════════════════════════
function WhatsAppTab() {
  const { toast } = useToast();
  const { settings, loaded } = useSettingsLoader();

  const cfg = settings.whatsapp.config as WhatsAppConfig;
  const [form, setForm] = useState<WhatsAppConfig>(cfg);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");

  useEffect(() => {
    setForm(cfg);
  }, [loaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting("whatsapp", { ...form }, form.enabled);
      toast({ title: "WhatsApp settings saved", description: "Cloud API config stored successfully." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testPhone.trim()) {
      toast({
        variant: "destructive",
        title: "Test target required",
        description: "Enter a recipient phone number (with country code, no +).",
      });
      return;
    }
    setTesting(true);
    try {
      const result = await testChannel("whatsapp", { ...form }, testPhone.trim());
      if (result.success) {
        toast({
          title: "WhatsApp test sent",
          description: result.message || `Delivered to ${testPhone}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "WhatsApp test failed",
          description: result.message || "Meta API rejected the send.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "WhatsApp test failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return <SettingsSkeleton />;

  return (
    <SettingsCard
      icon={MessageSquare}
      title="WhatsApp Business"
      description="Send incident and alert messages via the WhatsApp Cloud API."
      accent="emerald"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 sm:max-w-xs">
            <Field label="Send test message to" htmlFor="wa-test-target">
              <Input
                id="wa-test-target"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="919876543210"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <TestButton onClick={handleTest} loading={testing} label="Send Test Message" />
            <SaveButton onClick={handleSave} loading={saving} />
          </div>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300/90">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        <span>Get these from Meta Business Suite, then WhatsApp API.</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Phone Number ID" htmlFor="wa-phone-id">
          <Input
            id="wa-phone-id"
            value={form.phoneNumberId}
            onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
            placeholder="123456789012345"
            className={inputCls}
          />
        </Field>
        <Field label="Default Recipient Phone" htmlFor="wa-recipient">
          <Input
            id="wa-recipient"
            value={form.recipientPhone}
            onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })}
            placeholder="919876543210"
            className={inputCls}
          />
        </Field>
        <Field label="Access Token" htmlFor="wa-token" className="sm:col-span-2">
          <PasswordField
            id="wa-token"
            value={form.accessToken}
            onChange={(v) => setForm({ ...form, accessToken: v })}
            placeholder="EAAG..."
          />
        </Field>
        <div className="sm:col-span-2">
          <EnabledRow
            checked={form.enabled}
            onChange={(v) => setForm({ ...form, enabled: v })}
            label="Enable WhatsApp Channel"
            description="When off, no WhatsApp messages will be dispatched regardless of routing rules."
          />
        </div>
      </div>
    </SettingsCard>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TELEGRAM TAB
// ════════════════════════════════════════════════════════════════════════════
function TelegramTab() {
  const { toast } = useToast();
  const { settings, loaded } = useSettingsLoader();

  const cfg = settings.telegram.config as TelegramConfig;
  const [form, setForm] = useState<TelegramConfig>(cfg);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testChat, setTestChat] = useState("");

  useEffect(() => {
    setForm(cfg);
  }, [loaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting("telegram", { ...form }, form.enabled);
      toast({ title: "Telegram settings saved", description: "Bot token and chat ID stored." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testChannel("telegram", { ...form }, testChat.trim() || form.chatId);
      if (result.success) {
        toast({
          title: "Telegram test sent",
          description: result.message || "Message posted to chat.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Telegram test failed",
          description: result.message || "Bot API rejected the send.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Telegram test failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return <SettingsSkeleton />;

  return (
    <SettingsCard
      icon={Send}
      title="Telegram Bot"
      description="Push alerts to a Telegram chat using a BotFather-issued bot token."
      accent="cyan"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 sm:max-w-xs">
            <Field label="Send test to chat ID (optional)" htmlFor="tg-test-target">
              <Input
                id="tg-test-target"
                value={testChat}
                onChange={(e) => setTestChat(e.target.value)}
                placeholder={form.chatId || "-1001234567890"}
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <TestButton onClick={handleTest} loading={testing} label="Send Test Message" />
            <SaveButton onClick={handleSave} loading={saving} />
          </div>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[11px] text-cyan-300/90">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        <span>Create a bot with @BotFather, then get the chat ID from @userinfobot.</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Bot Token" htmlFor="tg-token" className="sm:col-span-2">
          <PasswordField
            id="tg-token"
            value={form.botToken}
            onChange={(v) => setForm({ ...form, botToken: v })}
            placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
          />
        </Field>
        <Field label="Chat ID" htmlFor="tg-chat-id" className="sm:col-span-2">
          <Input
            id="tg-chat-id"
            value={form.chatId}
            onChange={(e) => setForm({ ...form, chatId: e.target.value })}
            placeholder="-1001234567890"
            className={inputCls}
          />
        </Field>
        <div className="sm:col-span-2">
          <EnabledRow
            checked={form.enabled}
            onChange={(v) => setForm({ ...form, enabled: v })}
            label="Enable Telegram Channel"
            description="When off, no Telegram messages will be dispatched regardless of routing rules."
          />
        </div>
      </div>
    </SettingsCard>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SMS TAB
// ════════════════════════════════════════════════════════════════════════════
function SmsTab() {
  const { toast } = useToast();
  const { settings, loaded } = useSettingsLoader();

  const cfg = settings.sms.config as SmsConfig;
  const [form, setForm] = useState<SmsConfig>(cfg);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNumber, setTestNumber] = useState("");

  useEffect(() => {
    setForm(cfg);
  }, [loaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting("sms", { ...form }, form.enabled);
      toast({
        title: "SMS settings saved",
        description: `${form.provider === "twilio" ? "Twilio" : "MSG91"} configuration stored.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testNumber.trim()) {
      toast({
        variant: "destructive",
        title: "Test target required",
        description: "Enter a recipient phone number in E.164 format.",
      });
      return;
    }
    setTesting(true);
    try {
      const result = await testChannel("sms", { ...form }, testNumber.trim());
      if (result.success) {
        toast({
          title: "Test SMS sent",
          description: result.message || `Delivered to ${testNumber}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Test SMS failed",
          description: result.message || "Provider rejected the send.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Test SMS failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) return <SettingsSkeleton />;

  const isTwilio = form.provider === "twilio";

  return (
    <SettingsCard
      icon={Phone}
      title="SMS Gateway"
      description="Send critical alerts via SMS using Twilio or MSG91."
      accent="amber"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 sm:max-w-xs">
            <Field label="Send test SMS to" htmlFor="sms-test-target">
              <Input
                id="sms-test-target"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                placeholder="+919876543210"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <TestButton onClick={handleTest} loading={testing} label="Send Test SMS" />
            <SaveButton onClick={handleSave} loading={saving} />
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Provider" htmlFor="sms-provider">
          <select
            id="sms-provider"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value as "twilio" | "msg91" })}
            className={selectCls}
          >
            <option value="twilio">Twilio</option>
            <option value="msg91">MSG91</option>
          </select>
        </Field>
        <Field label="Default To Number" htmlFor="sms-to">
          <Input
            id="sms-to"
            value={form.toNumber}
            onChange={(e) => setForm({ ...form, toNumber: e.target.value })}
            placeholder="+919876543210"
            className={inputCls}
          />
        </Field>

        <AnimatePresence mode="wait">
          {isTwilio ? (
            <motion.div
              key="twilio-fields"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="contents"
            >
              <Field label="Twilio Account SID" htmlFor="twilio-sid">
                <Input
                  id="twilio-sid"
                  value={form.accountSid}
                  onChange={(e) => setForm({ ...form, accountSid: e.target.value })}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className={inputCls}
                />
              </Field>
              <Field label="Twilio Auth Token" htmlFor="twilio-token">
                <PasswordField
                  id="twilio-token"
                  value={form.authToken}
                  onChange={(v) => setForm({ ...form, authToken: v })}
                  placeholder="auth token"
                />
              </Field>
              <Field label="Twilio From Number" htmlFor="twilio-from" className="sm:col-span-2">
                <Input
                  id="twilio-from"
                  value={form.fromNumber}
                  onChange={(e) => setForm({ ...form, fromNumber: e.target.value })}
                  placeholder="+12345678901"
                  className={inputCls}
                />
              </Field>
            </motion.div>
          ) : (
            <motion.div
              key="msg91-fields"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="contents"
            >
              <Field label="MSG91 API Key" htmlFor="msg91-key" className="sm:col-span-2">
                <PasswordField
                  id="msg91-key"
                  value={form.apiKey}
                  onChange={(v) => setForm({ ...form, apiKey: v })}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                />
              </Field>
              <Field label="MSG91 Sender ID" htmlFor="msg91-sender" className="sm:col-span-2">
                <Input
                  id="msg91-sender"
                  value={form.sender}
                  onChange={(e) => setForm({ ...form, sender: e.target.value })}
                  placeholder="GUARDX"
                  className={inputCls}
                />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="sm:col-span-2">
          <EnabledRow
            checked={form.enabled}
            onChange={(v) => setForm({ ...form, enabled: v })}
            label="Enable SMS Channel"
            description="When off, no SMS messages will be dispatched regardless of routing rules."
          />
        </div>
      </div>
    </SettingsCard>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// GENERAL TAB
// ════════════════════════════════════════════════════════════════════════════
function GeneralTab() {
  const { toast } = useToast();
  const { settings, loaded } = useSettingsLoader();

  const cfg = settings.general.config as GeneralConfig;
  const [form, setForm] = useState<GeneralConfig>(cfg);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(cfg);
  }, [loaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting("general", { ...form }, true);
      toast({ title: "Organization settings saved", description: "Profile updated." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <SettingsSkeleton />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      <SettingsCard
        icon={Building2}
        title="Organization Profile"
        description="Shown on reports, digest emails, and the client portal header."
        accent="emerald"
        footer={
          <div className="flex justify-end">
            <SaveButton onClick={handleSave} loading={saving} />
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Organization Name" htmlFor="org-name">
            <Input
              id="org-name"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              placeholder="GuardianX"
              className={inputCls}
            />
          </Field>
          <Field label="Organization Email" htmlFor="org-email">
            <Input
              id="org-email"
              type="email"
              value={form.orgEmail}
              onChange={(e) => setForm({ ...form, orgEmail: e.target.value })}
              placeholder="hello@guardianx.in"
              className={inputCls}
            />
          </Field>
          <Field label="Organization Phone" htmlFor="org-phone">
            <Input
              id="org-phone"
              value={form.orgPhone}
              onChange={(e) => setForm({ ...form, orgPhone: e.target.value })}
              placeholder="+91 70067 12347"
              className={inputCls}
            />
          </Field>
          <Field label="Organization Website" htmlFor="org-website">
            <Input
              id="org-website"
              value={form.orgWebsite}
              onChange={(e) => setForm({ ...form, orgWebsite: e.target.value })}
              placeholder="https://www.guardianx.in"
              className={inputCls}
            />
          </Field>
          <Field label="Logo URL" htmlFor="org-logo" className="sm:col-span-2">
            <Input
              id="org-logo"
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="/guardianx-logo.png"
              className={inputCls}
            />
          </Field>
        </div>
      </SettingsCard>

      {/* Report preview */}
      <div className="holo-card-sharp hud-corners border border-zinc-800 p-5">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="size-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-100">Report Preview</h3>
        </div>
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-emerald-500/30 bg-emerald-500/10">
              {form.logoUrl ? (
                <img
                  src={form.logoUrl}
                  alt={`${form.orgName || "Org"} logo`}
                  className="size-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <Building2 className="size-5 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-zinc-100">
                {form.orgName || "GuardianX"}
              </div>
              <div className="truncate text-[10px] text-zinc-500">
                Security Posture Report
              </div>
            </div>
          </div>
          <div className="space-y-2 px-4 py-4 text-[11px]">
            <PreviewRow icon={Mail} label="Email" value={form.orgEmail} />
            <PreviewRow icon={Phone} label="Phone" value={form.orgPhone} />
            <PreviewRow icon={Globe} label="Website" value={form.orgWebsite} />
          </div>
          <div className="border-t border-zinc-800 bg-zinc-950/40 px-4 py-2 text-[10px] text-zinc-600">
            Generated by GuardianX Autonomous Security Platform
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 text-zinc-500" />
      <span className="w-14 shrink-0 text-zinc-500">{label}</span>
      <span className="truncate text-zinc-300">{value || "not set"}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS ROUTING TAB
// ════════════════════════════════════════════════════════════════════════════
const EVENT_ROWS: { key: EventTypeKey; label: string; icon: typeof Bell; accent: string }[] = [
  { key: "critical_findings", label: "Critical Findings", icon: ShieldCheck, accent: "text-red-400" },
  { key: "scan_completed", label: "Scan Completed", icon: Network, accent: "text-cyan-400" },
  { key: "incident_created", label: "Incident Created", icon: AlertCircle, accent: "text-amber-400" },
  { key: "canary_triggered", label: "Canary Triggered", icon: Sparkles, accent: "text-rose-400" },
  { key: "patch_ready", label: "Patch Ready", icon: ShieldCheck, accent: "text-emerald-400" },
  { key: "daily_digest", label: "Daily Digest", icon: FileText, accent: "text-sky-400" },
];

const CHANNEL_COLS: { key: ChannelKey; label: string; icon: typeof Mail }[] = [
  { key: "email", label: "Email", icon: Mail },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { key: "telegram", label: "Telegram", icon: Send },
  { key: "sms", label: "SMS", icon: Phone },
];

function NotificationsTab() {
  const { toast } = useToast();
  const { settings, loaded } = useSettingsLoader();

  const cfg = settings.notifications.config as NotificationsConfig;
  const [form, setForm] = useState<NotificationsConfig>(cfg);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(cfg);
  }, [loaded]);

  const toggle = (eventKey: EventTypeKey, channel: ChannelKey, value: boolean) => {
    setForm((prev) => ({
      ...prev,
      [eventKey]: { ...prev[eventKey], [channel]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSetting("notifications", { ...form }, true);
      toast({ title: "Routing rules saved", description: "Notification matrix updated." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <SettingsSkeleton />;

  return (
    <SettingsCard
      icon={Bell}
      title="Notification Routing"
      description="When an event occurs, GuardianX will send notifications via all enabled channels."
      accent="amber"
      footer={
        <div className="flex justify-end">
          <SaveButton onClick={handleSave} loading={saving} label="Save Routing Rules" />
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300/90">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Routing rules are independent of channel configuration. A channel must be enabled and
          configured on its own tab for messages to actually deliver.
        </span>
      </div>

      {/* Desktop: matrix table */}
      <div className="hidden overflow-x-auto rounded-md border border-zinc-800 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Event
              </th>
              {CHANNEL_COLS.map((c) => {
                const Icon = c.icon;
                return (
                  <th key={c.key} className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    <div className="flex flex-col items-center gap-1">
                      <Icon className="size-3.5 text-zinc-400" />
                      <span>{c.label}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {EVENT_ROWS.map((row, idx) => {
              const Icon = row.icon;
              return (
                <tr
                  key={row.key}
                  className={`border-b border-zinc-800/60 ${idx % 2 === 1 ? "bg-zinc-900/30" : ""}`}
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`size-4 ${row.accent}`} />
                      <span className="font-medium text-zinc-200">{row.label}</span>
                    </div>
                  </td>
                  {CHANNEL_COLS.map((c) => (
                    <td key={c.key} className="px-3 py-3 text-center">
                      <div className="flex justify-center">
                        <Switch
                          checked={!!form[row.key][c.key]}
                          onCheckedChange={(v) => toggle(row.key, c.key, v)}
                          aria-label={`${row.label} via ${c.label}`}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="space-y-3 md:hidden">
        {EVENT_ROWS.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.key} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Icon className={`size-4 ${row.accent}`} />
                <span className="text-sm font-semibold text-zinc-200">{row.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CHANNEL_COLS.map((c) => {
                  const Icon2 = c.icon;
                  return (
                    <div
                      key={c.key}
                      className="flex items-center justify-between gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/40 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                        <Icon2 className="size-3.5 text-zinc-400" />
                        {c.label}
                      </div>
                      <Switch
                        checked={!!form[row.key][c.key]}
                        onCheckedChange={(v) => toggle(row.key, c.key, v)}
                        aria-label={`${row.label} via ${c.label}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        <CheckCircle2 className="size-3.5 text-emerald-400" />
        <span>
          {EVENT_ROWS.reduce(
            (acc, r) => acc + CHANNEL_COLS.filter((c) => form[r.key][c.key]).length,
            0
          )}{" "}
          active routes across {EVENT_ROWS.length} event types and {CHANNEL_COLS.length} channels.
        </span>
      </div>
    </SettingsCard>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SECURITY TAB — TOTP 2FA setup / verify / disable
// ════════════════════════════════════════════════════════════════════════════
//
// Three states:
//   1. status === "unknown"   → loading
//   2. status.enabled === false → "Enable 2FA" button. Clicking it calls
//      /api/auth/2fa/setup, which returns a base32 secret + a PNG data URL
//      QR code. The user scans with Google Authenticator / Authy / 1Password
//      (or types the secret manually), enters the 6-digit code, and clicks
//      "Verify & Enable" → /api/auth/2fa/verify flips twoFactorEnabled=true.
//   3. status.enabled === true  → "2FA is enabled" badge + "Disable 2FA"
//      button (which requires the current TOTP code, for safety).
//
// For admins who haven't enabled 2FA, we show a stronger warning at the top.

function SecurityTab({ currentUser }: { currentUser?: { role?: string } | null }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<{
    enabled: boolean;
    hasPendingSecret: boolean;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Setup flow state
  const [setupData, setSetupData] = useState<{
    secret: string;
    qrCode: string;
    otpauthUrl: string;
  } | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Disable flow state
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/auth/2fa");
      const data = await res.json();
      if (res.ok) {
        setStatus({ enabled: !!data.enabled, hasPendingSecret: !!data.hasPendingSecret });
      } else {
        setStatus({ enabled: false, hasPendingSecret: false });
      }
    } catch {
      setStatus({ enabled: false, hasPendingSecret: false });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSetup = async () => {
    setSetupLoading(true);
    setVerifyCode("");
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start 2FA setup");
      }
      setSetupData({
        secret: data.secret,
        qrCode: data.qrCode,
        otpauthUrl: data.otpauthUrl,
      });
      toast({
        title: "Scan the QR code",
        description: "Then enter the 6-digit code from your authenticator to verify.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Setup failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSetupLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!setupData) return;
    const trimmed = verifyCode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      toast({
        variant: "destructive",
        title: "Invalid code",
        description: "Enter the 6-digit code from your authenticator.",
      });
      return;
    }
    setVerifyLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid code");
      }
      toast({
        title: "2FA enabled!",
        description: "Future logins will require a code from your authenticator.",
      });
      setSetupData(null);
      setVerifyCode("");
      await loadStatus();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: err instanceof Error ? err.message : "Invalid 2FA code.",
      });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleDisable = async () => {
    const trimmed = disableCode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      toast({
        variant: "destructive",
        title: "Invalid code",
        description: "Enter your current 6-digit code to disable 2FA.",
      });
      return;
    }
    setDisableLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid code");
      }
      toast({
        title: "2FA disabled",
        description: "We recommend re-enabling it as soon as possible.",
      });
      setDisableOpen(false);
      setDisableCode("");
      await loadStatus();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Disable failed",
        description: err instanceof Error ? err.message : "Invalid 2FA code.",
      });
    } finally {
      setDisableLoading(false);
    }
  };

  const cancelSetup = () => {
    setSetupData(null);
    setVerifyCode("");
  };

  const isAdmin = currentUser?.role === "admin";

  if (statusLoading) return <SettingsSkeleton />;

  return (
    <div className="space-y-5">
      {/* Admin warning — shown only for admins who haven't enabled 2FA. */}
      {isAdmin && status && !status.enabled && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-200">
              Admins should enable 2FA for account security
            </p>
            <p className="mt-1 text-[11px] text-amber-100/70">
              Your admin account can approve users, manage credentials, and change platform
              settings. Without 2FA, a compromised password gives an attacker full control.
              Enable 2FA below — it takes about 30 seconds.
            </p>
          </div>
        </div>
      )}

      <SettingsCard
        icon={ShieldCheck}
        title="Two-Factor Authentication (TOTP)"
        description="Add a second factor to your login using Google Authenticator, Authy, or 1Password."
        accent="violet"
      >
        {/* Status row */}
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
          <div className="flex items-center gap-2">
            {status?.enabled ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-200">2FA is enabled</span>
                <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">
                  Active
                </Badge>
              </>
            ) : (
              <>
                <AlertCircle className="size-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-200">2FA is not enabled</span>
                {status?.hasPendingSecret && (
                  <Badge className="border border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">
                    Setup pending
                  </Badge>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {!status?.enabled && !setupData && (
              <Button
                onClick={handleSetup}
                disabled={setupLoading}
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {setupLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Enable 2FA
              </Button>
            )}
            {status?.enabled && !disableOpen && (
              <Button
                variant="outline"
                onClick={() => setDisableOpen(true)}
                className="border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
              >
                Disable 2FA
              </Button>
            )}
          </div>
        </div>

        {/* Setup flow — QR + secret + verify input */}
        {setupData && (
          <div className="space-y-4 rounded-md border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <div className="mx-auto flex flex-col items-center gap-2">
                <img
                  src={setupData.qrCode}
                  alt="2FA QR code"
                  className="size-48 rounded-md border border-zinc-700 bg-white p-2"
                />
                <p className="text-[10px] text-zinc-500">Scan with your authenticator app</p>
              </div>
              <div className="space-y-3">
                <Field label="Manual entry (if you can't scan)" htmlFor="totp-secret">
                  <Input
                    id="totp-secret"
                    readOnly
                    value={setupData.secret}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="font-mono text-sm tracking-wider text-zinc-200"
                  />
                </Field>
                <Field label="Enter the 6-digit code from your authenticator" htmlFor="totp-verify">
                  <Input
                    id="totp-verify"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    placeholder="123456"
                    className="border-zinc-700 bg-zinc-900/60 text-center text-lg tracking-[0.5em] text-zinc-200 placeholder:tracking-normal focus-visible:border-emerald-500/50"
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    onClick={handleVerify}
                    disabled={verifyLoading || verifyCode.length !== 6}
                    className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    {verifyLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Verify &amp; Enable
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelSetup}
                    className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Disable flow — requires current TOTP code */}
        {status?.enabled && disableOpen && (
          <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-200">Disable 2FA</p>
                <p className="mt-1 text-[11px] text-amber-100/70">
                  For your safety, enter your current 6-digit authenticator code to confirm.
                  After disabling, you can re-enable 2FA at any time.
                </p>
              </div>
            </div>
            <Field label="Current 6-digit code" htmlFor="totp-disable">
              <Input
                id="totp-disable"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && handleDisable()}
                placeholder="123456"
                className="border-zinc-700 bg-zinc-900/60 text-center text-lg tracking-[0.5em] text-zinc-200 placeholder:tracking-normal focus-visible:border-amber-500/50"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                onClick={handleDisable}
                disabled={disableLoading || disableCode.length !== 6}
                className="bg-amber-600 text-white hover:bg-amber-500"
              >
                {disableLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Confirm Disable
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDisableOpen(false);
                  setDisableCode("");
                }}
                className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Help footer */}
        {!setupData && !disableOpen && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/30 px-3 py-2 text-[11px] text-zinc-400">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-400" />
            <div>
              <p className="font-medium text-zinc-300">How TOTP 2FA works</p>
              <p className="mt-1 text-zinc-500">
                We generate a unique secret and show it as a QR code. Scan it with Google
                Authenticator / Authy / 1Password, then enter the 6-digit code from the app to
                confirm. From then on, every login will require both your password AND a fresh
                code from your authenticator. Codes refresh every 30 seconds.
              </p>
            </div>
          </div>
        )}
      </SettingsCard>

      {/* Recent login activity — lets the user audit who has been
          attempting to log into their account. Fetches the last 20
          attempts from /api/auth/login-history on mount (and on manual
          refresh). Renders nothing for users on a fresh DB without the
          LoginHistory table — the API returns an empty list with a
          `migrationPending` flag and we surface it as a friendly hint. */}
      <LoginActivityCard />
    </div>
  );
}

// ── Recent Login Activity ───────────────────────────────────────────────────
//
// Sub-section of the Security tab. Lists the user's last 20 login
// attempts (success AND failure), newest first, so they can spot
// unauthorized access. Failed attempts show the failure reason under
// the row; successes show a green ✓ badge.

interface LoginHistoryEntry {
  id: string;
  ipAddress: string;
  userAgent: string;
  browser: string;
  os: string;
  success: boolean;
  failureReason: string | null;
  timestamp: string;
}

/**
 * Format a timestamp as a relative-time string ("just now", "5m ago",
 * "3h ago", "2d ago") for compact display. Falls back to "on <date>"
 * for anything older than 7 days.
 *
 * Pure client-side — no Intl.RelativeTimeFormat to keep the bundle
 * small and the output deterministic. Tolerant of malformed input
 * (returns "—" if the timestamp can't be parsed).
 */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "—";
  const now = Date.now();
  const diffMs = now - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  // Older than a week — show the calendar date.
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function LoginActivityCard() {
  const { toast } = useToast();
  const [history, setHistory] = useState<LoginHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login-history");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load login history");
      }
      setHistory(Array.isArray(data.history) ? data.history : []);
      setMigrationPending(!!data.migrationPending);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      setError(msg);
      // Only toast on manual refresh — auto-load on tab mount should
      // fail silently to avoid nagging on transient network blips.
      if (opts?.silent) {
        toast({
          variant: "destructive",
          title: "Couldn't refresh login history",
          description: msg,
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SettingsCard
      icon={History}
      title="Recent Login Activity"
      description="The last 20 attempts to log into your account. If you see one you don't recognize, change your password and contact support."
      accent="violet"
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-zinc-500">
            Showing the last {history.length} of 20 attempts.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load({ silent: true })}
            disabled={refreshing || loading}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>
      }
    >
      {/* Migration-pending hint: the LoginHistory table doesn't exist
          on the user's Supabase project yet. They need to run POST
          /api/db-init (or paste the new migration into the SQL editor). */}
      {migrationPending && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-100/80">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div>
            <p className="font-medium text-amber-200">Login tracking is not yet enabled</p>
            <p className="mt-0.5">
              The <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono">LoginHistory</code>{" "}
              table hasn&apos;t been created on this database yet. Ask an admin to{" "}
              <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono">POST /api/db-init</code>{" "}
              (or run <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono">supabase/migrations/0009_login_history.sql</code>{" "}
              in the Supabase SQL editor). Future logins will appear here.
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !migrationPending && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-[11px] text-red-100/80">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <div>
            <p className="font-medium text-red-200">Couldn&apos;t load login history</p>
            <p className="mt-0.5 text-red-100/70">{error}</p>
          </div>
        </div>
      )}

      {/* Loading skeleton — first fetch on tab mount */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5">
              <Skeleton className="size-8 rounded-md bg-zinc-800/60" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32 bg-zinc-800/60" />
                <Skeleton className="h-2.5 w-48 bg-zinc-800/60" />
              </div>
              <Skeleton className="h-5 w-16 bg-zinc-800/60" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && history.length === 0 && !migrationPending && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/30 px-4 py-8 text-center">
          <CheckCircle2 className="size-6 text-emerald-400/70" />
          <p className="text-sm font-medium text-zinc-300">No login activity recorded yet</p>
          <p className="max-w-sm text-[11px] text-zinc-500">
            Once you (or anyone else) attempt to log into this account, the most recent 20
            attempts will appear here with their IP address, browser, and result.
          </p>
        </div>
      )}

      {/* Login history list */}
      {!loading && !error && history.length > 0 && (
        <div className="space-y-1.5">
          {/* Column header — hidden on mobile (the rows stack vertically
              there anyway, so a header doesn't help). */}
          <div className="hidden grid-cols-[1fr_1fr_auto] gap-3 px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500 sm:grid">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3" /> When
            </div>
            <div className="flex items-center gap-1.5">
              <Globe className="size-3" /> IP &amp; Device
            </div>
            <div>Result</div>
          </div>

          {history.map((entry) => (
            <LoginHistoryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Always-visible safety note */}
      {!loading && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/30 px-3 py-2 text-[11px] text-zinc-400">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-400" />
          <p>
            If you see a login you don&apos;t recognize,{" "}
            <span className="font-medium text-zinc-200">change your password</span> and{" "}
            <span className="font-medium text-zinc-200">contact support</span>. Enable 2FA above
            to add a second factor and stop attackers even if your password is leaked.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}

/**
 * One login-attempt row. On mobile it stacks vertically (timestamp →
 * IP/device → result badge → failure reason). On >=sm it's a 3-column
 * grid: when | IP & device | result.
 */
function LoginHistoryRow({ entry }: { entry: LoginHistoryEntry }) {
  const absoluteTime = (() => {
    try {
      return new Date(entry.timestamp).toLocaleString();
    } catch {
      return entry.timestamp;
    }
  })();

  const deviceSummary =
    entry.browser === "Unknown" && entry.os === "Unknown"
      ? entry.userAgent
        ? // Truncate the raw UA so a giant bot UA doesn't blow out the row.
          entry.userAgent.length > 60
          ? `${entry.userAgent.slice(0, 60)}…`
          : entry.userAgent
        : "Unknown device"
      : `${entry.browser} on ${entry.os}`;

  return (
    <div
      className="grid grid-cols-1 gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-3"
      title={`Recorded ${absoluteTime}`}
    >
      {/* When */}
      <div className="flex items-center gap-1.5 text-xs">
        <Clock className="size-3 shrink-0 text-zinc-500" />
        <span
          className="font-medium text-zinc-200"
          title={absoluteTime}
        >
          {formatRelativeTime(entry.timestamp)}
        </span>
      </div>

      {/* IP & device */}
      <div className="flex flex-col gap-0.5 text-[11px] text-zinc-400">
        <div className="flex items-center gap-1.5 font-mono">
          <MapPin className="size-3 shrink-0 text-zinc-500" />
          <span className="text-zinc-300">{entry.ipAddress || "unknown IP"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Monitor className="size-3 shrink-0 text-zinc-500" />
          <span className="truncate" title={entry.userAgent || deviceSummary}>
            {deviceSummary}
          </span>
        </div>
      </div>

      {/* Result + optional failure reason */}
      <div className="flex flex-col items-start gap-0.5 sm:items-end">
        {entry.success ? (
          <Badge className="border border-emerald-500/40 bg-emerald-500/15 text-[10px] font-medium text-emerald-200">
            <CheckCircle2 className="mr-1 size-3" />
            Success
          </Badge>
        ) : (
          <Badge className="border border-red-500/40 bg-red-500/15 text-[10px] font-medium text-red-200">
            <AlertCircle className="mr-1 size-3" />
            Failed
          </Badge>
        )}
        {!entry.success && entry.failureReason && (
          <p
            className="max-w-[180px] text-[10px] leading-tight text-red-300/80 sm:text-right"
            title={entry.failureReason}
          >
            {entry.failureReason}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Organization tab (Task #8-multi-tenancy) ────────────────────────────────
//
// Surfaces the org-level multi-tenancy controls: org profile, member list,
// invite flow, and member removal. Only renders content if the user is in
// an org — otherwise it shows a CTA pointing to the sidebar OrgSwitcher
// (which has the "Create Organization" modal).
function OrganizationTab({ currentUser }: { currentUser?: { role?: string } | null }) {
  const { toast } = useToast();
  const [org, setOrg] = useState<{
    id: string;
    name: string;
    slug: string;
    members: Array<{
      id: string;
      email: string;
      role: string;
      invitedAt: string | null;
      joinedAt: string | null;
      isCreator: boolean;
    }>;
    memberCount: number;
  } | null>(null);
  const [currentUserMemberId, setCurrentUserMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "analyst" | "viewer">("viewer");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sentinelApi.getCurrentOrganization();
      setOrg(result.organization);
      setCurrentUserMemberId(result.currentUserMemberId);
    } catch (err) {
      // Non-fatal — render the empty state.
      console.warn("[OrganizationTab] load failed:", err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast({ variant: "destructive", title: "Email required", description: "Enter the teammate's email." });
      return;
    }
    setInviting(true);
    try {
      await sentinelApi.inviteToOrganization({ email: inviteEmail.trim(), role: inviteRole });
      toast({
        title: "Invitation sent",
        description: `An invite email was sent to ${inviteEmail.trim()}.`,
      });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("viewer");
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Invite failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from this organization? They will lose access to all org-shared clients.`)) {
      return;
    }
    setRemovingId(memberId);
    try {
      await sentinelApi.removeOrganizationMember(memberId);
      toast({ title: "Member removed", description: `${memberEmail} no longer has access.` });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Remove failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return <SettingsSkeleton />;

  // No org yet — show a CTA pointing to the sidebar OrgSwitcher.
  if (!org) {
    return (
      <SettingsCard
        icon={Building2}
        title="No Organization"
        description="You're currently a solo user. Create an organization to share clients, scans, and findings with your team."
        accent="cyan"
      >
        <div className="flex items-start gap-3 rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-3 text-[12px] text-cyan-200/90">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-cyan-300" />
          <span>
            Click <strong className="text-cyan-100">Create Org</strong> in the sidebar
            (top-left, under the GuardianX logo) to get started. The first user
            to create an org becomes its admin and can invite teammates by email.
          </span>
        </div>
      </SettingsCard>
    );
  }

  // Determine if the current user is an org admin (independent of their
  // global GuardianX role). Org admins can invite + remove members.
  const me = org.members.find((m) => m.id === currentUserMemberId);
  const isOrgAdmin = me?.role === "admin";

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={Building2}
        title="Organization Profile"
        description="Your team's shared workspace. Members see all clients in this org when their workspace context is set to 'Org Workspace'."
        accent="cyan"
        footer={
          isOrgAdmin ? (
            <div className="flex justify-end">
              <Button onClick={() => setInviteOpen(true)} className="bg-emerald-600 text-white hover:bg-emerald-500">
                <User className="size-4" />
                Invite Member
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Organization Name">
            <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100">
              {org.name}
            </div>
          </Field>
          <Field label="Slug">
            <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-sm text-emerald-300">
              {org.slug}
            </div>
          </Field>
          <Field label="Member Count">
            <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100">
              {org.memberCount} {org.memberCount === 1 ? "member" : "members"}
            </div>
          </Field>
        </div>
        {!isOrgAdmin && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300/90">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              You are an org member, not an admin. Only org admins can invite
              new members or remove existing ones. Ask an admin if you need
              these permissions.
            </span>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        icon={Users}
        title="Members"
        description="People who have access to this organization's shared clients."
        accent="emerald"
      >
        <ul className="divide-y divide-zinc-800/60">
          {org.members.map((m) => {
            const isMe = m.id === currentUserMemberId;
            const joined = m.joinedAt != null;
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                  {m.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm font-medium text-zinc-100">
                    <span className="truncate">{m.email}</span>
                    {isMe && (
                      <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-300">
                        You
                      </Badge>
                    )}
                    {m.isCreator && (
                      <Badge variant="outline" className="border-amber-500/30 text-[9px] text-amber-300">
                        Creator
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-[10px] text-zinc-500">
                    {joined
                      ? `Joined ${new Date(m.joinedAt as string).toLocaleDateString()}`
                      : `Invited ${m.invitedAt ? new Date(m.invitedAt).toLocaleDateString() : ""} (pending)`}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    m.role === "admin"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
                      : m.role === "analyst"
                        ? "border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-300"
                        : "border-zinc-700 bg-zinc-800/40 text-[10px] text-zinc-300"
                  }
                >
                  {m.role}
                </Badge>
                {isOrgAdmin && !isMe && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleRemove(m.id, m.email)}
                    disabled={removingId === m.id}
                    title={joined ? "Remove member" : "Revoke invite"}
                    className="size-7 shrink-0 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    {removingId === m.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                )}
              </li>
            );
          })}
          {org.members.length === 0 && (
            <li className="py-6 text-center text-xs text-zinc-500">No members yet.</li>
          )}
        </ul>
      </SettingsCard>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-50">
              <User className="size-5 text-emerald-400" />
              Invite a Teammate
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              They&apos;ll receive an email with a signup link tied to this organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Email" htmlFor="invite-email">
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@yourcompany.com"
                className={inputCls}
              />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "analyst" | "viewer")}
                className={selectCls}
              >
                <option value="viewer">Viewer — read-only access to org clients</option>
                <option value="analyst">Analyst — can run scans, create clients</option>
                <option value="admin">Admin — can invite + remove members</option>
              </select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting} className="border-zinc-700 bg-zinc-900 text-zinc-300">
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="bg-emerald-600 text-white hover:bg-emerald-500">
              {inviting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Skeleton loader ─────────────────────────────────────────────────────────
function SettingsSkeleton() {
  return (
    <div className="holo-card-sharp hud-corners border border-zinc-800 p-6">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="size-9 rounded-md bg-zinc-800/60" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40 bg-zinc-800/60" />
          <Skeleton className="h-3 w-64 bg-zinc-800/60" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20 bg-zinc-800/60" />
            <Skeleton className="h-9 w-full bg-zinc-800/60" />
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Skeleton className="h-9 w-32 bg-zinc-800/60" />
        <Skeleton className="h-9 w-24 bg-zinc-800/60" />
      </div>
    </div>
  );
}

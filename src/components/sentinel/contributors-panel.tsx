"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, Trash2, Edit2, Github, Linkedin, Twitter,
  Award, Code2, Shield, Palette, Bug, BookOpen, Briefcase,
  X, Loader2, Star, GitCommit,
} from "lucide-react";

interface Contributor {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  title?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  contributions: number;
  contributionSummary?: string | null;
  status: string;
  joinedAt: string;
}

interface GitHubContributor {
  username: string;
  avatarUrl: string;
  profileUrl: string;
  contributions: number;
}

const ROLE_CONFIG: Record<string, { icon: typeof Code2; color: string; bg: string; border: string; label: string }> = {
  founder: { icon: Star, color: "text-amber-400", bg: "bg-amber-500/5", border: "border-amber-500/40", label: "Founder" },
  developer: { icon: Code2, color: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/40", label: "Developer" },
  "security researcher": { icon: Shield, color: "text-red-400", bg: "bg-red-500/5", border: "border-red-500/40", label: "Security Researcher" },
  designer: { icon: Palette, color: "text-violet-400", bg: "bg-violet-500/5", border: "border-violet-500/40", label: "Designer" },
  tester: { icon: Bug, color: "text-cyan-400", bg: "bg-cyan-500/5", border: "border-cyan-500/40", label: "Tester" },
  advisor: { icon: Briefcase, color: "text-sky-400", bg: "bg-sky-500/5", border: "border-sky-500/40", label: "Advisor" },
  intern: { icon: BookOpen, color: "text-orange-400", bg: "bg-orange-500/5", border: "border-orange-500/40", label: "Intern" },
  analyst: { icon: Award, color: "text-purple-400", bg: "bg-purple-500/5", border: "border-purple-500/40", label: "Analyst" },
  contributor: { icon: Users, color: "text-zinc-400", bg: "bg-zinc-500/5", border: "border-zinc-500/40", label: "Contributor" },
};

function getRoleConfig(role: string) {
  return ROLE_CONFIG[role.toLowerCase()] || ROLE_CONFIG.contributor;
}

const inputCls = "border-zinc-800 bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50";

export function ContributorsPanel({ currentUser }: { currentUser?: { role?: string } | null }) {
  const { toast } = useToast();
  const isAdmin = currentUser?.role === "admin";

  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [githubContributors, setGithubContributors] = useState<GitHubContributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Add/Edit form state
  const [form, setForm] = useState({
    name: "", role: "developer", title: "", bio: "",
    githubUrl: "", linkedinUrl: "", twitterUrl: "",
    contributions: 0, contributionSummary: "", status: "active",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contributorsRes, githubRes] = await Promise.all([
        fetch("/api/contributors"),
        fetch("/api/contributors/github").catch(() => null),
      ]);
      const contributorsData = await contributorsRes.json();
      setContributors(contributorsData);
      if (githubRes && githubRes.ok) {
        const ghData = await githubRes.json();
        setGithubContributors(ghData);
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to load contributors" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("guardianx_token") : null;
    try {
      const res = await fetch("/api/contributors", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Contributor added", description: form.name });
        setShowAddForm(false);
        setForm({ name: "", role: "developer", title: "", bio: "", githubUrl: "", linkedinUrl: "", twitterUrl: "", contributions: 0, contributionSummary: "", status: "active" });
        load();
      } else {
        toast({ variant: "destructive", title: "Failed", description: data.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from contributors?`)) return;
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("guardianx_token") : null;
    try {
      await fetch(`/api/contributors?id=${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      toast({ title: "Contributor removed", description: name });
      load();
    } catch {
      toast({ variant: "destructive", title: "Failed to remove" });
    }
  };

  // Separate active and alumni
  const active = contributors.filter((c) => c.status === "active");
  const alumni = contributors.filter((c) => c.status === "alumni");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
            <Users className="size-5 text-emerald-400" />
            Contributions
          </h2>
          <p className="text-sm text-zinc-500">
            The people building GuardianX — developers, researchers, testers, and advisors.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAddForm(!showAddForm)} className="bg-emerald-600 text-white hover:bg-emerald-500">
            {showAddForm ? <X className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
            {showAddForm ? "Cancel" : "Add Contributor"}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="holo-card-sharp hud-corners rounded-lg p-4">
          <div className="text-2xl font-bold text-emerald-400">{contributors.length}</div>
          <div className="text-xs text-zinc-500">Total Contributors</div>
        </div>
        <div className="holo-card-sharp hud-corners rounded-lg p-4">
          <div className="text-2xl font-bold text-cyan-400">{active.length}</div>
          <div className="text-xs text-zinc-500">Active Now</div>
        </div>
        <div className="holo-card-sharp hud-corners rounded-lg p-4">
          <div className="text-2xl font-bold text-violet-400">{githubContributors.length}</div>
          <div className="text-xs text-zinc-500">GitHub Contributors</div>
        </div>
        <div className="holo-card-sharp hud-corners rounded-lg p-4">
          <div className="text-2xl font-bold text-amber-400">
            {contributors.reduce((sum, c) => sum + (c.contributions || 0), 0)}
          </div>
          <div className="text-xs text-zinc-500">Total Contributions</div>
        </div>
      </div>

      {/* Add/Edit form */}
      {showAddForm && isAdmin && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="holo-card-sharp hud-corners overflow-hidden rounded-lg p-5"
        >
          <h3 className="mb-4 text-sm font-bold text-zinc-100">Add New Contributor</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-zinc-400">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" className={inputCls} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Role</Label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className={`w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 ${inputCls}`}
              >
                <option value="developer">Developer</option>
                <option value="security researcher">Security Researcher</option>
                <option value="designer">Designer</option>
                <option value="tester">Tester</option>
                <option value="advisor">Advisor</option>
                <option value="intern">Intern</option>
                <option value="analyst">Analyst</option>
                <option value="founder">Founder</option>
                <option value="contributor">Contributor</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lead Security Engineer" className={inputCls} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Contributions Count</Label>
              <Input type="number" value={form.contributions} onChange={(e) => setForm({ ...form, contributions: parseInt(e.target.value) || 0 })} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-zinc-400">Bio</Label>
              <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Short bio about the contributor" className={inputCls + " min-h-[60px]"} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-zinc-400">Contribution Summary</Label>
              <Input value={form.contributionSummary} onChange={(e) => setForm({ ...form, contributionSummary: e.target.value })} placeholder="Built the DAST pipeline, fixed 23 bugs" className={inputCls} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">GitHub URL</Label>
              <Input value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} placeholder="https://github.com/username" className={inputCls} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">LinkedIn URL</Label>
              <Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/username" className={inputCls} />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Status</Label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={`w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 ${inputCls}`}
              >
                <option value="active">Active</option>
                <option value="alumni">Alumni</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleAdd} className="w-full bg-emerald-600 text-white hover:bg-emerald-500">
                <Plus className="mr-2 size-4" /> Add Contributor
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-emerald-400" />
        </div>
      )}

      {/* Active contributors grid */}
      {!loading && active.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-400">Active Contributors</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((c, i) => {
              const rc = getRoleConfig(c.role);
              const RoleIcon = rc.icon;
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`group relative rounded-lg border ${rc.border} ${rc.bg} p-5 transition-shadow hover:shadow-[0_0_24px_rgba(16,185,129,0.15)]`}
                >
                  {/* Delete button (admin only) */}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      className="absolute right-3 top-3 z-10 rounded p-1 text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      title="Remove contributor"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}

                  {/* Avatar + name */}
                  <div className="mb-3 flex items-center gap-3">
                    <div className={`flex size-12 items-center justify-center rounded-full border ${rc.border} bg-zinc-950`}>
                      {c.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.avatarUrl} alt={c.name} className="size-12 rounded-full" />
                      ) : (
                        <span className="text-lg font-bold text-zinc-300">
                          {c.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">{c.name}</h4>
                      {c.title && <p className="text-xs text-zinc-500">{c.title}</p>}
                    </div>
                  </div>

                  {/* Role badge */}
                  <div className="mb-3 flex items-center gap-2">
                    <Badge variant="outline" className={`${rc.border} ${rc.color} text-[10px] uppercase tracking-wider`}>
                      <RoleIcon className="mr-1 size-3" />
                      {rc.label}
                    </Badge>
                    {c.contributions > 0 && (
                      <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
                        <GitCommit className="mr-1 size-3" />
                        {c.contributions}
                      </Badge>
                    )}
                  </div>

                  {/* Bio */}
                  {c.bio && (
                    <p className="mb-2 text-xs leading-relaxed text-zinc-400">{c.bio}</p>
                  )}

                  {/* Contribution summary */}
                  {c.contributionSummary && (
                    <div className="mb-3 rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
                      <p className="text-[11px] text-emerald-300/80">{c.contributionSummary}</p>
                    </div>
                  )}

                  {/* Social links */}
                  <div className="flex gap-2">
                    {c.githubUrl && (
                      <a href={c.githubUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-emerald-400">
                        <Github className="size-4" />
                      </a>
                    )}
                    {c.linkedinUrl && (
                      <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-sky-400">
                        <Linkedin className="size-4" />
                      </a>
                    )}
                    {c.twitterUrl && (
                      <a href={c.twitterUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-cyan-400">
                        <Twitter className="size-4" />
                      </a>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* GitHub contributors (auto-fetched) */}
      {githubContributors.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-400">
            <Github className="size-4" />
            GitHub Contributors (auto-synced)
          </h3>
          <div className="flex flex-wrap gap-3">
            {githubContributors.map((gh) => (
              <a
                key={gh.username}
                href={gh.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gh.avatarUrl} alt={gh.username} className="size-8 rounded-full" />
                <div>
                  <div className="text-xs font-medium text-zinc-300 group-hover:text-emerald-300">{gh.username}</div>
                  <div className="text-[10px] text-zinc-500">{gh.contributions} commits</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Alumni */}
      {!loading && alumni.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-500">Alumni</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alumni.map((c) => {
              const rc = getRoleConfig(c.role);
              return (
                <div key={c.id} className={`rounded-lg border ${rc.border} ${rc.bg} p-4 opacity-60`}>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950">
                      <span className="text-sm font-bold text-zinc-400">{c.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-zinc-300">{c.name}</h4>
                      <p className="text-[11px] text-zinc-600">{c.title || rc.label}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && contributors.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-12 text-center">
          <Users className="mx-auto size-8 text-zinc-700" />
          <p className="mt-2 text-sm text-zinc-500">No contributors yet.</p>
          {isAdmin && <p className="text-xs text-zinc-600">Click "Add Contributor" to add the first one.</p>}
        </div>
      )}
    </div>
  );
}

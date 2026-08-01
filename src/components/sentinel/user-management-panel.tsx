"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Crown, Eye, Shield, UserPlus, Trash2, Loader2, Users, Mail,
} from "lucide-react";
import { motion } from "framer-motion";

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

const ROLE_STYLES: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  admin: { icon: Crown, color: "border-amber-500/40 bg-amber-500/10 text-amber-300", label: "Admin" },
  analyst: { icon: Shield, color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", label: "Analyst" },
  viewer: { icon: Eye, color: "border-sky-500/40 bg-sky-500/10 text-sky-300", label: "Viewer" },
};

export function UserManagementPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const invite = async () => {
    if (!newEmail || !newName || !newPassword) return;
    setInviting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, name: newName, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "User created", description: `${newName} (${newRole})` });
      setNewEmail(""); setNewName(""); setNewPassword(""); setNewRole("viewer");
      setShowInvite(false);
      load();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed", description: err instanceof Error ? err.message : "unknown" });
    } finally { setInviting(false); }
  };

  const changeRole = async (id: string, role: string) => {
    try {
      await fetch(`/api/users?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      toast({ title: "Role updated", description: `Changed to ${role}` });
      load();
    } catch { toast({ variant: "destructive", title: "Failed" }); }
  };

  const remove = async (id: string, name: string) => {
    try {
      await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      toast({ title: "User removed", description: name });
      load();
    } catch { toast({ variant: "destructive", title: "Failed" }); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
            <Users className="size-5 text-emerald-400" />
            User Management
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Manage team members and their roles. Admins have full access, analysts can scan and review, viewers have read-only access.
          </p>
        </div>
        <Button onClick={() => setShowInvite(!showInvite)} className="bg-emerald-600 text-white hover:bg-emerald-500">
          <UserPlus className="size-4" />
          <span className="hidden sm:inline">Add User</span>
        </Button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          <Card className="holo-card hud-corners mb-4 rounded-xl p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">Invite New Member</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs text-zinc-400">Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jane Doe" className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Email</Label>
                <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="jane@company.com" className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Password</Label>
                <Input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="••••••••" className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Role</Label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 text-sm text-zinc-200">
                  <option value="admin">Admin</option>
                  <option value="analyst">Analyst</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <Button onClick={invite} disabled={inviting || !newEmail || !newName || !newPassword} className="mt-3 bg-emerald-600 text-white hover:bg-emerald-500">
              {inviting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Create User
            </Button>
          </Card>
        </motion.div>
      )}

      {/* User list */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 bg-emerald-500/10" />)}</div>
      ) : users.length === 0 ? (
        <Card className="holo-card hud-corners rounded-xl p-8 text-center text-sm text-zinc-500">
          <Users className="mx-auto size-8 text-zinc-700" />
          <p className="mt-2">No users yet. Create the first admin account.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map((u, i) => {
            const roleStyle = ROLE_STYLES[u.role] ?? ROLE_STYLES.viewer;
            return (
              <motion.div key={u.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="holo-card hud-corners glow-hover rounded-xl p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/60">
                      <roleStyle.icon className="size-5 text-zinc-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-zinc-100">{u.name}</span>
                        <Badge className={`border text-[9px] ${roleStyle.color}`}>{roleStyle.label}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                        <Mail className="size-3" /> {u.email}
                      </div>
                    </div>
                    {/* Role selector */}
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      className="h-8 rounded-md border border-zinc-700 bg-zinc-900/60 px-2 text-xs text-zinc-200"
                    >
                      <option value="admin">Admin</option>
                      <option value="analyst">Analyst</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <Button size="icon" variant="ghost" onClick={() => remove(u.id, u.name)} className="size-8 text-zinc-500 hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

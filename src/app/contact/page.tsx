"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Phone, Globe, Send, Loader2, Shield } from "lucide-react";

export default function ContactPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.message) return;
    setLoading(true);
    // Simulate send (in production, would call /api/contact)
    setTimeout(() => {
      toast({ title: "Message sent!", description: "We'll respond within 4 hours." });
      setForm({ name: "", email: "", company: "", message: "" });
      setLoading(false);
    }, 1500);
  };

  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-24 py-20 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 text-center">
            <Shield className="mx-auto size-10 text-emerald-400 neon-emerald" />
            <h1 className="mt-4 text-4xl font-bold text-zinc-50">Get in touch</h1>
            <p className="mt-2 text-sm text-zinc-400">Questions about GuardianX? Need a custom plan? We respond within 4 hours.</p>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
            {/* Form */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="holo-card-sharp hud-corners p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-zinc-400">Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe"
                    className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Email *</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@company.com"
                    className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Company</Label>
                  <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Corp"
                    className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50" />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Message *</Label>
                  <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tell us what you need..."
                    className="mt-1 min-h-[6rem] resize-none border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50" />
                </div>
                <Button onClick={handleSubmit} disabled={loading || !form.name || !form.email || !form.message}
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send Message
                </Button>
              </div>
            </motion.div>

            {/* Contact Info */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="holo-card-sharp hud-corners p-5">
                <h3 className="mb-3 text-xs font-mono uppercase tracking-widest text-emerald-500/60">Direct Contact</h3>
                <div className="space-y-3">
                  <a href="https://www.guardianx.in" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-zinc-300 hover:text-emerald-400">
                    <Globe className="size-4 text-emerald-400" /> www.guardianx.in
                  </a>
                  <a href="mailto:hello@guardianx.in" className="flex items-center gap-2 text-sm text-zinc-300 hover:text-emerald-400">
                    <Mail className="size-4 text-emerald-400" /> hello@guardianx.in
                  </a>
                  <a href="tel:+917006712347" className="flex items-center gap-2 text-sm text-zinc-300 hover:text-emerald-400">
                    <Phone className="size-4 text-emerald-400" /> +91 70067 12347
                  </a>
                </div>
              </div>
              <div className="holo-card-sharp hud-corners p-5">
                <h3 className="mb-2 text-xs font-mono uppercase tracking-widest text-emerald-500/60">Response Time</h3>
                <p className="text-xs text-zinc-400">General: within 4 hours<br />Security incidents: within 1 hour<br />Enterprise SLA: 24/7 phone</p>
              </div>
            </motion.div>
          </div>
        </div>
        <SiteFooter />
      </div>
    </>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, FileText, Globe, IndianRupee, Phone, GitBranch } from "lucide-react";

const inputCls = "border-zinc-800 bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50";

const CONTENT_SCHEMA = [
  {
    category: "Homepage",
    icon: Globe,
    fields: [
      { key: "hero_title", label: "Hero Title", type: "text", placeholder: "Security that thinks, attacks, and heals itself" },
      { key: "hero_subtitle", label: "Hero Subtitle", type: "textarea", placeholder: "Description shown below the title" },
      { key: "hero_cta_primary", label: "Primary Button Text", type: "text", placeholder: "Enter the Lab Console" },
      { key: "hero_cta_secondary", label: "Secondary Button Text", type: "text", placeholder: "Explore 50+ Modules" },
    ],
  },
  {
    category: "Pricing",
    icon: IndianRupee,
    fields: [
      { key: "pricing_free_name", label: "Free Plan Name", type: "text" },
      { key: "pricing_free_price", label: "Free Plan Price", type: "text" },
      { key: "pricing_free_desc", label: "Free Plan Description", type: "text" },
      { key: "pricing_free_features", label: "Free Plan Features (semicolon-separated)", type: "textarea" },
      { key: "pricing_pro_name", label: "Pro Plan Name", type: "text" },
      { key: "pricing_pro_price", label: "Pro Plan Price", type: "text" },
      { key: "pricing_pro_desc", label: "Pro Plan Description", type: "text" },
      { key: "pricing_pro_features", label: "Pro Plan Features (semicolon-separated)", type: "textarea" },
      { key: "pricing_ent_name", label: "Enterprise Plan Name", type: "text" },
      { key: "pricing_ent_price", label: "Enterprise Plan Price", type: "text" },
      { key: "pricing_ent_desc", label: "Enterprise Plan Description", type: "text" },
      { key: "pricing_ent_features", label: "Enterprise Plan Features (semicolon-separated)", type: "textarea" },
    ],
  },
  {
    category: "Contact",
    icon: Phone,
    fields: [
      { key: "contact_email", label: "Contact Email", type: "text" },
      { key: "contact_phone", label: "Contact Phone", type: "text" },
      { key: "contact_website", label: "Website URL", type: "text" },
    ],
  },
  {
    category: "Footer & Social",
    icon: GitBranch,
    fields: [
      { key: "footer_text", label: "Footer Text", type: "text" },
      { key: "social_github", label: "GitHub URL", type: "text" },
    ],
  },
];

export function ContentEditor() {
  const { toast } = useToast();
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/site-content")
      .then((r) => r.json())
      .then((data) => {
        setContent(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = (key: string, value: string) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("guardianx_token") : null;
      const res = await fetch("/api/site-content", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ items: content }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({ title: "Content saved", description: data.message });
      } else {
        toast({ variant: "destructive", title: "Save failed", description: data.error || "Unknown error" });
      }
    } catch {
      toast({ variant: "destructive", title: "Save failed", description: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
            <FileText className="size-5 text-emerald-400" />
            Content Editor
          </h2>
          <p className="text-sm text-zinc-500">Edit marketing page content, pricing, and contact info without touching code.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-500">
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save Changes
        </Button>
      </div>

      {CONTENT_SCHEMA.map((section) => {
        const Icon = section.icon;
        return (
          <div key={section.category} className="holo-card-sharp hud-corners rounded-lg p-5">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-zinc-100">
              <Icon className="size-4 text-emerald-400" />
              {section.category}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
                  <Label className="mb-1 block text-xs text-zinc-400">{field.label}</Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      value={content[field.key] || ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder || ""}
                      className={inputCls + " min-h-[80px]"}
                    />
                  ) : (
                    <Input
                      value={content[field.key] || ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder || ""}
                      className={inputCls}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-500">
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save All Changes
        </Button>
      </div>
    </motion.div>
  );
}

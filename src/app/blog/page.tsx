"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, FileText, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { BlogCard } from "@/components/sentinel/blog-card";
import {
  BLOG_POSTS,
  BLOG_CATEGORIES,
  type BlogCategory,
} from "@/lib/blog-posts";

type Filter = "All" | BlogCategory;

const FILTERS: Filter[] = ["All", ...BLOG_CATEGORIES];

export default function BlogPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  const filtered = useMemo(() => {
    return BLOG_POSTS.filter((p) => {
      const matchesCategory = filter === "All" || p.category === filter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.author.name.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    }).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [query, filter]);

  return (
    <div className="relative min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Ambient glow (dark mode only) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 hidden dark:block"
      >
        <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-cyan-600/10 blur-3xl" />
      </div>

      <div className="relative z-10">
        <SiteHeader />

        <main className="mx-auto max-w-7xl px-4 pb-24 pt-28 sm:px-6">
          {/* Hero */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-10 text-center"
          >
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
              <FileText className="size-3" />
              GuardianX Blog
            </div>
            <h1 className="mb-3 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
              Security insights, tutorials, and{" "}
              <span className="gradient-text">case studies</span>
            </h1>
            <p className="mx-auto max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Practical guidance on VAPT, compliance (DPDPA / ISO 27001 / SOC 2),
              and DevSecOps from the GuardianX security research team.
            </p>
          </motion.section>

          {/* Search + Filter */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search posts..."
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === f
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                      : "border-zinc-200 bg-transparent text-zinc-600 hover:border-emerald-500/40 hover:text-emerald-600 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-emerald-400"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Results count */}
          <div className="mb-4 text-xs text-zinc-500 dark:text-zinc-500">
            Showing {filtered.length} of {BLOG_POSTS.length} posts
            {filter !== "All" && ` in ${filter}`}
            {query && ` matching "${query}"`}
          </div>

          {/* Grid */}
          {filtered.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((post, i) => (
                <BlogCard key={post.slug} post={post} index={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                No posts found. Try a different search or filter.
              </p>
            </div>
          )}

          {/* Bottom CTA */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mt-16 flex flex-col items-center justify-between gap-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-zinc-50 to-cyan-500/5 p-6 sm:flex-row dark:via-zinc-900/40"
          >
            <div className="text-center sm:text-left">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Ready to secure your code?
              </h3>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Run a full VAPT scan with GuardianX in under 5 minutes.
              </p>
            </div>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Sign up for GuardianX
              <ArrowRight className="size-4" />
            </a>
          </motion.section>
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}

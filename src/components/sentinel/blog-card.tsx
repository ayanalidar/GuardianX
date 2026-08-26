"use client";

import { motion } from "framer-motion";
import { ArrowRight, Clock, User } from "lucide-react";
import type { BlogPost } from "@/lib/blog-posts";
import { formatDate } from "@/lib/blog-posts";

const CATEGORY_STYLES: Record<string, string> = {
  Security:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 dark:text-emerald-300",
  Compliance:
    "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  Tutorials:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "Case Studies":
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

/**
 * BlogCard — card component for the blog listing grid.
 * Theme-aware (uses dark: variants), hover lift + glow effect.
 */
export function BlogCard({
  post,
  index = 0,
}: {
  post: BlogPost;
  index?: number;
}) {
  return (
    <motion.a
      href={`/blog/${post.slug}`}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.4) }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-500/40 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-500/50 dark:hover:shadow-[0_0_32px_rgba(16,185,129,0.12)]"
    >
      {/* Category badge */}
      <div className="mb-3 flex items-center justify-between">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider ${
            CATEGORY_STYLES[post.category] ?? CATEGORY_STYLES.Security
          }`}
        >
          {post.category}
        </span>
        <time className="font-mono text-[10px] text-zinc-500 dark:text-zinc-500">
          {formatDate(post.date)}
        </time>
      </div>

      {/* Title */}
      <h3 className="mb-2 line-clamp-2 text-base font-bold leading-snug text-zinc-900 transition-colors group-hover:text-emerald-600 dark:text-zinc-50 dark:group-hover:text-emerald-300">
        {post.title}
      </h3>

      {/* Excerpt */}
      <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        {post.excerpt}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-500">
          <User className="size-3" />
          <span>{post.author.name}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {post.readTime}
          </span>
          <span className="flex items-center gap-1 font-medium text-emerald-600 transition-transform group-hover:translate-x-0.5 dark:text-emerald-400">
            Read
            <ArrowRight className="size-3" />
          </span>
        </div>
      </div>
    </motion.a>
  );
}

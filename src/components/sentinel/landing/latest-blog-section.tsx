"use client";

import { motion } from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { getRecentPosts } from "@/lib/blog-posts";

/**
 * LatestBlogSection — "Latest from the Blog" section, shown on the homepage
 * before the footer. Renders the 3 most recent posts as cards with a
 * "View all posts" link to /blog.
 *
 * Dark-themed (matches the landing page's dark aesthetic) — uses hardcoded
 * zinc-950 surfaces since the homepage is always dark visually.
 */
export function LatestBlogSection() {
  const posts = getRecentPosts(3);

  return (
    <section className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="mb-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end"
      >
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            From the blog
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
            Latest from the{" "}
            <span className="gradient-text">GuardianX blog</span>
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Security insights, tutorials, and case studies from our research team.
          </p>
        </div>
        <a
          href="/blog"
          className="group inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15 hover:text-emerald-200"
        >
          View all posts
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </a>
      </motion.div>

      {/* Posts grid — hardcoded dark surface to match the landing page aesthetic */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post, i) => (
          <a
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-emerald-500/50 hover:shadow-[0_0_32px_rgba(16,185,129,0.12)]"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: Math.min(i * 0.08, 0.3) }}
              className="flex h-full flex-col"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                  {post.category}
                </span>
                <ArrowUpRight className="size-3.5 text-zinc-500 transition-colors group-hover:text-emerald-400" />
              </div>
              <h3 className="mb-2 line-clamp-2 text-base font-bold leading-snug text-zinc-50 transition-colors group-hover:text-emerald-300">
                {post.title}
              </h3>
              <p className="mb-4 line-clamp-3 flex-1 text-sm leading-relaxed text-zinc-400">
                {post.excerpt}
              </p>
              <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
                <span>{post.author.name}</span>
                <span>{post.readTime}</span>
              </div>
            </motion.div>
          </a>
        ))}
      </div>
    </section>
  );
}

"use client";

import { motion } from "framer-motion";
import {
  User,
  Clock,
  Calendar,
  ArrowLeft,
  ArrowRight,
  List as ListIcon,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import type { BlogPost } from "@/lib/blog-posts";
import {
  formatDate,
  getTableOfContents,
  getRelatedPosts,
} from "@/lib/blog-posts";
import { BlogCard } from "./blog-card";

/**
 * BlogPostView — renders a single blog post.
 *
 * Layout: sticky TOC sidebar (desktop) + main content column with the
 * markdown-ish rendered body, followed by a related-posts grid and a
 * "Sign up for GuardianX" CTA.
 *
 * The content is rendered via a small custom markdown-ish renderer
 * (see renderContent) that handles: ## / ### headings, ``` fenced code
 * blocks, > blockquotes, - bullet lists, **bold** inline, and paragraphs.
 */
export function BlogPostView({ post }: { post: BlogPost }) {
  const toc = getTableOfContents(post.content);
  const related = getRelatedPosts(post.slug, 3);

  return (
    <div className="relative min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Ambient glow (dark mode only) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 hidden dark:block"
      >
        <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-cyan-600/8 blur-3xl" />
      </div>

      <div className="relative z-10">
        {/* Top nav */}
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/80">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 transition-colors hover:text-emerald-600 dark:text-zinc-300 dark:hover:text-emerald-400"
            >
              <ArrowLeft className="size-4" />
              Back to blog
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
            >
              <Terminal className="size-3.5" />
              Enter Lab
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
            {/* TOC sidebar */}
            <aside className="hidden lg:block">
              {toc.length > 0 && (
                <div className="sticky top-24">
                  <div className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-500/70">
                    <ListIcon className="size-3" />
                    On this page
                  </div>
                  <nav className="space-y-1.5">
                    {toc.map((entry) => (
                      <a
                        key={entry.id}
                        href={`#${entry.id}`}
                        className={`block border-l-2 border-zinc-200 py-0.5 text-xs text-zinc-600 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-emerald-400 ${
                          entry.level === 3 ? "pl-4" : "pl-3 font-medium text-zinc-900 dark:text-zinc-200"
                        }`}
                      >
                        {entry.text}
                      </a>
                    ))}
                  </nav>
                </div>
              )}
            </aside>

            {/* Article body */}
            <article className="min-w-0">
              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                    {post.category}
                  </span>
                  <span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-500">
                    <Calendar className="size-3" />
                    {formatDate(post.date)}
                  </span>
                  <span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-500">
                    <Clock className="size-3" />
                    {post.readTime}
                  </span>
                </div>

                <h1 className="mb-3 text-3xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
                  {post.title}
                </h1>
                <p className="mb-5 text-base text-zinc-600 dark:text-zinc-400">
                  {post.excerpt}
                </p>

                <div className="mb-8 flex items-center gap-2 border-y border-zinc-200 py-3 dark:border-zinc-800">
                  <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-600 dark:text-emerald-300">
                    {post.author.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {post.author.name}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-500">
                      <User className="size-2.5" />
                      {post.author.role}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Rendered content */}
              <div className="blog-content">{renderContent(post.content)}</div>

              {/* CTA */}
              <div className="mt-12 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-zinc-50 to-cyan-500/5 p-6 dark:via-zinc-900/40">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-500/70">
                  {"// Ready to ship secure code?"}
                </div>
                <h3 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
                  Sign up for GuardianX
                </h3>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                  Run a full SAST + DAST + patch-generation VAPT scan on your
                  codebase in under 5 minutes. No credit card required.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="/"
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                  >
                    Start free scan
                    <ArrowRight className="size-4" />
                  </a>
                  <a
                    href="/contact"
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
                  >
                    Request demo
                  </a>
                </div>
              </div>
            </article>
          </div>

          {/* Related posts */}
          {related.length > 0 && (
            <section className="mt-20">
              <div className="mb-5 flex items-center gap-2">
                <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-500/70">
                  {"// Keep reading"}
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/30 to-transparent" />
              </div>
              <h2 className="mb-5 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                Related posts
              </h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((p, i) => (
                  <BlogCard key={p.slug} post={p} index={i} />
                ))}
              </div>
            </section>
          )}
        </main>

        <footer className="border-t border-zinc-200 py-6 dark:border-zinc-800">
          <div className="mx-auto max-w-6xl px-4 text-center text-xs text-zinc-500 sm:px-6 dark:text-zinc-500">
            © {new Date().getFullYear()} GuardianX.{" "}
            <Link href="/blog" className="hover:text-emerald-600 dark:hover:text-emerald-400">
              Back to blog
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ── Minimal markdown-ish renderer ──────────────────────────────────────────
// Supports: ## h2, ### h3, ``` fenced code blocks, > blockquote,
// - bullet lists, **bold** inline, and paragraphs.

function renderContent(content: string) {
  const blocks: React.ReactNode[] = [];
  const lines = content.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(
        <pre
          key={key++}
          className="my-4 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-900"
        >
          {lang && (
            <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-emerald-600 dark:text-emerald-500/70">
              {lang}
            </div>
          )}
          <code className="font-mono text-zinc-800 dark:text-zinc-200">
            {code.join("\n")}
          </code>
        </pre>,
      );
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = slugify(text);
      if (level === 2) {
        blocks.push(
          <h2
            key={key++}
            id={id}
            className="mb-3 mt-8 scroll-mt-24 text-xl font-bold text-zinc-900 dark:text-zinc-50"
          >
            {renderInline(text)}
          </h2>,
        );
      } else {
        blocks.push(
          <h3
            key={key++}
            id={id}
            className="mb-2 mt-6 scroll-mt-24 text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {renderInline(text)}
          </h3>,
        );
      }
      i++;
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().slice(1).trim());
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-4 border-l-4 border-emerald-500/60 bg-emerald-500/5 py-2 pl-4 pr-3 text-sm text-zinc-700 dark:text-zinc-300"
        >
          {renderInline(quote.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // Bullet list
    if (line.trim().startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push(
        <ul
          key={key++}
          className="my-3 ml-4 list-disc space-y-1.5 text-sm text-zinc-700 marker:text-emerald-500 dark:text-zinc-300"
        >
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-empty, non-special lines)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].match(/^(#{2,3})\s+/) &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("- ")
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p
        key={key++}
        className="my-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
      >
        {renderInline(para.join(" "))}
      </p>,
    );
  }

  return blocks;
}

/** Render inline bold (**text**) as <strong>. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Render inline code `code`
    const codeParts = part.split(/(`[^`]+`)/g);
    return codeParts.map((cp, cidx) => {
      if (cp.startsWith("`") && cp.endsWith("`")) {
        return (
          <code
            key={`${idx}-${cidx}`}
            className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-emerald-700 dark:bg-zinc-800 dark:text-emerald-300"
          >
            {cp.slice(1, -1)}
          </code>
        );
      }
      return <span key={`${idx}-${cidx}`}>{cp}</span>;
    });
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

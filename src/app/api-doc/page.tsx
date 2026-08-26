"use client";

// /api-doc — interactive Swagger UI for the GuardianX REST API.
//
// Loads the OpenAPI 3.0.3 spec from /api/openapi.json and renders it via
// `swagger-ui-react`. The page is intentionally public (no auth wall) so
// prospective integrators can explore the API surface before signing up.
//
// The page is a Client Component because `swagger-ui-react` reaches into
// the DOM (it ships its own CSS bundle and renders into a div). It is
// dynamically imported with `ssr: false` so the build step doesn't try to
// evaluate the lib in Node — it must run in the browser.
//
// A small dark-mode wrapper is applied so the page matches the GuardianX
// aesthetic (zinc-950 / emerald) instead of Swagger UI's default white.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Lazy-load Swagger UI on the client only. The component is large (~1.2 MB
// of JS+CSS) and pulls in `react`-internals, so we never want it in the SSR
// bundle. `next/dynamic` types its loader fairly strictly but the
// swagger-ui-react package ships with the slightly loose `export = SwaggerUI`
// CommonJS shape; the double cast (`as unknown as () => Promise<…>`) bridges
// that without polluting the import signature.
import type { ComponentType } from "react";

const SwaggerUI = dynamic<{ spec: unknown }>(
  ((): Promise<unknown> =>
    import("swagger-ui-react").then(
      (m) => (m as { default?: unknown }).default ?? m
    )) as unknown as () => Promise<ComponentType<{ spec: unknown }>>,
  { ssr: false, loading: () => <p className="p-8 text-zinc-500">Loading API explorer…</p> }
) as unknown as ComponentType<{ spec: unknown }>;

export default function ApiDocPage() {
  // Hold the fetched spec in state. Fetching on the client (rather than at
  // build time via getStaticProps) means the spec is always fresh relative
  // to the deployed route handler — no stale spec after a deploy.
  const [spec, setSpec] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/openapi.json", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setSpec(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load spec");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Page header — kept compact so the Swagger UI gets the bulk of the viewport. */}
      <header className="border-b border-emerald-500/15 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <a href="/" className="text-lg font-bold tracking-tight">
              Guardian<span className="text-emerald-400">X</span>{" "}
              <span className="text-zinc-400">API Docs</span>
            </a>
            <p className="mt-0.5 text-xs text-zinc-500">
              Interactive OpenAPI 3.0 reference. Authenticate with{" "}
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-emerald-300">
                POST /api/auth/login
              </code>{" "}
              and click <strong>Authorize</strong> to send authenticated requests from this page.
            </p>
          </div>
          <a
            href="/"
            className="hidden rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-emerald-500 hover:text-emerald-400 sm:inline-block"
          >
            ← Back to console
          </a>
        </div>
      </header>

      {/* Swagger UI host. The lib injects its own DOM + styles here. */}
      <div className="mx-auto max-w-7xl px-2 py-4 sm:px-4">
        {error ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
            Failed to load the OpenAPI spec: {error}.<br />
            <span className="text-red-400/70">
              Make sure <code>/api/openapi.json</code> is reachable and you are logged in if the
              route is gated.
            </span>
          </div>
        ) : spec ? (
          <div className="api-doc-swagger-wrap overflow-x-auto rounded-lg border border-zinc-800 bg-white">
            <SwaggerUI spec={spec} />
          </div>
        ) : (
          <p className="p-8 text-zinc-500">Loading API explorer…</p>
        )}
      </div>

      {/* Footer link back to the integration guide for integrators who want curl/Python examples. */}
      <footer className="mt-8 border-t border-zinc-800 px-4 py-6 text-center text-xs text-zinc-600">
        See <a className="text-emerald-400 hover:underline" href="https://github.com/z-ai-web-dev/GuardianX/blob/main/docs/API-INTEGRATION.md">docs/API-INTEGRATION.md</a>{" "}
        for end-to-end curl &amp; Python examples, rate limits, and webhook setup.
      </footer>

      {/* Local style overrides — coerce the Swagger UI's default white-on-grey
          chrome into something that at least sits inside our dark page chrome
          without looking completely alien. The Swagger UI itself stays light
          (its dark mode requires a custom CSS theme + SwaggerUI bundle config
          that is out of scope for this task). */}
      <style jsx global>{`
        .api-doc-swagger-wrap .swagger-ui {
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        .api-doc-swagger-wrap .swagger-ui .topbar {
          display: none; /* hide the Swagger UI logo bar — we have our own header */
        }
        .api-doc-swagger-wrap .swagger-ui .info {
          margin: 20px 0 10px;
        }
      `}</style>
    </main>
  );
}

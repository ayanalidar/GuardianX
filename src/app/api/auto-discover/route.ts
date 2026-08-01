import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/auto-discover — crawls a URL to discover assets (pages, JS files,
// tech stack, exposed files) and auto-creates codebases + targets for the client.
// Body: { clientId: string }
export async function POST(req: Request) {
  const { clientId } = await req.json().catch(() => ({}));
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  try {
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, targetUrl: true, authorized: true },
    });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const targetUrl = (client as Record<string, unknown>).targetUrl as string;
    if (!targetUrl) return NextResponse.json({ error: "Client has no targetUrl set" }, { status: 400 });

    const discovered: {
      pages: string[];
      jsFiles: string[];
      techStack: { name: string; version: string | null }[];
      exposedFiles: { path: string; status: number; type: string }[];
      subdomains: string[];
    } = {
      pages: [],
      jsFiles: [],
      techStack: [],
      exposedFiles: [],
      subdomains: [],
    };

    // ── 1. Fetch the homepage ─────────────────────────────────────────────
    const homeRes = await fetch(targetUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "GuardianX-Scanner/1.0" },
      redirect: "follow",
    }).catch(() => null);

    if (homeRes && homeRes.ok) {
      const html = await homeRes.text();

      // ── 2. Discover pages (extract links) ──────────────────────────────
      const linkRegex = /href=["']([^"']+)["']/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        let link = match[1];
        if (link.startsWith("/")) link = new URL(link, targetUrl).href;
        if (link.startsWith(targetUrl) || link.startsWith("http") && new URL(link).hostname === new URL(targetUrl).hostname) {
          if (!discovered.pages.includes(link) && !link.includes("#") && !link.endsWith(".pdf") && !link.endsWith(".jpg")) {
            discovered.pages.push(link);
          }
        }
      }
      discovered.pages = discovered.pages.slice(0, 50); // limit

      // ── 3. Discover JavaScript files ───────────────────────────────────
      const jsRegex = /src=["']([^"']+\.js[^"']*)["']/gi;
      while ((match = jsRegex.exec(html)) !== null) {
        let jsLink = match[1];
        if (jsLink.startsWith("/")) jsLink = new URL(jsLink, targetUrl).href;
        if (!discovered.jsFiles.includes(jsLink)) {
          discovered.jsFiles.push(jsLink);
        }
      }
      discovered.jsFiles = discovered.jsFiles.slice(0, 20);

      // ── 4. Detect tech stack from headers + HTML ───────────────────────
      const server = homeRes.headers.get("server") || "";
      const poweredBy = homeRes.headers.get("x-powered-by") || "";

      if (server) discovered.techStack.push({ name: "Server", version: server });
      if (poweredBy) discovered.techStack.push({ name: "Backend", version: poweredBy });
      if (html.includes("react") || html.includes("__NEXT_DATA__")) discovered.techStack.push({ name: "React/Next.js", version: null });
      if (html.includes("vue") || html.includes("__vue")) discovered.techStack.push({ name: "Vue.js", version: null });
      if (html.includes("angular") || html.includes("ng-app")) discovered.techStack.push({ name: "Angular", version: null });
      if (html.includes("wp-content") || html.includes("wp-includes")) discovered.techStack.push({ name: "WordPress", version: null });
      if (html.includes("jquery")) discovered.techStack.push({ name: "jQuery", version: null });
      if (html.includes("bootstrap")) discovered.techStack.push({ name: "Bootstrap", version: null });
      if (html.includes("tailwind")) discovered.techStack.push({ name: "Tailwind CSS", version: null });
      if (html.includes("cloudflare") || server.toLowerCase().includes("cloudflare")) discovered.techStack.push({ name: "Cloudflare", version: null });
      if (html.includes("gatsby")) discovered.techStack.push({ name: "Gatsby", version: null });
    }

    // ── 5. Check for exposed sensitive files ─────────────────────────────
    const sensitivePaths = [
      { path: "/.env", type: "Environment File" },
      { path: "/.git/config", type: "Git Repository" },
      { path: "/.git/HEAD", type: "Git Repository" },
      { path: "/backup.sql", type: "Database Backup" },
      { path: "/dump.sql", type: "Database Dump" },
      { path: "/wp-config.php", type: "WordPress Config" },
      { path: "/phpinfo.php", type: "PHP Info" },
      { path: "/server-status", type: "Server Status" },
      { path: "/robots.txt", type: "Robots File" },
      { path: "/sitemap.xml", type: "Sitemap" },
      { path: "/.well-known/security.txt", type: "Security Contact" },
      { path: "/package.json", type: "Package Config" },
      { path: "/composer.json", type: "Composer Config" },
      { path: "/.DS_Store", type: "macOS DS_Store" },
      { path: "/web.config", type: "IIS Config" },
      { path: "/config.json", type: "Config File" },
      { path: "/api/keys", type: "API Keys Endpoint" },
      { path: "/admin", type: "Admin Panel" },
      { path: "/wp-admin", type: "WordPress Admin" },
      { path: "/.htaccess", type: "Apache Config" },
    ];

    for (const { path, type } of sensitivePaths) {
      const checkUrl = new URL(path, targetUrl).href;
      const res = await fetch(checkUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "GuardianX-Scanner/1.0" },
        redirect: "manual",
      }).catch(() => null);

      if (res && res.status === 200) {
        const body = await res.text().catch(() => "");
        // Verify it's not a generic 404 page
        if (body.length > 10 && !body.toLowerCase().includes("not found")) {
          discovered.exposedFiles.push({ path, status: res.status, type });
        }
      }
    }

    // ── 6. Auto-create target if it doesn't exist ────────────────────────
    const existingTargets = await db.target.findMany({
      where: { clientId, baseUrl: targetUrl },
      select: { id: true },
    });

    if (existingTargets.length === 0) {
      await db.target.create({
        data: {
          id: randomUUID(),
          name: (client as Record<string, unknown>).name as string,
          baseUrl: targetUrl,
          authorized: (client as Record<string, unknown>).authorized as boolean,
          clientId,
        },
      });
    }

    // ── 7. Auto-create codebase from discovered JS files ─────────────────
    if (discovered.jsFiles.length > 0) {
      // Fetch the largest JS file and store as a codebase for SAST
      let largestJs = "";
      let largestSize = 0;
      for (const jsUrl of discovered.jsFiles.slice(0, 5)) {
        const jsRes = await fetch(jsUrl, {
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        if (jsRes && jsRes.ok) {
          const code = await jsRes.text();
          if (code.length > largestSize) {
            largestSize = code.length;
            largestJs = code;
          }
        }
      }

      if (largestJs.length > 100) {
        const jsFileName = discovered.jsFiles.find((f) => f)?.split("/").pop() || "discovered.js";
        await db.codebase.create({
          data: {
            id: randomUUID(),
            name: jsFileName,
            language: "javascript",
            description: `Auto-discovered from ${targetUrl}`,
            sourceCode: largestJs.slice(0, 50000), // limit to 50KB
            clientId,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      clientId,
      discovered,
      summary: {
        pages: discovered.pages.length,
        jsFiles: discovered.jsFiles.length,
        techStack: discovered.techStack.length,
        exposedFiles: discovered.exposedFiles.length,
        subdomains: discovered.subdomains.length,
      },
      message: `Discovered ${discovered.pages.length} pages, ${discovered.jsFiles.length} JS files, ${discovered.techStack.length} technologies, ${discovered.exposedFiles.length} exposed files. Auto-created target + codebase.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

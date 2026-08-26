import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/research-agent, searches GitHub for security tools, analyzes them,
// and generates optimization recommendations for GuardianX's own modules.
//
// Body: { action: "search" | "analyze" | "gap_analysis", query?, repoUrl?, module? }
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { action, query, repoUrl, module } = await req.json().catch(() => ({}));

  try {
    if (action === "search") {
      // ── Search GitHub for security tools ────────────────────────────────
      if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

      const githubRes = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}+language:python+is:public&sort=stars&order=desc&per_page=10`,
        {
          headers: {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "GuardianX-Research-Agent",
          },
        }
      );

      if (!githubRes.ok) {
        return NextResponse.json({ error: `GitHub API returned ${githubRes.status}` }, { status: 502 });
      }

      const data = await githubRes.json();
      const repos = (data.items || []).map((r: Record<string, unknown>) => ({
        name: r.full_name,
        url: r.clone_url,
        description: r.description,
        stars: r.stargazers_count,
        language: r.language,
        topics: r.topics,
        updated: r.updated_at,
      }));

      return NextResponse.json({
        query,
        results: repos,
        count: repos.length,
        message: `Found ${repos.length} repositories matching "${query}"`,
      });
    }

    if (action === "analyze") {
      // ── Analyze a specific repo's code ──────────────────────────────────
      if (!repoUrl) return NextResponse.json({ error: "repoUrl required" }, { status: 400 });

      // Fetch the repo's file tree via GitHub API
      const repoPath = repoUrl.replace("https://github.com/", "").replace(".git", "");
      const [owner, repo] = repoPath.split("/");

      // Get repo info
      const repoInfoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "GuardianX-Research-Agent" },
      });
      const repoInfo = await repoInfoRes.json();

      // Get contents (root level)
      const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
        headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "GuardianX-Research-Agent" },
      });
      const contents = await contentsRes.json();

      // Find Python files
      const pyFiles = Array.isArray(contents)
        ? contents.filter((f: Record<string, unknown>) => (f.name as string)?.endsWith(".py")).slice(0, 5)
        : [];

      // Fetch the content of each Python file (up to 5)
      const fileContents: { name: string; content: string; lines: number }[] = [];
      for (const f of pyFiles) {
        const fileRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/${f.name}`, {
          headers: { "User-Agent": "GuardianX-Research-Agent" },
        });
        if (fileRes.ok) {
          const content = await fileRes.text();
          fileContents.push({
            name: f.name,
            content: content.slice(0, 5000), // first 5000 chars
            lines: content.split("\n").length,
          });
        }
      }

      // AI analysis of the code
      let analysis: string = "";
      try {
        const zai = await ZAI.create();
        const prompt = `You are an elite security engineering agent. Analyze these Python files from the open-source security tool "${repoInfo.full_name}" (${repoInfo.stargazers_count} stars).

Tool description: ${repoInfo.description}

Files:
${fileContents.map((f) => `--- ${f.name} (${f.lines} lines) ---\n${f.content}`).join("\n\n")}

Extract and document:
1. Core algorithms and design patterns used
2. Concurrency model (async/threading/multiprocessing)
3. Protocol handling logic
4. Key optimizations that make this tool effective
5. Vulnerabilities or anti-patterns in the code
6. Specific concepts GuardianX could abstract and integrate

Be technical and specific.`;

        const response = await zai.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          thinking: { type: "disabled" },
        });
        analysis = response.choices[0]?.message?.content || "Analysis failed.";
      } catch {
        analysis = "AI analysis unavailable, check Z.AI config.";
      }

      return NextResponse.json({
        repo: repoInfo.full_name,
        stars: repoInfo.stargazers_count,
        description: repoInfo.description,
        files_analyzed: fileContents.length,
        analysis,
        analyzed_at: new Date().toISOString(),
      });
    }

    if (action === "gap_analysis") {
      // ── Compare GuardianX module against an open-source tool ────────────
      if (!module) return NextResponse.json({ error: "module required" }, { status: 400 });

      // Gather our current module's capabilities
      const ourCapabilities = getModuleCapabilities(module);

      let gapAnalysis: string = "";
      try {
        const zai = await ZAI.create();
        const prompt = `You are an elite security engineering agent performing a gap analysis.

GuardianX module: ${module}
Our current capabilities: ${ourCapabilities}

Compare our module against the best-in-class open-source tools for this domain.
Document:
1. Where open-source tools perform better (speed, accuracy, coverage)
2. Modern protocols/attack vectors we lack
3. Specific optimizations we should implement
4. Estimated performance improvement if implemented

Be specific and technical. Format as bullet points.`;

        const response = await zai.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          thinking: { type: "disabled" },
        });
        gapAnalysis = response.choices[0]?.message?.content || "Analysis failed.";
      } catch {
        gapAnalysis = "AI analysis unavailable.";
      }

      return NextResponse.json({
        module,
        our_capabilities: ourCapabilities,
        gap_analysis: gapAnalysis,
        analyzed_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// GET /api/research-agent, returns suggested search queries
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({
    suggested_queries: [
      "vulnerability scanner",
      "exploit framework",
      "network scanner nmap",
      "sql injection tool",
      "xss scanner",
      "web application fuzzer",
      "WAF rule generator",
      "intrusion detection system",
      "malware analyzer",
      "container security scanner",
      "cloud security scanner",
      "secrets detection",
      "dependency scanner",
      "attack surface management",
      "penetration testing framework",
    ],
    our_modules: [
      "sast-scanner",
      "dast-engine",
      "exploit-generator",
      "patch-generator",
      "adversarial-arena",
      "exposure-scanner",
      "compliance-engine",
      "anomaly-detector",
    ],
  });
}

function getModuleCapabilities(module: string): string {
  const caps: Record<string, string> = {
    "sast-scanner": "AI-powered static analysis using LLM. Detects SQL injection, XSS, path traversal, command injection, insecure deserialization. Generates patches with sandbox verification. CWE/CVE mapping. No AST parsing, relies on LLM reasoning.",
    "dast-engine": "Autonomous DAST via AI. Crawls targets, plans attacks per OWASP category, fires HTTP payloads, confirms exploitation. Sensitive data exposure scanner with 16 patterns. No protocol fuzzing. No low-and-slow scanning.",
    "exploit-generator": "AI generates PoC exploits per vulnerability. Runs against original + patched code. Exploit success/blocked markers. No mutation-based fuzzing.",
    "patch-generator": "AI generates patches with test code. Sandbox runs bun subprocess. Adversarial arena with attacker vs defender. No IaC remediation. No virtual patching.",
    "adversarial-arena": "AI attacker tries to bypass AI defender's patch. Up to 2 rounds. No formal DAG attack path modeling.",
    "exposure-scanner": "Scans HTTP responses for 16 secret patterns + 22 known exposure paths. Redacted samples. No behavioral anomaly detection.",
    "compliance-engine": "Maps findings to DPDPA, GDPR, HIPAA, PCI-DSS, ISO 27001, SOC 2. No telemetry aggregation. No automated threat hunting.",
    "anomaly-detector": "Basic anomaly detection (finding spikes, stuck scans, canary triggers). No baseline behavioral modeling. No process monitoring.",
  };
  return caps[module] || "Module not found in capabilities database.";
}

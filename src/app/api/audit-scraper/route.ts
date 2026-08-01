import { NextResponse } from "next/server";
import { engineCall } from "@/lib/sentinel/engine-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/audit-scraper, run the Python audit scraper engine.
// Body: JSON matching the ScraperConfig schema.
// Proxies to the Railway engine, which spawns python3 + httpx/BeautifulSoup.
// Returns: the structured audit result payload.
export async function POST(req: Request) {
  const config = await req.json().catch(() => ({}));

  if (!config.target_url) {
    return NextResponse.json({ error: "target_url required" }, { status: 400 });
  }

  const result = await engineCall("/api/run-scraper", config);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Scraper failed" },
      { status: result.status || 500 }
    );
  }

  return NextResponse.json(result.data);
}

// GET /api/audit-scraper, return the schema example
export async function GET() {
  return NextResponse.json({
    description: "GuardianX Audit Scraper Engine, dual-mode web scraping for authorized audit tasks.",
    schema: {
      target_url: "string (required), URL to scrape",
      execution_mode: "'lightweight' | 'browser' (default: lightweight)",
      rate_limit_delay_ms: "int (default: 1000), delay between requests",
      timeout_ms: "int (default: 30000), request timeout",
      max_retries: "int (default: 3), retry attempts on transient failures",
      headers: "dict, custom HTTP headers",
      target_selectors: [{
        field_name: "string, logical name for extracted field",
        selector: "string, CSS or XPath selector",
        selector_type: "'css' | 'xpath' (default: css)",
        attribute: "string?, HTML attribute to extract (e.g. href)",
        multiple: "bool (default: false), extract all matches as list",
        required: "bool (default: true), error if not found",
        default: "any?, fallback value if not found",
      }],
      sanitization_rules: [{
        key: "string, rule name or built-in pattern (email, phone, ssn, api_key, jwt, aws_key, private_key, ipv4)",
        pattern: "string?, custom regex (overrides built-in)",
        replacement: "string (default: [REDACTED])",
        applies_to: "string[]?, field names this rule applies to",
      }],
    },
    example: {
      target_url: "http://localhost:3004",
      execution_mode: "lightweight",
      target_selectors: [
        { field_name: "title", selector: "h1", selector_type: "css", required: true },
        { field_name: "links", selector: "a", selector_type: "css", attribute: "href", multiple: true },
      ],
      sanitization_rules: [
        { key: "email", replacement: "[EMAIL_REDACTED]" },
        { key: "api_key", replacement: "[REDACTED]" },
      ],
    },
  });
}

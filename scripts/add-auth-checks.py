#!/usr/bin/env python3
"""
Add auth checks to all unprotected API routes for STQC certification.

For each route in the list, adds:
  - import statement at top of file
  - auth check at top of each handler function (GET, POST, PUT, DELETE, PATCH)

Skips:
  - Public routes (auth/login, auth/signup, auth/session, auth/logout, health,
    contributors/github, client-portal-auth, db-init, cron/threat-hunter)
  - Routes that already have auth (skipped by initial grep)
"""

import re
import sys
from pathlib import Path

ROOT = Path("/home/z/my-project")

# Routes that should remain public (no auth).
PUBLIC_ROUTES = {
    "src/app/api/health/route.ts",
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/signup/route.ts",
    "src/app/api/auth/session/route.ts",
    "src/app/api/auth/logout/route.ts",  # part of auth flow; user may have expired token
    "src/app/api/contributors/github/route.ts",
    "src/app/api/client-portal-auth/route.ts",
    "src/app/api/db-init/route.ts",
    "src/app/api/cron/threat-hunter/route.ts",  # protected by CRON_SECRET
}

# Admin-only routes — use requireAdmin.
ADMIN_ROUTES = {
    "src/app/api/orgs/route.ts",
    "src/app/api/slack/route.ts",
    "src/app/api/migrate-dfir/route.ts",
    "src/app/api/webhooks/route.ts",
    "src/app/api/email-digest/route.ts",
    "src/app/api/launch-service/route.ts",
    "src/app/api/auto-approve/route.ts",
    "src/app/api/auto-remediation/route.ts",
    "src/app/api/auto-honeypot/route.ts",
    "src/app/api/auto-discover/route.ts",
    "src/app/api/waf-rules/route.ts",
    "src/app/api/rollback-snapshot/route.ts",
    "src/app/api/integrations/route.ts",
}

AUTH_TOKENS = ("getUserFromRequest", "requireAuth", "requireAdmin", "getAuthenticatedUser")


def is_protected(content: str) -> bool:
    """Return True if the file already contains an auth-check token."""
    return any(tok in content for tok in AUTH_TOKENS)


def add_auth_to_file(path: Path, use_admin: bool) -> tuple[bool, str]:
    """Add import + auth checks to a single route file.
    Returns (modified, reason)."""
    content = path.read_text()
    if is_protected(content):
        return False, "already-protected"

    fn = "requireAdmin" if use_admin else "getUserFromRequest"
    import_stmt = f'import {{ {fn} }} from "@/lib/auth";\n'

    # --- 1. Insert the import after the first import line, or at top ----------
    # Find existing import block end.
    lines = content.split("\n")
    # Locate the last import line (line that starts with `import`).
    last_import_idx = -1
    for i, ln in enumerate(lines):
        stripped = ln.strip()
        if stripped.startswith("import ") and " from " in stripped:
            last_import_idx = i
        elif stripped.startswith("import ") and stripped.endswith(";"):
            last_import_idx = i

    if last_import_idx >= 0:
        lines.insert(last_import_idx + 1, import_stmt.rstrip())
    else:
        # No imports — prepend.
        lines.insert(0, import_stmt.rstrip())
        lines.insert(1, "")

    content = "\n".join(lines)

    # --- 2. For each handler function, inject the auth check -----------------
    # Match: `export async function NAME(args) {` or multi-line variant.
    # We will inject after the opening `{` of the function body.

    # Pattern A: single-line signature, e.g.
    #   export async function GET(req: Request) {
    #   export async function GET() {
    pattern_single = re.compile(
        r'^(export async function (?:GET|POST|PUT|DELETE|PATCH))\s*\(([^)]*)\)\s*\{',
        re.MULTILINE,
    )

    def replace_single(match: re.Match) -> str:
        prefix = match.group(1)  # `export async function GET`
        args = match.group(2).strip()
        if not args:
            # No `req` parameter — add one.
            new_args = "req: Request"
        else:
            new_args = args
        auth_call = build_auth_check(use_admin)
        # Indent body line by 2 spaces (Next.js route handlers use 2-space indent).
        indented_auth = "\n".join("  " + ln if ln else ln for ln in auth_call.split("\n"))
        return f"{prefix}({new_args}) {{\n{indented_auth}"

    content = pattern_single.sub(replace_single, content)

    # Pattern B: multi-line signature, e.g.
    #   export async function GET(
    #     req: Request,
    #     ctx: { params: ... }
    #   ) {
    pattern_multi = re.compile(
        r'^(export async function (?:GET|POST|PUT|DELETE|PATCH))\s*\(\s*\n((?:[^\n]*\n)*?)\s*\)\s*\{',
        re.MULTILINE,
    )

    def replace_multi(match: re.Match) -> str:
        prefix = match.group(1)
        args_body = match.group(2)
        auth_call = build_auth_check(use_admin)
        indented_auth = "\n".join("  " + ln if ln else ln for ln in auth_call.split("\n"))
        return f"{prefix}(\n{args_body}) {{\n{indented_auth}"

    content = pattern_multi.sub(replace_multi, content)

    path.write_text(content)
    return True, "ok"


def build_auth_check(use_admin: bool) -> str:
    """Return the auth-check code block to inject at top of a handler."""
    if use_admin:
        return (
            "const auth = requireAdmin(req);\n"
            "if (!auth.ok) return auth.response;"
        )
    return (
        "const user = getUserFromRequest(req);\n"
        'if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });'
    )


def find_unprotected_routes() -> list[str]:
    """Walk src/app/api and return route files lacking any auth token."""
    routes = []
    api_dir = ROOT / "src" / "app" / "api"
    for path in sorted(api_dir.rglob("route.ts")):
        rel = str(path.relative_to(ROOT))
        content = path.read_text()
        if not is_protected(content):
            routes.append(rel)
    return routes


def main() -> int:
    routes = find_unprotected_routes()
    print(f"Found {len(routes)} unprotected routes.\n")

    fixed = 0
    skipped = []
    admin_count = 0
    user_count = 0

    for rel in routes:
        if rel in PUBLIC_ROUTES:
            skipped.append((rel, "public"))
            continue
        use_admin = rel in ADMIN_ROUTES
        path = ROOT / rel
        modified, reason = add_auth_to_file(path, use_admin)
        if modified:
            fixed += 1
            if use_admin:
                admin_count += 1
            else:
                user_count += 1
        else:
            skipped.append((rel, reason))

    print(f"Fixed: {fixed} ({user_count} user, {admin_count} admin)")
    print(f"Skipped: {len(skipped)}")
    for rel, reason in skipped:
        print(f"  SKIP [{reason}] {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

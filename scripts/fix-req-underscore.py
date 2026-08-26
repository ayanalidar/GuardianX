#!/usr/bin/env python3
"""
Fix-up: rename `_req: Request` to `req: Request` in route handlers we just
patched, since the auth check now uses `req`.
"""

import re
from pathlib import Path

ROOT = Path("/home/z/my-project")

# Match `export async function NAME(_req: Request` (single-line or multi-line).
# We rename `_req` to `req` in the function signature.
PATTERN = re.compile(
    r'(export async function (?:GET|POST|PUT|DELETE|PATCH)\()(_req)(: Request)',
)

count = 0
for path in sorted((ROOT / "src" / "app" / "api").rglob("route.ts")):
    content = path.read_text()
    if "_req: Request" not in content:
        continue
    new_content, n = PATTERN.subn(r"\1req\3", content)
    if n > 0:
        path.write_text(new_content)
        count += n
        print(f"  Fixed {n} in {path.relative_to(ROOT)}")

print(f"\nTotal renamed: {count}")

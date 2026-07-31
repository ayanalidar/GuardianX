"""
CredentialScanner — Automatically detects and extracts vulnerable data
(passwords, user IDs, emails, tokens, API keys, SSNs) from scraped HTML.

This module scans raw HTML for patterns indicating exposed credentials
and sensitive data. It does NOT sanitize — it EXTRACTS and reports them
so GuardianX can later fix the vulnerabilities.
"""

from __future__ import annotations

import re
from typing import Any

# Patterns for detecting exposed vulnerable data
CREDENTIAL_PATTERNS: dict[str, str] = {
    "password_assignment": r"(?:password|passwd|pwd)\s*[=:]\s*['\"]?([^'\"\s,;}{]{3,})['\"]?",
    "api_key_assignment": r"(?:api[_-]?key|apikey)\s*[=:]\s*['\"]?([^'\"\s,;}{]{10,})['\"]?",
    "secret_assignment": r"(?:secret|token|auth)\s*[=:]\s*['\"]?([^'\"\s,;}{]{10,})['\"]?",
    "db_connection_string": r"(?:mongodb|postgres|postgresql|mysql|redis)://[^\s'\"<>]+:[^\s'\"<>]+@[^\s'\"<>]+",
    "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b(?:\d[ -]*?){13,16}\b",
    "jwt_token": r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    "aws_key": r"AKIA[0-9A-Z]{16}",
    "stripe_key": r"sk_live_[0-9a-zA-Z]{20,}",
    "github_token": r"gh[pousr]_[A-Za-z0-9]{36,}",
    "private_key": r"-----BEGIN\s(?:RSA\s|EC\s|OPENSSH\s)?PRIVATE\sKEY-----",
    "bearer_token": r"Bearer\s+[A-Za-z0-9\-._~+/]+=*",
    "bearer_assignment": r"(?:bearer|authorization)\s*[=:]\s*['\"]?([A-Za-z0-9\-._~+/]{20,})['\"]?",
    "user_id_pattern": r"(?:user[_-]?id|uid|account[_-]?id)\s*[=:]\s*['\"]?(\d+)['\"]?",
    "phone_number": r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}",
}


def scan_for_credentials(html: str, url: str = "") -> dict[str, Any]:
    """
    Scan raw HTML for exposed credentials and sensitive data.

    Args:
        html: The raw HTML content to scan.
        url: The URL the content was fetched from (for reporting).

    Returns:
        Dictionary containing:
            - total_findings: count of all exposed data items
            - severity: "critical" | "high" | "medium" | "low"
            - credentials: list of {type, value, context} for each finding
            - summary: human-readable summary
    """
    findings: list[dict[str, Any]] = []

    for pattern_name, pattern in CREDENTIAL_PATTERNS.items():
        compiled = re.compile(pattern, re.IGNORECASE)
        matches = compiled.findall(html)

        # Deduplicate
        seen = set()
        unique_matches = []
        for m in matches:
            m_clean = m if isinstance(m, str) else str(m)
            if m_clean and m_clean not in seen and len(m_clean) > 2:
                seen.add(m_clean)
                unique_matches.append(m_clean)

        for match in unique_matches[:20]:  # cap at 20 per type
            # Find context (surrounding text)
            idx = html.lower().find(match.lower())
            context = ""
            if idx >= 0:
                start = max(0, idx - 40)
                end = min(len(html), idx + len(match) + 40)
                context = html[start:end].replace("\n", " ").strip()

            # Determine severity
            if pattern_name in ("password_assignment", "db_connection_string", "private_key", "stripe_key", "aws_key", "github_token"):
                severity = "critical"
            elif pattern_name in ("api_key_assignment", "secret_assignment", "jwt_token", "bearer_token", "bearer_assignment", "ssn", "credit_card"):
                severity = "high"
            elif pattern_name in ("email", "phone_number"):
                severity = "medium"
            else:
                severity = "low"

            findings.append({
                "type": pattern_name.replace("_", " ").title(),
                "value": match,
                "severity": severity,
                "context": context[:120],
                "source_url": url,
            })

    # Sort by severity
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    findings.sort(key=lambda f: severity_order.get(f["severity"], 4))

    # Overall severity
    if any(f["severity"] == "critical" for f in findings):
        overall_severity = "critical"
    elif any(f["severity"] == "high" for f in findings):
        overall_severity = "high"
    elif any(f["severity"] == "medium" for f in findings):
        overall_severity = "medium"
    else:
        overall_severity = "low"

    # Group by type
    by_type: dict[str, int] = {}
    for f in findings:
        by_type[f["type"]] = by_type.get(f["type"], 0) + 1

    return {
        "total_findings": len(findings),
        "severity": overall_severity,
        "credentials": findings,
        "by_type": by_type,
        "summary": f"{len(findings)} exposed data item(s) found — severity: {overall_severity}",
    }

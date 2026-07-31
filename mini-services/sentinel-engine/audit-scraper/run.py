#!/usr/bin/env python3
"""
GuardianX Audit Scraper Engine — Standalone Runner.

Reads a JSON audit task configuration from stdin, executes the scraping
pipeline, and writes the structured result to stdout as JSON.

Usage:
    echo '{"target_url":"http://localhost:3004",...}' | python3 run.py
    python3 run.py config.json
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any

# Add this directory to path so absolute imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import ScraperConfig
from engine import AuditScraperEngine

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(name)s %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)
logger = logging.getLogger("guardianx.audit")


async def run_audit(config_json: dict[str, Any]) -> dict[str, Any]:
    """Parse config JSON, initialize engine, execute audit, return result."""
    config = ScraperConfig.model_validate(config_json)
    logger.info("Audit %s: target=%s mode=%s selectors=%d",
                config.audit_id, config.target_url, config.execution_mode.value, len(config.target_selectors))
    engine = AuditScraperEngine(config)
    result = await engine.execute()
    logger.info("Audit %s: status=%s fields=%d errors=%d",
                result["audit_id"], result["status"], result["extracted_fields"], len(result["errors"]))
    return result


def main() -> None:
    """Entry point: read config from stdin/file, run audit, output JSON."""
    if len(sys.argv) > 1 and sys.argv[1] != "--stdin":
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            config_json = json.load(f)
    else:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({"status": "failed", "error": "No input provided on stdin"}))
            sys.exit(1)
        config_json = json.loads(raw)

    try:
        result = asyncio.run(run_audit(config_json))
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    except Exception as e:
        logger.error("Audit failed: %s", e, exc_info=True)
        print(json.dumps({"status": "failed", "error": str(e), "error_type": type(e).__name__}, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()

"""
GuardianX Audit Scraper Engine — Entry Point.

Reads a JSON audit task configuration from stdin (or a file path argument),
executes the scraping pipeline, and writes the structured result to stdout
as a JSON payload.

Usage:
    echo '{"target_url":"http://localhost:3004","target_selectors":[...]}' | python3 main.py
    python3 main.py --input config.json --output result.json
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from typing import Any

from .config import ScraperConfig
from .engine import AuditScraperEngine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(name)s %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,  # Logs go to stderr so stdout is pure JSON
)
logger = logging.getLogger("guardianx.audit.main")


async def run_audit(config_json: dict[str, Any]) -> dict[str, Any]:
    """
    Parse the config JSON, initialize the engine, and execute the audit.

    Args:
        config_json: Raw dictionary matching the ScraperConfig schema.

    Returns:
        The structured audit result payload.
    """
    # Validate configuration
    config = ScraperConfig.model_validate(config_json)
    logger.info("Audit %s: target=%s mode=%s", config.audit_id, config.target_url, config.execution_mode.value)

    # Initialize and execute
    engine = AuditScraperEngine(config)
    result = await engine.execute()

    logger.info(
        "Audit %s complete: status=%s fields=%d errors=%d",
        result["audit_id"],
        result["status"],
        result["extracted_fields"],
        len(result["errors"]),
    )

    return result


def main() -> None:
    """
    Main entry point: reads config JSON, runs the audit, outputs result JSON.

    Supports two input modes:
        1. stdin: echo '{"config": "..."}' | python3 -m audit_scraper.main
        2. File: python3 -m audit_scraper.main config.json
    """
    # Read config from stdin or file argument
    if len(sys.argv) > 1 and sys.argv[1] != "--stdin":
        with open(sys.argv[1], "r", encoding="utf-8") as f:
            config_json = json.load(f)
    else:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps({"status": "failed", "error": "No input provided on stdin"}))
            sys.exit(1)
        config_json = json.loads(raw_input)

    # Execute the audit
    try:
        result = asyncio.run(run_audit(config_json))
        # Output the result as JSON to stdout
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    except Exception as e:
        logger.error("Audit execution failed: %s", e, exc_info=True)
        print(json.dumps({
            "status": "failed",
            "error": str(e),
            "error_type": type(e).__name__,
        }, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()

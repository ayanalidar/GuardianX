"""
AuditTrailLogger — Appends audit metadata to the output payload for
integrity verification and compliance traceability.

For each scraped field, the logger records:
    - UTC timestamp of execution
    - HTTP status code of the response
    - Request duration in milliseconds
    - SHA-256 hash of the raw extracted data (tamper-evidence)
    - Execution mode used (lightweight / browser)
    - Number of retries attempted
    - Per-selector success/failure status

The logger produces a structured audit trail that can be independently
verified: given the same raw data, anyone can recompute the SHA-256 hash
and confirm it matches the recorded value.

Usage:
    logger = AuditTrailLogger(audit_id=config.audit_id)
    logger.record_request(status_code=200, duration_ms=450, mode="lightweight")
    logger.record_selector("title", success=True, raw_data="<h1>Hello</h1>")
    trail = logger.build_trail()
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

logger = logging.getLogger("guardianx.audit.trail")


class AuditTrailLogger:
    """
    Builds an immutable audit trail for a scraping execution.

    The trail includes request metadata, per-selector extraction results,
    and cryptographic hashes for integrity verification. Once built,
    the trail serves as a tamper-evident record of what was scraped,
    when, and from where.

    Attributes:
        audit_id: UUID of the parent audit task.
        entries: List of per-selector extraction log entries.
        request_meta: Metadata about the HTTP request(s) made.
    """

    def __init__(self, audit_id: UUID) -> None:
        """
        Initialize the audit trail logger.

        Args:
            audit_id: UUID of the audit task this trail belongs to.
        """
        self.audit_id: UUID = audit_id
        self.entries: list[dict[str, Any]] = []
        self.request_meta: dict[str, Any] = {}
        self.started_at: datetime = datetime.now(timezone.utc)
        self.completed_at: Optional[datetime] = None

    def record_request(
        self,
        status_code: int,
        duration_ms: int,
        mode: str,
        url: str,
        retries: int = 0,
        response_size: int = 0,
    ) -> None:
        """
        Record metadata about the HTTP request made to the target.

        Args:
            status_code: HTTP status code of the response (e.g. 200, 404).
            duration_ms: Total request duration in milliseconds.
            mode: Execution mode used ('lightweight' or 'browser').
            url: The URL that was requested.
            retries: Number of retry attempts before success/failure.
            response_size: Size of the response body in bytes.
        """
        self.request_meta = {
            "url": url,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "execution_mode": mode,
            "retries": retries,
            "response_size_bytes": response_size,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        }
        logger.info(
            "Request recorded: %s %d %dms (retries=%d)",
            url, status_code, duration_ms, retries,
        )

    def record_selector(
        self,
        field_name: str,
        success: bool,
        raw_data: str | None = None,
        error: str | None = None,
        match_count: int = 0,
    ) -> None:
        """
        Record the result of extracting a single selector.

        Computes a SHA-256 hash of the raw extracted data for integrity
        verification. This hash can be recomputed later to prove the
        data hasn't been tampered with since extraction.

        Args:
            field_name: Name of the field being extracted.
            success: Whether the extraction succeeded.
            raw_data: The raw extracted string (before sanitization).
            error: Error message if extraction failed.
            match_count: Number of DOM elements that matched the selector.
        """
        data_hash: Optional[str] = None
        if raw_data is not None:
            data_hash = hashlib.sha256(raw_data.encode("utf-8")).hexdigest()

        entry = {
            "field_name": field_name,
            "success": success,
            "match_count": match_count,
            "raw_data_sha256": data_hash,
            "raw_data_length": len(raw_data) if raw_data else 0,
            "error": error,
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        }
        self.entries.append(entry)
        logger.debug(
            "Selector '%s': success=%s matches=%d hash=%s",
            field_name, success, match_count,
            data_hash[:16] + "..." if data_hash else "none",
        )

    def complete(self) -> None:
        """Mark the audit trail as complete by recording the completion timestamp."""
        self.completed_at = datetime.now(timezone.utc)

    def build_trail(self) -> dict[str, Any]:
        """
        Build the final audit trail dictionary for inclusion in the output payload.

        Returns:
            A dictionary containing:
                - audit_id: UUID of the task
                - started_at / completed_at: UTC timestamps
                - total_duration_ms: Wall-clock duration
                - request: HTTP request metadata
                - selectors: Per-selector extraction results with SHA-256 hashes
                - integrity_hash: SHA-256 of the entire trail (tamper-evidence)
        """
        self.complete()
        total_duration_ms = int(
            (self.completed_at - self.started_at).total_seconds() * 1000
        ) if self.completed_at else 0

        trail = {
            "audit_id": str(self.audit_id),
            "started_at_utc": self.started_at.isoformat(),
            "completed_at_utc": self.completed_at.isoformat() if self.completed_at else None,
            "total_duration_ms": total_duration_ms,
            "request": self.request_meta,
            "selectors": self.entries,
        }

        # Compute an integrity hash over the entire trail
        trail_json = str(trail).encode("utf-8")
        trail["integrity_hash"] = hashlib.sha256(trail_json).hexdigest()

        return trail

    @staticmethod
    def verify_integrity(trail: dict[str, Any]) -> bool:
        """
        Verify the integrity of an audit trail by recomputing its hash.

        Args:
            trail: The audit trail dictionary to verify.

        Returns:
            True if the integrity hash matches, False if the trail has been tampered with.
        """
        stored_hash = trail.pop("integrity_hash", None)
        if stored_hash is None:
            return False
        recomputed = hashlib.sha256(str(trail).encode("utf-8")).hexdigest()
        return recomputed == stored_hash

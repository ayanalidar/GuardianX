"""
ScraperConfig — Pydantic model that validates the JSON audit task configuration.

This module defines the complete input schema for the AuditScraperEngine,
including target URL, execution mode, rate limiting, custom headers,
CSS/XPath selectors, and sanitization rules for PII scrubbing.

Usage:
    config = ScraperConfig.model_validate(json_dict)
    engine = AuditScraperEngine(config)
    result = await engine.execute()
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


class ExecutionMode(str, Enum):
    """Dual execution modes for the scraper engine."""
    LIGHTWEIGHT = "lightweight"  # httpx + BeautifulSoup for static pages
    BROWSER = "browser"          # Playwright async for JS-rendered pages


class SelectorType(str, Enum):
    """Supported selector types for DOM element extraction."""
    CSS = "css"
    XPATH = "xpath"


class TargetSelector(BaseModel):
    """
    Defines a single extraction target: which DOM elements to scrape
    and what attribute or text content to pull from them.
    """
    field_name: str = Field(
        ...,
        description="Logical name for the extracted field, e.g. 'product_title'.",
        min_length=1,
        max_length=128,
    )
    selector: str = Field(
        ...,
        description="CSS or XPath selector string targeting the DOM element(s).",
        min_length=1,
    )
    selector_type: SelectorType = Field(
        default=SelectorType.CSS,
        description="Whether the selector is CSS or XPath.",
    )
    attribute: Optional[str] = Field(
        default=None,
        description="If set, extract this HTML attribute (e.g. 'href', 'src'). "
                    "If None, extracts visible text content.",
    )
    multiple: bool = Field(
        default=False,
        description="If True, extract all matching elements as a list. "
                    "If False, extract only the first match.",
    )
    required: bool = Field(
        default=True,
        description="If True, a missing element is treated as an error. "
                    "If False, missing elements are silently skipped.",
    )
    default: Optional[Any] = Field(
        default=None,
        description="Fallback value to use if the element is not found and 'required' is False.",
    )


class SanitizationRule(BaseModel):
    """
    A single sanitization rule that scrubs sensitive data from scraped content.
    Either a named pattern (email, phone, token, ssn) or a custom regex.
    """
    key: str = Field(
        ...,
        description="Logical name for this rule, e.g. 'scrub_emails'.",
        min_length=1,
    )
    pattern: Optional[str] = Field(
        default=None,
        description="Custom regex pattern. If omitted, 'key' must match a built-in pattern.",
    )
    replacement: str = Field(
        default="[REDACTED]",
        description="String to replace matched sensitive data with.",
    )
    applies_to: Optional[list[str]] = Field(
        default=None,
        description="List of field_names this rule applies to. If None, applies to all fields.",
    )


# Built-in sanitization patterns for common PII / sensitive data types.
BUILTIN_PATTERNS: dict[str, str] = {
    "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    "phone": r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}",
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b(?:\d[ -]*?){13,16}\b",
    "api_key": r"(?:api[_-]?key|token|secret|password)\s*[=:]\s*['\"]?[A-Za-z0-9/+=_-]{16,}['\"]?",
    "bearer_token": r"Bearer\s+[A-Za-z0-9\-._~+/]+=*",
    "jwt": r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    "aws_key": r"AKIA[0-9A-Z]{16}",
    "private_key": r"-----BEGIN\s(?:RSA\s|EC\s|OPENSSH\s)?PRIVATE\sKEY-----",
    "ipv4": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
}


class ScraperConfig(BaseModel):
    """
    Top-level configuration model for an audit scrape task.

    This model is the single entry point for configuring the AuditScraperEngine.
    It validates all inputs, applies defaults, and ensures the configuration
    is safe and well-formed before execution begins.

    Example JSON:
        {
            "audit_id": "550e8400-e29b-41d4-a716-446655440000",
            "target_url": "https://authorized-target.example.com",
            "execution_mode": "lightweight",
            "rate_limit_delay_ms": 1000,
            "headers": {"User-Agent": "GuardianX-Audit-Bot/1.0"},
            "target_selectors": [
                {
                    "field_name": "page_title",
                    "selector": "h1",
                    "selector_type": "css",
                    "required": true
                }
            ],
            "sanitization_rules": [
                {"key": "email", "replacement": "[EMAIL_REDACTED]"},
                {"key": "phone", "replacement": "[PHONE_REDACTED]"}
            ]
        }
    """

    audit_id: UUID = Field(
        default_factory=uuid4,
        description="Unique identifier for this audit task. Auto-generated if omitted.",
    )
    target_url: str = Field(
        ...,
        description="Fully-qualified URL of the authorized target to scrape.",
        min_length=1,
    )
    execution_mode: ExecutionMode = Field(
        default=ExecutionMode.LIGHTWEIGHT,
        description="Execution mode: 'lightweight' (httpx+BS4) or 'browser' (Playwright).",
    )
    rate_limit_delay_ms: int = Field(
        default=1000,
        description="Minimum delay between requests in milliseconds.",
        ge=0,
        le=60000,
    )
    timeout_ms: int = Field(
        default=30000,
        description="Request timeout in milliseconds.",
        ge=1000,
        le=120000,
    )
    max_retries: int = Field(
        default=3,
        description="Maximum number of retry attempts on transient failures.",
        ge=0,
        le=10,
    )
    headers: dict[str, str] = Field(
        default_factory=dict,
        description="Custom HTTP headers (User-Agent, Authorization, etc.).",
    )
    target_selectors: list[TargetSelector] = Field(
        default_factory=list,
        description="List of CSS/XPath selectors defining what data to extract.",
    )
    sanitization_rules: list[SanitizationRule] = Field(
        default_factory=list,
        description="Rules for scrubbing PII/sensitive data from scraped content.",
    )
    follow_redirects: bool = Field(
        default=True,
        description="Whether to follow HTTP redirects.",
    )
    verify_ssl: bool = Field(
        default=True,
        description="Whether to verify SSL certificates.",
    )

    @field_validator("target_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        """Ensure target_url has a valid scheme."""
        if not v.startswith(("http://", "https://")):
            raise ValueError("target_url must start with http:// or https://")
        return v

    @model_validator(mode="after")
    def validate_browser_selectors(self) -> "ScraperConfig":
        """Warn (via model config) if XPath selectors are used in lightweight mode."""
        if self.execution_mode == ExecutionMode.LIGHTWEIGHT:
            xpath_selectors = [
                s for s in self.target_selectors
                if s.selector_type == SelectorType.XPATH
            ]
            if xpath_selectors:
                # XPath is supported in lightweight mode via lxml, but we log a note
                pass  # lxml supports XPath in BeautifulSoup, so this is fine
        return self

    class Config:
        """Pydantic model configuration."""
        use_enum_values = False  # Keep enum types for internal logic
        json_encoders = {UUID: str}

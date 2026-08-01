"""
SanitizerPipeline — Processing pipeline that strips PII and sensitive data
from scraped content before it is stored or returned.

The pipeline applies a configurable set of regex-based sanitization rules
to each extracted field. Built-in patterns cover common PII types (emails,
phone numbers, SSNs, credit cards, API keys, JWTs, AWS keys, private keys,
IP addresses). Custom regex patterns can also be supplied per rule.

Usage:
    pipeline = SanitizerPipeline(rules)
    cleaned = pipeline.sanitize({"email": "user@test.com", "name": "John"})
    # → {"email": "[REDACTED]", "name": "John"}
"""

from __future__ import annotations

import re
import logging
from typing import Any

from config import SanitizationRule, BUILTIN_PATTERNS

logger = logging.getLogger("guardianx.audit.sanitizer")


class SanitizerPipeline:
    """
    A processing pipeline that scrubs sensitive data from scraped fields.

    The pipeline is initialized with a list of SanitizationRule objects.
    Each rule specifies a regex pattern (either built-in or custom),
    a replacement string, and an optional list of target field names.

    Attributes:
        rules: List of SanitizationRule objects to apply.
        compiled_patterns: List of (compiled_regex, replacement, applies_to) tuples.
    """

    def __init__(self, rules: list[SanitizationRule]) -> None:
        """
        Initialize the sanitizer pipeline with the given rules.

        Args:
            rules: List of SanitizationRule objects defining what to scrub.
        """
        self.rules: list[SanitizationRule] = rules
        self.compiled_patterns: list[tuple[re.Pattern[str], str, list[str] | None]] = []

        for rule in self.rules:
            # Resolve the pattern: custom regex takes precedence, then built-in by key name
            pattern_str = rule.pattern
            if pattern_str is None:
                pattern_str = BUILTIN_PATTERNS.get(rule.key)
                if pattern_str is None:
                    logger.warning(
                        "Sanitization rule '%s' has no custom pattern and does not "
                        "match any built-in pattern. Skipping.",
                        rule.key,
                    )
                    continue

            try:
                compiled = re.compile(pattern_str, re.IGNORECASE)
                self.compiled_patterns.append((compiled, rule.replacement, rule.applies_to))
                logger.debug("Compiled sanitization rule '%s' with pattern: %s", rule.key, pattern_str)
            except re.error as e:
                logger.error("Invalid regex in rule '%s': %s — %s", rule.key, pattern_str, e)

    def sanitize_value(self, value: Any, field_name: str | None = None) -> Any:
        """
        Apply all applicable sanitization rules to a single value.

        If a rule has 'applies_to' set, the value is only scrubbed if
        field_name is in that list. Otherwise, the rule applies to all fields.

        Args:
            value: The value to sanitize. Non-string values are returned unchanged.
            field_name: The name of the field being sanitized (for rule targeting).

        Returns:
            The sanitized value, with sensitive data replaced by [REDACTED]-style tokens.
        """
        if not isinstance(value, str):
            return value

        sanitized = value
        for compiled, replacement, applies_to in self.compiled_patterns:
            # Skip this rule if it doesn't apply to this field
            if applies_to is not None and field_name is not None and field_name not in applies_to:
                continue
            sanitized = compiled.sub(replacement, sanitized)

        return sanitized

    def sanitize(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Sanitize all string values in a dictionary of scraped data.

        Recursively processes nested dictionaries and lists. Non-string values
        (integers, booleans, None) are passed through unchanged.

        Args:
            data: Dictionary of scraped field_name → value pairs.

        Returns:
            A new dictionary with all applicable sanitization rules applied.
        """
        return self._sanitize_dict(data)

    def _sanitize_dict(self, data: dict[str, Any]) -> dict[str, Any]:
        """Recursively sanitize all values in a dictionary."""
        result: dict[str, Any] = {}
        for key, value in data.items():
            result[key] = self._sanitize_value_recursive(value, key)
        return result

    def _sanitize_list(self, items: list[Any], field_name: str | None = None) -> list[Any]:
        """Recursively sanitize all items in a list."""
        return [self._sanitize_value_recursive(item, field_name) for item in items]

    def _sanitize_value_recursive(self, value: Any, field_name: str | None = None) -> Any:
        """Recursively sanitize a value, handling dicts, lists, and scalars."""
        if isinstance(value, dict):
            return self._sanitize_dict(value)
        elif isinstance(value, list):
            return self._sanitize_list(value, field_name)
        else:
            return self.sanitize_value(value, field_name)

    def get_redaction_summary(self, original: dict[str, Any], sanitized: dict[str, Any]) -> dict[str, Any]:
        """
        Compare original vs sanitized data and return a summary of what was redacted.

        Args:
            original: The pre-sanitization data dictionary.
            sanitized: The post-sanitization data dictionary.

        Returns:
            A dictionary with per-field redaction counts.
        """
        summary: dict[str, Any] = {}
        for key in original:
            orig_val = str(original.get(key, ""))
            san_val = str(sanitized.get(key, ""))
            redaction_count = orig_val.count("[REDACTED]") - san_val.count("[REDACTED]")
            # Count replacements by comparing lengths
            if orig_val != san_val:
                summary[key] = {
                    "redacted": True,
                    "original_length": len(orig_val),
                    "sanitized_length": len(san_val),
                }
        return summary

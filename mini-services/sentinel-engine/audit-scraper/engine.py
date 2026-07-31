"""
AuditScraperEngine — Core scraping engine with dual execution modes,
retry logic, timeout handling, and request throttling.

The engine supports two modes:
    1. Lightweight: httpx + BeautifulSoup (fast, for static pages)
    2. Browser: Playwright async (for JS-rendered pages)

Both modes share the same selector extraction logic, sanitization pipeline,
and audit trail logging. The engine handles:
    - HTTP 4xx/5xx errors with retry
    - Selector timeouts and missing DOM elements (non-blocking)
    - Rate limiting / request throttling
    - SSL verification toggle
    - Custom headers
    - Fallback from browser mode to lightweight if JS rendering fails

Usage:
    config = ScraperConfig.model_validate(task_json)
    engine = AuditScraperEngine(config)
    result = await engine.execute()
    print(json.dumps(result, indent=2))
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

import httpx
from bs4 import BeautifulSoup
from lxml import etree

from config import ScraperConfig, ExecutionMode, SelectorType, TargetSelector
from sanitizer import SanitizerPipeline
from logger import AuditTrailLogger
from credential_scanner import scan_for_credentials

logger = logging.getLogger("guardianx.audit.engine")


class AuditScraperEngine:
    """
    Production-ready web scraping engine for authorized audit tasks.

    The engine orchestrates the full scraping pipeline:
        1. Initialize HTTP session with custom headers and SSL config
        2. Fetch the target page (lightweight or browser mode)
        3. Parse the HTML DOM
        4. Extract data using configured CSS/XPath selectors
        5. Sanitize extracted data (strip PII / sensitive strings)
        6. Build an audit trail with SHA-256 integrity hashes
        7. Return a structured JSON payload

    Attributes:
        config: Validated ScraperConfig instance.
        sanitizer: SanitizerPipeline for PII scrubbing.
        trail: AuditTrailLogger for integrity tracking.
    """

    def __init__(self, config: ScraperConfig) -> None:
        """
        Initialize the scraper engine with a validated configuration.

        Args:
            config: A ScraperConfig instance (validated via Pydantic).
        """
        self.config: ScraperConfig = config
        self.sanitizer: SanitizerPipeline = SanitizerPipeline(config.sanitization_rules)
        self.trail: AuditTrailLogger = AuditTrailLogger(config.audit_id)
        self._soup: Optional[BeautifulSoup] = None
        self._tree: Optional[etree._Element] = None
        self._raw_html: Optional[str] = None

    async def execute(self) -> dict[str, Any]:
        """
        Execute the full scraping pipeline and return a structured result.

        This is the main entry point. It fetches the target page, extracts
        all configured selectors, sanitizes the results, and builds the
        audit trail. Errors in individual selectors do not halt the pipeline.

        Returns:
            A dictionary containing:
                - audit_id: UUID of the task
                - status: "success" | "partial_success" | "failed"
                - extracted_data: Dict of field_name → extracted value
                - sanitized_data: Dict of field_name → sanitized value
                - audit_trail: Integrity-verified audit trail
                - errors: List of non-fatal errors encountered
        """
        errors: list[str] = []
        extracted_data: dict[str, Any] = {}
        start_time = time.monotonic()

        # ── Step 1: Fetch the target page ────────────────────────────────
        try:
            if self.config.execution_mode == ExecutionMode.BROWSER:
                try:
                    html, status, duration, retries, size = await self._fetch_browser()
                except Exception as browser_err:
                    logger.warning(
                        "Browser mode failed (%s), falling back to lightweight mode.",
                        browser_err,
                    )
                    errors.append(f"Browser mode failed, fell back to lightweight: {browser_err}")
                    html, status, duration, retries, size = await self._fetch_lightweight()
            else:
                html, status, duration, retries, size = await self._fetch_lightweight()

            self._raw_html = html
            self.trail.record_request(
                status_code=status,
                duration_ms=int(duration * 1000),
                mode=self.config.execution_mode.value,
                url=self.config.target_url,
                retries=retries,
                response_size=size,
            )

            if status >= 400:
                errors.append(f"HTTP {status} received from target")
                # Continue anyway — some error pages contain useful data

        except Exception as fetch_err:
            logger.error("Failed to fetch target URL: %s", fetch_err)
            self.trail.record_request(
                status_code=0,
                duration_ms=int((time.monotonic() - start_time) * 1000),
                mode=self.config.execution_mode.value,
                url=self.config.target_url,
                retries=0,
                response_size=0,
            )
            return self._build_result(
                extracted_data, errors, "failed",
                error_detail=str(fetch_err),
            )

        # ── Step 2: Parse the HTML DOM ───────────────────────────────────
        try:
            self._soup = BeautifulSoup(html, "lxml")
            # Build lxml tree for XPath support
            self._tree = etree.HTML(html)
        except Exception as parse_err:
            errors.append(f"HTML parsing failed: {parse_err}")
            return self._build_result(extracted_data, errors, "failed", error_detail=str(parse_err))

        # ── Step 3: Extract data using configured selectors ───────────────
        for selector in self.config.target_selectors:
            try:
                value, match_count, raw_data = self._extract_selector(selector)
                extracted_data[selector.field_name] = value
                self.trail.record_selector(
                    field_name=selector.field_name,
                    success=True,
                    raw_data=raw_data,
                    match_count=match_count,
                )
            except Exception as sel_err:
                if selector.required:
                    extracted_data[selector.field_name] = selector.default
                    errors.append(f"Required selector '{selector.field_name}' failed: {sel_err}")
                else:
                    logger.debug("Optional selector '%s' failed: %s", selector.field_name, sel_err)
                self.trail.record_selector(
                    field_name=selector.field_name,
                    success=False,
                    error=str(sel_err),
                    match_count=0,
                )

        # ── Step 4: Sanitize extracted data ──────────────────────────────
        sanitized_data = self.sanitizer.sanitize(extracted_data)

        # ── Step 4b: Scan for exposed credentials / vulnerable data ──────
        vulnerable_data = scan_for_credentials(html, self.config.target_url)

        # ── Step 5: Determine overall status ─────────────────────────────
        total_selectors = len(self.config.target_selectors)
        successful = sum(1 for e in self.trail.entries if e.get("success"))
        if errors and successful == 0:
            status = "failed"
        elif errors or successful < total_selectors:
            status = "partial_success"
        else:
            status = "success"

        return self._build_result(sanitized_data, errors, status, vulnerable_data=vulnerable_data)

    def _extract_selector(
        self, selector: TargetSelector
    ) -> tuple[Any, int, Optional[str]]:
        """
        Extract data for a single selector from the parsed DOM.

        Supports both CSS (via BeautifulSoup) and XPath (via lxml).
        Handles 'attribute' extraction (e.g. href, src) and text content.
        Supports 'multiple' mode for extracting all matches as a list.

        Args:
            selector: TargetSelector defining what to extract.

        Returns:
            Tuple of (extracted_value, match_count, raw_data_string).

        Raises:
            ValueError: If no matches are found and the selector is required.
            RuntimeError: If the DOM has not been parsed yet.
        """
        if self._soup is None or self._tree is None:
            raise RuntimeError("DOM not parsed. Call execute() first.")

        raw_values: list[str] = []

        if selector.selector_type == SelectorType.CSS:
            # Use BeautifulSoup for CSS selectors
            elements = self._soup.select(selector.selector)
            for el in elements:
                if selector.attribute:
                    val = el.get(selector.attribute, "")
                else:
                    val = el.get_text(strip=True)
                if val:
                    raw_values.append(val)

        elif selector.selector_type == SelectorType.XPATH:
            # Use lxml for XPath selectors
            results = self._tree.xpath(selector.selector)
            for el in results:
                if isinstance(el, str):
                    raw_values.append(el.strip())
                elif hasattr(el, "get") and selector.attribute:
                    val = el.get(selector.attribute, "")
                    if val:
                        raw_values.append(val)
                elif hasattr(el, "text_content"):
                    val = el.text_content().strip()
                    if val:
                        raw_values.append(val)

        match_count = len(raw_values)

        if match_count == 0:
            if selector.required:
                raise ValueError(
                    f"No elements matched selector '{selector.selector}' "
                    f"({selector.selector_type.value})"
                )
            return selector.default, 0, None

        # Build the raw data string for hashing
        raw_data = "\n".join(raw_values)

        if selector.multiple:
            return raw_values, match_count, raw_data
        else:
            return raw_values[0], match_count, raw_data

    async def _fetch_lightweight(self) -> tuple[str, int, float, int, int]:
        """
        Fetch the target page using httpx (lightweight mode).

        Implements retry logic with exponential backoff for transient errors
        (429, 500, 502, 503, 504), request throttling, and timeout handling.

        Returns:
            Tuple of (html_body, status_code, duration_seconds, retries, response_size).

        Raises:
            httpx.RequestError: If all retries are exhausted.
        """
        delay_seconds = self.config.rate_limit_delay_ms / 1000.0
        timeout_seconds = self.config.timeout_ms / 1000.0
        retries = 0
        last_error: Optional[Exception] = None

        # Default headers
        default_headers = {
            "User-Agent": "GuardianX-Audit-Scraper/1.0 (+https://www.guardianx.in)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        default_headers.update(self.config.headers)

        async with httpx.AsyncClient(
            timeout=timeout_seconds,
            follow_redirects=self.config.follow_redirects,
            verify=self.config.verify_ssl,
            headers=default_headers,
        ) as client:
            for attempt in range(self.config.max_retries + 1):
                try:
                    # Throttle: wait before each request (except the first)
                    if attempt > 0:
                        backoff = min(delay_seconds * (2 ** attempt), 30.0)
                        logger.info("Retrying in %.1fs (attempt %d/%d)...", backoff, attempt + 1, self.config.max_retries + 1)
                        await asyncio.sleep(backoff)
                    elif delay_seconds > 0:
                        await asyncio.sleep(delay_seconds)

                    start = time.monotonic()
                    response = await client.get(self.config.target_url)
                    duration = time.monotonic() - start

                    # Retry on rate-limiting and server errors
                    if response.status_code in (429, 500, 502, 503, 504) and attempt < self.config.max_retries:
                        retries += 1
                        logger.warning("HTTP %d — will retry (attempt %d)", response.status_code, attempt + 1)
                        last_error = httpx.HTTPStatusError(
                            f"HTTP {response.status_code}",
                            request=response.request,
                            response=response,
                        )
                        continue

                    return response.text, response.status_code, duration, retries, len(response.content)

                except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as e:
                    retries += 1
                    last_error = e
                    logger.warning("Network error (attempt %d): %s", attempt + 1, e)
                    if attempt >= self.config.max_retries:
                        raise
                    continue

        # All retries exhausted
        if last_error:
            raise last_error
        raise RuntimeError("Unknown error during lightweight fetch")

    async def _fetch_browser(self) -> tuple[str, int, float, int, int]:
        """
        Fetch the target page using Playwright async (browser mode).

        Launches a headless Chromium browser, navigates to the target URL,
        waits for the page to load (including JS rendering), and extracts
        the fully-rendered HTML.

        If Playwright is not installed or fails to launch, this method
        raises an exception that triggers a fallback to lightweight mode.

        Returns:
            Tuple of (html_body, status_code, duration_seconds, retries, response_size).

        Raises:
            ImportError: If Playwright is not installed.
            Exception: If the browser fails to launch or navigate.
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError as e:
            raise ImportError(
                "Playwright is not installed. Install with: pip install playwright && playwright install chromium"
            ) from e

        delay_seconds = self.config.rate_limit_delay_ms / 1000.0
        timeout_ms = self.config.timeout_ms

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=self.config.headers.get(
                    "User-Agent",
                    "GuardianX-Audit-Scraper/1.0 (+https://www.guardianx.in)"
                ),
                ignore_https_errors=not self.config.verify_ssl,
            )

            # Set custom headers
            if self.config.headers:
                await context.set_extra_http_headers(self.config.headers)

            page = await context.new_page()
            page.set_default_timeout(timeout_ms)

            # Throttle
            if delay_seconds > 0:
                await asyncio.sleep(delay_seconds)

            start = time.monotonic()

            try:
                response = await page.goto(self.config.target_url, wait_until="networkidle")

                # Wait a bit extra for any lazy-loaded content
                await page.wait_for_timeout(1000)

                html = await page.content()
                duration = time.monotonic() - start
                status = response.status if response else 200
                size = len(html.encode("utf-8"))

                return html, status, duration, 0, size

            except Exception as nav_err:
                # If navigation fails, try to grab whatever HTML is available
                try:
                    html = await page.content()
                    duration = time.monotonic() - start
                    logger.warning("Navigation error, but got partial HTML: %s", nav_err)
                    return html, 0, duration, 0, len(html.encode("utf-8"))
                except Exception:
                    raise nav_err
            finally:
                await context.close()
                await browser.close()

    def _build_result(
        self,
        data: dict[str, Any],
        errors: list[str],
        status: str,
        error_detail: Optional[str] = None,
        vulnerable_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """
        Build the final structured output payload.

        Args:
            data: The (sanitized) extracted data dictionary.
            errors: List of non-fatal error messages encountered.
            status: Overall execution status.
            error_detail: Optional fatal error detail.
            vulnerable_data: Exposed credentials / sensitive data found.

        Returns:
            Complete output payload with data, vulnerable_data, audit trail, and metadata.
        """
        trail = self.trail.build_trail()

        result: dict[str, Any] = {
            "audit_id": str(self.config.audit_id),
            "status": status,
            "target_url": self.config.target_url,
            "execution_mode": self.config.execution_mode.value,
            "extracted_fields": len(data),
            "data": data,
            "vulnerable_data": vulnerable_data or {"total_findings": 0, "severity": "none", "credentials": [], "summary": "No exposed credentials found."},
            "audit_trail": trail,
            "errors": errors,
        }

        if error_detail:
            result["fatal_error"] = error_detail

        return result

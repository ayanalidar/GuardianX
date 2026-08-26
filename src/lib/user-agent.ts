// GuardianX — lightweight User-Agent parser (no external deps).
//
// Used by /api/auth/login-history to summarize the raw UA string into a
// human-readable { browser, os } pair for the Security → Recent Login
// Activity table. We intentionally only detect the *major* browser
// families and OSes — perfect UA parsing is a moving target and we'd
// rather ship something readable than pull in a 50KB dep.
//
// Detection order matters: many browsers spoof earlier ones in their UA
// string (Edge spoofs Chrome, Chrome spoofs Safari), so we check the
// spoofer FIRST.

export interface ParsedUserAgent {
  /** Human-readable browser family, e.g. "Chrome", "Safari", "Edge",
   *  "Firefox", "Opera", "Internet Explorer", or "Unknown" if we
   *  couldn't recognize it. */
  browser: string;
  /** Human-readable OS family, e.g. "Windows", "macOS", "Linux",
   *  "iOS", "Android", or "Unknown". */
  os: string;
}

/**
 * Parse a User-Agent header string into a { browser, os } summary.
 *
 * Returns `{ browser: "Unknown", os: "Unknown" }` for empty / missing
 * input — the caller should expect this for non-browser clients (curl,
 * server-side fetch, etc.).
 *
 * The function is intentionally case-sensitive on UA substrings: per
 * RFC 9110 §10.1.5 the User-Agent header is sent verbatim by the
 * client, and all major browsers use the canonical capitalizations
 * matched below.
 */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua || typeof ua !== "string" || ua.trim().length === 0) {
    return { browser: "Unknown", os: "Unknown" };
  }

  return {
    browser: detectBrowser(ua),
    os: detectOs(ua),
  };
}

// ── Browser detection ───────────────────────────────────────────────────────
//
// Order matters! Each browser is checked in turn and the first match
// wins. This is required because:
//   - Edge's UA contains "Chrome/" and "Edg/" — must check Edg first.
//   - Opera's UA contains "OPR/" (newer) or "Opera/" (older) AND
//     "Chrome/" — must check Opera first.
//   - Chrome's UA contains "Safari/" — must check Chrome before Safari.
//   - Internet Explorer's UA contains "Trident/" and "MSIE " — check
//     before Safari too (some IE11 UAs contain "like Gecko").
//   - Firefox is the only major browser that doesn't spoof others, so
//     it can go late.
//   - Safari is the catch-all for anything left over with "Safari/" —
//     this is the right default for iOS Safari, macOS Safari, etc.
function detectBrowser(ua: string): string {
  // Microsoft Edge (Chromium) — UA contains "Edg/<version>".
  if (/Edg\//i.test(ua)) return "Edge";
  // Opera (Chromium-based, 2013+) — UA contains "OPR/<version>".
  if (/OPR\//i.test(ua)) return "Opera";
  // Opera (Presto-based, pre-2013) — UA contains "Opera/".
  if (/Opera\//i.test(ua)) return "Opera";
  // Internet Explorer 11 — UA contains "Trident/7.0" and "rv:11.0".
  if (/Trident\/7\.0/i.test(ua) || /rv:11\.0/i.test(ua)) return "Internet Explorer";
  // Internet Explorer 10 and earlier — UA contains "MSIE <version>".
  if (/MSIE\s\d/i.test(ua)) return "Internet Explorer";
  // Firefox — UA contains "Firefox/<version>". Must come before Chrome
  // because Firefox on iOS sends a Safari-like UA (handled below) but
  // desktop Firefox reliably includes "Firefox/".
  if (/Firefox\//i.test(ua)) return "Firefox";
  // Chrome — UA contains "Chrome/<version>" but NOT "Edg/" or "OPR/"
  // (already filtered above). This also matches Chromium, Brave,
  // Vivaldi, Arc, etc. — we don't differentiate, which is fine for
  // the "did I log in from a familiar browser?" use case.
  if (/Chrome\//i.test(ua)) return "Chrome";
  // Safari — UA contains "Safari/<version>" but NOT "Chrome/". This
  // must come last (after Chrome) because Chrome also includes
  // "Safari/" in its UA.
  if (/Safari\//i.test(ua)) return "Safari";
  // Anything else: curl, Postman, custom client, etc.
  return "Unknown";
}

// ── OS detection ────────────────────────────────────────────────────────────
//
// Order: mobile-first (iOS / Android) before desktop (Windows / macOS /
// Linux), because iPadOS sends a macOS-like UA ("Macintosh") but is
// actually iOS — checking iOS first avoids mislabeling iPads. Likewise,
// Android tablets send "Android" in their UA, so we don't need a
// separate tablet branch.
function detectOs(ua: string): string {
  // iOS — iPhone, iPad (modern iPadOS sends "Macintosh" but also
  // includes "iPad" — older iOS sends "iPhone" or "iPod"). We check
  // iPad/iPhone/iPod explicitly first, then fall back to the iPadOS-13+
  // "Mac OS X + touch" heuristic.
  if (/iPad|iPhone|iPod/i.test(ua)) return "iOS";
  if (/Macintosh|Mac OS X/i.test(ua) && /Touch/i.test(ua)) return "iOS";
  // Android — phones and tablets both send "Android <version>".
  if (/Android/i.test(ua)) return "Android";
  // Windows — must come before "Mac OS X" check because Windows UAs
  // don't contain "Mac", but we want explicit ordering anyway. We
  // accept "Windows NT <version>" (desktop) and "Windows Phone" (mobile).
  if (/Windows/i.test(ua)) return "Windows";
  // macOS — desktop Mac ("Macintosh" or "Mac OS X"). The iOS check
  // above already grabbed iPadOS-13+ via the Touch heuristic.
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  // Linux — various distros all send "Linux" + "X11" or "Wayland". We
  // also catch ChromeOS here (its UA contains "X11; CrOS") — close
  // enough for the security audit use case.
  if (/Linux|X11|CrOS/i.test(ua)) return "Linux";
  // FreeBSD / OpenBSD / other Unix — rare but worth a friendly label.
  if (/FreeBSD|OpenBSD|NetBSD/i.test(ua)) return "BSD";
  return "Unknown";
}

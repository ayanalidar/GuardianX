"use client";

/**
 * Real User Monitoring (RUM)
 * ==========================
 * Tracks real user experiences in production:
 *   - Every API call's duration + success/failure
 *   - Every error boundary trigger (with component + context)
 *   - Slow renders (>100ms) — beacon via Performance Observer
 *   - Aggregates into a "User Health Score" (0-100)
 *
 * Data is batched + sent to /api/rum/report every 30 seconds (or on
 * page unload). The server stores it in memory (or DB) and the health
 * dashboard renders it.
 *
 * Privacy: no PII is collected. Only endpoint paths, durations, and
 * error messages (truncated to 200 chars).
 */

interface RUMEvent {
  type: "api" | "error" | "slow-render";
  endpoint?: string;
  duration?: number;
  success?: boolean;
  status?: number;
  error?: string;
  component?: string;
  timestamp: number;
}

interface RUMSession {
  sessionId: string;
  startedAt: number;
  events: RUMEvent[];
  pageViews: number;
}

const FLUSH_INTERVAL_MS = 30_000;
const SLOW_RENDER_THRESHOLD_MS = 100;
const MAX_ERROR_LENGTH = 200;

class RUMCollector {
  private session: RUMSession;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private performanceObserver: PerformanceObserver | null = null;

  constructor() {
    this.session = {
      sessionId: this.generateSessionId(),
      startedAt: Date.now(),
      events: [],
      pageViews: 1,
    };

    if (typeof window !== "undefined") {
      this.startFlushTimer();
      this.observePerformance();
      this.observeUnload();
    }
  }

  private generateSessionId(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `rum-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /** Record an API call result. */
  recordApiCall(endpoint: string, duration: number, success: boolean, status: number): void {
    this.session.events.push({
      type: "api",
      endpoint,
      duration,
      success,
      status,
      timestamp: Date.now(),
    });
  }

  /** Record an error boundary trigger. */
  recordError(component: string, error: string): void {
    this.session.events.push({
      type: "error",
      component,
      error: error.slice(0, MAX_ERROR_LENGTH),
      timestamp: Date.now(),
    });
  }

  /** Record a slow render. */
  recordSlowRender(duration: number, componentName?: string): void {
    this.session.events.push({
      type: "slow-render",
      duration,
      component: componentName,
      timestamp: Date.now(),
    });
  }

  /** Calculate the User Health Score (0-100) for this session. */
  getHealthScore(): number {
    const apiEvents = this.session.events.filter((e) => e.type === "api");
    const errorEvents = this.session.events.filter((e) => e.type === "error");

    if (apiEvents.length === 0) return 100;

    const apiFailures = apiEvents.filter((e) => !e.success).length;
    const apiFailureRate = apiFailures / apiEvents.length;

    // Each error boundary trigger deducts 10 points
    const errorPenalty = Math.min(errorEvents.length * 10, 50);

    // API failure rate determines the base score
    const baseScore = (1 - apiFailureRate) * 100;

    return Math.max(0, Math.round(baseScore - errorPenalty));
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, FLUSH_INTERVAL_MS);
  }

  private observePerformance(): void {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > SLOW_RENDER_THRESHOLD_MS) {
            this.recordSlowRender(entry.duration, entry.name);
          }
        }
      });
      this.performanceObserver.observe({ entryTypes: ["measure", "longtask"] });
    } catch {
      // PerformanceObserver not available — skip slow render tracking
    }
  }

  private observeUnload(): void {
    window.addEventListener("beforeunload", () => {
      this.flush().catch(() => {});
    });
  }

  /** Send batched events to the server. */
  private async flush(): Promise<void> {
    if (this.session.events.length === 0) return;

    const batch = {
      sessionId: this.session.sessionId,
      startedAt: this.session.startedAt,
      events: this.session.events.slice(),
      healthScore: this.getHealthScore(),
      url: typeof window !== "undefined" ? window.location.pathname : "unknown",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    };

    // Clear the events (they're being sent)
    this.session.events = [];

    try {
      await fetch("/api/rum/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        keepalive: true, // allow the request to complete even if page is unloading
      });
    } catch {
      // Network error — re-queue the events for the next flush
      this.session.events.unshift(...batch.events);
    }
  }

  /** Get the current session stats (for the health dashboard). */
  getSessionStats(): {
    sessionId: string;
    duration: number;
    totalEvents: number;
    apiCalls: number;
    apiFailures: number;
    errors: number;
    slowRenders: number;
    healthScore: number;
  } {
    const apiEvents = this.session.events.filter((e) => e.type === "api");
    return {
      sessionId: this.session.sessionId,
      duration: Date.now() - this.session.startedAt,
      totalEvents: this.session.events.length,
      apiCalls: apiEvents.length,
      apiFailures: apiEvents.filter((e) => !e.success).length,
      errors: this.session.events.filter((e) => e.type === "error").length,
      slowRenders: this.session.events.filter((e) => e.type === "slow-render").length,
      healthScore: this.getHealthScore(),
    };
  }
}

// Singleton — one RUM collector per browser tab
export const rum = new RUMCollector();

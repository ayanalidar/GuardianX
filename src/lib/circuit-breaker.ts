"use client";

/**
 * Circuit Breaker + Smart Retry
 * ==============================
 * Like an electrical circuit breaker — if an endpoint fails repeatedly,
 * "trip" the circuit and stop calling it for a cooldown period. Prevents
 * cascading failures and reduces server load when an endpoint is down.
 *
 * States:
 *   CLOSED    — normal operation. Requests go through.
 *   OPEN      — circuit tripped. Requests return cached/fallback immediately.
 *   HALF_OPEN — cooldown elapsed. One request allowed through to test.
 *
 * Smart Retry:
 *   - Retries failed requests with exponential backoff: 500ms, 1s, 2s
 *   - Only retries on 5xx and network errors (not 4xx — those are permanent)
 *   - Max 2 retries (3 total attempts)
 */

type CircuitState = "closed" | "open" | "half-open";

interface CircuitRecord {
  state: CircuitState;
  /** Timestamps of recent failures (for failure-rate calculation). */
  failures: number[];
  /** Timestamps of recent successes. */
  successes: number[];
  /** When the circuit opened (for cooldown). */
  openedAt: number;
  /** Last good cached response (returned when circuit is open). */
  cachedResponse: unknown;
  /** Whether we have a cached response. */
  hasCache: boolean;
  /** Total requests sent through this circuit. */
  totalRequests: number;
  /** Total failures (for health stats). */
  totalFailures: number;
  /** Total successes (for health stats). */
  totalSuccesses: number;
}

const FAILURE_WINDOW = 10; // look at last 10 calls
const FAILURE_THRESHOLD = 0.5; // 50% failure rate → trip
const COOLDOWN_MS = 60_000; // 60s cooldown before half-open
const MAX_RETRIES = 2;

class CircuitBreaker {
  private circuits = new Map<string, CircuitRecord>();
  private listeners: Array<(endpoint: string, state: CircuitState) => void> = [];

  private getOrCreate(endpoint: string): CircuitRecord {
    if (!this.circuits.has(endpoint)) {
      this.circuits.set(endpoint, {
        state: "closed",
        failures: [],
        successes: [],
        openedAt: 0,
        cachedResponse: null,
        hasCache: false,
        totalRequests: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      });
    }
    return this.circuits.get(endpoint)!;
  }

  /**
   * Check if a request should be allowed through. Returns:
   *   - { allowed: true } if the circuit is CLOSED or HALF_OPEN
   *   - { allowed: false, cachedResponse } if OPEN (return cache instead)
   */
  canRequest(endpoint: string): { allowed: boolean; cachedResponse?: unknown; hasCache: boolean } {
    const circuit = this.getOrCreate(endpoint);
    const now = Date.now();

    // If circuit is open, check if cooldown has elapsed
    if (circuit.state === "open") {
      if (now - circuit.openedAt >= COOLDOWN_MS) {
        // Cooldown elapsed → half-open (allow one request through to test)
        circuit.state = "half-open";
        this.notifyStateChange(endpoint, "half-open");
        return { allowed: true };
      }
      // Still in cooldown → return cached/fallback
      return { allowed: false, cachedResponse: circuit.cachedResponse, hasCache: circuit.hasCache };
    }

    // CLOSED or HALF_OPEN → allow
    return { allowed: true };
  }

  /** Record a successful response. */
  recordSuccess(endpoint: string, response: unknown): void {
    const circuit = this.getOrCreate(endpoint);
    const now = Date.now();

    circuit.successes.push(now);
    circuit.totalSuccesses++;
    circuit.totalRequests++;

    // Cache the last good response
    circuit.cachedResponse = response;
    circuit.hasCache = true;

    // Trim old entries
    circuit.successes = circuit.successes.slice(-FAILURE_WINDOW);
    circuit.failures = circuit.failures.slice(-FAILURE_WINDOW);

    // If circuit was half-open and this succeeded → close it
    if (circuit.state === "half-open") {
      circuit.state = "closed";
      this.notifyStateChange(endpoint, "closed");
    }
  }

  /** Record a failed response. */
  recordFailure(endpoint: string): void {
    const circuit = this.getOrCreate(endpoint);
    const now = Date.now();

    circuit.failures.push(now);
    circuit.totalFailures++;
    circuit.totalRequests++;

    // Trim old entries
    circuit.successes = circuit.successes.slice(-FAILURE_WINDOW);
    circuit.failures = circuit.failures.slice(-FAILURE_WINDOW);

    // If circuit was half-open and this failed → re-open it
    if (circuit.state === "half-open") {
      circuit.state = "open";
      circuit.openedAt = now;
      this.notifyStateChange(endpoint, "open");
      return;
    }

    // Check failure rate
    const totalCalls = circuit.successes.length + circuit.failures.length;
    if (totalCalls >= 3) {
      // Need at least 3 calls before tripping
      const failureRate = circuit.failures.length / totalCalls;
      if (failureRate >= FAILURE_THRESHOLD) {
        circuit.state = "open";
        circuit.openedAt = now;
        this.notifyStateChange(endpoint, "open");
        console.warn(`[circuit-breaker] Circuit OPENED for ${endpoint} (failure rate: ${Math.round(failureRate * 100)}%)`);
      }
    }
  }

  /**
   * Smart retry with exponential backoff.
   * Retries on 5xx and network errors. Returns the final response (or null).
   */
  async fetchWithRetry(
    endpoint: string,
    doFetch: () => Promise<{ ok: boolean; status: number; data: unknown }>,
  ): Promise<{ ok: boolean; status: number; data: unknown; attempts: number }> {
    let lastResult: { ok: boolean; status: number; data: unknown } = { ok: false, status: 0, data: null };
    let attempts = 0;

    for (let i = 0; i <= MAX_RETRIES; i++) {
      attempts++;
      try {
        const result = await doFetch();
        lastResult = result;

        // Success → record + return
        if (result.ok) {
          this.recordSuccess(endpoint, result.data);
          return { ...result, attempts };
        }

        // 4xx → don't retry (client error, won't fix itself)
        if (result.status >= 400 && result.status < 500) {
          this.recordFailure(endpoint);
          return { ...result, attempts };
        }

        // 5xx or network error → retry with backoff (if we have retries left)
        if (i < MAX_RETRIES) {
          const backoffMs = 500 * Math.pow(2, i); // 500ms, 1s, 2s
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      } catch (err) {
        // Network error → retry
        lastResult = { ok: false, status: 0, data: null };
        if (i < MAX_RETRIES) {
          const backoffMs = 500 * Math.pow(2, i);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      }
    }

    // All retries exhausted
    this.recordFailure(endpoint);
    return { ...lastResult, attempts };
  }

  /** Get the current state of a circuit (for health dashboard). */
  getState(endpoint: string): CircuitState {
    return this.getOrCreate(endpoint).state;
  }

  /** Get health stats for all circuits (for health dashboard). */
  getAllStats(): Array<{
    endpoint: string;
    state: CircuitState;
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    successRate: number;
    hasCache: boolean;
  }> {
    return Array.from(this.circuits.entries()).map(([endpoint, c]) => ({
      endpoint,
      state: c.state,
      totalRequests: c.totalRequests,
      totalFailures: c.totalFailures,
      totalSuccesses: c.totalSuccesses,
      successRate: c.totalRequests > 0 ? c.totalSuccesses / c.totalRequests : 1,
      hasCache: c.hasCache,
    }));
  }

  /** Subscribe to circuit state changes. Returns unsubscribe function. */
  onStateChange(callback: (endpoint: string, state: CircuitState) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notifyStateChange(endpoint: string, state: CircuitState): void {
    for (const listener of this.listeners) {
      try {
        listener(endpoint, state);
      } catch {
        /* listener error — non-critical */
      }
    }
  }

  /** Reset all circuits (for testing). */
  reset(): void {
    this.circuits.clear();
  }
}

// Singleton — one circuit breaker per browser tab
export const circuitBreaker = new CircuitBreaker();

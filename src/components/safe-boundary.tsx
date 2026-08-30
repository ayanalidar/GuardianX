"use client";

import { Component, type ReactNode } from "react";

/**
 * ErrorBoundary
 * =============
 * Catches React render crashes and shows a recovery UI instead of the
 * dreaded "This page couldn't load" white screen.
 *
 * When a component throws during render (e.g. accessing an undefined
 * property like `p.id` when `p` is undefined), React unmounts the entire
 * tree and shows a blank error page. This boundary catches the error,
 * logs it, and renders a recovery UI with:
 *   - "Try Again" button (re-mounts the component)
 *   - "Reload Page" button (full page refresh)
 *   - The error message (for debugging)
 *
 * Usage — wrap any component that fetches data:
 *
 *   <ErrorBoundary fallback={<div>Failed to load patches</div>}>
 *     <PatchesView />
 *   </ErrorBoundary>
 *
 * Or wrap the whole app (in layout.tsx) for a global safety net.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI. If omitted, shows the default recovery UI. */
  fallback?: ReactNode;
  /** Called when an error is caught (for logging/analytics). */
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
  /** Called when the user clicks "Try Again" (resets the boundary). */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: { componentStack: string } | null;
  /** Incremented each time the user clicks "Try Again" — used as a key
   *  to force remount of children. */
  retryCount: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log to console (Vercel captures these in server logs)
    console.error("[ErrorBoundary] Caught render error:", error.message, errorInfo.componentStack);
  }

  handleReset = (): void => {
    this.props.onReset?.();
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  handleReload = (): void => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided.
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default recovery UI — dark theme, emerald accent, no indigo/blue.
      const errorMsg = this.state.error?.message || "An unknown error occurred.";
      const stack = this.state.errorInfo?.componentStack?.trim() || "";

      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-xl border border-red-500/30 bg-zinc-950/80 p-6 text-center backdrop-blur">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-red-400">
            <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
            Component crashed
          </div>
          <p className="max-w-md text-sm text-zinc-400">
            This section failed to render. The rest of the page is still working.
            You can try again or reload the page.
          </p>
          <details className="max-w-md text-left">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400">
              Error details
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-black/40 p-3 font-mono text-[10px] text-red-300">
              {errorMsg}
              {stack ? `\n\n${stack}` : ""}
            </pre>
          </details>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    // Force remount on retry by keying the children with retryCount.
    return (
      <div key={this.state.retryCount} className="contents">
        {this.props.children}
      </div>
    );
  }
}

/**
 * Convenience wrapper — wraps the children in an ErrorBoundary that reports
 * errors to the /api/audit-log endpoint (so we can see what's crashing in
 * production without users having to report it).
 */
export function SafeSection({
  children,
  name,
  fallback,
}: {
  children: ReactNode;
  name: string;
  fallback?: ReactNode;
}): ReactNode {
  return (
    <ErrorBoundary
      fallback={
        fallback ?? (
          <div className="rounded-lg border border-red-500/20 bg-zinc-950/50 p-4 text-center font-mono text-xs text-zinc-500">
            {name} failed to load.{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-emerald-400 underline hover:text-emerald-300"
            >
              Reload
            </button>
          </div>
        )
      }
      onError={(error, info) => {
        // Fire-and-forget — don't block the UI on the log.
        try {
          void fetch("/api/audit-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "RENDER_ERROR",
              targetType: "Component",
              details: JSON.stringify({
                section: name,
                error: error.message,
                stack: info.componentStack?.slice(0, 500),
                url: typeof window !== "undefined" ? window.location.pathname : "unknown",
                timestamp: new Date().toISOString(),
              }),
            }),
          }).catch(() => {});
        } catch {
          /* swallow — logging is best-effort */
        }
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

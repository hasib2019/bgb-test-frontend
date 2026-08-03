'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * REQUIREMENT 6 — the containment layer.
 *
 * The API's dataQuality report handles corruption we anticipated. This handles
 * the corruption we did not: any render-time throw is caught here and confined
 * to a single card, so one malformed lot cannot blank the dashboard.
 *
 * It reports the failure rather than hiding it — a swallowed exception that
 * renders nothing would technically "not crash", but it would also make a
 * broken lot invisible, which is the outcome the requirement forbids.
 */
interface Props {
  children: ReactNode;
  itemId: string;
  itemLabel: string;
}

interface State {
  error: Error | null;
}

export class ItemErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ItemErrorBoundary] lot ${this.props.itemId} failed to render:`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <article
        role="alert"
        data-testid={`item-crashed-${this.props.itemId}`}
        className="flex flex-col rounded-xl border-2 border-dashed border-red-800 bg-red-950/25 p-5"
      >
        <span className="w-fit rounded bg-red-900/70 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-red-300">
          Render failure
        </span>

        <h3 className="mt-3 text-base font-semibold text-red-200">
          This lot could not be displayed
        </h3>

        <p className="mt-1.5 text-sm text-red-300/80">
          The remaining lots on this page are unaffected and remain safe to bid on.
        </p>

        <dl className="mt-3 space-y-1 border-t border-red-900/60 pt-3 text-xs">
          <div className="flex gap-2">
            <dt className="text-red-400/70">Lot</dt>
            <dd className="font-mono text-red-300/90">{this.props.itemLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-red-400/70">ID</dt>
            <dd className="font-mono text-red-300/90">{this.props.itemId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-red-400/70">Error</dt>
            <dd className="font-mono break-all text-red-300/90">{this.state.error.message}</dd>
          </div>
        </dl>
      </article>
    );
  }
}

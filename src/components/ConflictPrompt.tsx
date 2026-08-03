'use client';

import { formatMoney } from '@/lib/format';
import type { ConflictDetails } from '@/lib/types';

/**
 * REQUIREMENT 2 — the "do not silently swallow the 409" surface.
 *
 * Deliberately loud: it names the person who outbid the user, states the new
 * price and the new minimum, and offers a single click to re-bid at that
 * minimum. It does not auto-retry — the user re-commits their money knowingly.
 */
interface ConflictPromptProps {
  details: ConflictDetails;
  attemptedAmount: number;
  onRetry: (suggestedAmount: number) => void;
  onDismiss: () => void;
}

export function ConflictPrompt({
  details, attemptedAmount, onRetry, onDismiss,
}: ConflictPromptProps) {
  const { currentPrice, minimumAcceptableBid, highestBidderName } = details;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-labelledby="conflict-title"
      className="animate-pulse-ring rounded-lg border border-red-800 bg-red-950/60 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 id="conflict-title" className="text-sm font-semibold text-red-200">
          Someone just outbid you
        </h4>
        <span className="shrink-0 rounded bg-red-900/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-red-300">
          409 Conflict
        </span>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-red-200/90">
        Your bid of{' '}
        <span className="font-semibold text-red-100">{formatMoney(attemptedAmount)}</span>{' '}
        was rejected — the price moved while you were typing.
        {highestBidderName && (
          <>
            {' '}
            <span className="font-semibold text-red-100">{highestBidderName}</span> is now the
            highest bidder at{' '}
          </>
        )}
        {!highestBidderName && ' The lot now stands at '}
        <span className="font-semibold text-red-100">{formatMoney(currentPrice)}</span>.
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onRetry(minimumAcceptableBid)}
          className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400"
        >
          Try again at {formatMoney(minimumAcceptableBid)}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-red-800/80 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-950"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

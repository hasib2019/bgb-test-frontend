'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { AuctionItem, ConflictDetails } from '@/lib/types';
import { ConflictPrompt } from './ConflictPrompt';

/**
 * REQUIREMENT 2 (frontend half) + REQUIREMENT 4 (client-side validation).
 *
 * Two rules govern this component:
 *
 *  1. Client-side validation is a COURTESY, never a gate. It warns the user
 *     before they spend a round-trip, but every rule it checks is re-checked by
 *     the server, and a server rejection always wins.
 *
 *  2. A 409 is never swallowed. It renders a blocking, explicit prompt naming
 *     who outbid the user and at what price, with a one-click path to re-bid at
 *     the new minimum. The form does not silently retry — a bid is money, and
 *     resubmitting it without consent would be committing the user to a price
 *     they never agreed to.
 */
interface BidFormProps {
  item: AuctionItem;
  token: string;
  onSuccess: (result: { currentPrice: number; version: number }) => void;
  onRefreshNeeded: () => void;
}

type Submission =
  | { state: 'idle' }
  | { state: 'submitting' }
  | { state: 'accepted'; amount: number }
  | { state: 'conflict'; details: ConflictDetails; attemptedAmount: number }
  | { state: 'rejected'; code: string; message: string };

export function BidForm({ item, token, onSuccess, onRefreshNeeded }: BidFormProps) {
  const [amount, setAmount] = useState('');
  const [submission, setSubmission] = useState<Submission>({ state: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  const minimum = item.minimumAcceptableBid;
  // Server-computed: covers admin closure AND the scheduled end time passing.
  const isClosed = item.isClosed ?? item.status === 'ENDED';
  const isExpired = item.isExpired ?? false;
  const isBiddable = (item.isBiddable ?? item.dataQuality.biddable) && !isClosed;

  // ---- Client-side validation (Requirement 4) -------------------------------
  const parsed = amount.trim() === '' ? null : Number(amount);
  const clientWarning = (() => {
    if (parsed === null) return null;
    if (!Number.isFinite(parsed)) return 'Enter a valid number.';
    if (parsed <= 0) return 'A bid must be greater than zero.';
    if (Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-9) {
      return 'Bids cannot be more precise than one cent.';
    }
    if (minimum !== null && parsed < minimum) {
      return `Too low. The minimum acceptable bid is ${formatMoney(minimum)} — that is ${formatMoney(item.minIncrement)} above the current price.`;
    }
    return null;
  })();

  const canSubmit =
    isBiddable &&
    parsed !== null &&
    clientWarning === null &&
    submission.state !== 'submitting';

  // Clear the transient "accepted" banner after a moment.
  useEffect(() => {
    if (submission.state !== 'accepted') return;
    const id = setTimeout(() => setSubmission({ state: 'idle' }), 4000);
    return () => clearTimeout(id);
  }, [submission]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || parsed === null) return;

    setSubmission({ state: 'submitting' });

    try {
      // `item.version` is the optimistic-concurrency token. If the dashboard's
      // poll has not caught up with reality, this is exactly the value that
      // earns us a 409 instead of a lost update.
      const result = await api.placeBid(item.id, parsed, item.version, token);

      setAmount('');
      setSubmission({ state: 'accepted', amount: result.bid.amount });
      onSuccess({ currentPrice: result.item.currentPrice, version: result.item.version });
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setSubmission({ state: 'rejected', code: 'UNKNOWN', message: 'Something went wrong.' });
        return;
      }

      // ---- The conflict path ------------------------------------------------
      const details = err.conflictDetails;
      if (details) {
        setSubmission({ state: 'conflict', details, attemptedAmount: parsed });
        onRefreshNeeded();
        return;
      }

      setSubmission({ state: 'rejected', code: err.code, message: err.message });
      // A closed auction or corrupt lot means our view of the world is wrong.
      if (err.code === 'AUCTION_ENDED' || err.code === 'ITEM_DATA_CORRUPT') onRefreshNeeded();
    }
  }

  /** "Try again" from the conflict prompt: pre-fill, focus, but do NOT auto-submit. */
  function acceptConflictSuggestion(suggested: number) {
    setAmount(String(suggested));
    setSubmission({ state: 'idle' });
    onRefreshNeeded();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (isClosed) {
    return (
      <div className="rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3 text-center">
        <p className="text-sm font-medium text-ink-300">Bidding is closed for this lot.</p>
        <p className="mt-0.5 text-[11px] text-ink-500">
          {isExpired && item.status !== 'ENDED'
            ? 'The scheduled end time has passed.'
            : 'An administrator closed this auction.'}
        </p>
      </div>
    );
  }

  if (!item.dataQuality.biddable) {
    return (
      <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-center">
        <p className="text-sm font-medium text-red-300">
          Bidding disabled — this lot&apos;s pricing data is corrupt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {submission.state === 'conflict' && (
        <ConflictPrompt
          details={submission.details}
          attemptedAmount={submission.attemptedAmount}
          onRetry={acceptConflictSuggestion}
          onDismiss={() => setSubmission({ state: 'idle' })}
        />
      )}

      {submission.state === 'accepted' && (
        <div
          role="status"
          className="rounded-lg border border-emerald-800/70 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300"
        >
          Bid accepted at {formatMoney(submission.amount)} — you are the highest bidder.
        </div>
      )}

      {submission.state === 'rejected' && (
        <div
          role="alert"
          className="rounded-lg border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-300"
        >
          <span className="font-mono text-[11px] uppercase tracking-wide text-red-400/80">
            {submission.code}
          </span>
          <p className="mt-0.5">{submission.message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor={`bid-${item.id}`} className="block text-xs font-medium text-ink-400">
          Your bid
          {minimum !== null && (
            <span className="ml-1 text-ink-300">· minimum {formatMoney(minimum)}</span>
          )}
        </label>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">
              $
            </span>
            <input
              ref={inputRef}
              id={`bid-${item.id}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min={minimum ?? 0}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (submission.state === 'rejected') setSubmission({ state: 'idle' });
              }}
              placeholder={minimum !== null ? String(minimum) : ''}
              aria-invalid={clientWarning !== null}
              aria-describedby={clientWarning ? `bid-warning-${item.id}` : undefined}
              disabled={submission.state === 'submitting'}
              className={`w-full rounded-lg border bg-ink-950/80 py-2 pl-7 pr-3 text-sm text-ink-200
                placeholder:text-ink-600 focus:outline-none focus:ring-2 disabled:opacity-50
                ${clientWarning
                  ? 'border-amber-700/70 focus:ring-amber-600/40'
                  : 'border-ink-700 focus:border-brass-500/60 focus:ring-brass-500/30'}`}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="shrink-0 rounded-lg bg-brass-500 px-4 py-2 text-sm font-semibold text-ink-950
              transition hover:bg-brass-400 disabled:cursor-not-allowed disabled:bg-ink-700
              disabled:text-ink-400"
          >
            {submission.state === 'submitting' ? 'Placing…' : 'Place bid'}
          </button>
        </div>

        {/* Client-side warning — advisory, shown before the round trip. */}
        {clientWarning && (
          <p
            id={`bid-warning-${item.id}`}
            role="alert"
            className="flex items-start gap-1.5 text-xs text-amber-400"
          >
            <span aria-hidden="true">⚠</span>
            <span>{clientWarning}</span>
          </p>
        )}

        <p className="text-[11px] text-ink-600">
          Submitting against version {item.version} · the server re-validates every rule
        </p>
      </form>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { AuctionItem } from '@/lib/types';

/**
 * REQUIREMENT 8 — single-level retraction, with a live countdown.
 *
 * The window is displayed rather than merely enforced, so the user can see the
 * option expiring. The countdown is advisory: the authoritative check is the
 * server's, which compares against `bids.created_at` — a user with a skewed
 * clock or a paused tab cannot extend their own window.
 */
interface RetractButtonProps {
  item: AuctionItem;
  token: string;
  windowSeconds: number;
  /** Timestamp of this user's most recent bid on this lot, if any. */
  myBidPlacedAt: number | null;
  onRetracted: (result: { currentPrice: number; version: number }) => void;
}

export function RetractButton({
  item, token, windowSeconds, myBidPlacedAt, onRetracted,
}: RetractButtonProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    myBidPlacedAt === null
      ? 0
      : Math.max(0, windowSeconds - Math.floor((Date.now() - myBidPlacedAt) / 1000))
  );
  const [isRetracting, setIsRetracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (myBidPlacedAt === null) return;

    const tick = () => {
      const elapsed = Math.floor((Date.now() - myBidPlacedAt) / 1000);
      setSecondsLeft(Math.max(0, windowSeconds - elapsed));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [myBidPlacedAt, windowSeconds]);

  if (myBidPlacedAt === null || item.status === 'ENDED') return null;

  const expired = secondsLeft <= 0;

  async function handleRetract() {
    setIsRetracting(true);
    setError(null);
    try {
      const result = await api.retractBid(item.id, token);
      onRetracted({ currentPrice: result.item.currentPrice, version: result.item.version });
    } catch (err) {
      // Never silent: the server may refuse because the window closed, because
      // the user was outbid mid-click, or because their one retraction is spent.
      setError(err instanceof ApiError ? err.message : 'Retraction failed.');
    } finally {
      setIsRetracting(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleRetract}
        disabled={expired || isRetracting}
        title={
          expired
            ? 'The retraction window for your bid has closed.'
            : `Undo your ${formatMoney(item.currentPrice)} bid`
        }
        className="w-full rounded-lg border border-ink-600 bg-ink-800/70 px-3 py-1.5 text-xs
          font-medium text-ink-200 transition hover:border-ink-400 hover:bg-ink-700
          disabled:cursor-not-allowed disabled:border-ink-800 disabled:bg-ink-900/50
          disabled:text-ink-600"
      >
        {isRetracting
          ? 'Retracting…'
          : expired
            ? 'Retraction window closed'
            : `Retract my bid · ${secondsLeft}s left`}
      </button>

      {!expired && (
        <div
          className="h-0.5 w-full overflow-hidden rounded-full bg-ink-800"
          role="progressbar"
          aria-label="Time remaining to retract"
          aria-valuenow={secondsLeft}
          aria-valuemin={0}
          aria-valuemax={windowSeconds}
        >
          <div
            className="h-full bg-brass-500 transition-[width] duration-1000 ease-linear"
            style={{ width: `${(secondsLeft / windowSeconds) * 100}%` }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

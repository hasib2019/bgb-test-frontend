'use client';

import { useEffect, useState } from 'react';

/**
 * Live countdown to a lot's scheduled close.
 *
 * Anchored to the SERVER clock, not the browser's. The API sends `serverTime`
 * alongside `endsAt`; the offset between that and the local clock is measured
 * once and applied to every tick. A user whose machine is ten minutes fast
 * would otherwise watch a lot appear to close early — and, worse, disagree with
 * every other bidder about when the final seconds are.
 *
 * This is display only. The server rejects late bids regardless of what any
 * clock here says (`ends_at > now()` inside the bid write).
 */
interface AuctionCountdownProps {
  endsAt: string | null;
  serverTime: string;
  isClosed: boolean;
}

function format(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export function AuctionCountdown({ endsAt, serverTime, isClosed }: AuctionCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAt || isClosed) {
      setRemaining(null);
      return;
    }

    const end = Date.parse(endsAt);
    const server = Date.parse(serverTime);
    if (Number.isNaN(end) || Number.isNaN(server)) {
      setRemaining(null);
      return;
    }

    // Positive when the browser clock runs ahead of the server.
    const skew = Date.now() - server;

    const tick = () => setRemaining(end - (Date.now() - skew));
    tick();

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, serverTime, isClosed]);

  if (isClosed || remaining === null) return null;

  const isFinalMinute = remaining <= 60_000;
  const isUrgent = remaining <= 5 * 60_000;

  return (
    <span
      // aria-live only in the final minute — announcing every second for a lot
      // that closes in three days would make the page unusable with a screen reader.
      aria-live={isFinalMinute ? 'polite' : 'off'}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
        isFinalMinute
          ? 'bg-red-950/70 text-red-300 ring-1 ring-red-800'
          : isUrgent
            ? 'bg-amber-950/60 text-amber-300'
            : 'text-ink-500'
      }`}
      title={`Closes ${new Date(endsAt as string).toLocaleString()}`}
    >
      <span aria-hidden="true">{isFinalMinute ? '🔴' : '⏱'}</span>
      {remaining <= 0 ? 'closing…' : format(remaining)}
    </span>
  );
}

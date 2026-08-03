'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatRelativeTime, isRenderableMoney, UNRENDERABLE } from '@/lib/format';
import type { AuctionItem, User } from '@/lib/types';
import { AuctionCountdown } from './AuctionCountdown';
import { BidForm } from './BidForm';
import { DataQualityPanel } from './DataQualityPanel';
import { RetractButton } from './RetractButton';

interface ItemCardProps {
  item: AuctionItem;
  user: User | null;
  token: string | null;
  retractionWindowSeconds: number;
  myLastBidAt: number | null;
  onLocalUpdate: (itemId: string, patch: Partial<AuctionItem>) => void;
  onRefresh: () => void;
  onBidPlaced: (itemId: string) => void;
}

export function ItemCard({
  item, user, token, retractionWindowSeconds, myLastBidAt,
  onLocalUpdate, onRefresh, onBidPlaced,
}: ItemCardProps) {
  const [isEnding, setIsEnding] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const previousPrice = useRef(item.currentPrice);

  // Closed covers BOTH ways an auction ends: an admin closing it early, and the
  // scheduled end time passing. The server computes this — deriving it here
  // from `endsAt` against the browser clock would let a skewed machine show a
  // bid form for a lot that is already over.
  const isClosed = item.isClosed ?? item.status === 'ENDED';
  const isExpired = item.isExpired ?? false;
  const isDegraded = !item.dataQuality.ok;
  const iAmHighest = user !== null && item.highestBid?.bidderId === user.id;

  // Requirement 2: a price that moves under the user must be *noticed*.
  useEffect(() => {
    if (previousPrice.current !== item.currentPrice) {
      previousPrice.current = item.currentPrice;
      setPriceChanged(true);
      const id = setTimeout(() => setPriceChanged(false), 800);
      return () => clearTimeout(id);
    }
  }, [item.currentPrice]);

  async function handleEndAuction() {
    if (!token) return;
    setIsEnding(true);
    setAdminError(null);
    try {
      await api.endAuction(item.id, token);
      onRefresh();
    } catch (err) {
      setAdminError(err instanceof ApiError ? err.message : 'Could not end the auction.');
    } finally {
      setIsEnding(false);
    }
  }

  // Title is nullable by design (Requirement 6) — render the fault, not a guess.
  const titleNode =
    item.title && item.title.trim() !== '' ? (
      <span>{item.title}</span>
    ) : (
      <span className="italic text-amber-400/90">Untitled lot — catalogue entry missing</span>
    );

  return (
    <article
      data-testid={`item-${item.id}`}
      className={`flex flex-col rounded-xl border p-5 transition ${
        isClosed
          ? 'border-ink-800 bg-ink-900/40 opacity-75'
          : isDegraded
            ? 'border-amber-900/60 bg-ink-900/70'
            : 'border-ink-700 bg-ink-900/70 hover:border-ink-600'
      }`}
    >
      {/* ---- Header ---------------------------------------------------- */}
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-ink-200">{titleNode}</h3>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isClosed
                ? 'bg-ink-700 text-ink-300'
                : 'bg-emerald-950 text-emerald-400 ring-1 ring-emerald-900'
            }`}
          >
            {isClosed ? 'Closed' : 'Live'}
          </span>

          <AuctionCountdown
            endsAt={item.endsAt}
            serverTime={item.serverTime}
            isClosed={isClosed}
          />
        </div>
      </header>

      {item.description && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-400">
          {item.description}
        </p>
      )}

      {/* ---- Requirement 6 fallback ------------------------------------- */}
      {isDegraded && (
        <div className="mt-3">
          <DataQualityPanel quality={item.dataQuality} itemId={item.id} />
        </div>
      )}

      {/* ---- Price ------------------------------------------------------ */}
      <div className="mt-4 border-t border-ink-800 pt-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-ink-500">
              {isClosed ? 'Final price' : 'Current highest bid'}
            </p>

            {/* A negative or non-numeric price is shown as a fault, never coerced. */}
            {isRenderableMoney(item.currentPrice) ? (
              <p
                className={`text-2xl font-semibold tabular-nums text-brass-300 ${
                  priceChanged ? 'animate-price-bump' : ''
                }`}
              >
                {formatMoney(item.currentPrice)}
              </p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums text-red-400">
                {UNRENDERABLE}
                <span className="ml-2 align-middle font-mono text-[11px] font-normal text-red-400/80">
                  invalid ({String(item.currentPrice)})
                </span>
              </p>
            )}
          </div>

          <div className="text-right text-[11px] text-ink-500">
            <p>
              {item.bidCount} {item.bidCount === 1 ? 'bid' : 'bids'}
            </p>
            <p className="font-mono">v{item.version}</p>
          </div>
        </div>

        {item.highestBid && (
          <p className="mt-1 text-xs text-ink-400">
            held by{' '}
            <span className={iAmHighest ? 'font-semibold text-brass-400' : 'text-ink-300'}>
              {iAmHighest ? 'you' : item.highestBid.bidderName}
            </span>
          </p>
        )}

        {!isClosed && item.minimumAcceptableBid !== null && (
          <p className="mt-0.5 text-[11px] text-ink-500">
            next minimum {formatMoney(item.minimumAcceptableBid)} · increment{' '}
            {formatMoney(item.minIncrement)}
          </p>
        )}
      </div>

      {/* ---- Legacy import, shown but never trusted as numbers ---------- */}
      {Array.isArray(item.legacyBidHistory) && item.legacyBidHistory.length > 0 && (
        <details className="mt-3 rounded-lg border border-ink-800 bg-ink-950/50 px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-medium text-ink-400">
            Imported legacy history ({item.legacyBidHistory.length} records)
          </summary>
          <ul className="mt-2 space-y-1">
            {(item.legacyBidHistory as Array<Record<string, unknown>>).map((entry, i) => {
              const amount = entry?.amount;
              const usable = typeof amount === 'number' && Number.isFinite(amount);
              return (
                <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-ink-500">{String(entry?.bidder ?? 'unknown')}</span>
                  {usable ? (
                    <span className="tabular-nums text-ink-300">{formatMoney(amount)}</span>
                  ) : (
                    <span className="rounded bg-amber-950/60 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">
                      unreadable: {JSON.stringify(amount)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* ---- Actions ---------------------------------------------------- */}
      <div className="mt-4 space-y-2.5">
        {!user && !isClosed && (
          <p className="rounded-lg border border-ink-800 bg-ink-950/50 px-3 py-2 text-center text-xs text-ink-400">
            Sign in to place a bid.
          </p>
        )}

        {user && token && (
          <>
            <BidForm
              item={item}
              token={token}
              onSuccess={(result) => {
                onLocalUpdate(item.id, {
                  currentPrice: result.currentPrice,
                  version: result.version,
                  minimumAcceptableBid: result.currentPrice + item.minIncrement,
                });
                onBidPlaced(item.id);
                onRefresh();
              }}
              onRefreshNeeded={onRefresh}
            />

            {iAmHighest && (
              <RetractButton
                item={item}
                token={token}
                windowSeconds={retractionWindowSeconds}
                myBidPlacedAt={myLastBidAt}
                onRetracted={(result) => {
                  onLocalUpdate(item.id, {
                    currentPrice: result.currentPrice,
                    version: result.version,
                  });
                  onRefresh();
                }}
              />
            )}
          </>
        )}

        {/* ---- Requirement 5: admin-only control ------------------------ */}
        {user?.role === 'ADMIN' && !isClosed && (
          <div className="space-y-1.5 border-t border-ink-800 pt-2.5">
            <button
              type="button"
              onClick={handleEndAuction}
              disabled={isEnding}
              className="w-full rounded-lg border border-red-900 bg-red-950/50 px-3 py-1.5
                text-xs font-semibold text-red-300 transition hover:bg-red-900/50
                disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEnding ? 'Closing…' : 'End auction early (admin)'}
            </button>
            {adminError && (
              <p role="alert" className="text-[11px] text-red-400">
                {adminError}
              </p>
            )}
          </div>
        )}

        {isClosed && (
          <p className="text-center text-[11px] text-ink-500">
            {isExpired && item.status !== 'ENDED'
              ? `Bidding closed ${formatRelativeTime(item.endsAt)} at the scheduled end time`
              : `Closed ${formatRelativeTime(item.endedAt)} by an administrator`}
            {item.highestBid && ` · won by ${item.highestBid.bidderName}`}
          </p>
        )}
      </div>
    </article>
  );
}

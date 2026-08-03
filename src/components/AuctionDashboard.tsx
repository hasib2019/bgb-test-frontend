'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAuctionItems } from '@/hooks/useAuctionItems';
import { formatRelativeTime } from '@/lib/format';
import { ItemCard } from './ItemCard';
import { ItemErrorBoundary } from './ItemErrorBoundary';
import { SignInPanel } from './SignInPanel';

const RETRACTION_WINDOW_SECONDS = 60;

export function AuctionDashboard() {
  const { user, token, logout, isLoading: authLoading } = useAuth();
  const { items, meta, isLoading, error, lastUpdated, refresh, patchItem } = useAuctionItems();

  // When this user last bid on each lot — drives the retraction countdown.
  // Local to the session by design: the server remains the authority on whether
  // the 60-second window is actually still open.
  const [myBidTimes, setMyBidTimes] = useState<Record<string, number>>({});

  const recordBid = useCallback((itemId: string) => {
    setMyBidTimes((prev) => ({ ...prev, [itemId]: Date.now() }));
  }, []);

  const activeItems = items.filter((i) => i.status === 'ACTIVE');
  const closedItems = items.filter((i) => i.status === 'ENDED');

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ---- Masthead ---------------------------------------------------- */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-800 pb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brass-500">
            Hallam &amp; Vane
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-200">
            Silent Auction Engine
          </h1>
          <p className="mt-1 text-xs text-ink-500">
            Optimistic concurrency control · every bid is versioned and the database is the referee
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] text-ink-500">
              {lastUpdated ? `updated ${formatRelativeTime(lastUpdated.toISOString())}` : 'loading…'}
            </p>
            {meta && (
              <p className="text-[11px] text-ink-600">
                {meta.total} lots · {meta.healthy} healthy
                {meta.degraded > 0 && (
                  <span className="text-amber-500"> · {meta.degraded} degraded</span>
                )}
              </p>
            )}
          </div>

          {user && (
            <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-1.5">
              <div className="text-right">
                <p className="text-xs font-medium text-ink-200">{user.name}</p>
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    user.role === 'ADMIN' ? 'text-brass-400' : 'text-ink-500'
                  }`}
                >
                  {user.role}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-ink-700 px-2 py-1 text-[11px] text-ink-400
                  transition hover:border-ink-500 hover:text-ink-200"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ---- Auth -------------------------------------------------------- */}
      {!authLoading && !user && (
        <div className="mt-6">
          <SignInPanel />
        </div>
      )}

      {/* ---- Transport-level failure (distinct from data-level failure) --- */}
      {error && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-amber-800/70 bg-amber-950/30 px-4 py-3"
        >
          <p className="text-sm font-medium text-amber-300">
            Live updates interrupted — showing the last known prices.
          </p>
          <p className="mt-0.5 text-xs text-amber-400/80">{error}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-2 rounded-md border border-amber-700 px-2.5 py-1 text-xs font-medium
              text-amber-300 transition hover:bg-amber-900/40"
          >
            Retry now
          </button>
        </div>
      )}

      {/* ---- Lots -------------------------------------------------------- */}
      {isLoading && items.length === 0 ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl border border-ink-800 bg-ink-900/40" />
          ))}
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Live lots ({activeItems.length})
            </h2>

            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeItems.map((item) => (
                // Each card is independently isolated: a render failure in one
                // lot cannot take down the dashboard (Requirement 6).
                <ItemErrorBoundary
                  key={item.id}
                  itemId={item.id}
                  itemLabel={item.title ?? '(untitled)'}
                >
                  <ItemCard
                    item={item}
                    user={user}
                    token={token}
                    retractionWindowSeconds={RETRACTION_WINDOW_SECONDS}
                    myLastBidAt={myBidTimes[item.id] ?? null}
                    onLocalUpdate={patchItem}
                    onRefresh={() => void refresh()}
                    onBidPlaced={recordBid}
                  />
                </ItemErrorBoundary>
              ))}
            </div>
          </section>

          {closedItems.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Closed lots ({closedItems.length})
              </h2>

              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {closedItems.map((item) => (
                  <ItemErrorBoundary
                    key={item.id}
                    itemId={item.id}
                    itemLabel={item.title ?? '(untitled)'}
                  >
                    <ItemCard
                      item={item}
                      user={user}
                      token={token}
                      retractionWindowSeconds={RETRACTION_WINDOW_SECONDS}
                      myLastBidAt={myBidTimes[item.id] ?? null}
                      onLocalUpdate={patchItem}
                      onRefresh={() => void refresh()}
                      onBidPlaced={recordBid}
                    />
                  </ItemErrorBoundary>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer className="mt-12 border-t border-ink-800 pt-4 text-[11px] text-ink-600">
        Dashboard polls every 4s · bids carry the item version and are rejected with{' '}
        <span className="font-mono">409 Conflict</span> if the price moved first.
      </footer>
    </main>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { AuctionItem, ItemsResponse } from '@/lib/types';

/**
 * Server state for the dashboard.
 *
 * Deliberately NOT a global store. Auction data is server state, not client
 * state: it is owned by Postgres, it goes stale on its own, and it is
 * invalidated by other users' actions. Caching it in Redux would create a
 * second source of truth that can disagree with the database — precisely the
 * failure mode this whole project is built to avoid.
 *
 * Polling keeps `items[].version` fresh, which is what makes the optimistic
 * bid path succeed most of the time instead of conflicting constantly.
 */
interface UseAuctionItems {
  items: AuctionItem[];
  meta: ItemsResponse['meta'] | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  /** Applies a server-confirmed change immediately, without waiting for a poll. */
  patchItem: (itemId: string, patch: Partial<AuctionItem>) => void;
}

export function useAuctionItems(pollIntervalMs = 4000): UseAuctionItems {
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [meta, setMeta] = useState<ItemsResponse['meta'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await api.listItems(controller.signal);
      if (!mountedRef.current) return;
      setItems(data.items);
      setMeta(data.meta);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if ((err as Error).name === 'AbortError' || !mountedRef.current) return;
      // A failed poll must not blank the dashboard — keep showing the last
      // known good data with a staleness warning instead.
      setError(err instanceof ApiError ? err.message : 'Could not refresh auction data.');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const id = setInterval(() => { void refresh(); }, pollIntervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [refresh, pollIntervalMs]);

  const patchItem = useCallback((itemId: string, patch: Partial<AuctionItem>) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }, []);

  return { items, meta, isLoading, error, lastUpdated, refresh, patchItem };
}

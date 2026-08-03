import type {
  ApiErrorCode,
  ConflictDetails,
  ItemsResponse,
  PlaceBidSuccess,
  RetractSuccess,
  User,
  Bid,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * A typed API failure.
 *
 * Requirement 2 hinges on this class: a 409 must never be swallowed, so every
 * non-2xx response becomes a thrown ApiError carrying the machine-readable
 * `code` and the server's `details`. Callers branch on `code`, never on the
 * message text.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the server rejected the write because our state was stale. */
  get isConflict(): boolean {
    return this.status === 409 && this.code === 'VERSION_CONFLICT';
  }

  /** The authoritative state to re-bid against, when the server supplied it. */
  get conflictDetails(): ConflictDetails | null {
    if (!this.isConflict) return null;
    const d = this.details as Partial<ConflictDetails> | undefined;
    if (!d || typeof d.currentPrice !== 'number' || typeof d.version !== 'number') return null;
    return d as ConflictDetails;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the auction server. Check your connection.');
  }

  // 204 / empty body
  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(
      response.status,
      (error?.code as ApiErrorCode) ?? 'INTERNAL_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details
    );
  }

  return payload as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  register: (email: string, password: string, displayName: string) =>
    request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: { email, password, displayName },
    }),

  me: (token: string) => request<{ user: User }>('/api/auth/me', { token }),

  listItems: (signal?: AbortSignal) => request<ItemsResponse>('/api/items', { signal }),

  getItemBids: (itemId: string) =>
    request<{ bids: Bid[] }>(`/api/items/${itemId}/bids?limit=50`),

  /**
   * `expectedVersion` is mandatory: it is the optimistic-concurrency token the
   * server compares against. Omitting it would make a lost update possible.
   */
  placeBid: (itemId: string, amount: number, expectedVersion: number, token: string) =>
    request<PlaceBidSuccess>(`/api/items/${itemId}/bids`, {
      method: 'POST',
      body: { amount, expectedVersion },
      token,
    }),

  retractBid: (itemId: string, token: string) =>
    request<RetractSuccess>(`/api/items/${itemId}/retract`, { method: 'POST', token }),

  endAuction: (itemId: string, token: string) =>
    request<{ item: { id: string; status: string; version: number }; winner: unknown }>(
      `/api/items/${itemId}/end`,
      { method: 'POST', token }
    ),
};

export { API_URL };

/** Mirrors the API contract in backend/src/services/itemService.js */

export type Role = 'USER' | 'ADMIN';
export type ItemStatus = 'ACTIVE' | 'ENDED';
export type IssueSeverity = 'critical' | 'warning';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface DataQualityIssue {
  field: string;
  code:
    | 'MISSING_TITLE'
    | 'NEGATIVE_PRICE'
    | 'PRICE_NOT_NUMERIC'
    | 'INVALID_INCREMENT'
    | 'HISTORY_NOT_ARRAY'
    | 'HISTORY_AMOUNT_NOT_NUMERIC';
  severity: IssueSeverity;
  message: string;
  rawValue: unknown;
}

export interface DataQuality {
  ok: boolean;
  /** false when a critical issue makes the lot unsafe to transact against. */
  biddable: boolean;
  issues: DataQualityIssue[];
}

export interface HighestBid {
  id: string;
  amount: number;
  bidderId: string;
  bidderName: string;
}

export interface AuctionItem {
  id: string;
  /** Deliberately nullable — Requirement 6 seeds a lot with no title. */
  title: string | null;
  description: string | null;
  startingPrice: number;
  currentPrice: number;
  minIncrement: number;
  /** null when the lot is not safely biddable. */
  minimumAcceptableBid: number | null;
  status: ItemStatus;
  /** The optimistic-concurrency token echoed back when bidding. */
  version: number;
  endsAt: string | null;
  endedAt: string | null;
  createdAt: string;
  bidCount: number;
  highestBid: HighestBid | null;
  legacyBidHistory: unknown;
  dataQuality: DataQuality;
}

export interface ItemsResponse {
  items: AuctionItem[];
  meta: { total: number; healthy: number; degraded: number };
}

export interface Bid {
  id: string;
  amount: number;
  status: 'ACTIVE' | 'RETRACTED';
  createdAt: string;
  retractedAt: string | null;
  appliedToVersion: number;
  bidder: { id: string; name: string };
}

export interface PlaceBidSuccess {
  accepted: true;
  bid: { id: string; amount: number; createdAt: string; appliedToVersion: number };
  item: { id: string; currentPrice: number; version: number };
  strategy: string;
}

export interface RetractSuccess {
  retracted: true;
  retractedBid: { id: string; amount: number };
  item: {
    id: string;
    currentPrice: number;
    version: number;
    revertedTo: 'previous_bidder' | 'starting_price';
  };
  windowSeconds: number;
}

/** Details attached to a 409 VERSION_CONFLICT — everything needed to re-bid. */
export interface ConflictDetails {
  currentPrice: number;
  version: number;
  minIncrement: number;
  minimumAcceptableBid: number;
  highestBidderName: string | null;
}

export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'BID_TOO_LOW'
  | 'UNAUTHORIZED'
  | 'BAD_CREDENTIALS'
  | 'FORBIDDEN'
  | 'AUCTION_ENDED'
  | 'NOT_FOUND'
  | 'ITEM_DATA_CORRUPT'
  | 'VERSION_CONFLICT'
  | 'RETRACTION_WINDOW_EXPIRED'
  | 'RETRACTION_NOT_HIGHEST'
  | 'RETRACTION_ALREADY_USED'
  | 'NO_RETRACTABLE_BID'
  | 'CONSTRAINT_VIOLATION'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

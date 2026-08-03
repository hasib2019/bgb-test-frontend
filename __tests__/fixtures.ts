import type { AuctionItem, User } from '@/lib/types';

/** Mirrors the shape GET /api/items actually returns (verified against the API). */
export function healthyItem(overrides: Partial<AuctionItem> = {}): AuctionItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Apollo 11 Flown Lunar Surface Checklist Page',
    description: 'Flown to the lunar surface aboard Eagle.',
    startingPrice: 12000,
    currentPrice: 12000,
    minIncrement: 10,
    minimumAcceptableBid: 12010,
    status: 'ACTIVE',
    version: 3,
    endsAt: null,
    endedAt: null,
    createdAt: new Date().toISOString(),
    bidCount: 2,
    highestBid: {
      id: 'bid-1',
      amount: 12000,
      bidderId: 'user-bob',
      bidderName: 'Bob Okafor',
    },
    legacyBidHistory: null,
    dataQuality: { ok: true, biddable: true, issues: [] },
    ...overrides,
  };
}

export const negativePriceItem = (): AuctionItem =>
  healthyItem({
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Ming Dynasty Blue-and-White Vase (Yongle Period)',
    currentPrice: -4500,
    startingPrice: -4500,
    minimumAcceptableBid: null,
    highestBid: null,
    bidCount: 0,
    dataQuality: {
      ok: false,
      biddable: false,
      issues: [
        {
          field: 'currentPrice',
          code: 'NEGATIVE_PRICE',
          severity: 'critical',
          message:
            "The current price is negative (-4500). This lot's valuation was imported incorrectly.",
          rawValue: -4500,
        },
      ],
    },
  });

export const missingTitleItem = (): AuctionItem =>
  healthyItem({
    id: '33333333-3333-4333-8333-333333333333',
    title: null,
    currentPrice: 15000,
    minimumAcceptableBid: 15010,
    highestBid: null,
    bidCount: 0,
    dataQuality: {
      ok: false,
      biddable: true,
      issues: [
        {
          field: 'title',
          code: 'MISSING_TITLE',
          severity: 'warning',
          message: 'This lot has no title. Its catalogue entry was never linked.',
          rawValue: null,
        },
      ],
    },
  });

export const stringHistoryItem = (): AuctionItem =>
  healthyItem({
    id: '44444444-4444-4444-8444-444444444444',
    title: 'Fabergé Imperial Workmaster Cigarette Case, 1908',
    currentPrice: 9800,
    minimumAcceptableBid: 9810,
    highestBid: null,
    bidCount: 0,
    legacyBidHistory: [
      { bidder: 'legacy-import', amount: 'twelve thousand five hundred', at: '2024-11-02T10:14:00Z' },
      { bidder: 'legacy-import', amount: '9,800.00', at: '2024-11-02T09:51:00Z' },
      { bidder: 'legacy-import', amount: null, at: 'unknown' },
    ],
    dataQuality: {
      ok: false,
      biddable: true,
      issues: [
        {
          field: 'legacyBidHistory',
          code: 'HISTORY_AMOUNT_NOT_NUMERIC',
          severity: 'warning',
          message:
            '3 of 3 imported bid records store the amount as text instead of a number.',
          rawValue: [{ index: 0, amount: 'twelve thousand five hundred' }],
        },
      ],
    },
  });

export const standardUser: User = {
  id: 'user-alice',
  email: 'alice@auction.test',
  name: 'Alice Chen',
  role: 'USER',
};

export const adminUser: User = {
  id: 'user-amara',
  email: 'admin@auction.test',
  name: 'Amara',
  role: 'ADMIN',
};

export const noop = () => {};

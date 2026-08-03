/**
 * Frontend half of the scheduled-auction-end fix.
 *
 * The gap being closed: the UI derived "closed" from `status === 'ENDED'`, so a
 * lot whose end time had passed still rendered as Live with a working bid form.
 * Closure is now computed server-side and delivered as `isClosed`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ItemCard } from '@/components/ItemCard';
import { AuctionCountdown } from '@/components/AuctionCountdown';
import {
  healthyItem, expiredItem, adminClosedItem, closingSoonItem, standardUser, noop,
} from './fixtures';
import type { AuctionItem } from '@/lib/types';

function renderCard(item: AuctionItem, signedIn = true) {
  return render(
    <ItemCard
      item={item}
      user={signedIn ? standardUser : null}
      token={signedIn ? 'test-token' : null}
      retractionWindowSeconds={60}
      myLastBidAt={null}
      onLocalUpdate={noop}
      onRefresh={noop}
      onBidPlaced={noop}
    />
  );
}

describe('A lot past its end time renders as closed', () => {
  it('shows Closed even though status is still ACTIVE', () => {
    const item = expiredItem();
    expect(item.status).toBe('ACTIVE'); // the database row genuinely says this

    renderCard(item);
    const card = within(screen.getByTestId(`item-${item.id}`));

    expect(card.getByText('Closed')).toBeInTheDocument();
    expect(card.queryByText('Live')).not.toBeInTheDocument();
  });

  it('removes the bid form entirely', () => {
    renderCard(expiredItem());

    expect(screen.getByText(/Bidding is closed for this lot/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /place bid/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/your bid/i)).not.toBeInTheDocument();
  });

  it('explains that it closed on time, not by an administrator', () => {
    renderCard(expiredItem());

    expect(screen.getByText(/scheduled end time has passed/i)).toBeInTheDocument();
    expect(screen.queryByText(/administrator closed this auction/i)).not.toBeInTheDocument();
  });

  it('hides the countdown once closed', () => {
    renderCard(expiredItem());
    expect(screen.queryByText(/^\d+[dhms]/)).not.toBeInTheDocument();
  });
});

describe('A lot an admin closed reports a different reason', () => {
  it('attributes closure to an administrator', () => {
    renderCard(adminClosedItem());

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText(/administrator closed this auction/i)).toBeInTheDocument();
    expect(screen.queryByText(/scheduled end time has passed/i)).not.toBeInTheDocument();
  });
});

describe('An open lot is unaffected', () => {
  it('still renders Live with a working bid form', () => {
    const item = healthyItem();
    renderCard(item);
    const card = within(screen.getByTestId(`item-${item.id}`));

    expect(card.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /place bid/i })).toBeInTheDocument();
    expect(screen.queryByText(/Bidding is closed/i)).not.toBeInTheDocument();
  });
});

describe('Countdown', () => {
  it('renders remaining time for an open lot', () => {
    render(
      <AuctionCountdown
        endsAt={new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()}
        serverTime={new Date().toISOString()}
        isClosed={false}
      />
    );
    expect(screen.getByText(/^1h 59m$|^2h 0m$/)).toBeInTheDocument();
  });

  it('escalates visually inside the final minute', () => {
    render(
      <AuctionCountdown
        endsAt={new Date(Date.now() + 30 * 1000).toISOString()}
        serverTime={new Date().toISOString()}
        isClosed={false}
      />
    );

    const el = screen.getByText(/^\d{1,2}s$/);
    expect(el).toBeInTheDocument();
    // Announced to assistive tech only when it actually matters.
    expect(el).toHaveAttribute('aria-live', 'polite');
  });

  it('anchors to the SERVER clock, not the browser clock', () => {
    // Browser is one hour fast. Without skew correction the lot would appear
    // to have 1h less remaining — and in the final seconds, would look closed
    // while the server is still accepting bids.
    const serverNow = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() - 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString();

    render(<AuctionCountdown endsAt={endsAt} serverTime={serverNow} isClosed={false} />);

    // ~2h remaining per the server, despite the skewed local clock.
    expect(screen.getByText(/^1h 59m$|^2h 0m$/)).toBeInTheDocument();
  });

  it('renders nothing when the lot has no end time', () => {
    const { container } = render(
      <AuctionCountdown endsAt={null} serverTime={new Date().toISOString()} isClosed={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once the lot is closed', () => {
    const { container } = render(
      <AuctionCountdown
        endsAt={new Date(Date.now() + 60_000).toISOString()}
        serverTime={new Date().toISOString()}
        isClosed
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('A lot closing soon is still fully biddable', () => {
  it('shows the countdown and the bid form together', () => {
    const item = closingSoonItem();
    renderCard(item);

    expect(screen.getByRole('button', { name: /place bid/i })).toBeInTheDocument();
    expect(screen.getByText(/^\d{1,2}s$/)).toBeInTheDocument();
  });
});

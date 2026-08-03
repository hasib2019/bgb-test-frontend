/**
 * REQUIREMENT 6 — frontend half.
 *
 * Proves the dashboard renders a clearly visible fault state for exactly the
 * broken lots, does not crash, does not hide the problem, and leaves the
 * healthy lots beside them untouched.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ItemCard } from '@/components/ItemCard';
import { ItemErrorBoundary } from '@/components/ItemErrorBoundary';
import type { AuctionItem } from '@/lib/types';
import {
  healthyItem, negativePriceItem, missingTitleItem, stringHistoryItem, noop,
} from './fixtures';

function renderDashboard(items: AuctionItem[]) {
  return render(
    <div>
      {items.map((item) => (
        <ItemErrorBoundary key={item.id} itemId={item.id} itemLabel={item.title ?? '(untitled)'}>
          <ItemCard
            item={item}
            user={null}
            token={null}
            retractionWindowSeconds={60}
            myLastBidAt={null}
            onLocalUpdate={noop}
            onRefresh={noop}
            onBidPlaced={noop}
          />
        </ItemErrorBoundary>
      ))}
    </div>
  );
}

const ALL_ITEMS = () => [
  healthyItem(),
  negativePriceItem(),
  missingTitleItem(),
  stringHistoryItem(),
];

describe('The dashboard survives malformed lots', () => {
  it('renders every lot — broken ones included — without crashing', () => {
    const items = ALL_ITEMS();
    renderDashboard(items);

    for (const item of items) {
      expect(screen.getByTestId(`item-${item.id}`)).toBeInTheDocument();
    }
    // No card fell through to the error boundary.
    expect(screen.queryByText(/This lot could not be displayed/i)).not.toBeInTheDocument();
  });

  it('shows a fault panel for exactly the broken lots and none of the healthy ones', () => {
    const items = ALL_ITEMS();
    renderDashboard(items);

    expect(screen.queryByTestId(`data-quality-${items[0].id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`data-quality-${items[1].id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`data-quality-${items[2].id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`data-quality-${items[3].id}`)).toBeInTheDocument();
  });

  it('leaves the healthy lot fully intact alongside broken neighbours', () => {
    const items = ALL_ITEMS();
    renderDashboard(items);

    const healthy = within(screen.getByTestId(`item-${items[0].id}`));
    expect(healthy.getByText('Apollo 11 Flown Lunar Surface Checklist Page')).toBeInTheDocument();
    expect(healthy.getByText('$12,000.00')).toBeInTheDocument();
    expect(healthy.getByText(/next minimum \$12,010\.00/)).toBeInTheDocument();
    expect(healthy.getByText('Live')).toBeInTheDocument();
  });
});

describe('Negative price (critical)', () => {
  it('does not render the corrupt figure as if it were money', () => {
    const item = negativePriceItem();
    renderDashboard([item]);

    const card = within(screen.getByTestId(`item-${item.id}`));
    expect(card.queryByText('-$4,500.00')).not.toBeInTheDocument();
    expect(card.getByText(/invalid \(-4500\)/)).toBeInTheDocument();
  });

  it('names the specific fault instead of showing a generic error', () => {
    const item = negativePriceItem();
    renderDashboard([item]);

    const panel = within(screen.getByTestId(`data-quality-${item.id}`));
    expect(panel.getByText('NEGATIVE_PRICE')).toBeInTheDocument();
    expect(panel.getByText(/Corrupt data — bidding disabled/i)).toBeInTheDocument();
    expect(panel.getByText(/valuation was imported incorrectly/i)).toBeInTheDocument();
  });

  it('blocks bidding on the lot', () => {
    const item = negativePriceItem();
    render(
      <ItemCard
        item={item}
        user={{ id: 'user-alice', email: 'a@b.c', name: 'Alice', role: 'USER' }}
        token="fake-token"
        retractionWindowSeconds={60}
        myLastBidAt={null}
        onLocalUpdate={noop}
        onRefresh={noop}
        onBidPlaced={noop}
      />
    );

    // The fault is stated twice on purpose: once in the data-quality panel as a
    // diagnosis, once where the bid form would have been as a consequence.
    expect(screen.getByText(/Corrupt data — bidding disabled/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Bidding disabled — this lot's pricing data is corrupt\./i)
    ).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /place bid/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/your bid/i)).not.toBeInTheDocument();
  });
});

describe('Missing title (warning)', () => {
  it('marks the gap explicitly rather than inventing a placeholder', () => {
    const item = missingTitleItem();
    renderDashboard([item]);

    const card = within(screen.getByTestId(`item-${item.id}`));
    expect(card.getByText(/Untitled lot — catalogue entry missing/i)).toBeInTheDocument();
    expect(card.getByText('MISSING_TITLE')).toBeInTheDocument();
  });

  it('still shows its valid price — degradation is per-field, not per-card', () => {
    const item = missingTitleItem();
    renderDashboard([item]);

    const card = within(screen.getByTestId(`item-${item.id}`));
    expect(card.getByText('$15,000.00')).toBeInTheDocument();
    expect(card.queryByText(/Bidding disabled/i)).not.toBeInTheDocument();
  });
});

describe('String-typed bid history (warning)', () => {
  it('flags the unreadable amounts individually instead of dropping the list', () => {
    const item = stringHistoryItem();
    renderDashboard([item]);

    const card = within(screen.getByTestId(`item-${item.id}`));
    expect(card.getByText(/Imported legacy history \(3 records\)/)).toBeInTheDocument();

    const unreadable = card.getAllByText(/unreadable:/);
    expect(unreadable).toHaveLength(3);
    expect(card.getByText('HISTORY_AMOUNT_NOT_NUMERIC')).toBeInTheDocument();
  });

  it('does not coerce "9,800.00" into a number', () => {
    const item = stringHistoryItem();
    renderDashboard([item]);

    const details = within(screen.getByTestId(`item-${item.id}`));
    expect(details.getByText(/unreadable: "9,800\.00"/)).toBeInTheDocument();
  });
});

describe('Containment: an unexpected render throw', () => {
  it('is confined to its own card, leaving neighbours interactive', () => {
    // A shape no validator anticipated: dataQuality itself is missing.
    const sabotaged = { ...healthyItem(), id: 'sabotaged', dataQuality: undefined } as unknown as AuctionItem;
    const good = healthyItem();

    renderDashboard([sabotaged, good]);

    // The broken card degraded loudly…
    expect(screen.getByTestId('item-crashed-sabotaged')).toBeInTheDocument();
    expect(screen.getByText(/This lot could not be displayed/i)).toBeInTheDocument();

    // …and the healthy card beside it is entirely unaffected.
    const healthyCard = within(screen.getByTestId(`item-${good.id}`));
    expect(healthyCard.getByText('Apollo 11 Flown Lunar Surface Checklist Page')).toBeInTheDocument();
    expect(healthyCard.getByText('$12,000.00')).toBeInTheDocument();
  });
});

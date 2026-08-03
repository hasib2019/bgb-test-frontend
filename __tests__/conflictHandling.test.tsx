/**
 * REQUIREMENT 2 (frontend half) + REQUIREMENT 4 (client-side validation).
 *
 * Proves the UI does not silently swallow a 409: it surfaces who outbid the
 * user, at what price, and offers an explicit path to re-bid — without
 * auto-submitting money on the user's behalf.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidForm } from '@/components/BidForm';
import { ApiError, api } from '@/lib/api';
import { healthyItem, noop } from './fixtures';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { ...actual.api, placeBid: vi.fn() },
  };
});

const placeBid = vi.mocked(api.placeBid);

const conflictError = () =>
  new ApiError(409, 'VERSION_CONFLICT', 'Someone just outbid you — the price moved while you were bidding.', {
    currentPrice: 12500,
    version: 4,
    minIncrement: 10,
    minimumAcceptableBid: 12510,
    highestBidderName: 'Bob Okafor',
  });

function renderForm(overrides = {}) {
  const item = healthyItem();
  const onSuccess = vi.fn();
  const onRefreshNeeded = vi.fn();
  render(
    <BidForm
      item={item}
      token="test-token"
      onSuccess={onSuccess}
      onRefreshNeeded={onRefreshNeeded}
      {...overrides}
    />
  );
  return { item, onSuccess, onRefreshNeeded };
}

beforeEach(() => {
  placeBid.mockReset();
});

describe('Client-side validation (advisory, pre-flight)', () => {
  it('warns before submitting when the bid is below the minimum', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12005');

    expect(await screen.findByText(/Too low\. The minimum acceptable bid is \$12,010\.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /place bid/i })).toBeDisabled();
    // The warning is client-side only — no request was ever made.
    expect(placeBid).not.toHaveBeenCalled();
  });

  it('warns about sub-cent precision', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010.005');

    expect(await screen.findByText(/cannot be more precise than one cent/i)).toBeInTheDocument();
    expect(placeBid).not.toHaveBeenCalled();
  });

  it('enables submission once the bid clears the minimum', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /place bid/i })).toBeEnabled();
    });
  });
});

describe('A 409 is never swallowed', () => {
  it('surfaces the conflict with the new price and the outbidder’s name', async () => {
    const user = userEvent.setup();
    placeBid.mockRejectedValueOnce(conflictError());
    renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    const prompt = await screen.findByRole('alertdialog');
    expect(prompt).toHaveTextContent(/Someone just outbid you/i);
    expect(prompt).toHaveTextContent(/Bob Okafor/);
    expect(prompt).toHaveTextContent(/\$12,500\.00/);
    expect(prompt).toHaveTextContent(/409 Conflict/);
    // The user's own rejected amount is echoed back so they know what was lost.
    expect(prompt).toHaveTextContent(/\$12,010\.00/);
  });

  it('offers a one-click retry at the new minimum without auto-submitting', async () => {
    const user = userEvent.setup();
    placeBid.mockRejectedValueOnce(conflictError());
    renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    const retry = await screen.findByRole('button', { name: /try again at \$12,510\.00/i });
    await user.click(retry);

    // The input is pre-filled with the new minimum…
    await waitFor(() => {
      expect(screen.getByLabelText(/your bid/i)).toHaveValue(12510);
    });
    // …but nothing was resubmitted. A bid is money; the user re-commits.
    expect(placeBid).toHaveBeenCalledTimes(1);
  });

  it('triggers a refresh so the dashboard shows the true price', async () => {
    const user = userEvent.setup();
    placeBid.mockRejectedValueOnce(conflictError());
    const { onRefreshNeeded } = renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    await waitFor(() => expect(onRefreshNeeded).toHaveBeenCalled());
  });

  it('lets the user dismiss the prompt and keep bidding', async () => {
    const user = userEvent.setup();
    placeBid.mockRejectedValueOnce(conflictError());
    renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});

describe('Other server rejections are surfaced too', () => {
  it('shows the server’s BID_TOO_LOW verdict even if the client thought it was fine', async () => {
    const user = userEvent.setup();
    // The client believed 12010 was valid; the server is the source of truth.
    placeBid.mockRejectedValueOnce(
      new ApiError(400, 'BID_TOO_LOW', 'Bid must be at least 12510.', {
        minimumAcceptableBid: 12510,
      })
    );
    renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('BID_TOO_LOW');
    expect(alert).toHaveTextContent(/must be at least 12510/);
  });

  it('surfaces AUCTION_ENDED and asks the dashboard to resync', async () => {
    const user = userEvent.setup();
    placeBid.mockRejectedValueOnce(
      new ApiError(403, 'AUCTION_ENDED', 'This auction has been closed. No further bids are accepted.')
    );
    const { onRefreshNeeded } = renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    expect(await screen.findByText(/auction has been closed/i)).toBeInTheDocument();
    await waitFor(() => expect(onRefreshNeeded).toHaveBeenCalled());
  });

  it('reports a network failure instead of appearing to succeed', async () => {
    const user = userEvent.setup();
    placeBid.mockRejectedValueOnce(
      new ApiError(0, 'NETWORK_ERROR', 'Could not reach the auction server. Check your connection.')
    );
    renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    expect(await screen.findByText(/Could not reach the auction server/i)).toBeInTheDocument();
  });
});

describe('Successful bid', () => {
  it('confirms the accepted amount and reports the new version upward', async () => {
    const user = userEvent.setup();
    placeBid.mockResolvedValueOnce({
      accepted: true,
      bid: { id: 'bid-9', amount: 12010, createdAt: new Date().toISOString(), appliedToVersion: 3 },
      item: { id: healthyItem().id, currentPrice: 12010, version: 4 },
      strategy: 'optimistic',
    });
    const { onSuccess } = renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Bid accepted at \$12,010\.00/);
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith({ currentPrice: 12010, version: 4 })
    );
  });

  it('sends the item version as the concurrency token', async () => {
    const user = userEvent.setup();
    placeBid.mockResolvedValueOnce({
      accepted: true,
      bid: { id: 'bid-9', amount: 12010, createdAt: new Date().toISOString(), appliedToVersion: 3 },
      item: { id: healthyItem().id, currentPrice: 12010, version: 4 },
      strategy: 'optimistic',
    });
    const { item } = renderForm();

    await user.type(screen.getByLabelText(/your bid/i), '12010');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    await waitFor(() =>
      expect(placeBid).toHaveBeenCalledWith(item.id, 12010, item.version, 'test-token')
    );
  });
});

describe('Closed lots', () => {
  it('replaces the form entirely rather than disabling a still-visible button', () => {
    render(
      <BidForm
        item={healthyItem({ status: 'ENDED' })}
        token="test-token"
        onSuccess={noop}
        onRefreshNeeded={noop}
      />
    );

    expect(screen.getByText(/Bidding is closed for this lot/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /place bid/i })).not.toBeInTheDocument();
  });
});

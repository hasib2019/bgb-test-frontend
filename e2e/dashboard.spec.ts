import { test, expect, type Page } from '@playwright/test';

/**
 * REQUIREMENTS 1, 5 and 6, end to end.
 *
 * Malformed-data resilience in particular is worth proving in a real browser:
 * the component tests hand the card a hand-written fixture, whereas this loads
 * the genuinely corrupt rows out of PostgreSQL, through the API, into Chromium.
 */

const API = 'http://localhost:4000';

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
}

test.describe('Requirement 1 — the dashboard', () => {
  test('lists lots with their current highest bid and a bid form', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /silent auction engine/i })).toBeVisible();
    await expect(page.getByText(/live lots/i)).toBeVisible();

    // Seeded data: 5 healthy + 3 deliberately broken.
    const cards = page.locator('[data-testid^="item-"]');
    await expect(cards).toHaveCount(8);

    await expect(page.getByText('Current highest bid').first()).toBeVisible();

    // The bid form appears only once signed in.
    await expect(page.getByText(/sign in to place a bid/i).first()).toBeVisible();
    await signIn(page, 'alice@auction.test');
    await expect(page.getByRole('button', { name: /place bid/i }).first()).toBeVisible();
  });
});

test.describe('Requirement 6 — malformed data', () => {
  test('renders a fault state for exactly the broken lots, and the page survives', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    await page.goto('/');
    await expect(page.locator('[data-testid^="item-"]')).toHaveCount(8);

    const res = await page.request.get(`${API}/api/items`);
    const { items, meta } = await res.json();
    expect(meta.degraded).toBe(3);
    expect(meta.healthy).toBe(5);

    const broken = items.filter((i: any) => !i.dataQuality.ok);
    const healthy = items.filter((i: any) => i.dataQuality.ok);

    // Exactly the broken lots carry a fault panel…
    for (const item of broken) {
      await expect(page.getByTestId(`data-quality-${item.id}`)).toBeVisible();
    }
    // …and none of the healthy ones do.
    for (const item of healthy) {
      await expect(page.getByTestId(`data-quality-${item.id}`)).toHaveCount(0);
    }

    // Nothing crashed the page, and no card fell through to the error boundary.
    expect(pageErrors).toHaveLength(0);
    await expect(page.getByText(/this lot could not be displayed/i)).toHaveCount(0);
  });

  test('shows the negative price as a fault rather than as money, and blocks bidding', async ({ page }) => {
    await signIn(page, 'alice@auction.test');

    const res = await page.request.get(`${API}/api/items`);
    const { items } = await res.json();
    const negative = items.find((i: any) =>
      i.dataQuality.issues.some((x: any) => x.code === 'NEGATIVE_PRICE')
    );

    const card = page.getByTestId(`item-${negative.id}`);
    await expect(card.getByText('NEGATIVE_PRICE')).toBeVisible();
    await expect(card.getByText(/invalid \(-4500\)/)).toBeVisible();
    await expect(card.getByText('-$4,500.00')).toHaveCount(0);

    // Stated twice on purpose — once as a diagnosis in the fault panel, once as
    // a consequence where the bid form would have been. Assert both explicitly
    // rather than with a loose regex that matches either.
    await expect(card.getByRole('heading', { name: /corrupt data — bidding disabled/i })).toBeVisible();
    await expect(card.getByText(/bidding disabled — this lot's pricing data is corrupt/i)).toBeVisible();
    await expect(card.getByRole('button', { name: /place bid/i })).toHaveCount(0);
    await expect(card.getByLabel(/your bid/i)).toHaveCount(0);
  });

  test('marks the untitled lot without inventing a title, and still shows its valid price', async ({ page }) => {
    await page.goto('/');

    const res = await page.request.get(`${API}/api/items`);
    const { items } = await res.json();
    const untitled = items.find((i: any) => i.title === null);

    const card = page.getByTestId(`item-${untitled.id}`);
    await expect(card.getByText(/untitled lot — catalogue entry missing/i)).toBeVisible();
    await expect(card.getByText('MISSING_TITLE')).toBeVisible();
    // Degradation is per-field: its price is sound, so it renders normally.
    await expect(card.getByText('$15,000.00')).toBeVisible();
  });

  test('flags string-typed legacy amounts individually', async ({ page }) => {
    await page.goto('/');

    const res = await page.request.get(`${API}/api/items`);
    const { items } = await res.json();
    const legacy = items.find((i: any) =>
      i.dataQuality.issues.some((x: any) => x.code === 'HISTORY_AMOUNT_NOT_NUMERIC')
    );

    const card = page.getByTestId(`item-${legacy.id}`);
    await card.getByText(/imported legacy history/i).click(); // expand the <details>
    await expect(card.getByText(/unreadable:/).first()).toBeVisible();
    await expect(card.getByText(/unreadable: "9,800\.00"/)).toBeVisible();
  });
});

test.describe('Requirement 5 — role-based admin action', () => {
  test('a standard user never sees the End Auction control', async ({ page }) => {
    await signIn(page, 'alice@auction.test');
    await expect(page.getByRole('button', { name: /end auction early/i })).toHaveCount(0);
  });

  test('an admin sees it, and the UI closes the lot once used', async ({ page }) => {
    await signIn(page, 'admin@auction.test');

    const res = await page.request.get(`${API}/api/items`);
    const { items } = await res.json();
    // Close the most expensive healthy lot so the cheaper ones stay available
    // for the concurrency spec.
    const target = items
      .filter((i: any) => i.isBiddable && i.dataQuality.ok)
      .sort((a: any, b: any) => b.currentPrice - a.currentPrice)[0];

    const card = page.getByTestId(`item-${target.id}`);
    // `exact` pins this to the status badge; several other strings on a closed
    // card also contain the word "Closed".
    await expect(card.getByText('Live', { exact: true })).toBeVisible();

    await card.getByRole('button', { name: /end auction early/i }).click();

    // The dashboard polls, so the card visibly transitions to Closed.
    await expect(card.getByText('Closed', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/bidding is closed for this lot/i)).toBeVisible();
    await expect(card.getByText(/an administrator closed this auction/i)).toBeVisible();
    await expect(card.getByRole('button', { name: /place bid/i })).toHaveCount(0);
  });

  test('the API rejects a bid on the closed lot regardless of the UI', async ({ page }) => {
    const res = await page.request.get(`${API}/api/items?status=ENDED`);
    const { items } = await res.json();
    const closed = items.find((i: any) => i.status === 'ENDED');
    expect(closed, 'expected a lot closed by the previous test').toBeTruthy();

    const login = await page.request.post(`${API}/api/auth/login`, {
      data: { email: 'alice@auction.test', password: 'password123' },
    });
    const { token } = await login.json();

    const bid = await page.request.post(`${API}/api/items/${closed.id}/bids`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { amount: 9_999_999, expectedVersion: closed.version },
    });

    expect(bid.status()).toBe(403);
    const body = await bid.json();
    expect(body.error.code).toBe('AUCTION_ENDED');
    expect(body.error.details.reason).toBe('closed_by_admin');
  });
});

async function carlaToken(page: Page) {
  const res = await page.request.post(`${API}/api/auth/login`, {
    data: { email: 'carla@auction.test', password: 'password123' },
  });
  return (await res.json()).token;
}

test.describe('Requirement 8 — retraction', () => {
  test('offers a countdown-limited undo after bidding, and reverts the price', async ({ page }) => {
    await signIn(page, 'carla@auction.test');

    const res = await page.request.get(`${API}/api/items`);
    const { items } = await res.json();
    const lot = items
      .filter((i: any) => i.isBiddable && i.dataQuality.ok)
      .sort((a: any, b: any) => a.currentPrice - b.currentPrice)[0];

    const card = page.getByTestId(`item-${lot.id}`);
    const priceBefore = lot.currentPrice;

    await card.getByLabel(/your bid/i).fill(String(lot.minimumAcceptableBid));
    await card.getByRole('button', { name: /place bid/i }).click();
    await expect(card.getByRole('status')).toContainText(/bid accepted/i);

    // The retract button appears with a live countdown.
    const retract = card.getByRole('button', { name: /retract my bid/i });
    await expect(retract).toBeVisible();
    await expect(retract).toContainText(/\d+s left/);

    // Wait on the actual response, not on the button disappearing: the label
    // changes to "Retracting…" the instant it is clicked, so a locator keyed to
    // "Retract my bid" goes to zero *before* the request has even been sent.
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(`/api/items/${lot.id}/retract`) && r.request().method() === 'POST'
      ),
      retract.click(),
    ]);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.retracted).toBe(true);
    // Whether it reverts to a previous bidder or to the opening price depends
    // on whether earlier specs already bid on this lot, so assert the contract
    // rather than one branch of it. The price check below is the real assertion.
    expect(['previous_bidder', 'starting_price']).toContain(body.item.revertedTo);

    // The database reverted to the price this bid displaced…
    const after = await (await page.request.get(`${API}/api/items/${lot.id}`)).json();
    expect(after.item.currentPrice).toBe(priceBefore);

    // …and the card catches up on the next poll.
    await expect(
      card.getByText(priceBefore.toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
    ).toBeVisible({ timeout: 20_000 });

    // The retraction is spent — single-level undo.
    const second = await page.request.post(`${API}/api/items/${lot.id}/retract`, {
      headers: { Authorization: `Bearer ${await carlaToken(page)}` },
    });
    expect([404, 409]).toContain(second.status());
  });
});

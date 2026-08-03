import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * REQUIREMENT 2 + 3, end to end in a real browser.
 *
 * The component tests in `__tests__/conflictHandling.test.tsx` mock
 * `api.placeBid` and assert the UI reacts correctly to a 409. They cannot prove
 * a 409 is ever actually produced, travels over the wire, and reaches the user.
 * That is what these tests are for: real Chromium, real Next.js build, real
 * Express API, real PostgreSQL.
 */

const API = 'http://localhost:4000';

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // The masthead shows the signed-in user once the session is established.
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
}

/** The cheapest healthy, open lot — stable across runs because we reseed. */
async function pickBiddableLot(page: Page) {
  const res = await page.request.get(`${API}/api/items`);
  const { items } = await res.json();
  const lot = items
    .filter((i: any) => i.isBiddable && i.dataQuality.ok)
    .sort((a: any, b: any) => a.currentPrice - b.currentPrice)[0];
  expect(lot, 'expected at least one biddable lot in the seed').toBeTruthy();
  return lot;
}

function card(page: Page, itemId: string) {
  return page.getByTestId(`item-${itemId}`);
}

test.describe('A 409 conflict reaches the user', () => {
  let bobContext: BrowserContext;

  test.afterEach(async () => {
    await bobContext?.close();
  });

  test('shows "Someone just outbid you" with the real new price', async ({ page, browser }) => {
    const lot = await pickBiddableLot(page);

    await signIn(page, 'alice@auction.test');

    // Bob signs in on a second, fully independent browser context.
    bobContext = await browser.newContext();
    const bob = await bobContext.newPage();
    await signIn(bob, 'bob@auction.test');

    await expect(card(bob, lot.id)).toBeVisible();

    // Freeze Bob's view of the world by blocking his dashboard polling. Without
    // this the 4-second poll would refresh his `version` and he would simply
    // succeed — the test would then pass or fail on timing, which is not a
    // property worth asserting. Blocking the poll makes his state *reliably*
    // stale, which is exactly the condition the concurrency control exists for.
    await bob.route('**/api/items', (route) => route.abort());

    // Alice bids first and wins.
    const aliceInput = card(page, lot.id).getByLabel(/your bid/i);
    await aliceInput.fill(String(lot.minimumAcceptableBid));
    await card(page, lot.id).getByRole('button', { name: /place bid/i }).click();
    await expect(card(page, lot.id).getByRole('status')).toContainText(/bid accepted/i);

    // Bob now submits against the version he loaded before Alice's bid landed.
    const bobInput = card(bob, lot.id).getByLabel(/your bid/i);
    await bobInput.fill(String(lot.minimumAcceptableBid));
    await card(bob, lot.id).getByRole('button', { name: /place bid/i }).click();

    // The conflict is surfaced, not swallowed.
    const prompt = card(bob, lot.id).getByRole('alertdialog');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/someone just outbid you/i);
    await expect(prompt).toContainText('409 Conflict');
    await expect(prompt).toContainText('Alice Chen');

    // And it carries the genuinely current price from the database.
    const newPrice = lot.minimumAcceptableBid;
    const nextMinimum = newPrice + lot.minIncrement;
    await expect(prompt).toContainText(
      newPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    );
    await expect(
      prompt.getByRole('button', { name: new RegExp(`try again at`, 'i') })
    ).toBeVisible();

    // The retry button pre-fills the new minimum but does NOT auto-submit —
    // a bid is money, so the user re-commits deliberately.
    await prompt.getByRole('button', { name: /try again at/i }).click();
    await expect(bobInput).toHaveValue(String(nextMinimum));
    await expect(card(bob, lot.id).getByRole('alertdialog')).toBeHidden();
  });

  test('the database agrees with what the winner was told', async ({ page }) => {
    const lot = await pickBiddableLot(page);
    await signIn(page, 'alice@auction.test');

    await card(page, lot.id).getByLabel(/your bid/i).fill(String(lot.minimumAcceptableBid));
    await card(page, lot.id).getByRole('button', { name: /place bid/i }).click();
    await expect(card(page, lot.id).getByRole('status')).toContainText(/bid accepted/i);

    // Read the authoritative state back through the API.
    const res = await page.request.get(`${API}/api/items/${lot.id}`);
    const { item } = await res.json();

    expect(item.currentPrice).toBe(lot.minimumAcceptableBid);
    expect(item.version).toBe(lot.version + 1);
    expect(item.highestBid.bidderName).toBe('Alice Chen');
  });
});

test.describe('Client-side validation warns before the round trip', () => {
  test('blocks submission below the minimum without calling the API', async ({ page }) => {
    const lot = await pickBiddableLot(page);
    await signIn(page, 'alice@auction.test');

    let bidRequests = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/bids')) bidRequests += 1;
    });

    const lotCard = card(page, lot.id);
    await lotCard.getByLabel(/your bid/i).fill(String(lot.currentPrice + 1));

    await expect(lotCard.getByText(/too low/i)).toBeVisible();
    await expect(lotCard.getByRole('button', { name: /place bid/i })).toBeDisabled();
    expect(bidRequests).toBe(0);
  });

  test('but the server still has the final say', async ({ page }) => {
    // Bypasses the UI entirely: the API must reject a low bid even when no
    // client-side check ran.
    const lot = await pickBiddableLot(page);

    const login = await page.request.post(`${API}/api/auth/login`, {
      data: { email: 'alice@auction.test', password: 'password123' },
    });
    const { token } = await login.json();

    const res = await page.request.post(`${API}/api/items/${lot.id}/bids`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { amount: lot.currentPrice + 1, expectedVersion: lot.version },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('BID_TOO_LOW');
  });
});

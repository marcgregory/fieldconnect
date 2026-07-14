/**
 * ClockInOut Browser Smoke Test (Single Sequential Test)
 *
 * All scenarios run in one test to share the login session and avoid
 * rate-limiting issues. Each step captures a screenshot as evidence.
 *
 * Wait strategy: never use `networkidle` (Socket.IO WebSocket keeps the
 * network active forever). Use `domcontentloaded` and explicit UI state waits.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const TECH_EMAIL = 'rc-tech-1@fieldconnect.test';
const TECH_PASSWORD = 'rc-test-password';

const TIMER_SELECTOR = '[data-testid="timer-display"], .text-5xl.font-mono';

// ─── Helpers ───────────────────────────────────────────────────────────────────────

async function loginAsTech(page: Page) {
  await page.goto('/login');

  // Wait for hydration: button transitions from "Initializing..." to "Sign In"
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible({ timeout: 10_000 });

  // Fill credentials and submit
  await page.fill('input[type="email"]', TECH_EMAIL);
  await page.fill('input[type="password"]', TECH_PASSWORD);
  await page.click('button[type="submit"]');

  // Login page pushes to /dashboard → server redirects field_technician to /mobile
  await page.waitForURL(/\/mobile/, { timeout: 20_000 });
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText(/Welcome, RC Tech 1/i)).toBeVisible({ timeout: 10_000 });
}

async function enableGps(context: BrowserContext, lat = 37.7749, lng = -122.4194) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: lat, longitude: lng });
}

async function disableGps(context: BrowserContext) {
  await context.grantPermissions([]);
}

async function waitForClockInForm(page: Page) {
  await expect(page.getByText('Select a project to clock in')).toBeVisible({ timeout: 10_000 });
}

async function doClockIn(page: Page) {
  await page.click('role=radio[name="Select project Smith Residence"]');
  await page.click('button:has-text("Clock In")');
  await expect(page.locator(TIMER_SELECTOR).first()).toBeVisible({ timeout: 15_000 });
}

async function doClockOut(page: Page) {
  await page.click('button:has-text("Clock Out")');
  await expect(page.getByText('Confirm clock out?')).toBeVisible();
  await page.click('button:has-text("Confirm")');

  // Wait for the "Clocked Out" summary heading to appear
  await expect(page.locator('h3:has-text("Clocked Out")')).toBeVisible({ timeout: 20_000 });
  await page.click('button:has-text("Done")');
}

// ─── Tests ─────────────────────────────────────────────────────────────────────────

test.describe('ClockInOut Browser Smoke Test', () => {
  test('All ClockInOut browser behaviors', async ({ page, context }) => {
    console.log('\n=== Starting ClockInOut Browser Smoke Test ===\n');

    // ══════════════════════════════════════════════════════════════════
    // STEP 1: Login (GPS denied)
    // ══════════════════════════════════════════════════════════════════
    await disableGps(context);
    await loginAsTech(page);
    console.log('✅ Logged in as rc-tech-1');

    // ══════════════════════════════════════════════════════════════════
    // STEP 2: Clock In (GPS denied — best-effort)
    // ══════════════════════════════════════════════════════════════════
    await waitForClockInForm(page);
    await expect(page.getByRole('radio', { name: /Smith Residence/ })).toBeVisible();
    await doClockIn(page);

    const timerLocator = page.locator(TIMER_SELECTOR).first();
    const timerText = await timerLocator.textContent();
    expect(timerText).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    await expect(page.getByText('Clocked in at')).toBeVisible();
    await expect(page.getByText('Smith Residence').first()).toBeVisible();
    console.log(`  ✅ Clock-in success: ${timerText}`);
    await page.screenshot({ path: 'test-results/e2e/clockinout/01-clockin-gps-denied.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 3: Clock Out Cancel → still active
    // ══════════════════════════════════════════════════════════════════
    await page.click('button:has-text("Clock Out")');
    await expect(page.getByText('Confirm clock out?')).toBeVisible();
    await page.click('button:has-text("Cancel")');
    await expect(page.getByText('Clocked in at')).toBeVisible();
    console.log('  ✅ Cancel: entry still active');
    await page.screenshot({ path: 'test-results/e2e/clockinout/02-cancel-kept-active.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 4: Clock Out Confirm → closed + summary
    // ══════════════════════════════════════════════════════════════════
    await doClockOut(page);
    console.log('  ✅ Confirm: entry closed, summary shown');
    await page.screenshot({ path: 'test-results/e2e/clockinout/03-clockout-confirmed.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 5: Clock In with GPS → geofence + Maps link
    // ══════════════════════════════════════════════════════════════════
    await enableGps(context, 37.7749, -122.4194);
    await page.goto('/mobile');
    await page.waitForLoadState('domcontentloaded');

    await waitForClockInForm(page);
    await expect(page.getByRole('radio', { name: /Smith Residence/ })).toBeVisible({ timeout: 10_000 });
    await doClockIn(page);

    await expect(page.getByText('Inside Geofence')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/from customer site/)).toBeVisible();
    await expect(page.getByText('View clock-in location on Google Maps')).toBeVisible();
    console.log('  ✅ GPS: Inside Geofence, distance, Maps link');
    await page.screenshot({ path: 'test-results/e2e/clockinout/04-geofence-inside.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 6: Timer restoration after refresh
    // ══════════════════════════════════════════════════════════════════
    const timerBefore = await timerLocator.textContent();
    await page.waitForTimeout(2000);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(timerLocator).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Clocked in at')).toBeVisible();
    await expect(page.getByText('Smith Residence').first()).toBeVisible();
    const timerAfter = await timerLocator.textContent();
    console.log(`  ✅ Timer: before=${timerBefore}, after=${timerAfter}`);
    await page.screenshot({ path: 'test-results/e2e/clockinout/05-timer-after-refresh.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 7: No hydration errors on reload
    // ══════════════════════════════════════════════════════════════════
    const hydErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().toLowerCase().includes('hydrat')) hydErrors.push(msg.text());
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(timerLocator).toBeVisible({ timeout: 15_000 });

    console.log(`  ✅ Hydration errors: ${hydErrors.length === 0 ? 'none' : hydErrors}`);
    expect(hydErrors).toEqual([]);
    await page.screenshot({ path: 'test-results/e2e/clockinout/06-no-hydration-errors.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 8: Clean up — clock out
    // ══════════════════════════════════════════════════════════════════
    await doClockOut(page);
    console.log('  ✅ Cleaned up');
    await page.screenshot({ path: 'test-results/e2e/clockinout/07-cleaned-up.png' });

    console.log('\n✅ ALL BROWSER SMOKE TESTS PASSED');
  });
});

/**
 * ClockInOut Browser Smoke Test (Single Sequential Test)
 *
 * All scenarios run in one test to share the login session and avoid
 * rate-limiting issues. Each step captures a screenshot as evidence.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const TECH_EMAIL = 'rc-tech-1@fieldconnect.test';
const TECH_PASSWORD = 'rc-test-password';

async function loginAsTech(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Wait for React hydration by checking for a known React-managed element.
  // The Button component from @fieldconnect/ui has role="button" and loading state.
  // When React hydrates, the Sign In button becomes interactive.
  await page.waitForSelector('button:has-text("Sign In"):not([type="submit"])', { state: 'attached', timeout: 10_000 }).catch(() => {});
  // Wait extra long for React to hydrate event handlers
  await page.waitForTimeout(2000);

  // Use page.evaluate to call the login API + NextAuth signIn directly
  // This bypasses the React form entirely and avoids native form submission
  await page.evaluate(async ({ email, password }) => {
    // 1. Call BFF login
    const bffRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!bffRes.ok) throw new Error(`BFF login: ${await bffRes.text()}`);

    // 2. Get CSRF token
    const csrfRes = await fetch('/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();

    // 3. Call NextAuth credentials callback with form-urlencoded body
    const params = new URLSearchParams({
      csrfToken, email, password,
      callbackUrl: '/mobile',
      json: 'true',
    });
    const cbRes = await fetch('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!cbRes.ok) {
      const body = await cbRes.json();
      console.log('Credentials callback status:', cbRes.status, 'body:', JSON.stringify(body));
      // The cookie may still be set on the redirect — try navigating anyway
    }

    // 4. Navigate to mobile
    window.location.href = '/mobile';
  }, { email: TECH_EMAIL, password: TECH_PASSWORD });

  // Wait for mobile page
  await page.waitForURL(/\/mobile/, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
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
  await expect(page.locator('.text-5xl.font-mono')).toBeVisible({ timeout: 15_000 });
}

async function doClockOut(page: Page, confirm: boolean) {
  await page.click('button:has-text("Clock Out")');
  await expect(page.getByText('Confirm clock out?')).toBeVisible();
  if (confirm) {
    await page.click('button:has-text("Confirm")');
    await expect(page.getByText('Clocked Out')).toBeVisible({ timeout: 15_000 });
    await page.click('button:has-text("Done")');
    await page.waitForTimeout(1000);
  } else {
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('.text-5xl.font-mono')).toBeVisible();
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────────

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
    await expect(page.getByText('Smith Residence')).toBeVisible();
    await doClockIn(page);

    const timerText = await page.locator('.text-5xl.font-mono').textContent();
    expect(timerText).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    await expect(page.getByText('Clocked in at')).toBeVisible();
    await expect(page.getByText('Smith Residence')).toBeVisible();
    console.log(`  ✅ Clock-in success: ${timerText}`);
    await page.screenshot({ path: 'test-results/e2e/clockinout/01-clockin-gps-denied.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 3: Clock Out Cancel → still active
    // ══════════════════════════════════════════════════════════════════
    await doClockOut(page, false);
    await expect(page.getByText('Clocked in at')).toBeVisible();
    console.log('  ✅ Cancel: entry still active');
    await page.screenshot({ path: 'test-results/e2e/clockinout/02-cancel-kept-active.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 4: Clock Out Confirm → closed + summary
    // ══════════════════════════════════════════════════════════════════
    await doClockOut(page, true);
    await expect(page.getByText('Clocked Out')).toBeVisible();
    console.log('  ✅ Confirm: entry closed, summary shown');
    await page.screenshot({ path: 'test-results/e2e/clockinout/03-clockout-confirmed.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 5: Clock In with GPS → geofence + Maps link
    // ══════════════════════════════════════════════════════════════════
    await enableGps(context, 37.7749, -122.4194); // exactly at Smith Residence
    await page.goto('/mobile');
    await page.waitForLoadState('networkidle');

    await waitForClockInForm(page);
    await doClockIn(page);

    await expect(page.getByText('Inside Geofence')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/from customer site/)).toBeVisible();
    await expect(page.getByText('View clock-in location on Google Maps')).toBeVisible();
    console.log('  ✅ GPS: Inside Geofence, distance, Maps link');
    await page.screenshot({ path: 'test-results/e2e/clockinout/04-geofence-inside.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 6: Timer restoration after refresh
    // ══════════════════════════════════════════════════════════════════
    const timerBefore = await page.locator('.text-5xl.font-mono').textContent();
    await page.waitForTimeout(2000);

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.text-5xl.font-mono')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Clocked in at')).toBeVisible();
    await expect(page.getByText('Smith Residence')).toBeVisible();
    const timerAfter = await page.locator('.text-5xl.font-mono').textContent();
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
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.text-5xl.font-mono')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    console.log(`  ✅ Hydration errors: ${hydErrors.length === 0 ? 'none' : hydErrors}`);
    expect(hydErrors).toEqual([]);
    await page.screenshot({ path: 'test-results/e2e/clockinout/06-no-hydration-errors.png' });

    // ══════════════════════════════════════════════════════════════════
    // STEP 8: Clean up — clock out
    // ══════════════════════════════════════════════════════════════════
    await doClockOut(page, true);
    console.log('  ✅ Cleaned up');
    await page.screenshot({ path: 'test-results/e2e/clockinout/07-cleaned-up.png' });

    console.log('\n✅ ALL BROWSER SMOKE TESTS PASSED');
  });
});

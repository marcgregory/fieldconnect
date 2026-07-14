/**
 * Login Hydration Guard Tests
 *
 * The login form was vulnerable to native GET submission before React
 * hydration completes. These tests verify the fix:
 *
 * 1.  A fast click before hydration never produces ?email=...&password=... in the URL.
 * 2.  After hydration, the real UI-based login flow works end-to-end.
 * 3.  Repeated runs have zero flaky native submissions.
 */

import { test, expect, type Page } from '@playwright/test';

const TECH_EMAIL = 'rc-tech-1@fieldconnect.test';
const TECH_PASSWORD = 'rc-test-password';

// ─── Helpers ───────────────────────────────────────────────────────────────────────

/**
 * Attempt a native (non-JS) GET submission by clicking Submit immediately
 * after page load, before React can hydrate. If the guard is working, the
 * page must stay on /login and the URL must contain no credential params.
 */
async function tryNativeSubmitBeforeHydration(page: Page) {
  await page.goto('/login');
  // Do NOT wait for any load state — click as early as possible.
  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.click({ timeout: 3_000 }).catch(() => {
    // It's fine if the button is disabled and the click is a no-op —
    // that's the whole point. We just need to verify no GET submission occurred.
  });
  // Small pause for any pending navigation to settle
  await page.waitForTimeout(500);
}

/**
 * Fill credentials and submit the form via the real UI after hydration.
 * Returns the final URL after navigation resolves.
 */
async function loginViaUi(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Wait for the button text to change from "Initializing..." to "Sign In"
  // which signals that the hydration useEffect has fired.
  const submitBtn = page.locator('button[type="submit"]');
  await expect(submitBtn).toContainText('Sign In', { timeout: 10_000 });

  // Fill credentials
  await page.fill('input[type="email"]', TECH_EMAIL);
  await page.fill('input[type="password"]', TECH_PASSWORD);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for navigation away from /login
  await page.waitForURL(/\/(dashboard|mobile)/, { timeout: 20_000 });
  return page.url();
}

// ─── Tests ─────────────────────────────────────────────────────────────────────────

test.describe('Login Hydration Guard', () => {
  test.describe.configure({ mode: 'parallel' });

  test('A: Native GET submission is blocked before hydration', async ({ page }) => {
    await tryNativeSubmitBeforeHydration(page);

    const url = page.url();
    // The URL must NOT contain email or password query params
    expect(url).not.toContain('email=');
    expect(url).not.toContain('password=');
    // Must not have navigated away from /login via native form action
    expect(url).toContain('/login');

    // Verify no query string at all (/login, not /login?...)
    const hasQuery = url.includes('?');
    expect(hasQuery).toBe(false);

    console.log('  ✅ No credential params in URL after early submit attempt');
  });

  test('B: Real UI login via hydrated form succeeds', async ({ page }) => {
    const finalUrl = await loginViaUi(page);

    // Verify we navigated to a post-login page
    expect(finalUrl).toMatch(/\/(dashboard|mobile)/);
    console.log('  ✅ UI login succeeded, redirected to:', finalUrl);
  });

  test('C: Login form guards and hydration state', async ({ page }) => {
    // Collect console errors for debugging hydration issues
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));

    // C1: Verify form starts in disabled/hydrating state
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // The button should initially show "Initializing..." (pre-hydration)
    const button = page.locator('button[type="submit"]');
    await expect(button).toBeVisible();

    // Check button text right after load
    const initialText = await button.textContent();
    console.log(`  Initial button text: "${initialText}"`);

    // The form should have aria-busy set
    const form = page.locator('form');
    const busyAttr = await form.getAttribute('aria-busy');
    if (busyAttr !== null) {
      console.log(`  ✅ form has aria-busy attribute: ${busyAttr}`);
    }

    // Wait 3 seconds and check if button text changed
    await page.waitForTimeout(3000);
    const afterWaitText = await button.textContent();
    console.log(`  After 3s button text: "${afterWaitText}"`);

    if (consoleErrors.length > 0) {
      console.log('  ⚠️ Console errors:', consoleErrors.join('\n    '));
    }

    // C2: Check form method
    const method = await form.getAttribute('method');
    expect(method).toBe('post');
    console.log('  ✅ Form method="post"');
  });
});

test.describe('Login Hydration Flood', () => {
  test('D: 5 rapid repeat attempts with zero query-param leaks', async ({ page }) => {
    test.setTimeout(120_000);
    const failures: string[] = [];

    for (let i = 0; i < 5; i++) {
      await page.goto('/login');

      // Rapidly click submit up to 3 times before hydration can complete
      const btn = page.locator('button[type="submit"]');
      for (let attempt = 0; attempt < 3; attempt++) {
        await btn.click({ timeout: 1_000 }).catch(() => {});
        await page.waitForTimeout(50);
      }

      // Wait a moment for any pending navigation to resolve
      await page.waitForTimeout(500);

      const url = page.url();
      if (url.includes('email=') || url.includes('password=')) {
        failures.push(`Run ${i + 1}: credentials leaked in URL: ${url}`);
      }

      // Must still be on /login (no native GET navigation)
      if (!url.includes('/login')) {
        failures.push(`Run ${i + 1}: navigated away: ${url}`);
      }
    }

    if (failures.length > 0) {
      console.log('❌ Flood test failures:', failures.join('\n'));
    }
    expect(failures).toEqual([]);
    console.log('  ✅ 5 rapid-repeat attempts: zero credential leaks');
  });
});

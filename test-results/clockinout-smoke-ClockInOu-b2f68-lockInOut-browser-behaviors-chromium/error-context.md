# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: clockinout-smoke.spec.ts >> ClockInOut Browser Smoke Test >> All ClockInOut browser behaviors
- Location: tests\e2e\clockinout-smoke.spec.ts:66:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
  navigated to "http://localhost:3002/login?email=rc-tech-1%40fieldconnect.test&password=rc-test-password"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e5]:
    - generic [ref=e6]:
      - img [ref=e9]
      - heading "FieldConnect" [level=1] [ref=e12]
      - paragraph [ref=e13]: Sign in to your account
    - generic [ref=e14]:
      - generic [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Email
          - textbox "Email" [ref=e19]:
            - /placeholder: you@company.com
        - generic [ref=e20]:
          - generic [ref=e21]: Password
          - textbox "Password" [ref=e23]
        - link "Forgot password?" [ref=e25] [cursor=pointer]:
          - /url: /forgot-password?email=
        - button "Sign In" [ref=e26] [cursor=pointer]
      - paragraph [ref=e27]:
        - text: Don't have an account?
        - link "Sign up" [ref=e28] [cursor=pointer]:
          - /url: /register
```

# Test source

```ts
  1   | /**
  2   |  * ClockInOut Browser Smoke Test (Single Sequential Test)
  3   |  *
  4   |  * All scenarios run in one test to share the login session and avoid
  5   |  * rate-limiting issues. Each step captures a screenshot as evidence.
  6   |  */
  7   | 
  8   | import { test, expect, type Page, type BrowserContext } from '@playwright/test';
  9   | 
  10  | const TECH_EMAIL = 'rc-tech-1@fieldconnect.test';
  11  | const TECH_PASSWORD = 'rc-test-password';
  12  | 
  13  | async function loginAsTech(page: Page) {
  14  |   await page.goto('/login');
  15  |   await page.waitForLoadState('networkidle');
  16  | 
  17  |   // Wait for React hydration (form button must say "Sign In")
  18  |   await page.waitForSelector('button:has-text("Sign In")', { state: 'visible', timeout: 15_000 });
  19  | 
  20  |   await page.fill('input[type="email"]', TECH_EMAIL);
  21  |   await page.fill('input[type="password"]', TECH_PASSWORD);
  22  | 
  23  |   // Click Sign In and wait for navigation — form POSTs to /api/auth/login BFF
  24  |   // then calls signIn which redirects to /dashboard, then role guard → /mobile
  25  |   await Promise.all([
> 26  |     page.waitForURL(/\/mobile/, { timeout: 30_000 }),
      |          ^ TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
  27  |     page.click('button:has-text("Sign In")'),
  28  |   ]);
  29  | 
  30  |   await page.waitForLoadState('networkidle');
  31  |   await expect(page.getByText(/Welcome, RC Tech 1/i)).toBeVisible({ timeout: 10_000 });
  32  | }
  33  | 
  34  | async function enableGps(context: BrowserContext, lat = 37.7749, lng = -122.4194) {
  35  |   await context.grantPermissions(['geolocation']);
  36  |   await context.setGeolocation({ latitude: lat, longitude: lng });
  37  | }
  38  | 
  39  | async function disableGps(context: BrowserContext) {
  40  |   await context.grantPermissions([]);
  41  | }
  42  | 
  43  | async function clockIn(page: Page) {
  44  |   await expect(page.getByText('Select a project to clock in')).toBeVisible({ timeout: 10_000 });
  45  |   await page.click('role=radio[name="Select project Smith Residence"]');
  46  |   await page.click('button:has-text("Clock In")');
  47  |   await expect(page.locator('.text-5xl.font-mono')).toBeVisible({ timeout: 15_000 });
  48  | }
  49  | 
  50  | async function clockOut(page: Page, confirm: boolean) {
  51  |   await page.click('button:has-text("Clock Out")');
  52  |   await expect(page.getByText('Confirm clock out?')).toBeVisible();
  53  |   if (confirm) {
  54  |     await page.click('button:has-text("Confirm")');
  55  |     await expect(page.getByText('Clocked Out')).toBeVisible({ timeout: 15_000 });
  56  |     await page.click('button:has-text("Done")');
  57  |   } else {
  58  |     await page.click('button:has-text("Cancel")');
  59  |     await expect(page.locator('.text-5xl.font-mono')).toBeVisible();
  60  |   }
  61  | }
  62  | 
  63  | // ─── Tests ───────────────────────────────────────────────────────────────────────
  64  | 
  65  | test.describe('ClockInOut Browser Smoke Test', () => {
  66  |   test('All ClockInOut browser behaviors', async ({ page, context }) => {
  67  |     // ══════════════════════════════════════════════════════════════════
  68  |     // PREREQ: GPS denied → login
  69  |     // ══════════════════════════════════════════════════════════════════
  70  |     await disableGps(context);
  71  |     await loginAsTech(page);
  72  |     console.log('✅ Logged in as rc-tech-1');
  73  | 
  74  |     // ══════════════════════════════════════════════════════════════════
  75  |     // 1. Clock In with GPS denied → still succeeds (best-effort)
  76  |     // ══════════════════════════════════════════════════════════════════
  77  |     await clockIn(page);
  78  |     const timerText = await page.locator('.text-5xl.font-mono').textContent();
  79  |     expect(timerText).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  80  |     await expect(page.getByText('Clocked in at')).toBeVisible();
  81  |     await expect(page.getByText('Smith Residence')).toBeVisible();
  82  |     console.log(`  ✅ 1. Timer started: ${timerText}`);
  83  |     await page.screenshot({ path: 'test-results/e2e/clockinout/01-timer-gps-denied.png' });
  84  | 
  85  |     // ══════════════════════════════════════════════════════════════════
  86  |     // 2. Clock Out Cancel → entry stays active
  87  |     // ══════════════════════════════════════════════════════════════════
  88  |     await clockOut(page, false);
  89  |     await expect(page.locator('.text-5xl.font-mono')).toBeVisible();
  90  |     await expect(page.getByText('Clocked in at')).toBeVisible();
  91  |     console.log(`  ✅ 2. Cancel kept entry active`);
  92  |     await page.screenshot({ path: 'test-results/e2e/clockinout/02-cancel-kept-active.png' });
  93  | 
  94  |     // ══════════════════════════════════════════════════════════════════
  95  |     // 3. Clock Out Confirm → entry closes, summary shown
  96  |     // ══════════════════════════════════════════════════════════════════
  97  |     await clockOut(page, true);
  98  |     await expect(page.getByText('Clocked Out')).toBeVisible();
  99  |     await expect(page.getByText('Smith Residence')).toBeVisible();
  100 |     await expect(page.locator('.text-2xl.font-bold')).toBeVisible();
  101 |     console.log(`  ✅ 3. Clock-out confirmed, summary shown`);
  102 |     await page.screenshot({ path: 'test-results/e2e/clockinout/03-clockout-confirmed.png' });
  103 | 
  104 |     // ══════════════════════════════════════════════════════════════════
  105 |     // 4. Clock-in with GPS captured → geofence, Maps link
  106 |     // ══════════════════════════════════════════════════════════════════
  107 |     await enableGps(context, 37.7749, -122.4194); // exactly at Smith Residence
  108 |     await page.reload();
  109 |     await page.waitForLoadState('networkidle');
  110 | 
  111 |     await clockIn(page);
  112 | 
  113 |     // Check geofence
  114 |     await expect(page.getByText('Inside Geofence')).toBeVisible({ timeout: 10_000 });
  115 |     await expect(page.getByText(/from customer site/)).toBeVisible();
  116 |     await expect(page.getByText('View clock-in location on Google Maps')).toBeVisible();
  117 |     console.log(`  ✅ 4. GPS captured: Inside Geofence badge + Maps link`);
  118 |     await page.screenshot({ path: 'test-results/e2e/clockinout/04-geofence-inside.png' });
  119 | 
  120 |     // ══════════════════════════════════════════════════════════════════
  121 |     // 5. Timer restoration after refresh
  122 |     // ══════════════════════════════════════════════════════════════════
  123 |     const timerBefore = await page.locator('.text-5xl.font-mono').textContent();
  124 |     await page.waitForTimeout(2000);
  125 | 
  126 |     await page.reload();
```
const { test, expect } = require('@playwright/test');

async function installSafeMocks(page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = String(input && input.url ? input.url : input);
      if (url.includes('/.netlify/functions/')) {
        return new Response(JSON.stringify({ ok: true, id: 'qa-mock' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };
  });
}

async function installFirebaseMock(page) {
  await page.evaluate(() => {
    const user = {
      uid: 'qa-rich',
      email: 'richkingsford@gmail.com',
      emailVerified: true,
      displayName: 'Rich QA',
    };
    window.skilfFirebase = {
      ready: true,
      user,
      profile: { roles: ['admin', 'board-member', 'mentor', 'intern'] },
      registeredRoles: ['admin', 'board-member', 'mentor', 'intern'],
      hasRegisteredRole: true,
      isAdmin: true,
      requireSignIn: async () => user,
      syncUserProfile: async () => ({ roles: ['admin', 'board-member', 'mentor', 'intern'] }),
      saveCardMessage: async () => ({ id: 'qa-message' }),
      saveDashboardAction: async () => ({ ok: true }),
      getIdToken: async () => 'qa-token',
      writesAllowedInThisDeployment: () => true,
    };
  });
}

test.describe('Performance smoke budgets', () => {
  test('Interns page renders searchable cards and thumbnails within a local budget', async ({ page }) => {
    await installSafeMocks(page);
    const started = Date.now();
    await page.goto('/interns.html', { waitUntil: 'domcontentloaded' });
    await installFirebaseMock(page);
    await expect(page.locator('#interns .intern-card').first()).toBeVisible({ timeout: 6000 });
    const elapsedMs = Date.now() - started;

    const metrics = await page.evaluate(() => ({
      cardCount: document.querySelectorAll('#interns .intern-card').length,
      completeImages: [...document.querySelectorAll('#interns .intern-card img, #interns .intern-card .profile-icon')]
        .filter((element) => element.tagName !== 'IMG' || (element.complete && element.naturalWidth > 0)).length,
      resourceCount: performance.getEntriesByType('resource').length,
      domNodes: document.querySelectorAll('*').length,
    }));

    expect(elapsedMs, 'Interns page should render locally before the user wonders if it froze').toBeLessThan(6000);
    expect(metrics.cardCount).toBeGreaterThanOrEqual(6);
    expect(metrics.completeImages).toBeGreaterThanOrEqual(6);
    expect(metrics.resourceCount).toBeLessThan(90);
    expect(metrics.domNodes).toBeLessThan(2500);
  });

  test('Dashboard pages render their first actionable cards within a local budget', async ({ page }) => {
    for (const route of ['/mentor-dashboard.html', '/board-member-dashboard.html', '/intern-dashboard.html']) {
      await installSafeMocks(page);
      const started = Date.now();
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await installFirebaseMock(page);
      await expect(page.locator('[data-action]').first()).toBeVisible({ timeout: 5000 });
      const elapsedMs = Date.now() - started;
      const actionCount = await page.locator('[data-action]').count();
      expect(elapsedMs, `${route} should render dashboard actions promptly`).toBeLessThan(5000);
      expect(actionCount, `${route} should expose actionable dashboard controls`).toBeGreaterThan(0);
    }
  });
});

const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort();
const localPages = htmlFiles.map((file) => `/${file}`);

async function installSafeMocks(page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = String(input && input.url ? input.url : input);
      if (url.includes('/.netlify/functions/')) {
        return new Response(JSON.stringify({ ok: true, id: 'qa-mock', url: 'https://checkout.example.test/session' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };
    window.open = (...args) => {
      window.__qaLastOpen = args;
      return null;
    };
  });
}

async function installFirebaseMock(page, roles = ['admin', 'board-member', 'mentor', 'intern']) {
  await page.evaluate((mockRoles) => {
    const user = {
      uid: 'qa-rich',
      email: 'richkingsford@gmail.com',
      emailVerified: true,
      displayName: 'Rich QA',
    };
    window.skilfFirebase = {
      ready: true,
      user,
      profile: { roles: mockRoles },
      registeredRoles: mockRoles,
      hasRegisteredRole: true,
      isAdmin: true,
      requireSignIn: async () => user,
      syncUserProfile: async () => ({ roles: mockRoles }),
      saveCardMessage: async () => ({ id: 'qa-message' }),
      saveDashboardAction: async () => ({ ok: true }),
      savePersonApplication: async () => ({ id: 'qa-application' }),
      getIdToken: async () => 'qa-token',
      writesAllowedInThisDeployment: () => true,
    };
  }, roles);
}

async function openLocalPage(page, route) {
  await installSafeMocks(page);
  await page.goto(route, { waitUntil: 'load' });
  if (route === '/student-dashboard.html') {
    await page.waitForURL(/intern-dashboard(?:\.html)?$/, { timeout: 5000 });
  } else {
    await installFirebaseMock(page);
  }
}

test.describe('Mobile viewport coverage', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  for (const route of localPages) {
    test(`${route} fits and renders at phone width`, async ({ page }) => {
      await openLocalPage(page, route);
      const metrics = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        bodyTextLength: document.body.innerText.trim().length,
      }));
      expect(metrics.bodyTextLength, `${route} should render visible mobile text`).toBeGreaterThan(0);
      expect(metrics.overflowX, `${route} should not overflow at phone width`).toBe(false);
    });
  }

  test('mobile users can reach core menus, messages, carousel controls, and dashboard actions', async ({ page }) => {
    await openLocalPage(page, '/index.html');
    await page.locator('.site-nav .site-adventure summary').click();
    await expect(page.locator('.site-nav .site-adventure-menu')).toBeVisible();
    await expect(page.locator('.site-nav .site-adventure-menu a')).toHaveCount(7);
    await expect(page.locator('.site-nav .site-adventure-menu a[href="apply.html#company-project"]')).toBeVisible();

    await page.locator('#experts .expert-card .msg-arrow').first().click();
    await expect(page.locator('#experts .expert-card .msg-menu').first()).toBeVisible();
    await page.locator('#experts .expert-card .send-btn').first().click();
    await expect(page.locator('#experts .expert-card .send-btn').first()).toHaveText('Sent');

    await openLocalPage(page, '/intern-dashboard.html');
    await expect(page.locator('[data-success-track]')).toBeVisible();
    const firstTip = await page.locator('[data-success-track] h3').first().textContent();
    await page.locator('[data-tip-dir="1"]').click();
    await expect(page.locator('[data-tip-count]')).toHaveText('2 / 20');
    await page.locator('[data-tip-dot="0"]').click();
    await expect(page.locator('[data-tip-count]')).toHaveText('1 / 20');
    await expect(page.locator('[data-success-track] h3').first()).toHaveText(firstTip || '');

    await page.locator('[data-action="schedule-check-in"]').click();
    await expect(page.locator('[data-dashboard-status]')).not.toHaveText('');
  });
});

test.describe('Accessibility smoke coverage', () => {
  for (const route of localPages) {
    test(`${route} has no serious automated accessibility violations`, async ({ page }) => {
      await openLocalPage(page, route);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const serious = results.violations
        .filter((violation) => ['serious', 'critical'].includes(violation.impact))
        .map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
        }));
      expect(serious).toEqual([]);
    });
  }

  test('interactive controls expose useful accessible names', async ({ page }) => {
    const failures = [];
    for (const route of localPages) {
      await openLocalPage(page, route);
      const unnamed = await page.evaluate(() => {
        function visible(element) {
          const style = window.getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
        }
        function nameFor(element) {
          const imageAlt = element.querySelector('img[alt]') ? element.querySelector('img[alt]').getAttribute('alt') : '';
          return [
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
            element.textContent,
            imageAlt,
          ].join(' ').trim().replace(/\s+/g, ' ');
        }
        return [...document.querySelectorAll('a[href], button, summary, input, textarea, select')]
          .filter(visible)
          .filter((element) => {
            const tag = element.tagName.toLowerCase();
            if (['input', 'textarea', 'select'].includes(tag)) {
              const id = element.getAttribute('id');
              const hasLabel = Boolean(id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
              const hasWrappingLabel = Boolean(element.closest('label'));
              return !(hasLabel || hasWrappingLabel || element.getAttribute('aria-label') || element.getAttribute('placeholder'));
            }
            return !nameFor(element);
          })
          .map((element) => element.outerHTML.slice(0, 180));
      });
      unnamed.forEach((html) => failures.push(`${route}: ${html}`));
    }
    expect(failures).toEqual([]);
  });
});

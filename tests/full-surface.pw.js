const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort();
const localPages = htmlFiles.map((file) => `/${file}`);

function routeForHref(file, href) {
  if (!href) return null;
  if (href.includes('${')) return null;
  if (href.startsWith('#')) return null;
  if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) return null;
  const withoutHash = href.split('#')[0];
  if (!withoutHash) return null;
  const normalized = withoutHash.startsWith('/')
    ? withoutHash
    : path.posix.normalize(`${path.posix.dirname(`/${file}`)}/${withoutHash}`).replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function buttonCoverage(button) {
  const label = button.text || button.aria || button.title || button.className || button.outer;
  if (button.dataAuthAction) return `auth:${button.dataAuthAction}`;
  if (button.type === 'submit') return 'form-submit';
  if (button.dataAdminAction || button.dataAdminSignIn) return 'admin-function';
  if (button.dataPaymentKind) return 'payment-function';
  if (button.dataAction) return `dashboard-action:${button.dataAction}`;
  if (button.dataTipDir) return 'success-carousel-nav';
  if (button.dataTipDot) return 'success-carousel-dot';
  if (button.dataTree || button.dataTreeToggle !== null) return 'skill-filter-toggle';
  if (button.dataClearSearch !== null) return 'clear-search';
  if (button.dataMoreInterns !== null) return 'more-interns';
  if (button.className.includes('msg-arrow')) return 'message-template-menu';
  if (button.className.includes('send-btn')) return 'message-send';
  if (button.className.includes('tag')) return 'tag-filter';
  if (button.className.includes('registration-close')) return 'registration-modal-close';
  if (button.className.includes('send-login-cancel') || button.className.includes('send-login-submit')) return 'message-sign-in-prompt';
  if (button.aria === 'Clear skill filter') return 'active-skill-filter-clear';
  return `UNCLASSIFIED: ${label}`;
}

async function installSafeMocks(page) {
  await page.addInitScript(() => {
    window.__qaFetchCalls = [];
    window.__qaOriginalOpen = window.open;
    window.open = (...args) => {
      window.__qaLastOpen = args;
      return null;
    };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = String(input && input.url ? input.url : input);
      window.__qaFetchCalls.push({
        url,
        method: init.method || 'GET',
        body: init.body || '',
      });
      if (url.includes('/.netlify/functions/create-checkout-session')) {
        return new Response(JSON.stringify({ error: 'QA checkout is intentionally mocked.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/.netlify/functions/admin-set-user-roles')) {
        return new Response(JSON.stringify({
          ok: true,
          user: {
            uid: 'qa-dummy-user',
            email: 'qa-dummy@example.test',
            roles: ['intern'],
            suspended: false,
            disabled: false,
            suspendedReason: '',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/.netlify/functions/record-dashboard-action')) {
        return new Response(JSON.stringify({ ok: true, actionId: 'qa-action' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/.netlify/functions/send-message')) {
        return new Response(JSON.stringify({ ok: true, id: 'qa-email' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
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

test.describe('Full page surface', () => {
  for (const route of localPages) {
    test(`${route} loads without browser errors or horizontal overflow`, async ({ page }) => {
      await installSafeMocks(page);
      const browserErrors = [];
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text());
      });

      const response = await page.goto(route, { waitUntil: 'load' });
      expect(response && response.status(), `${route} should load`).toBeLessThan(400);
      if (route === '/student-dashboard.html') {
        await page.waitForURL(/intern-dashboard(?:\.html)?$/, { timeout: 5000 });
      } else {
        await installFirebaseMock(page);
      }

      const metrics = await page.evaluate(() => ({
        title: document.title,
        buttonCount: document.querySelectorAll('button').length,
        linkCount: document.querySelectorAll('a[href]').length,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        bodyTextLength: document.body.innerText.trim().length,
      }));
      expect(metrics.title, `${route} should have a title`).not.toBe('');
      expect(metrics.bodyTextLength, `${route} should render visible text`).toBeGreaterThan(0);
      expect(metrics.overflowX, `${route} should not overflow horizontally`).toBe(false);
      expect(browserErrors, `${route} browser errors`).toEqual([]);
    });
  }

  test('all internal links point to reachable local destinations', async ({ request }) => {
    const failures = [];
    const checked = new Set();
    for (const file of htmlFiles) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      const hrefs = [...source.matchAll(/\s(?:href|action)=["']([^"']+)["']/g)].map((match) => match[1]);
      for (const href of hrefs) {
        const route = routeForHref(file, href);
        if (!route || checked.has(route)) continue;
        checked.add(route);
        const response = await request.get(route);
        if (response.status() >= 400) failures.push(`${file} -> ${href} (${response.status()})`);
      }
    }
    expect(failures).toEqual([]);
  });

  test('every button has an automated coverage classification', async ({ page }) => {
    const uncovered = [];
    for (const route of localPages) {
      await installSafeMocks(page);
      await page.goto(route, { waitUntil: 'load' });
      if (route === '/student-dashboard.html') {
        await page.waitForURL(/intern-dashboard(?:\.html)?$/, { timeout: 5000 });
      } else {
        await installFirebaseMock(page);
      }
      const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((button) => ({
        text: button.textContent.trim().replace(/\s+/g, ' '),
        aria: button.getAttribute('aria-label') || '',
        title: button.getAttribute('title') || '',
        type: button.getAttribute('type') || '',
        className: button.className || '',
        dataAuthAction: button.dataset.authAction || '',
        dataAdminAction: button.dataset.adminAction || '',
        dataAdminSignIn: button.hasAttribute('data-admin-sign-in'),
        dataPaymentKind: button.dataset.paymentKind || '',
        dataAction: button.dataset.action || '',
        dataTipDir: button.dataset.tipDir || '',
        dataTipDot: button.dataset.tipDot || '',
        dataTree: button.dataset.tree || '',
        dataTreeToggle: button.hasAttribute('data-tree-toggle') ? '' : null,
        dataClearSearch: button.hasAttribute('data-clear-search') ? '' : null,
        dataMoreInterns: button.hasAttribute('data-more-interns') ? '' : null,
        outer: button.outerHTML.slice(0, 180),
      })));
      for (const button of buttons) {
        const coverage = buttonCoverage(button);
        if (coverage.startsWith('UNCLASSIFIED')) uncovered.push(`${route}: ${coverage}`);
      }
    }
    expect(uncovered).toEqual([]);
  });

  test('core safe buttons respond locally without navigating to external services', async ({ page }) => {
    await installSafeMocks(page);
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.evaluate(() => {
      window.skilfFirebase = {
        ready: true,
        user: null,
        requireSignIn: async () => null,
        saveCardMessage: async () => {
          throw new Error('Should not save before sign-in.');
        },
      };
    });
    await page.locator('#expert-toolbar [data-tree="expert-tree"]').click();
    await expect(page.locator('#expert-tree')).toHaveClass(/open/);
    await page.locator('#expert-toolbar [data-tree="expert-tree"]').click();
    await expect(page.locator('#expert-tree')).not.toHaveClass(/open/);
    await page.locator('#experts .expert-card .msg-arrow').first().click();
    await expect(page.locator('#experts .expert-card .msg-menu').first()).toBeVisible();
    await page.locator('#experts .expert-card .send-btn').first().click();
    await expect(page.locator('#experts .expert-card').first().locator('.send-login-prompt')).toBeVisible();
    await page.locator('#experts .expert-card .send-login-cancel').click();
    await expect(page.locator('.send-login-prompt')).toHaveCount(0);

    await page.goto('/interns.html', { waitUntil: 'load' });
    await page.evaluate(() => {
      window.skilfFirebase = {
        ready: true,
        user: null,
        requireSignIn: async () => null,
        saveCardMessage: async () => {
          throw new Error('Should not save before sign-in.');
        },
      };
    });
    await expect(page.locator('#interns .intern-card').first()).toBeVisible();
    await page.locator('[data-tree-toggle]').click();
    await expect(page.locator('#intern-tree')).toHaveClass(/open/);
    await page.locator('#intern-tree .tree-leaf').first().click();
    await expect(page.locator('[data-active-filter]')).toHaveClass(/visible/);
    await page.locator('[data-active-filter] button').click();
    await expect(page.locator('[data-active-filter]')).not.toHaveClass(/visible/);
    await page.locator('#interns .intern-card .msg-arrow').first().click();
    await expect(page.locator('#interns .intern-card .msg-menu').first()).toBeVisible();

    await page.goto('/payments.html', { waitUntil: 'load' });
    await installFirebaseMock(page);
    const paymentButtons = page.locator('[data-payment-kind]');
    const paymentCount = await paymentButtons.count();
    for (let index = 0; index < paymentCount; index += 1) {
      await paymentButtons.nth(index).click();
      await expect(page.locator('[data-payment-status]')).toContainText('QA checkout is intentionally mocked.');
    }

    for (const dashboardRoute of ['/mentor-dashboard.html', '/board-member-dashboard.html', '/intern-dashboard.html']) {
      await page.goto(dashboardRoute, { waitUntil: 'load' });
      await installFirebaseMock(page);
      const actions = page.locator('[data-action]');
      const actionCount = await actions.count();
      for (let index = 0; index < actionCount; index += 1) {
        const action = actions.nth(index);
        if (await action.isEnabled()) {
          await action.click();
          await expect(page.locator('[data-dashboard-status]')).not.toHaveText('');
        }
      }
    }
  });
});

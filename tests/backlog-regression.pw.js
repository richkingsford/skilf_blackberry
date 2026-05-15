const { test, expect } = require('@playwright/test');

test.describe('Backlog regression', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  // --- Backlog item 1: Search & filter by name, region, skilfId ---
  test('search filters expert cards by name', async ({ page }) => {
    await page.fill('#search', 'Lila');
    const cards = page.locator('#experts .expert-card');
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().locator('.name')).toContainText('Lila');
  });

  test('search filters expert cards by region', async ({ page }) => {
    await page.fill('#search', 'Zurich');
    const cards = page.locator('#experts .expert-card');
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().locator('.region')).toContainText('Zurich');
  });

  test('search filters expert cards by skilfId', async ({ page }) => {
    await page.fill('#search', 'SKL-003');
    const cards = page.locator('#experts .expert-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator('.name')).toHaveText('Eng. Noor Haddad');
  });

  test('clearing search restores all 6 expert cards', async ({ page }) => {
    await page.fill('#search', 'xyz');
    await expect(page.locator('#experts .expert-card')).toHaveCount(0);
    await page.fill('#search', '');
    await expect(page.locator('#experts .expert-card')).toHaveCount(6);
  });

  test('initial expert cards use the first 6 experts fixture records', async ({ page }) => {
    await expect(page.locator('#experts .expert-card')).toHaveCount(6);
  });

  // --- Backlog item 2: Begin your own Skilf adventure CTA ---
  test('Begin your own Skilf adventure links to the local application form', async ({ page }) => {
    const links = page.locator('a.cta[href^="apply.html"]', { hasText: 'Begin your own Skilf adventure' });
    await expect(links.first()).toBeVisible();
    await expect(links).toHaveCount(2);
  });

  test('homepage no longer links to Google Forms', async ({ page }) => {
    await expect(page.locator('a[href*="google.com/forms"]')).toHaveCount(0);
    await expect(page.locator('a[href="apply.html?kind=scholarship"]')).toBeVisible();
  });

  test('application form is available for Netlify capture', async ({ page }) => {
    await page.goto('/apply.html');
    await expect(page.locator('form[name="skilf-application"][data-netlify="true"]')).toBeVisible();
    await expect(page.locator('select[name="role"] option')).toHaveCount(3);
  });

  // --- Post a skilf button removed ---
  test('Post a skilf button no longer exists', async ({ page }) => {
    await expect(page.locator('a.cta-outline', { hasText: 'Post a skilf' })).toHaveCount(0);
  });

  // --- Backlog item 4: Find a partner section with 6 cards ---
  test('Find a partner section has 6 cards', async ({ page }) => {
    await expect(page.locator('.section-title', { hasText: 'Find a partner' })).toBeVisible();
    await expect(page.locator('#partners .card')).toHaveCount(6);
  });

  test('initial partner cards use the first 6 partner fixture records', async ({ page }) => {
    await expect(page.locator('#partners .partner-card')).toHaveCount(6);
  });

  // --- Message dropdown + attached send + pre-filled value ---
  test('expert cards have message widget with pre-filled value', async ({ page }) => {
    const firstExpert = page.locator('#experts .expert-card').first();
    const input = firstExpert.locator('.msg-input');
    const arrow = firstExpert.locator('.msg-arrow');
    const sendBtn = firstExpert.locator('.send-btn');
    await expect(input).toBeVisible();
    await expect(arrow).toBeVisible();
    await expect(sendBtn).toBeVisible();
    const val = await input.inputValue();
    expect(val.length).toBeGreaterThan(0);
  });

  test('arrow opens popover menu and selecting an option changes input', async ({ page }) => {
    const firstCard = page.locator('#experts .expert-card').first();
    const input = firstCard.locator('.msg-input');
    const arrow = firstCard.locator('.msg-arrow');
    const menu = firstCard.locator('.msg-menu');
    await expect(menu).toBeHidden();
    await arrow.click();
    await expect(menu).toBeVisible();
    const thirdOption = menu.locator('li').nth(2);
    const optionText = await thirdOption.textContent();
    await thirdOption.click();
    await expect(menu).toBeHidden();
    expect(await input.inputValue()).toBe(optionText);
  });

  test('typing in message input preserves and extends pre-filled text', async ({ page }) => {
    const input = page.locator('#experts .expert-card').first().locator('.msg-input');
    const original = await input.inputValue();
    await input.click();
    await input.press('End');
    await input.type(' Also curious about timeline.');
    const updated = await input.inputValue();
    expect(updated).toContain(original);
    expect(updated).toContain('Also curious about timeline.');
  });

  // --- Partner cards also have message widget ---
  test('partner cards have message widget', async ({ page }) => {
    const firstPartner = page.locator('#partners .card').first();
    await expect(firstPartner.locator('.msg-input')).toBeVisible();
    await expect(firstPartner.locator('.msg-arrow')).toBeVisible();
    await expect(firstPartner.locator('.send-btn')).toBeVisible();
  });

  // --- Single paragraph per card ---
  test('expert cards have exactly one bio paragraph (not two)', async ({ page }) => {
    const firstCard = page.locator('#experts .expert-card').first();
    await expect(firstCard.locator('.bio')).toHaveCount(1);
    await expect(firstCard.locator('.signal')).toHaveCount(0);
    await expect(firstCard.locator('.project')).toHaveCount(0);
  });

  // --- Tags on cards ---
  test('expert cards display tags', async ({ page }) => {
    const tags = page.locator('#experts .expert-card').first().locator('.tag');
    const count = await tags.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('partner cards display tags', async ({ page }) => {
    const tags = page.locator('#partners .card').first().locator('.tag');
    const count = await tags.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // --- More space between grids ---
  test('section title has significant top margin for grid spacing', async ({ page }) => {
    const mt = await page.locator('.section-title').evaluate(el => getComputedStyle(el).marginTop);
    expect(parseInt(mt)).toBeGreaterThanOrEqual(40);
  });

  // --- Top grid title and tagline ---
  test('top grid titled "Hire someone with a skilf" with tagline', async ({ page }) => {
    await expect(page.locator('h1.app-title')).toHaveText('Skilf');
    await expect(page.locator('h2.section-title').first()).toHaveText('Hire someone with a skilf');
    await expect(page.locator('.tagline')).toContainText('adversarial demo defense');
  });

  // --- 6 expert cards with region pills ---
  test('all 6 expert cards render with region info', async ({ page }) => {
    const cards = page.locator('#experts .expert-card');
    await expect(cards).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      await expect(cards.nth(i).locator('.region')).toBeVisible();
    }
  });

  // --- Years expert in region tag ---
  test('region tag shows years expert wording', async ({ page }) => {
    const regionText = await page.locator('#experts .expert-card').first().locator('.region').textContent();
    expect(regionText).toContain('skilfs in');
  });

  // --- Message widget is 3 separate columns ---
  test('message row has 3 connected elements', async ({ page }) => {
    const row = page.locator('#experts .expert-card').first().locator('.msg-row');
    await expect(row.locator('.msg-input')).toBeVisible();
    await expect(row.locator('.msg-arrow')).toBeVisible();
    await expect(row.locator('.send-btn')).toBeVisible();
  });

  // --- No "Elite experts" lead text ---
  test('page does not contain old lead text', async ({ page }) => {
    await expect(page.locator('.lead')).toHaveCount(0);
  });
});

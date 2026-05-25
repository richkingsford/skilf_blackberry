const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

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
    await expect(links).toHaveCount(1);
  });

  test('homepage no longer links to Google Forms', async ({ page }) => {
    await expect(page.locator('a[href*="google.com/forms"]')).toHaveCount(0);
    await expect(page.locator('a[href="apply.html#scholarship"]')).toBeVisible();
  });

  test('homepage has global top navigation with logo', async ({ page }) => {
    const nav = page.locator('.site-nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.site-logo')).toHaveAttribute('src', 'assets/skilf-logo-solo-defense-refined.svg');
    await expect(nav.getByRole('link', { name: 'Interns' })).toHaveAttribute('href', 'interns');
    await expect(nav.getByRole('link', { name: 'Hire', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: '$500/Demo Day' })).toHaveAttribute('href', 'defense-day.html');
    await expect(nav.getByRole('link', { name: 'Board Members' })).toHaveAttribute('href', 'board-dashboard.html');
    await expect(nav.getByRole('link', { name: 'Mentors' })).toHaveAttribute('href', 'monetize.html');
    await expect(nav.getByRole('link', { name: 'Begin a Skilf' })).toHaveAttribute('href', 'apply.html');
    await expect(nav.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(nav.locator('[data-auth-profile]')).toBeHidden();
    await expect(nav.locator('[data-auth-menu]')).toBeHidden();
    await expect(nav.locator('[data-auth-action="sign-out"]')).toBeHidden();
    await expect(nav.locator('[data-auth-status]')).toBeHidden();
    await expect(nav.getByRole('link', { name: 'Board', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Partners' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Student' })).toHaveCount(0);
  });

  test('homepage search boxes use categorized skill filter dropdowns', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Open skill filters' })).toHaveCount(2);
    await expect(page.getByText('Skill tree')).toHaveCount(0);

    await page.locator('#search').focus();
    await expect(page.locator('#expert-tree')).toHaveClass(/open/);
    await expect(page.locator('#expert-tree .tree-category')).toHaveCount(9);
    await expect(page.locator('#expert-tree .tree-leaf')).toHaveCount(66);
    await expect(page.locator('#expert-tree [data-skill="Computer Vision"]')).toBeVisible();

    await page.fill('#search', 'NLP');
    await expect(page.locator('#expert-tree [data-skill="NLP"]')).toBeVisible();
    await expect(page.locator('#expert-tree [data-skill="Computer Vision"]')).toBeHidden();
    await page.locator('#expert-tree [data-skill="NLP"]').click();
    await expect(page.locator('#search')).toHaveValue('NLP');
    await expect(page.locator('#expert-tree')).not.toHaveClass(/open/);

    await page.locator('#partner-search').scrollIntoViewIfNeeded();
    await page.locator('#partner-toolbar .tree-btn').click();
    await expect(page.locator('#partner-tree')).toHaveClass(/open/);
    await expect(page.locator('#partner-tree .tree-category')).toHaveCount(9);
    await expect(page.locator('#partner-tree .tree-leaf')).toHaveCount(66);
    await page.fill('#partner-search', 'Wearables');
    await expect(page.locator('#partner-tree [data-skill="Wearables"]')).toBeVisible();
    await expect(page.locator('#partner-tree [data-skill="Computer Vision"]')).toBeHidden();
  });

  test('send buttons require Google sign-in before sending', async ({ page }) => {
    await page.evaluate(() => {
      window.__signInRequests = 0;
      window.skilfFirebase = {
        user: null,
        requireSignIn: async () => {
          window.__signInRequests += 1;
          return null;
        },
        saveCardMessage: async () => {
          throw new Error('Should not save before sign-in');
        },
      };
    });

    const send = page.locator('#experts .expert-card').first().locator('.send-btn');
    const card = page.locator('#experts .expert-card').first();
    await send.click();
    await expect(send).toHaveText('Send');
    await expect(card.locator('.send-login-prompt')).toBeVisible();
    await expect(card.locator('.send-login-prompt')).toContainText('Sign in with Google to send this message.');
    await expect.poll(() => page.evaluate(() => window.__signInRequests)).toBe(0);
    await card.locator('.send-login-submit').click();
    await expect.poll(() => page.evaluate(() => window.__signInRequests)).toBe(1);
  });

  test('send buttons proceed when already signed in', async ({ page }) => {
    await page.evaluate(() => {
      window.__signInRequests = 0;
      window.__savedMessages = [];
      window.skilfFirebase = {
        user: { uid: 'test-user' },
        requireSignIn: async () => {
          window.__signInRequests += 1;
          return { uid: 'test-user' };
        },
        saveCardMessage: async (payload) => {
          window.__savedMessages.push(payload);
        },
      };
    });

    const send = page.locator('#experts .expert-card').first().locator('.send-btn');
    await send.click();
    await expect(send).toHaveText('Sent');
    await expect.poll(() => page.evaluate(() => window.__signInRequests)).toBe(0);
    const messages = await page.evaluate(() => window.__savedMessages);
    expect(messages).toHaveLength(1);
    expect(messages[0].targetType).toBe('expert');
    expect(messages[0].targetName.length).toBeGreaterThan(0);
    expect(messages[0].message.length).toBeGreaterThan(0);
  });

  test('application form is available for Netlify capture', async ({ page }) => {
    await page.goto('/apply.html');
    await expect(page.locator('form[name="skilf-application"][data-netlify="true"]')).toBeVisible();
    await expect(page.locator('select[name="role"] option')).toHaveCount(5);
    await expect(page.locator('select[name="role"] option[value="scholarship"]')).toHaveText('Get a scholarship');
    await expect(page.locator('select[name="role"] option[value="hire"]')).toHaveText('Hire an intern');
    await expect(page.locator('input[name="phone"]')).toHaveCount(0);
    await expect(page.locator('input[name="organization"]')).toHaveCount(0);
    await expect(page.locator('input[name="skilf_interest"]')).toHaveCount(0);
    await expect(page.locator('.note')).toHaveCount(0);
  });

  test('application form adapts to selected intent', async ({ page }) => {
    await page.goto('/apply.html');
    await expect(page.locator('[data-project-label]')).toHaveText('What do you want to build or prove?');
    await page.selectOption('[data-intent-select]', 'board-member');
    await expect(page.locator('[data-project-label]')).toHaveText('What expertise can you use to evaluate Demo Day work?');
    await expect(page.locator('[data-kind-input]')).toHaveValue('board-member');
    await page.selectOption('[data-intent-select]', 'mentor');
    await expect(page.locator('[data-project-label]')).toHaveText('How would you like to mentor apprentices?');
    await page.selectOption('[data-intent-select]', 'scholarship');
    await expect(page.locator('[data-project-label]')).toHaveText('What would a scholarship help you build or prove?');
    await expect(page.locator('[data-kind-input]')).toHaveValue('scholarship');
    await expect(page.locator('.submit-btn')).toHaveText('Apply');
    await page.selectOption('[data-intent-select]', 'hire');
    await expect(page.locator('[data-project-label]')).toHaveText('What kind of internship or project work can you offer?');
    await expect(page.locator('[data-kind-input]')).toHaveValue('hire');
    await expect(page.locator('.submit-btn')).toHaveText('Start hiring');
    await page.goto('/apply.html#scholarship');
    await expect(page.locator('[data-intent-select]')).toHaveValue('scholarship');
    await page.goto('/apply.html#hire');
    await expect(page.locator('[data-intent-select]')).toHaveValue('hire');
  });

  test('Interns page supports search, skill tree filtering, and thumbnails', async ({ page }) => {
    await page.goto('/interns');
    await expect(page.getByRole('heading', { name: 'Interns' })).toBeVisible();
    await expect(page.locator('.lead')).toHaveText('Every Skilf intern already has an internship — some are even working for themselves on their own startup.');
    await expect(page.getByRole('heading', { name: 'Hire or mentor an intern.' })).toBeVisible();
    await expect(page.locator('img[src="assets/interns-mentor-hero.png"]')).toBeVisible();
    await expect(page.getByText('Every Skilf intern already has an internship')).toHaveCount(1);
    await expect(page.getByText('paid or unpaid role with an experienced professional')).toBeVisible();
    await expect(page.locator('[data-visual-count]')).toHaveText('66');
    await expect(page.locator('.batch-section')).toHaveCount(0);
    await expect(page.locator('[data-thumbnail-batches]')).toHaveCount(0);
    await expect(page.locator('#intern-search')).not.toBeFocused();
    await expect(page.locator('#intern-tree')).not.toHaveClass(/open/);
    const filterButton = page.getByRole('button', { name: 'Open skill filters' });
    await expect(filterButton).toBeVisible();
    await expect(page.locator('#interns .intern-card')).toHaveCount(6);
    await filterButton.click();
    await expect(page.locator('#intern-tree')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#intern-tree')).not.toHaveClass(/open/);
    await page.locator('#intern-search').click();
    await expect(page.locator('#intern-tree')).toHaveClass(/open/);
    await expect(page.getByText('Skill tree')).toHaveCount(0);
    await expect(page.locator('#intern-tree .tree-category')).toHaveCount(9);
    await expect(page.locator('#intern-tree .tree-leaf')).toHaveCount(66);
    await expect(page.locator('#intern-tree .tree-leaf[data-skill="ML"]')).toBeVisible();
    await expect(page.locator('#intern-tree .tree-leaf[data-skill="Medical NLP"]')).toBeVisible();
    await expect(page.locator('[data-intern-count]')).toHaveText('264');
    await expect(page.locator('#interns .intern-card .thumb')).toHaveCount(6);
    await expect(page.locator('#interns .intern-card .thumb svg')).toHaveCount(6);
    await expect(page.locator('#interns .intern-card').first().locator('.thumb')).toHaveAttribute('aria-label', /Computer Vision/);
    await expect(page.locator('#interns .intern-card .profile-icon')).toHaveCount(6);
    await expect(page.locator('#interns .intern-card .msg-row')).toHaveCount(6);
    await expect(page.locator('#interns .intern-card .msg-input')).toHaveCount(6);
    await expect(page.locator('#interns .intern-card .send-btn')).toHaveCount(6);
    await expect(page.locator('#interns .card-actions')).toHaveCount(0);
    await expect(page.locator('#interns a[href="apply.html#mentor"]')).toHaveCount(0);
    await expect(page.locator('#interns a[href="apply.html#board-member"]')).toHaveCount(0);
    await expect(page.locator('[data-more-interns]')).toBeVisible();
    await expect(page.locator('[data-more-interns]')).toHaveText('258 more');
    await page.keyboard.press('Escape');
    await expect(page.locator('#intern-tree')).not.toHaveClass(/open/);
    const homepageMessageOptions = [
      'Would you be interested in paid-work on my project?',
      'Would you be interested in working on my project as a sweat-equity cofounder?',
      'Are you open to experienced collaborators joining you in this effort?',
      'Are you open to inexperienced collaborators joining you in this effort?',
    ];
    const firstInternCard = page.locator('#interns .intern-card').first();
    await expect(firstInternCard.locator('.msg-input')).toHaveValue(homepageMessageOptions[0]);
    await firstInternCard.locator('.msg-arrow').click();
    await expect(firstInternCard).toHaveClass(/menu-open/);
    await expect(firstInternCard.locator('.msg-menu li')).toHaveText(homepageMessageOptions);
    await page.keyboard.press('Escape');
    await expect(firstInternCard).not.toHaveClass(/menu-open/);
    await page.locator('[data-more-interns]').click();
    await expect(page.locator('#interns .intern-card')).toHaveCount(264);
    await expect(page.locator('[data-more-interns]')).toBeHidden();

    await page.getByRole('button', { name: 'Open skill filters' }).click();
    await page.locator('#intern-tree .tree-leaf[data-skill="Computer Vision"]').click();
    await expect(page.locator('[data-active-filter]')).toContainText('Computer Vision');
    await expect(page.locator('#interns .intern-card')).toHaveCount(6);
    await expect(page.locator('[data-more-interns]')).toHaveText('6 more');

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(page.locator('#interns .intern-card')).toHaveCount(6);
    await expect(page.locator('[data-more-interns]')).toHaveText('258 more');
    await expect(page.locator('#intern-tree')).not.toHaveClass(/open/);

    await page.fill('#intern-search', 'NLP');
    await expect(page.locator('#intern-tree .tree-leaf[data-skill="NLP"]')).toBeVisible();
    await expect(page.locator('#intern-tree .tree-leaf[data-skill="Computer Vision"]')).toBeHidden();
    await page.locator('#intern-tree .tree-leaf[data-skill="NLP"]').click();
    await expect(page.locator('[data-active-filter]')).toContainText('NLP');
    await expect(page.locator('#interns .intern-card')).toHaveCount(6);
    await expect(page.locator('[data-more-interns]')).toHaveText('6 more');
    await expect(page.getByRole('link', { name: 'Become an Intern' })).toHaveAttribute('href', 'apply.html#intern');
    await expect(page.getByRole('link', { name: 'Mentor an Intern' })).toHaveAttribute('href', 'apply.html#mentor');
    await expect(page.getByRole('link', { name: 'Hire an Intern' })).toHaveAttribute('href', 'apply.html#hire');
  });

  test('Interns page send widgets require sign-in and save intern payloads', async ({ page }) => {
    await page.goto('/interns');
    await expect(page.locator('#interns .intern-card').first()).toBeVisible();

    await page.evaluate(() => {
      window.__signInRequests = 0;
      window.__savedMessages = [];
      window.skilfFirebase = {
        user: null,
        requireSignIn: async () => {
          window.__signInRequests += 1;
          return null;
        },
        saveCardMessage: async () => {
          throw new Error('Should not save before sign-in');
        },
      };
    });

    const firstCard = page.locator('#interns .intern-card').first();
    const send = firstCard.locator('.send-btn');
    await page.keyboard.press('Escape');
    await send.click();
    await expect(page.locator('.registration-modal')).toBeVisible();
    await expect(page.locator('.registration-modal')).toContainText('Only registered mentors, interns, and board members can send messages.');
    await expect(page.locator('.registration-modal a', { hasText: 'Mentor' })).toHaveAttribute('href', 'apply.html#mentor');
    await expect(page.locator('.registration-modal a', { hasText: 'Intern' })).toHaveAttribute('href', 'apply.html#intern');
    await expect(page.locator('.registration-modal a', { hasText: 'Board Member' })).toHaveAttribute('href', 'apply.html#board-member');
    await expect.poll(() => page.evaluate(() => window.__signInRequests)).toBe(0);

    await page.evaluate(() => {
      window.skilfFirebase = {
        user: { uid: 'test-user' },
        hasRegisteredRole: true,
        requireSignIn: async () => ({ uid: 'test-user' }),
        saveCardMessage: async (payload) => {
          window.__savedMessages.push(payload);
        },
      };
    });
    await page.locator('.registration-close').click();
    await send.click();
    await expect(send).toHaveText('Sent');
    const messages = await page.evaluate(() => window.__savedMessages);
    expect(messages).toHaveLength(1);
    expect(messages[0].targetType).toBe('intern');
    expect(messages[0].targetName.length).toBeGreaterThan(0);
    expect(messages[0].targetField.length).toBeGreaterThan(0);
    expect(messages[0].targetProject.length).toBeGreaterThan(0);
    expect(messages[0].message.length).toBeGreaterThan(0);
  });

  test('Firebase schema tracks registered sender roles', async () => {
    const firebaseSource = fs.readFileSync(path.join(__dirname, '..', 'skilf-firebase.js'), 'utf8');
    const rulesSource = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'firestore-schema.md'), 'utf8');

    expect(firebaseSource).toContain('userProfiles');
    expect(firebaseSource).toContain('"richkingsford@gmail.com": "mentor"');
    expect(firebaseSource).toContain('senderRoles');
    expect(rulesSource).toContain('match /userProfiles/{userId}');
    expect(rulesSource).toContain('isRegisteredSender()');
    expect(rulesSource).toContain('"intern", "scholarship", "board-member", "mentor", "hire"');
    expect(schemaSource).toContain('`userProfiles`');
    expect(schemaSource).toContain('`richkingsford@gmail.com` is seeded as `mentor`');
  });

  test('intern project data has complete visible and search tags', async () => {
    const dataPath = path.join(__dirname, '..', 'prospectivePartners.json');
    const treePath = path.join(__dirname, '..', 'skill-tree.json');
    const interns = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
    const validSkills = new Set(Object.values(tree).flat());

    expect(interns).toHaveLength(264);
    for (const intern of interns) {
      expect(intern.name.trim().length).toBeGreaterThan(0);
      expect(validSkills.has(intern.skill)).toBeTruthy();
      expect(intern.project.trim().length).toBeGreaterThan(0);
      expect(intern.region.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(intern.tags)).toBeTruthy();
      expect(intern.tags.length).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(intern.searchTags)).toBeTruthy();
      expect(intern.searchTags.length).toBeGreaterThanOrEqual(6);
      for (const tag of [...intern.tags, ...intern.searchTags]) {
        expect(typeof tag).toBe('string');
        expect(tag.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('all thumbnail batches are generated from the skill tree manifest', async () => {
    const manifestPath = path.join(__dirname, '..', 'assets', 'skilf-thumbnails', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.totalSkillTreeLeaves).toBe(66);
    expect(manifest.batchSize).toBe(30);
    expect(manifest.generatedItems).toBe(66);
    expect(manifest.batches).toHaveLength(3);
    for (const item of manifest.items) {
      expect(fs.existsSync(path.join(__dirname, '..', item.file))).toBeTruthy();
    }
  });

  // --- Post a skilf button removed ---
  test('Post a skilf button no longer exists', async ({ page }) => {
    await expect(page.locator('a.cta-outline', { hasText: 'Post a skilf' })).toHaveCount(0);
  });

  // --- Backlog item 4: Find a partner section with 6 cards ---
  test('Find a partner section has 6 cards', async ({ page }) => {
    await expect(page.locator('.section-title', { hasText: 'Find a partner' })).toBeVisible();
    await expect(page.locator('#partners .card')).toHaveCount(6);
    await expect(page.getByRole('link', { name: 'Hire or mentor an intern' })).toHaveAttribute('href', 'monetize.html');
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
    const mt = await page.getByRole('heading', { name: 'Hire proven Skilf interns' }).evaluate(el => getComputedStyle(el).marginTop);
    expect(parseInt(mt)).toBeGreaterThanOrEqual(40);
  });

  test('homepage showcases robotics and VR demo images', async ({ page }) => {
    await expect(page.locator('.showcase-panel')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Earn a Skilf by proving the work.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Turn your project into evidence companies can trust' })).toBeVisible();
    await expect(page.getByText('Robotics Skilf')).toHaveCount(0);
    await expect(page.getByText('VR App Skilf')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Skilf Ideas' })).toHaveAttribute('href', 'find-partner.html');
    await expect(page.getByRole('link', { name: 'Join the Board', exact: true })).toHaveAttribute('href', 'board-dashboard.html');
    await expect(page.getByRole('link', { name: 'Become a mentor' })).toHaveAttribute('href', 'monetize.html');
    await expect(page.getByRole('link', { name: 'Live app flow' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'User testing' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Design defense' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Become an intern' })).toHaveAttribute('href', 'apply.html?role=intern');
    await expect(page.getByRole('link', { name: 'Find a partner' }).first()).toHaveAttribute('href', 'find-partner.html');
    await expect(page.getByRole('link', { name: 'Mentor apprentices' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Join the board', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Explore Demo Day' })).toHaveAttribute('href', 'defense-day.html');

    await page.locator('img[src="assets/home-vr-app-defense.png"]').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      return [...document.querySelectorAll('.showcase-media img')].every(img => img.complete && img.naturalWidth > 0);
    });
  });

  test('homepage card messages have a verified email function', async () => {
    const functionSource = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'send-message.js'), 'utf8');
    expect(functionSource).toContain('richkingsford@gmail.com');
    expect(functionSource).toContain('accounts:lookup');
    expect(functionSource).toContain('api.resend.com/emails');
  });

  test('Find a Partner page exists as a blank destination', async ({ page }) => {
    await page.goto('/find-partner.html');
    await expect(page.getByRole('heading', { name: 'Find a Partner' })).toBeVisible();
    await expect(page.locator('main p')).toHaveText('');
  });

  // --- Top grid title and tagline ---
  test('top grid titled "Hire proven Skilf interns" with tagline', async ({ page }) => {
    await expect(page.locator('h1.app-title')).toHaveCount(0);
    await expect(page.locator('h2.section-title').first()).toHaveText('Hire proven Skilf interns');
    await expect(page.locator('.tagline')).toContainText('paid or unpaid roles start with evidence');
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

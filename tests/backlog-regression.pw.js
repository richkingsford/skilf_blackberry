const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Backlog regression', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('production batch 1 has secret templates and preview write guards', async () => {
    const root = path.join(__dirname, '..');
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    const netlifyIgnore = fs.readFileSync(path.join(root, '.netlifyignore'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const netlifyConfig = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
    const firebaseAdmin = fs.readFileSync(path.join(root, 'netlify', 'functions', '_firebase-admin.js'), 'utf8');
    const sendMessage = fs.readFileSync(path.join(root, 'netlify', 'functions', 'send-message.js'), 'utf8');
    const browserFirebase = fs.readFileSync(path.join(root, 'skilf-firebase.js'), 'utf8');

    expect(gitignore).toContain('.env*');
    expect(gitignore).toContain('!.env.example');
    expect(netlifyIgnore).toContain('.env*');
    expect(netlifyIgnore).toContain('.secrets/');
    expect(netlifyIgnore).toContain('artifacts/');
    expect(netlifyIgnore).toContain('tests/');
    for (const key of [
      'FIREBASE_SERVICE_ACCOUNT_JSON',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'ADMIN_ROLE_TOKEN',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'RESEND_API_KEY',
      'MESSAGE_TO_EMAIL',
      'MESSAGE_FROM_EMAIL',
      'SKILF_ALLOW_WRITES',
    ]) {
      expect(envExample).toContain(`${key}=`);
    }
    expect(packageJson.scripts['production:env-check']).toBe('node scripts/check-production-env.js');
    expect(packageJson.scripts['production:env-check:payments']).toBe('node scripts/check-production-env.js --include-payments');
    expect(packageJson.scripts['production:admin-token']).toBe('node scripts/generate-admin-token.js');
    expect(packageJson.scripts['production:set-email-env']).toBe('node scripts/set-email-env.js');
    expect(packageJson.scripts['production:message-smoke']).toBe('node scripts/send-production-message-smoke.js');
    expect(packageJson.scripts['production:deploy']).toBe('node scripts/deploy-production-clean.js');
    expect(netlifyConfig).toContain('[context.production.environment]');
    expect(netlifyConfig).toContain('SKILF_ALLOW_WRITES = "true"');
    expect(netlifyConfig).toContain('[context.deploy-preview.environment]');
    expect(netlifyConfig).toContain('[context.branch-deploy.environment]');
    expect(firebaseAdmin).toContain('function blockWritesIfDisabled()');
    expect(sendMessage).toContain('Production writes are disabled for this deployment.');
    expect(browserFirebase).toContain('function writesAllowedInThisDeployment()');
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

  test('homepage bottom pathway buttons are side by side', async ({ page }) => {
    const actions = page.locator('.home-final-actions');
    await expect(actions).toBeVisible();
    await expect(actions.getByRole('link', { name: 'Join intern waitlist' })).toHaveAttribute('href', 'apply.html#intern');
    await expect(actions.getByRole('link', { name: 'Offer mentorship' })).toHaveAttribute('href', 'apply.html#mentor');
    await expect(actions.getByRole('link', { name: 'Hire or host interns' })).toHaveAttribute('href', 'apply.html#hire');
    await expect(actions.locator('.cta')).toHaveCount(3);
    await expect(actions).toHaveCSS('display', 'flex');
    await expect(page.getByRole('link', { name: /Begin your own Skilf adventure/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Apply for a scholarship' })).toHaveCount(0);
  });

  test('homepage omits the top role table', async ({ page }) => {
    await expect(page.locator('.clarity-strip')).toHaveCount(0);
    await expect(page.locator('.clarity-cell')).toHaveCount(0);
  });

  test('homepage has a 4-letter resume claim checker with URL preload', async ({ page }) => {
    await page.goto('/index.html');
    const checker = page.locator('#claim-check');
    const headerChecker = page.locator('.site-claim-check');
    await expect(headerChecker.getByLabel('Claim checker code')).toHaveAttribute('placeholder', '4 letter code');
    await expect(checker.locator('#proof-code')).toHaveAttribute('placeholder', '4 letter code');
    await expect(checker).not.toContainText('WORK');
    await expect(checker).not.toContainText('dummy code');
    await expect(checker).not.toContainText('not wired yet');
    await expect(checker.locator('#proof-result')).toBeHidden();
    await expect(checker).not.toContainText('Enter a Skilf code to check a resume claim.');

    await page.goto('/?code=ABCD#claim-check');
    await expect(checker).toBeVisible();
    await expect(headerChecker.getByLabel('Claim checker code')).toHaveValue('ABCD');
    await expect(checker.getByRole('heading', { name: 'Resume claim checker' })).toBeVisible();
    await expect(checker.locator('#proof-code')).toHaveValue('ABCD');
    await expect(checker.locator('#proof-result')).toBeVisible();
    await expect(checker.getByText('Not verified')).toBeVisible();
    await expect(checker.getByText('We could not verify ABCD.')).toBeVisible();
    await expect(checker.getByRole('link', { name: /Try/ })).toHaveCount(0);

    await checker.locator('#proof-code').fill('NOPE');
    await checker.getByRole('button', { name: 'Confirm' }).click();
    await expect(checker.locator('#proof-code')).toHaveValue('NOPE');
    await expect(checker.getByText('We could not verify NOPE.')).toBeVisible();
    await expect(page).toHaveURL(/code=NOPE#claim-check$/);

    await headerChecker.getByLabel('Claim checker code').fill('SKLF');
    await headerChecker.getByLabel('Claim checker code').press('Enter');
    await expect(checker.locator('#proof-code')).toHaveValue('SKLF');
    await expect(checker.getByText('We could not verify SKLF.')).toBeVisible();
    await expect(page).toHaveURL(/code=SKLF#claim-check$/);
  });

  test('homepage ticker uses tech and science skilf types', async ({ page }) => {
    const tickerItems = await page.locator('#ticker span').allTextContents();
    expect(tickerItems).toEqual(expect.arrayContaining([
      'AI',
      'Computer Vision',
      'Robotics',
      'Quantum Hardware',
      'Materials Science',
      'Computational Biology',
      'Climate Informatics',
      'Drug Discovery',
    ]));
    expect(tickerItems).not.toContain('Anesthesiology');
    expect(tickerItems).not.toContain('Dentistry');
  });

  test('homepage no longer links to Google Forms', async ({ page }) => {
    await expect(page.locator('a[href*="google.com/forms"]')).toHaveCount(0);
    await expect(page.locator('.home-final-actions a[href^="apply.html"]').first()).toBeVisible();
  });

  test('homepage has global top navigation with logo', async ({ page }) => {
    const nav = page.locator('.site-nav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.site-logo')).toHaveAttribute('src', 'assets/skilf-logo-solo-defense-refined.svg');
    await expect(nav.getByRole('link', { name: 'Interns' })).toHaveAttribute('href', 'interns');
    await expect(nav.getByRole('link', { name: 'Hire', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Demo Day' })).toHaveAttribute('href', 'defense-day.html');
    await expect(nav.getByRole('link', { name: 'Board Members' })).toHaveAttribute('href', 'board-dashboard.html');
    await expect(nav.getByRole('link', { name: 'Mentors' })).toHaveAttribute('href', 'monetize.html');
    const topAdventure = nav.locator('.site-adventure summary');
    await expect(topAdventure).toHaveText('Get Started');
    await expect(topAdventure).toHaveCSS('padding-top', '9px');
    await expect(topAdventure).toHaveCSS('border-top-left-radius', '8px');
    await topAdventure.click();
    const adventureMenu = nav.locator('.site-adventure-menu');
    await expect(adventureMenu.locator('.site-adventure-label')).toHaveText('Choose a path');
    await expect(adventureMenu.getByRole('menuitem', { name: 'Join intern waitlist' })).toHaveAttribute('href', 'apply.html#intern');
    await expect(adventureMenu.getByRole('menuitem', { name: 'Request support' })).toHaveAttribute('href', 'apply.html#scholarship');
    await expect(adventureMenu.getByRole('menuitem', { name: 'Join reviewer board' })).toHaveAttribute('href', 'apply.html#board-member');
    await expect(adventureMenu.getByRole('menuitem', { name: 'Offer mentorship' })).toHaveAttribute('href', 'apply.html#mentor');
    await expect(adventureMenu.getByRole('menuitem', { name: 'Hire or host interns' })).toHaveAttribute('href', 'apply.html#hire');
    await expect(adventureMenu.getByRole('menuitem', { name: 'Send feedback' })).toHaveAttribute('href', 'apply.html#feedback');
    await expect(nav.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(nav.locator('[data-auth-profile]')).toBeHidden();
    await expect(nav.locator('[data-auth-menu]')).toBeHidden();
    await expect(nav.locator('[data-auth-action="sign-out"]')).toBeHidden();
    await expect(nav.locator('[data-auth-status]')).toBeHidden();
    await expect(nav.getByRole('link', { name: 'Board', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Partners' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Student' })).toHaveCount(0);
  });

  test('site pages share a footer with core page links', async () => {
    const root = path.join(__dirname, '..');
    const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
    const footerLinks = [
      'href="index.html"',
      'href="interns"',
      'href="defense-day.html"',
      'href="board-dashboard.html"',
      'href="monetize.html"',
      'href="find-partner.html"',
      'href="faq.html"',
      'href="privacy.html"',
    ];

    for (const file of pages) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      const footer = source.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] || "";
      expect(footer, `${file} should include the shared footer`).toContain('<footer class="site-footer">');
      for (const link of footerLinks) {
        expect(footer, `${file} footer should include ${link}`).toContain(link);
      }
      expect(footer, `${file} footer should not include the adventure form link`).not.toContain('href="apply.html"');
    }
  });

  test('fixed quick actions appear on every page with feedback and adventure options', async ({ page }) => {
    const root = path.join(__dirname, '..');
    const pages = fs.readdirSync(root).filter((file) => file.endsWith('.html'));

    for (const file of pages) {
      await page.goto(`/${file}`);
      const fixed = page.locator('[data-fixed-actions]');
      await expect(fixed, `${file} should render fixed quick actions`).toBeVisible();
      await expect(fixed).toHaveCSS('gap', '24px');
      await expect(fixed).toHaveCSS('padding-top', '16px');
      await expect(fixed).toHaveCSS('padding-left', '18px');
      await expect(fixed.locator('.site-fixed-btn').first()).toHaveCSS('min-width', '112px');
      await expect(fixed.locator('.site-fixed-btn').first()).toHaveCSS('padding-top', '7.5px');
      await expect(fixed.locator('summary')).toHaveCSS('min-width', '150px');
      await expect(fixed.getByRole('link', { name: 'Send feedback' })).toHaveAttribute('href', 'apply.html#feedback');
      await expect(fixed.locator('summary')).toHaveText('Get Started');
      await fixed.locator('summary').click();
      await expect(fixed.locator('.site-adventure-label')).toHaveText('Choose a path');
      await expect(fixed.getByRole('menuitem', { name: 'Join intern waitlist' })).toHaveAttribute('href', 'apply.html#intern');
      await expect(fixed.getByRole('menuitem', { name: 'Offer mentorship' })).toHaveAttribute('href', 'apply.html#mentor');
      await expect(fixed.getByRole('menuitem', { name: 'Send feedback' })).toHaveAttribute('href', 'apply.html#feedback');
    }
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
    await expect(card.locator('.send-login-prompt')).toContainText('Sign in with Google. Only registered mentors, interns, and board members can send messages.');
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
    await expect(page.getByRole('heading', { name: 'Join the Skilf waitlist' })).toBeVisible();
    await expect(page.locator('main > .lead')).toContainText('route interns, mentors, reviewer-board candidates, hiring partners');
    await expect(page.locator('select[name="role"] option')).toHaveCount(6);
    await expect(page.locator('select[name="role"] option[value="scholarship"]')).toHaveText('Request support');
    await expect(page.locator('select[name="role"] option[value="mentor"]')).toHaveText('Offer mentorship');
    await expect(page.locator('select[name="role"] option[value="hire"]')).toHaveText('Hire or host interns');
    await expect(page.locator('select[name="role"] option[value="feedback"]')).toHaveText('Send feedback');
    await expect(page.locator('input[name="phone"]')).toHaveCount(0);
    await expect(page.locator('input[name="organization"]')).toHaveCount(0);
    await expect(page.locator('input[name="skilf_interest"]')).toHaveCount(0);
    await expect(page.locator('.note')).toHaveCount(0);
  });

  test('application form adapts to selected intent', async ({ page }) => {
    await page.goto('/apply.html');
    await expect(page.locator('[data-project-label]')).toHaveText('What do you want to build or prove?');
    await expect(page.locator('[data-intent-note]')).toContainText('Intern means anyone pursuing a Skilf');
    await expect(page.locator('[data-intent-note]')).toContainText('Join the waitlist');
    await page.selectOption('[data-intent-select]', 'board-member');
    await expect(page.locator('[data-project-label]')).toHaveText('What expertise can you use to evaluate Demo Day work?');
    await expect(page.locator('[data-intent-note]')).toContainText('make pass/fail calls');
    await expect(page.locator('[data-kind-input]')).toHaveValue('board-member');
    await page.selectOption('[data-intent-select]', 'mentor');
    await expect(page.locator('[data-project-label]')).toHaveText('How would you like to mentor interns?');
    await expect(page.locator('[data-intent-note]')).toContainText('Mentors help interns');
    await expect(page.locator('.submit-btn')).toHaveText('Offer mentorship');
    await page.selectOption('[data-intent-select]', 'scholarship');
    await expect(page.locator('[data-project-label]')).toHaveText('What would support help you build or prove?');
    await expect(page.locator('[data-kind-input]')).toHaveValue('scholarship');
    await expect(page.locator('.submit-btn')).toHaveText('Request support');
    await page.selectOption('[data-intent-select]', 'hire');
    await expect(page.locator('[data-project-label]')).toHaveText('What kind of internship or project work can you offer?');
    await expect(page.locator('[data-kind-input]')).toHaveValue('hire');
    await expect(page.locator('.submit-btn')).toHaveText('Talk about hiring');
    await page.selectOption('[data-intent-select]', 'feedback');
    await expect(page.locator('[data-project-label]')).toHaveText('What feedback would you like to send to the Skilf organization?');
    await expect(page.locator('[data-intent-note]')).toContainText('goes directly to the Skilf organization');
    await expect(page.locator('[data-intent-note]')).toContainText('not sent to an intern, mentor, or board member');
    await expect(page.locator('[data-kind-input]')).toHaveValue('feedback');
    await expect(page.locator('.submit-btn')).toHaveText('Send feedback');
    await page.goto('/apply.html#scholarship');
    await expect(page.locator('[data-intent-select]')).toHaveValue('scholarship');
    await page.goto('/apply.html#hire');
    await expect(page.locator('[data-intent-select]')).toHaveValue('hire');
    await page.goto('/apply.html#feedback');
    await expect(page.locator('[data-intent-select]')).toHaveValue('feedback');
  });

  test('Interns page supports search, skill tree filtering, and thumbnails', async ({ page }) => {
    await page.goto('/interns');
    await expect(page.getByRole('heading', { name: 'Interns', exact: true })).toBeVisible();
    await expect(page.locator('.lead')).toHaveText('A Skilf intern is anyone earning a Skilf through real project evidence. There are no lighter project tiers: the rigor level is always enough to support a post-high-school full-time job in a technically rigorous industry, and each review accepts one public YouTube video between 30 and 60 seconds.');
    await expect(page.getByRole('heading', { name: 'Mentor a Skilf intern' })).toBeVisible();
    await expect(page.locator('img[src="assets/interns-mentor-hero.png"]')).toBeVisible();
    await expect(page.getByText('A Skilf intern is anyone earning a Skilf')).toHaveCount(1);
    await expect(page.getByText('A real role with an experienced person')).toBeVisible();
    await expect(page.locator('[data-visual-count]')).toHaveText('66');
    await expect(page.getByRole('heading', { name: 'Find Skilf interns' })).toBeVisible();
    await expect(page.getByText('including one-person companies')).toBeVisible();
    await expect(page.getByText('send a message from an intern card')).toBeVisible();
    await expect(page.locator('.intern-cta-sections')).toBeVisible();
    await expect(page.locator('.intern-cta-row')).toHaveCSS('flex-wrap', 'nowrap');
    await expect(page.locator('.intern-cta-row')).toHaveCSS('margin-top', '76px');
    await expect(page.locator('.intern-cta-row .intern-cta').first()).toHaveCSS('min-width', '180px');
    await expect(page.locator('.intern-cta-panel')).toHaveCount(3);
    await expect(page.locator('.intern-cta-panel').first()).toHaveCSS('border-top-style', 'none');
    await expect(page.locator('.intern-cta-panel').nth(1).locator('.intern-cta-image')).toHaveCSS('order', '2');
    await expect(page.locator('.intern-cta-kicker')).toHaveCount(0);
    await expect(page.locator('.intern-cta-progress')).toHaveCount(0);
    await expect(page.locator('.intern-cta-panel img[src="assets/intern-cta-become.png"]')).toBeVisible();
    await expect(page.locator('.intern-cta-panel img[src="assets/intern-cta-mentor.png"]')).toBeVisible();
    await expect(page.locator('.intern-cta-panel img[src="assets/intern-cta-hire.png"]')).toBeVisible();
    await expect(page.locator('.intern-cta-panel .panel-cta')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Four check-ins, then Demo Day' })).toBeVisible();
    await expect(page.getByText('Interns move through monthly check-ins')).toBeVisible();
    await expect(page.getByText('one public 30-60 second YouTube video as the official artifact')).toBeVisible();
    await expect(page.getByRole('heading', { name: "Change an intern's life" })).toBeVisible();
    await expect(page.getByText('Good mentorship helps interns')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Give talent a serious arena' })).toBeVisible();
    const h2Texts = await page.locator('h2').allTextContents();
    expect(h2Texts.filter((text) => text.trim().endsWith('.'))).toEqual([]);
    await expect(page.locator('.batch-section')).toHaveCount(0);
    await expect(page.locator('[data-thumbnail-batches]')).toHaveCount(0);
    await expect(page.locator('#intern-search')).not.toBeFocused();
    await expect(page.locator('#intern-tree')).not.toHaveClass(/open/);
    const filterButton = page.getByRole('button', { name: 'Open skill filters' });
    await expect(filterButton).toBeVisible();
    await expect(page.locator('#interns .intern-card')).toHaveCount(6);
    await expect(page.locator('#interns .intern-card .calendly-link')).toHaveCount(6);
    await expect(page.locator('#interns .intern-card .calendly-link').first()).toHaveAttribute('href', /https:\/\/calendly\.com\/richkingsford\/30m\?.*utm_source=skilf/);
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
      'I would like to learn more about this project.',
      'I can offer mentorship on this project.',
      'I may have a hiring opportunity for this intern.',
      'I would like to discuss a collaboration.',
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
    await expect(page.locator('.intern-cta-row a', { hasText: 'Join intern waitlist' })).toHaveAttribute('href', 'apply.html#intern');
    await expect(page.locator('.intern-cta-row a', { hasText: 'Offer mentorship' })).toHaveAttribute('href', 'apply.html#mentor');
    await expect(page.locator('.intern-cta-row a', { hasText: 'Hire or host interns' })).toHaveAttribute('href', '#hire-interns');
    await expect(page.locator('.intern-cta-panel .panel-cta', { hasText: 'Join intern waitlist' })).toHaveAttribute('href', 'apply.html#intern');
    await expect(page.locator('.intern-cta-panel .panel-cta', { hasText: 'Offer mentorship' })).toHaveAttribute('href', 'apply.html#mentor');
    await expect(page.locator('.intern-cta-panel .panel-cta', { hasText: 'Hire or host interns' })).toHaveAttribute('href', '#hire-interns');
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
    expect(firebaseSource).toContain('const OWNER_EMAIL = "richkingsford@gmail.com"');
    expect(firebaseSource).toContain('OWNER_ROLES = ["admin", "board-member", "mentor", "intern"]');
    expect(firebaseSource).toContain('ADMIN_LINKS');
    expect(firebaseSource).toContain('admin.html');
    expect(firebaseSource).toContain('board-member-dashboard.html');
    expect(firebaseSource).toContain('saveDashboardAction');
    expect(firebaseSource).toContain('/.netlify/functions/record-dashboard-action');
    expect(firebaseSource).toContain('senderRoles');
    expect(rulesSource).toContain('match /userProfiles/{userId}');
    expect(rulesSource).toContain('function isRichOwner()');
    expect(rulesSource).toContain('match /dashboardActions/{actionId}');
    expect(rulesSource).toContain('allow read, create, update, delete: if false;');
    expect(rulesSource).toContain('hasAnyRegisteredAuthority()');
    expect(rulesSource).toContain('"intern", "scholarship", "board-member", "mentor", "hire", "feedback"');
    expect(schemaSource).toContain('`userProfiles`');
    expect(schemaSource).toContain('`richkingsford@gmail.com` has admin, board-member, mentor, and intern authority');
    expect(schemaSource).toContain('suspendedRoles');
    expect(schemaSource).toContain('`dashboardActions`');
    expect(schemaSource).toContain('`creditLedger`');
    expect(schemaSource).toContain('Feedback submissions are organization-directed intake');
    const adminHelper = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', '_firebase-admin.js'), 'utf8');
    const roleFunction = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'admin-set-user-roles.js'), 'utf8');
    const dashboardFunction = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'record-dashboard-action.js'), 'utf8');
    expect(adminHelper).toContain('OWNER_EMAIL = "richkingsford@gmail.com"');
    expect(adminHelper).toContain('rolesFromClaims');
    expect(adminHelper).toContain('verifyIdToken(token, true)');
    expect(roleFunction).toContain('setCustomUserClaims');
    expect(roleFunction).toContain('suspendedRoles');
    expect(roleFunction).toContain('revokeRefreshTokens');
    expect(dashboardFunction).toContain('runTransaction');
    expect(dashboardFunction).toContain('mentorDonationCredits');
    expect(dashboardFunction).toContain('pass-demo');
  });

  test('admin page governs email-first permissions and suspension', async ({ page }) => {
    const adminSource = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    const roleFunction = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'admin-set-user-roles.js'), 'utf8');
    const rulesSource = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

    await page.goto('/admin.html');
    await expect(page.getByRole('heading', { name: 'Permissions and account safety' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin sign-in required' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in as admin' })).toBeVisible();
    await expect(page.locator('[data-admin-console]')).toBeHidden();

    expect(adminSource).toContain('data-admin-email');
    expect(adminSource).toContain('value="admin"');
    expect(adminSource).toContain('value="board-member"');
    expect(adminSource).toContain('data-admin-suspended');
    expect(adminSource).toContain('Only active registered interns, mentors, and board members can send messages.');
    expect(roleFunction).toContain('authorizeAdmin');
    expect(roleFunction).toContain('lookupOnly');
    expect(roleFunction).toContain('disabled: suspended');
    expect(roleFunction).toContain('suspendedReason');
    expect(rulesSource).toContain('request.auth.token.suspended != true');
    expect(rulesSource).toContain('userProfileEditableKeys');
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

  test('mentor, board, and intern dashboards expose role workflows', async ({ page }) => {
    await page.goto('/mentor-dashboard.html');
    await expect(page.getByRole('heading', { name: 'Help two interns clear a real checkpoint' })).toBeVisible();
    await expect(page.getByText('2 monthly check-in credits')).toBeVisible();
    await expect(page.getByText('2 mentor credits available')).toBeVisible();
    await expect(page.locator('[data-intern-results] .intern-card')).toHaveCount(9);
    await expect(page.locator('[data-intern-results] .intern-card').first().getByRole('link', { name: 'Monthly check-in' })).toHaveAttribute('href', /https:\/\/calendly\.com\/richkingsford\/30m\?.*utm_source=skilf/);
    await expect(page.locator('[data-action="donate-credit"]').first()).toHaveText('Donate credit');
    await expect(page.getByRole('heading', { name: 'Relationship boundaries' })).toBeVisible();
    await expect(page.getByText('more than 30 days late')).toBeVisible();
    await expect(page.locator('.actions').getByRole('link', { name: 'Intern policies' })).toHaveAttribute('href', 'intern-policies.html');

    await page.goto('/board-member-dashboard.html');
    await expect(page.getByRole('heading', { name: 'Review, mentor, and protect Demo Day' })).toBeVisible();
    await expect(page.getByText('same mentor tools')).toBeVisible();
    await expect(page.getByText('Pass/fail Demo Days')).toBeVisible();
    await expect(page.locator('[data-action="pass-demo"]')).toHaveText('Pass Demo Day');
    await expect(page.locator('[data-action="fail-demo"]')).toHaveText('Fail Demo Day');
    await expect(page.locator('[data-intern-results] .intern-card')).toHaveCount(9);

    await page.goto('/intern-dashboard.html');
    await expect(page.getByRole('heading', { name: 'Spend credits carefully. Earn Demo Day honestly.' })).toBeVisible();
    await expect(page.getByText('Credits are spent when you schedule a check-in')).toBeVisible();
    await expect(page.getByText('Every intern gets one credit each month')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sharper proof before every check-in' })).toBeVisible();
    await expect(page.locator('[data-success-slide]')).toHaveCount(20);
    await expect(page.getByText('Make one public 45-second proof video')).toBeVisible();
    const successCopy = await page.locator('[data-success-carousel]').textContent();
    expect(successCopy).toContain('Paste the check-in rubric and your project summary');
    expect(successCopy).toContain('Use Python even if you are not a programmer');
    expect(successCopy).toContain('Use VS Code with AI extensions');
    expect(successCopy).toContain('AI-generated images or video');
    const tipImages = await page.locator('[data-success-slide] img').evaluateAll((images) => images.map((image) => ({ src: image.getAttribute('src'), alt: image.getAttribute('alt') })));
    expect(new Set(tipImages.map((image) => image.src)).size).toBe(20);
    expect(tipImages.every((image) => image.src.includes('assets/intern-success-tip-'))).toBeTruthy();
    expect(tipImages.every((image) => image.alt && image.alt.length > 20)).toBeTruthy();
    await page.getByRole('button', { name: 'Next tip' }).click();
    await expect(page.locator('[data-tip-count]')).toHaveText('2 / 20');
    await page.waitForTimeout(320);
    const tipLayout = await page.evaluate(() => {
      const windowBox = document.querySelector('.tip-window').getBoundingClientRect();
      const slide = document.querySelector('[data-tip-index="1"]').getBoundingClientRect();
      const image = document.querySelector('[data-tip-index="1"] img').getBoundingClientRect();
      const copy = document.querySelector('[data-tip-index="1"] .tip-copy').getBoundingClientRect();
      return [slide, image, copy].every((box) => box.left >= windowBox.left - 2 && box.right <= windowBox.right + 2);
    });
    expect(tipLayout).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Schedule Demo Day' })).toBeVisible();
    await expect(page.getByText('Locked until check-in #4 passes')).toBeVisible();
    await expect(page.getByText('After passing 2 check-ins')).toHaveCount(2);
    await expect(page.locator('[data-action="become-mentor"]')).toHaveText('Request mentor unlock');
  });

  test('intern policies and payments pages document new operations', async ({ page }) => {
    await page.goto('/intern-policies.html');
    await expect(page.getByRole('heading', { name: 'Intern Policies', level: 1 })).toBeVisible();
    await expect(page.getByText('Every intern receives 1 monthly credit')).toBeVisible();
    await expect(page.getByText('An intern can request mentor status after passing 2 monthly check-ins')).toBeVisible();
    await expect(page.getByText('Intern/mentor relationships expire')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Evidence video' })).toBeVisible();
    await expect(page.getByText('exactly one official evidence, presentation, and artifact format')).toBeVisible();
    await expect(page.getByText('30-60 seconds long')).toBeVisible();
    await expect(page.getByText('Webcam should be on for 100%')).toBeVisible();
    await expect(page.getByText('After 3 failed check-ins')).toBeVisible();

    await page.goto('/payments.html');
    await expect(page.getByRole('heading', { name: 'Pay for check-ins, Demo Day, or sponsorships' })).toBeVisible();
    await expect(page.getByText('Stripe Checkout')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Pay check-in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay Demo Day' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sponsor credit' })).toBeVisible();
    const functionSource = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'create-checkout-session.js'), 'utf8');
    expect(functionSource).toContain('STRIPE_SECRET_KEY');
    expect(functionSource).toContain('checkout.sessions.create');
    const webhookSource = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'stripe-webhook.js'), 'utf8');
    expect(webhookSource).toContain('STRIPE_WEBHOOK_SECRET');
    expect(webhookSource).toContain('webhooks.constructEvent');
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

  test('intern CTA PNG assets exist', async () => {
    for (const filename of ['intern-cta-become.png', 'intern-cta-mentor.png', 'intern-cta-hire.png']) {
      const assetPath = path.join(__dirname, '..', 'assets', filename);
      expect(fs.existsSync(assetPath)).toBeTruthy();
      expect(fs.statSync(assetPath).size).toBeGreaterThan(250000);
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
    await expect(page.locator('.home-final-actions').getByRole('link', { name: 'Offer mentorship' })).toHaveAttribute('href', 'apply.html#mentor');
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
    const mt = await page.getByRole('heading', { name: 'Hire for proof, not pedigree' }).evaluate(el => getComputedStyle(el).marginTop);
    expect(parseInt(mt)).toBeGreaterThanOrEqual(40);
  });

  test('homepage showcases robotics and VR demo images', async ({ page }) => {
    await expect(page.locator('.showcase-panel')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Build honest evidence. Earn a Skilf.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Turn a project into evidence' })).toBeVisible();
    await expect(page.getByText('Robotics Skilf')).toHaveCount(0);
    await expect(page.getByText('VR App Skilf')).toHaveCount(0);
    const roboticsActions = page.locator('.robotics-showcase .showcase-actions');
    await expect(roboticsActions.getByRole('link', { name: 'Explore project ideas' })).toHaveAttribute('href', 'find-partner.html');
    await expect(roboticsActions.getByRole('link', { name: 'Join reviewer board', exact: true })).toHaveAttribute('href', 'apply.html#board-member');
    await expect(roboticsActions.getByRole('link', { name: 'Offer mentorship' })).toHaveAttribute('href', 'apply.html#mentor');
    await expect(page.getByRole('link', { name: 'Live app flow' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'User testing' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Design defense' })).toHaveCount(0);
    const vrActions = page.locator('.vr-showcase .showcase-actions');
    await expect(vrActions.getByRole('link', { name: 'Join intern waitlist' })).toHaveAttribute('href', 'apply.html?role=intern');
    await expect(vrActions.getByRole('link', { name: 'Find a partner' })).toHaveAttribute('href', 'find-partner.html');
    await expect(page.getByRole('link', { name: 'Mentor interns' })).toHaveCount(0);
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
    expect(functionSource).toContain('requireUser');
    expect(functionSource).toContain('Only active registered interns, mentors, and board members can send messages.');
    expect(functionSource).toContain('api.resend.com/emails');
  });

  test('Find a Partner page exists as a blank destination', async ({ page }) => {
    await page.goto('/find-partner.html');
    await expect(page.getByRole('heading', { name: 'Find a Partner' })).toBeVisible();
    await expect(page.locator('main p')).toHaveText('');
  });

  test('Defense Day page explains failures, rubric, and retry rules', async ({ page }) => {
    await page.goto('/defense-day.html');
    await expect(page).toHaveTitle('Demo Day - Skilf');
    await expect(page.getByRole('heading', { name: 'Demo Day', level: 1 })).toBeVisible();
    await expect(page.getByText('AI is welcome. Fake proof is not.')).toBeVisible();
    await expect(page.getByText('honest evidence, sound judgment')).toBeVisible();
    await expect(page.getByText('The single 30-60 second public YouTube video shows the strongest proof')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Common mistakes' })).toBeVisible();
    await expect(page.locator('.mistake-row')).toHaveCount(15);
    await expect(page.getByText('Not every intern passes every checkpoint')).toBeVisible();
    await expect(page.getByText('Unreliable live demo')).toBeVisible();
    await expect(page.getByText('42%')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'If you fail monthly check-in #4' })).toBeVisible();
    await expect(page.getByText('passing check-in before greenlighting Demo Day')).toBeVisible();
    await expect(page.getByText('every additional check-in meeting still costs $100 or one monthly check-in credit')).toBeVisible();
    await expect(page.getByText('only accepted evidence, presentation, and artifact format is a single public YouTube video')).toBeVisible();
    await expect(page.getByText('between 30 and 60 seconds')).toBeVisible();
    await expect(page.getByText('one free, one-time audit')).toBeVisible();
    await expect(page.getByText('protect interns by preventing repeated paid attempts')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'You control the timeline, with Skilf boundaries' })).toBeVisible();
    await expect(page.getByText('pass/fail outcomes, cash, credits, sponsorship')).toBeVisible();
    await expect(page.locator('.roadmap-card')).toHaveCount(10);
    await expect(page.locator('.timeline-step')).toHaveCount(57);
    await expect(page.getByText('Best case: sponsored')).toBeVisible();
    await expect(page.getByText('$0 out of pocket')).toBeVisible();
    await expect(page.getByText('Straight four-check path')).toBeVisible();
    await expect(page.getByText('Mentor-backed sprint')).toBeVisible();
    await expect(page.getByText('Company-sponsored intern')).toBeVisible();
    await expect(page.getByText('Fourth-gate repair')).toBeVisible();
    await expect(page.getByText('Delay gets expensive')).toBeVisible();
    await expect(page.getByText('Three-fail soft wall')).toBeVisible();
    await expect(page.getByText('Six-fail hard wall')).toBeVisible();
    await expect(page.getByText('$1,100+ + 1 year')).toBeVisible();
    await expect(page.getByText('Pass: credit used')).toHaveCount(6);
    await expect(page.getByText('Fail: fourth gate')).toBeVisible();
    await expect(page.getByText('Credit expires unused')).toBeVisible();
    await expect(page.getByText('Six-month wait')).toBeVisible();
    await expect(page.getByText('One-year wall begins')).toBeVisible();
    await expect(page.getByText('Costs keep rising')).toBeVisible();
    await expect(page.getByText('minus one check-in credit')).toHaveCount(2);

    await expect(page.getByRole('heading', { name: 'Check-in rubric' })).toBeVisible();
    await expect(page.locator('.rubric-card')).toHaveCount(6);
    await expect(page.locator('.score-pill')).toHaveCount(6);
    await expect(page.locator('.score-pill')).toHaveText(Array(6).fill('0-100%'));
    await expect(page.getByText('Working artifact')).toBeVisible();
    await expect(page.getByText('Technical reasoning')).toHaveCount(0);
    await expect(page.getByText('Communication under pressure')).toHaveCount(0);
    await expect(page.getByText('A 75% total score is the pass/fail cutoff.')).toBeVisible();
    await expect(page.getByRole('heading', { name: "It's ok to make mistakes" })).toBeVisible();
    await expect(page.getByText('can be delayed up to 30 days without consequence')).toHaveCount(2);
    await expect(page.getByText('protects mentors and reviewers from repeated low-signal meetings')).toBeVisible();
    await expect(page.getByText('After 3 failed check-ins')).toBeVisible();
    await expect(page.getByText('wait 6 months before the next check-in')).toBeVisible();
    await expect(page.getByText('After 6 failed check-ins')).toBeVisible();
    await expect(page.getByText('1 year wall')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Counterfeit evidence' })).toBeVisible();
    await expect(page.getByText('anything that makes the project look more real')).toBeVisible();
    await expect(page.getByText('The easiest way to avoid this perception is one public YouTube video')).toBeVisible();
    await expect(page.getByText('30-60 seconds long, posted within 24 hours before the review')).toBeVisible();
    await expect(page.getByText('webcam on for 100%')).toBeVisible();
    await expect(page.getByText('screen sharing and live footage')).toBeVisible();
    await expect(page.getByText('copied code without attribution')).toBeVisible();
    await expect(page.getByText('AI-generated explanations the intern cannot defend')).toBeVisible();
    await expect(page.getByText('Post one public YouTube video')).toBeVisible();
    await expect(page.getByText('credit outside help')).toBeVisible();
    await expect(page.getByText('what is prototype, borrowed, simulated, or unfinished')).toBeVisible();
    await expect(page.getByText('These sections fill in the practical gaps')).toHaveCount(0);
    await expect(page.getByText('Monthly check-ins may use one qualified reviewer')).toHaveCount(0);
    await expect(page.getByText('Monthly check-ins use one qualified reviewer')).toBeVisible();
    await expect(page.getByText('A failed monthly check-in or Demo Day does not erase progress.')).toBeVisible();
    await expect(page.getByText('Bring one public YouTube link posted within the required window')).toBeVisible();
    await expect(page.locator('.policy-card')).toHaveCount(10);
    await expect(page.locator('.cta-row').getByRole('link', { name: 'Find a partner' })).toHaveAttribute('href', 'interns#hire-interns');
    await expect(page.locator('.cta-row').getByRole('link', { name: 'Start my Skilf project' })).toHaveAttribute('href', 'apply.html#intern');
    await expect(page.getByRole('link', { name: 'Begin your Skilf adventure' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Preview student dashboard' })).toHaveCount(0);
  });

  test('Board Members page explains board service and payment structure', async ({ page }) => {
    await page.goto('/board-dashboard.html');
    await expect(page.getByRole('heading', { name: 'Board Members', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Board Dashboard' })).toHaveCount(0);
    await expect(page.locator('.lead')).toContainText('paid or volunteer reviewers');
    await expect(page.locator('.lead')).toContainText('pass/fail calls');
    await expect(page.locator('.lead')).toContainText('protect interns, reviewers, employers');
    await expect(page.locator('.section').first()).toHaveCSS('margin-top', '72px');
    await expect(page.getByRole('heading', { name: 'What board members do' })).toBeVisible();
    await expect(page.getByText('Spend 15 minutes with an intern')).toBeVisible();
    await expect(page.getByText('pass or fail the check-in')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Use the same evidence standard' })).toBeVisible();
    await expect(page.getByText('one public YouTube video, 30-60 seconds long')).toBeVisible();
    await expect(page.getByText('posted within 24 hours before the check-in or Demo Day')).toBeVisible();
    await expect(page.getByText('webcam on for 100%')).toBeVisible();
    await expect(page.getByText('AI-generated explanations the intern cannot defend')).toBeVisible();
    await expect(page.getByText('Do not grade accent, background, confidence')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Score the same six signals' })).toBeVisible();
    await expect(page.locator('.rubric-pill')).toHaveCount(6);
    await expect(page.getByText('75% is the pass/fail cutoff')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payment and volunteer options' })).toBeVisible();
    await expect(page.getByText('Compensation details come after fit')).toBeVisible();
    await expect(page.getByText('Flat fee per 15-minute check-in visit')).toBeVisible();
    await expect(page.getByText('Phone call or Zoom is fine')).toBeVisible();
    await expect(page.getByText('cameras can be on or off')).toBeVisible();
    await expect(page.getByText('Every extra check-in still costs the intern $100 or one qualified check-in credit')).toBeVisible();
    await expect(page.getByText('Flat fee per Demo Day appearance')).toBeVisible();
    await expect(page.getByText('negotiated when you are hired')).toBeVisible();
    await expect(page.getByText('only after a passing fourth check-in')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Boundaries protect everyone' })).toBeVisible();
    await expect(page.getByText('minus one check-in credit')).toBeVisible();
    await expect(page.getByText('After 3 failed check-ins')).toBeVisible();
    await expect(page.getByText('waits 6 months')).toBeVisible();
    await expect(page.getByText('After 6 failed check-ins')).toBeVisible();
    await expect(page.getByText('wall is 1 year')).toBeVisible();
    await expect(page.getByText('82% pass')).toBeVisible();
    await expect(page.getByText('Revise public video evidence')).toBeVisible();
    await expect(page.getByText('Mentor-sponsored check-in')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join reviewer board' }).first()).toHaveAttribute('href', 'apply.html#board-member');
    await expect(page.getByRole('link', { name: 'Join reviewer board', exact: true }).first()).toHaveAttribute('href', 'apply.html#board-member');
    await expect(page.getByRole('link', { name: 'Donate a check-in' })).toHaveAttribute('href', 'apply.html#scholarship');
  });

  test('FAQ and privacy pages are accessible destinations', async ({ page }) => {
    await page.goto('/faq.html');
    await expect(page.getByRole('heading', { name: 'FAQ', level: 1 })).toBeVisible();
    await expect(page.locator('.faq-list details')).toHaveCount(8);
    await expect(page.locator('.faq-list summary').first()).toHaveText('What is a Skilf?');
    await expect(page.getByText('It is earned through evidence, check-ins, and Demo Day review.')).toBeVisible();
    await page.locator('.faq-list details').nth(1).evaluate((el) => el.setAttribute('open', ''));
    await expect(page.getByText('We use intern for anyone pursuing a Skilf.')).toBeVisible();

    await page.goto('/privacy.html');
    await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible();
    await expect(page.getByText('Last updated: May 26, 2026')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What we collect' })).toBeVisible();
    await expect(page.getByText('official review artifact is one public YouTube video, 30-60 seconds long')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Message access' })).toBeVisible();
    await expect(page.getByText('Only active registered interns, mentors, and board members can send messages through Skilf.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Suspension and abuse review' })).toBeVisible();
    await expect(page.getByText('we may suspend or disable the account while we review it')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your choices' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'richkingsford@gmail.com' })).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'richkingsford@gmail.com' }).first()).toHaveAttribute('href', 'mailto:richkingsford@gmail.com');
  });

  // --- Top grid title and tagline ---
  test('top grid titled "Hire for proof, not pedigree" with tagline', async ({ page }) => {
    await expect(page.locator('h1.app-title')).toHaveCount(0);
    await expect(page.locator('h2.section-title').first()).toHaveText('Hire for proof, not pedigree');
    await expect(page.locator('.tagline')).toContainText('Hiring partners and mentors can search by project, skill, region, or Skilf ID');
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

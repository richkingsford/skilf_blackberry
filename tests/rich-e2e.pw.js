const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const RICH_EMAIL = 'richkingsford@gmail.com';
const RICH_ROLES = ['admin', 'board-member', 'mentor', 'intern'];
const RICH_MESSAGE_ROLES = ['board-member', 'mentor', 'intern'];

async function actAsRich(page) {
  await page.evaluate(({ email, roles }) => {
    window.__richDashboardActions = [];
    window.__richMessages = [];
    const user = {
      uid: 'rich-test-uid',
      email,
      displayName: 'Rich Kingsford',
      photoURL: '',
    };
    window.skilfFirebase = {
      ready: true,
      user,
      profile: {
        uid: user.uid,
        email,
        displayName: user.displayName,
        roles,
        primaryRole: 'admin',
        isRegistered: true,
      },
      registeredRoles: roles,
      hasRegisteredRole: true,
      requireSignIn: async () => user,
      saveCardMessage: async (payload) => {
        const message = {
          ...payload,
          authUid: user.uid,
          authEmail: email,
          senderRoles: roles.filter((role) => role !== 'admin'),
        };
        window.__richMessages.push(message);
        return { id: `message-${window.__richMessages.length}` };
      },
      saveDashboardAction: async (payload) => {
        const action = {
          ...payload,
          authUid: user.uid,
          authEmail: email,
          actorRoles: roles,
        };
        window.__richDashboardActions.push(action);
        return { id: `action-${window.__richDashboardActions.length}` };
      },
    };
  }, { email: RICH_EMAIL, roles: RICH_ROLES });
}

test.describe('Rich single-user role e2e', () => {
  test('Rich owner authority grants admin, intern, mentor, and board-member roles', async () => {
    const firebaseSource = fs.readFileSync(path.join(__dirname, '..', 'skilf-firebase.js'), 'utf8');
    const schemaSource = fs.readFileSync(path.join(__dirname, '..', 'docs', 'firestore-schema.md'), 'utf8');

    expect(firebaseSource).toContain('const OWNER_EMAIL = "richkingsford@gmail.com"');
    expect(firebaseSource).toContain('OWNER_ROLES = ["admin", "board-member", "mentor", "intern"]');
    expect(firebaseSource).toContain('if (roles.includes("admin")) return "admin.html"');
    expect(schemaSource).toContain('`richkingsford@gmail.com` has admin, board-member, mentor, and intern authority');
  });

  test('Rich can send an applicant card message as a registered all-role user', async ({ page }) => {
    await page.goto('/interns');
    await expect(page.locator('#interns .intern-card').first()).toBeVisible();
    await actAsRich(page);

    const firstCard = page.locator('#interns .intern-card').first();
    await firstCard.locator('.send-btn').click();

    await expect(firstCard.locator('.send-btn')).toHaveText('Sent');
    await expect(page.locator('.registration-modal')).toHaveCount(0);
    const messages = await page.evaluate(() => window.__richMessages);
    expect(messages).toHaveLength(1);
    expect(messages[0].authEmail).toBe(RICH_EMAIL);
    expect(messages[0].senderRoles).toEqual(RICH_MESSAGE_ROLES);
    expect(messages[0].targetType).toBe('intern');
    expect(messages[0].message.length).toBeGreaterThan(0);
  });

  test('Rich can donate mentor credits and offer mentoring', async ({ page }) => {
    await page.goto('/mentor-dashboard.html');
    await expect(page.locator('[data-intern-results] .intern-card')).toHaveCount(9);
    await actAsRich(page);

    await page.locator('[data-action="donate-credit"]').first().click();
    await expect(page.locator('[data-dashboard-status]')).toContainText('Credit sent to');
    await expect(page.locator('[data-credit-display="mentor"]')).toHaveText('1 mentor credit available');

    await page.locator('[data-action="offer-mentor"]').first().click();
    await expect(page.locator('[data-dashboard-status]')).toContainText('Mentor offer drafted');

    await page.locator('[data-action="donate-credit"]').nth(1).click();
    await expect(page.locator('[data-credit-display="mentor"]')).toHaveText('0 mentor credits available');
    await expect(page.locator('[data-action="donate-credit"]').first()).toBeDisabled();

    const actions = await page.evaluate(() => window.__richDashboardActions);
    expect(actions.map((action) => action.action)).toEqual(['donate-credit', 'offer-mentor', 'donate-credit']);
    expect(actions[0].authEmail).toBe(RICH_EMAIL);
    expect(actions[0].actorRoles).toEqual(RICH_ROLES);
    expect(actions[0].creditKind).toBe('mentor-monthly-check-in');
    expect(actions[0].creditDelta).toBe(-1);
  });

  test('Rich can use board pass/fail powers while retaining mentor access', async ({ page }) => {
    await page.goto('/board-member-dashboard.html');
    await expect(page.getByRole('heading', { name: 'Review, mentor, and protect Demo Day' })).toBeVisible();
    await actAsRich(page);

    await page.locator('[data-action="pass-demo"]').click();
    await expect(page.locator('[data-dashboard-status]')).toContainText('Demo Day pass decision recorded');
    await page.locator('[data-action="fail-demo"]').click();
    await expect(page.locator('[data-dashboard-status]')).toContainText('Demo Day fail decision recorded');
    await page.locator('[data-action="donate-credit"]').first().click();
    await expect(page.locator('[data-credit-display="mentor"]')).toHaveText('1 mentor credit available');

    const actions = await page.evaluate(() => window.__richDashboardActions);
    expect(actions.map((action) => action.action)).toEqual(['pass-demo', 'fail-demo', 'donate-credit']);
    expect(actions.every((action) => action.authEmail === RICH_EMAIL)).toBeTruthy();
    expect(actions[2].creditKind).toBe('mentor-monthly-check-in');
  });

  test('Rich can spend intern credits, give one away, and request mentor unlock', async ({ page }) => {
    await page.goto('/intern-dashboard.html');
    await expect(page.getByRole('heading', { name: 'Spend credits carefully. Earn Demo Day honestly.' })).toBeVisible();
    await actAsRich(page);

    await page.locator('[data-action="schedule-check-in"]').click();
    await expect(page.locator('[data-dashboard-status]')).toContainText('One check-in credit spent');
    await expect(page.locator('[data-credit-display="checkin"]')).toHaveText('1 available');

    await page.locator('[data-action="give-intern-credit"]').click();
    await expect(page.locator('[data-dashboard-status]')).toContainText('Give-away credit sent');
    await expect(page.locator('[data-credit-display="giveaway"]')).toHaveText('0 monthly credits');
    await expect(page.locator('[data-action="give-intern-credit"]')).toBeDisabled();

    await page.locator('[data-action="become-mentor"]').click();
    await expect(page.locator('[data-dashboard-status]')).toContainText('Mentor unlock request saved');

    const actions = await page.evaluate(() => window.__richDashboardActions);
    expect(actions.map((action) => action.action)).toEqual(['schedule-check-in', 'give-intern-credit', 'become-mentor']);
    expect(actions[0].creditKind).toBe('intern-check-in');
    expect(actions[0].creditDelta).toBe(-1);
    expect(actions[1].creditKind).toBe('intern-give-away');
    expect(actions[1].creditDelta).toBe(-1);
  });
});

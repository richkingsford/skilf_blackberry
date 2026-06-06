const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.SKILF_E2E_PORT || 3999);
const BASE_URL = `http://localhost:${PORT}`;
const OUT_DIR = path.join(ROOT, "artifacts", "full-e2e");
const VIDEO_DIR = path.join(OUT_DIR, "video-raw");
const MP4_PATH = path.join(OUT_DIR, "skilf-full-e2e-rich-all-roles.mp4");
const WEBM_PATH = path.join(OUT_DIR, "skilf-full-e2e-rich-all-roles.webm");
const COVERAGE_PATH = path.join(OUT_DIR, "coverage.json");

const RICH_EMAIL = "richkingsford@gmail.com";
const RICH_USER = {
  uid: "rich-e2e-uid",
  email: RICH_EMAIL,
  displayName: "Rich Kingsford",
  photoURL: "",
};
const ROLE_SETS = {
  intern: ["intern"],
  mentor: ["mentor"],
  board: ["board-member"],
  rich: ["admin", "board-member", "mentor", "intern"],
};
const ADVENTURE_HASHES = ["intern", "scholarship", "board-member", "mentor", "hire", "feedback"];
const APP_PAGES = [
  "index.html",
  "interns",
  "apply.html",
  "defense-day.html",
  "board-dashboard.html",
  "monetize.html",
  "mentor-dashboard.html",
  "board-member-dashboard.html",
  "intern-dashboard.html",
  "intern-policies.html",
  "payments.html",
  "faq.html",
  "privacy.html",
  "find-partner.html",
  "student-dashboard.html",
  "thanks.html",
  "logo-options.html",
  "logo-constellation-variants.html",
];

const skillTree = JSON.parse(fs.readFileSync(path.join(ROOT, "skill-tree.json"), "utf8"));
const skillLeaves = [...new Set(Object.values(skillTree).flatMap((value) => (
  Array.isArray(value) ? value : Object.values(value).flat()
)))];

const coverage = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  pagesVisited: [],
  clicks: [],
  messages: [],
  dashboardActions: [],
  payments: [],
  forms: [],
  notes: [],
};

function note(message) {
  coverage.notes.push({ at: new Date().toISOString(), message });
  console.log(message);
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function startServer() {
  if (await waitForServer(`${BASE_URL}/index.html`, 1500)) {
    note(`Reusing existing local server at ${BASE_URL}`);
    return null;
  }
  note(`Starting local static server at ${BASE_URL}`);
  const child = spawn("npx.cmd", ["serve", ".", "-l", String(PORT), "--no-clipboard"], {
    cwd: ROOT,
    stdio: "ignore",
    windowsHide: true,
  });
  if (!(await waitForServer(`${BASE_URL}/index.html`, 20000))) {
    child.kill();
    throw new Error("Local server did not start.");
  }
  return child;
}

function attr(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function pause(ms = 160) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function step(page, label, delay = 220) {
  coverage.clicks.push({ at: new Date().toISOString(), label });
  console.log(`STEP: ${label}`);
  await page.evaluate((text) => {
    let box = document.querySelector("[data-e2e-overlay]");
    if (!box) {
      box = document.createElement("div");
      box.setAttribute("data-e2e-overlay", "");
      box.style.cssText = [
        "position:fixed",
        "left:16px",
        "bottom:16px",
        "z-index:2147483647",
        "max-width:min(760px,calc(100vw - 32px))",
        "padding:12px 14px",
        "border-radius:8px",
        "background:rgba(5,10,18,.9)",
        "color:#f7d77a",
        "font:700 15px/1.35 Segoe UI,Arial,sans-serif",
        "border:1px solid rgba(247,215,122,.55)",
        "box-shadow:0 12px 34px rgba(0,0,0,.35)",
        "pointer-events:none",
      ].join(";");
      document.body.appendChild(box);
    }
    box.textContent = text;
  }, label).catch(() => null);
  await pause(delay);
}

async function mockAuth(page, roleKey = "rich") {
  const roles = ROLE_SETS[roleKey] || ROLE_SETS.rich;
  await page.evaluate(({ user, roles, roleKey }) => {
    window.skilfFirebase = {
      ready: true,
      user,
      profile: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        roles,
        primaryRole: roles.includes("admin") ? "admin" : roles.includes("board-member") ? "board-member" : roles[0],
        isRegistered: true,
      },
      registeredRoles: roles,
      hasRegisteredRole: true,
      requireSignIn: async () => user,
      syncUserProfile: async () => window.skilfFirebase.profile,
      saveCardMessage: async (payload) => {
        const message = { ...payload, authUid: user.uid, authEmail: user.email, senderRoles: roles };
        await window.__recordE2E({ type: "message", roleKey, payload: message });
        return { id: `mock-message-${Date.now()}` };
      },
      saveDashboardAction: async (payload) => {
        const action = { ...payload, authUid: user.uid, authEmail: user.email, actorRoles: roles };
        await window.__recordE2E({ type: "dashboardAction", roleKey, payload: action });
        return { id: `mock-action-${Date.now()}` };
      },
      savePersonApplication: async (form) => {
        const data = Object.fromEntries(new FormData(form).entries());
        await window.__recordE2E({ type: "form", roleKey, payload: data });
        return { id: `mock-form-${Date.now()}` };
      },
    };

    for (const ui of document.querySelectorAll("[data-auth-ui]")) {
      const signIn = ui.querySelector('[data-auth-action="sign-in"]');
      const profile = ui.querySelector("[data-auth-profile]");
      const name = ui.querySelector("[data-auth-name]");
      const initial = ui.querySelector("[data-auth-initial]");
      const avatar = ui.querySelector("[data-auth-avatar]");
      const status = ui.querySelector("[data-auth-status]");
      const signOut = ui.querySelector('[data-auth-action="sign-out"]');
      if (signIn) signIn.hidden = true;
      if (profile) profile.hidden = false;
      if (signOut) signOut.hidden = false;
      if (name) name.textContent = roleKey === "rich" ? "Rich" : `${roleKey} Rich`;
      if (initial) {
        initial.textContent = "R";
        initial.hidden = false;
      }
      if (avatar) avatar.hidden = true;
      if (status) {
        status.textContent = `Mocked ${roles.join(" + ")} user`;
        status.hidden = false;
      }
    }
  }, { user: RICH_USER, roles, roleKey });
}

async function mockNoAuth(page) {
  await page.evaluate(() => {
    window.skilfFirebase = {
      ready: true,
      user: null,
      registeredRoles: [],
      hasRegisteredRole: false,
      requireSignIn: async () => null,
      saveCardMessage: async () => {
        throw new Error("Should not save while signed out.");
      },
    };
  });
}

async function gotoPage(page, target, label = target, roleKey = "rich") {
  const url = target.startsWith("http") ? target : `${BASE_URL}/${target}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => null);
  coverage.pagesVisited.push({ at: new Date().toISOString(), target: page.url(), label });
  await mockAuth(page, roleKey);
  await step(page, `Page: ${label}`, 260);
}

async function clickLocator(page, locator, label, options = {}) {
  const count = await locator.count();
  if (count < 1) {
    coverage.notes.push({ at: new Date().toISOString(), message: `Missing control: ${label}` });
    return false;
  }
  const target = locator.first();
  await target.scrollIntoViewIfNeeded().catch(() => null);
  await step(page, label, options.beforeDelay || 80);
  await target.click({ timeout: options.timeout || 5000 }).catch(async (error) => {
    coverage.notes.push({ at: new Date().toISOString(), message: `Click failed: ${label}: ${error.message}` });
    throw error;
  });
  await pause(options.afterDelay || 150);
  return true;
}

async function clickBySelector(page, selector, label, options = {}) {
  return clickLocator(page, page.locator(selector), label, options);
}

async function openTopAdventure(page) {
  await clickBySelector(page, ".site-nav .site-adventure summary", "Open top Begin a Skilf menu");
}

async function openFixedAdventure(page) {
  await clickBySelector(page, "[data-fixed-actions] summary", "Open fixed Begin a Skilf menu");
}

async function exerciseGlobalChrome(page) {
  await gotoPage(page, "index.html", "global chrome baseline");
  await openTopAdventure(page);
  await clickBySelector(page, '.site-nav .site-adventure-menu a[href="apply.html#intern"]', "Top menu option: Join intern waitlist");
  await gotoPage(page, "index.html", "global chrome top menu remaining");
  for (const hash of ADVENTURE_HASHES.slice(1)) {
    await openTopAdventure(page);
    await clickBySelector(page, `.site-nav .site-adventure-menu a[href="apply.html#${hash}"]`, `Top menu option: ${hash}`);
    await gotoPage(page, "index.html", `return after top ${hash}`);
  }

  for (const hash of ADVENTURE_HASHES) {
    await openFixedAdventure(page);
    await clickBySelector(page, `[data-fixed-actions] a[href="apply.html#${hash}"]`, `Fixed menu option: ${hash}`);
    await gotoPage(page, "index.html", `return after fixed ${hash}`);
  }

  await clickBySelector(page, '[data-fixed-actions] a[href="apply.html#feedback"]', "Fixed Feedback button");
  await gotoPage(page, "index.html", "profile menu");
  await clickBySelector(page, '[data-auth-action="profile-menu"]', "Open mocked profile dropdown");
  await clickBySelector(page, '[data-auth-action="sign-out"]', "Click logout in profile dropdown");
}

async function clickSkillLeaves(page, inputSelector, buttonSelector, treeSelector, label) {
  for (let index = 0; index < skillLeaves.length; index += 1) {
    const skill = skillLeaves[index];
    await page.fill(inputSelector, "");
    await clickBySelector(page, buttonSelector, `${label}: open filter for ${skill}`, { beforeDelay: index % 12 === 0 ? 120 : 10, afterDelay: 20 });
    await page.evaluate((selector) => {
      const tree = document.querySelector(selector);
      if (tree) {
        tree.classList.add("open");
        Object.assign(tree.style, {
          position: "fixed",
          top: "92px",
          left: "28px",
          right: "28px",
          maxHeight: "58vh",
          overflow: "auto",
          zIndex: "2147483000",
        });
      }
    }, treeSelector);
    await clickBySelector(page, `${treeSelector} [data-skill="${attr(skill)}"]`, `${label}: select ${skill}`, { beforeDelay: 10, afterDelay: 20 });
  }
}

async function exerciseMessageWidget(page, cardSelector, label) {
  const firstCard = page.locator(cardSelector).first();
  await firstCard.scrollIntoViewIfNeeded();
  const optionCount = await firstCard.locator(".msg-menu li").count();
  for (let i = 0; i < optionCount; i += 1) {
    await clickLocator(page, firstCard.locator(".msg-arrow"), `${label}: open choices ${i + 1}`, { beforeDelay: 20, afterDelay: 20 });
    await firstCard.evaluate((card) => {
      const row = card.querySelector(".msg-row");
      const menu = card.querySelector(".msg-menu");
      if (row) row.classList.add("menu-open");
      if (menu) menu.style.display = "block";
    });
    await clickLocator(page, firstCard.locator(".msg-menu li").nth(i), `${label}: choose canned message ${i + 1}`, { beforeDelay: 20, afterDelay: 40 });
  }
}

async function sendVisibleCards(page, cardSelector, label) {
  const count = await page.locator(cardSelector).count();
  for (let i = 0; i < count; i += 1) {
    const card = page.locator(cardSelector).nth(i);
    await clickLocator(page, card.locator(".send-btn"), `${label}: send card ${i + 1}`, { beforeDelay: i === 0 ? 80 : 20, afterDelay: 40 });
  }
}

async function exerciseHome(page) {
  await gotoPage(page, "index.html", "homepage");
  await page.fill("#search", "Lila");
  await step(page, "Homepage expert search: name");
  await page.fill("#search", "Zurich");
  await step(page, "Homepage expert search: region");
  await page.fill("#search", "SKL-003");
  await step(page, "Homepage expert search: Skilf ID");
  await page.fill("#search", "");
  await clickSkillLeaves(page, "#search", '[data-tree="expert-tree"]', "#expert-tree", "Homepage expert skill filter");

  await page.fill("#partner-search", "NLP");
  await step(page, "Homepage partner search: NLP");
  await page.fill("#partner-search", "");
  await clickSkillLeaves(page, "#partner-search", '#partner-toolbar [data-tree="partner-tree"]', "#partner-tree", "Homepage partner skill filter");

  await mockNoAuth(page);
  await clickLocator(page, page.locator("#experts .expert-card").first().locator(".send-btn"), "Signed-out send attempt on expert card");
  await clickBySelector(page, ".send-login-cancel", "Dismiss signed-out send prompt");
  await mockAuth(page, "rich");
  await exerciseMessageWidget(page, "#experts .expert-card", "Expert card message widget");
  await sendVisibleCards(page, "#experts .expert-card", "Rich sends expert messages");
  await exerciseMessageWidget(page, "#partners .partner-card", "Partner card message widget");
  await sendVisibleCards(page, "#partners .partner-card", "Rich sends partner messages");

  for (const selector of [
    '.showcase-action[href="find-partner.html"]',
    '.showcase-action[href="board-dashboard.html"]',
    '.showcase-action[href="monetize.html"]',
    '.showcase-action[href="apply.html?role=intern"]',
    '.showcase-action[href="defense-day.html"]',
    '.home-final-actions a[href="apply.html#intern"]',
    '.home-final-actions a[href="apply.html#mentor"]',
    '.home-final-actions a[href="apply.html#hire"]',
  ]) {
    await gotoPage(page, "index.html", `homepage CTA reset ${selector}`);
    await clickBySelector(page, selector, `Homepage CTA: ${selector}`);
  }
}

async function exerciseInterns(page) {
  await gotoPage(page, "interns", "Interns public page");
  await page.fill("#intern-search", "NLP");
  await step(page, "Interns search: NLP");
  await page.fill("#intern-search", "");
  await clickSkillLeaves(page, "#intern-search", "[data-tree-toggle]", "#intern-tree", "Interns skill filter");

  await gotoPage(page, "interns", "Interns expand all");
  await clickBySelector(page, "[data-more-interns]", "Expand all 264 intern cards", { afterDelay: 300 });
  await exerciseMessageWidget(page, "#interns .intern-card", "Intern card message widget");
  await mockNoAuth(page);
  await clickLocator(page, page.locator("#interns .intern-card").first().locator(".send-btn"), "Signed-out send attempt on intern card");
  await clickBySelector(page, ".registration-close", "Dismiss registered-role modal");

  for (const roleKey of ["intern", "mentor", "board", "rich"]) {
    await gotoPage(page, "interns", `Interns send as ${roleKey}`, roleKey);
    await clickLocator(page, page.locator("#interns .intern-card").first().locator(".send-btn"), `Send intern message as ${roleKey}`);
  }

  await gotoPage(page, "interns", "Intern CTAs");
  for (const selector of [
    '.intern-cta-row a[href="apply.html#intern"]',
    '.intern-cta-row a[href="apply.html#mentor"]',
    '.intern-cta-row a[href="#hire-interns"]',
    '.intern-cta-panel .panel-cta[href="apply.html#intern"]',
    '.intern-cta-panel .panel-cta[href="apply.html#mentor"]',
    '.intern-cta-panel .panel-cta[href="#hire-interns"]',
  ]) {
    await clickBySelector(page, selector, `Interns CTA: ${selector}`, { afterDelay: 120 });
    if (!page.url().includes("/interns")) await gotoPage(page, "interns", `return after ${selector}`);
  }
}

async function exerciseApply(page) {
  for (const hash of ADVENTURE_HASHES) {
    await gotoPage(page, `apply.html#${hash}`, `Apply form for ${hash}`);
    await page.evaluate(() => {
      const form = document.querySelector("[data-skilf-application-form]");
      if (form && !form.dataset.e2eSubmitTrap) {
        form.dataset.e2eSubmitTrap = "true";
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          window.__recordE2E({
            type: "form",
            roleKey: "rich",
            payload: Object.fromEntries(new FormData(form).entries()),
          });
          const button = form.querySelector("[type='submit']");
          if (button) button.textContent = "Recorded";
        }, { capture: true });
      }
    });
    await page.fill('input[name="name"]', `Rich ${hash}`);
    await page.fill('input[name="email"]', RICH_EMAIL);
    await page.fill('textarea[name="project"]', `Full e2e project text for ${hash}.`);
    await page.fill('textarea[name="message"]', `Full e2e message for ${hash}.`);
    await clickBySelector(page, ".submit-btn", `Submit apply form permutation: ${hash}`);
  }

  await gotoPage(page, "apply.html", "Apply select permutations");
  for (const hash of ADVENTURE_HASHES) {
    await page.selectOption("[data-intent-select]", hash);
    await step(page, `Apply dropdown select: ${hash}`);
  }
}

async function exerciseFaq(page) {
  await gotoPage(page, "faq.html", "FAQ page");
  const count = await page.locator("main details > summary").count();
  for (let i = 0; i < count; i += 1) {
    await clickLocator(page, page.locator("main details > summary").nth(i), `FAQ open question ${i + 1}`, { afterDelay: 90 });
  }
  for (let i = count - 1; i >= 0; i -= 1) {
    await clickLocator(page, page.locator("main details > summary").nth(i), `FAQ close question ${i + 1}`, { afterDelay: 40 });
  }
}

async function exerciseDashboards(page) {
  await gotoPage(page, "mentor-dashboard.html", "Mentor dashboard as mentor", "mentor");
  await page.fill("[data-intern-search]", "robotics");
  await step(page, "Mentor dashboard search: robotics");
  await page.fill("[data-intern-search]", "");
  await clickLocator(page, page.locator('[data-action="offer-mentor"]').first(), "Mentor offers to mentor first intern");
  await clickLocator(page, page.locator('[data-action="donate-credit"]').first(), "Mentor donates credit one");
  await pause(920);
  await clickLocator(page, page.locator('[data-action="donate-credit"]').nth(1), "Mentor donates credit two");
  await clickBySelector(page, '[data-action="report-problem"]', "Mentor reports a problem");

  await gotoPage(page, "board-member-dashboard.html", "Board dashboard as board member", "board");
  await page.fill("[data-intern-search]", "climate");
  await step(page, "Board dashboard search: climate");
  await clickBySelector(page, '[data-action="pass-demo"]', "Board passes Demo Day");
  await clickBySelector(page, '[data-action="fail-demo"]', "Board fails Demo Day");
  await clickBySelector(page, '[data-action="report-problem"]', "Board reports a problem");
  await clickLocator(page, page.locator('[data-action="donate-credit"]').first(), "Board uses mentor credit tool");

  await gotoPage(page, "intern-dashboard.html", "Intern dashboard as intern", "intern");
  await clickBySelector(page, '[data-action="schedule-check-in"]', "Intern spends first check-in credit");
  await pause(920);
  await clickBySelector(page, '[data-action="schedule-check-in"]', "Intern spends second check-in credit");
  await clickBySelector(page, '[data-action="give-intern-credit"]', "Intern gives away monthly credit");
  await clickBySelector(page, '[data-action="become-mentor"]', "Intern requests mentor unlock");
  await clickBySelector(page, 'a[href="intern-policies.html#demo-day-gate"]', "Intern opens Demo Day locked policy link");

  await gotoPage(page, "board-member-dashboard.html", "Rich all-role dashboard", "rich");
  await clickBySelector(page, '[data-action="pass-demo"]', "Rich all-role pass Demo Day");
  await clickLocator(page, page.locator('[data-action="donate-credit"]').first(), "Rich all-role donate mentor credit");
}

async function exercisePayments(page) {
  for (const kind of ["check-in", "demo-day", "sponsor-credit"]) {
    await gotoPage(page, "payments.html", `Payments page ${kind}`);
    await clickBySelector(page, `[data-payment-kind="${kind}"]`, `Payment button: ${kind}`, { afterDelay: 350 });
  }
}

async function exerciseStaticPages(page) {
  for (const target of APP_PAGES) {
    await gotoPage(page, target, `Static page sweep: ${target}`);
    const topCount = await page.locator(".site-nav .site-adventure summary").count();
    if (topCount) {
      await clickBySelector(page, ".site-nav .site-adventure summary", `Open top Begin a Skilf on ${target}`, { afterDelay: 40 });
    }
    const fixedCount = await page.locator("[data-fixed-actions] summary").count();
    if (fixedCount) {
      await clickBySelector(page, "[data-fixed-actions] summary", `Open fixed Begin a Skilf on ${target}`, { afterDelay: 40 });
    }
  }

  await gotoPage(page, "logo-options.html", "Logo options click sweep");
  const logoCount = await page.locator(".logo-lockup").count();
  for (let i = 0; i < logoCount; i += 1) {
    await clickLocator(page, page.locator(".logo-lockup").nth(i), `Logo option ${i + 1}`, { afterDelay: 40 });
  }
}

async function convertToMp4(inputPath, outputPath) {
  let ffmpegPath = null;
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch {
    note("ffmpeg-static is not installed; leaving WebM only.");
    return false;
  }
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      "-y",
      "-i", inputPath,
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-vcodec", "libx264",
      "-preset", "veryfast",
      "-crf", "24",
      outputPath,
    ], { stdio: "ignore", windowsHide: true });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
  });
  return true;
}

async function main() {
  cleanDir(OUT_DIR);
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const server = await startServer();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO_DIR, size: { width: 1366, height: 768 } },
  });
  await context.exposeFunction("__recordE2E", (event) => {
    if (event.type === "message") coverage.messages.push({ at: new Date().toISOString(), ...event });
    if (event.type === "dashboardAction") coverage.dashboardActions.push({ at: new Date().toISOString(), ...event });
    if (event.type === "form") coverage.forms.push({ at: new Date().toISOString(), ...event });
  });
  await context.route("**/.netlify/functions/create-checkout-session", async (route) => {
    const body = route.request().postDataJSON?.() || {};
    const kind = body.kind || "unknown";
    coverage.payments.push({ at: new Date().toISOString(), kind });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: `mock_${kind}`, url: `${BASE_URL}/thanks.html?payment=success&kind=${kind}` }),
    });
  });
  await context.route("https://calendly.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Mock Calendly</title><body><h1>Mock Calendly booking page</h1></body>",
    });
  });

  const page = await context.newPage();
  await page.setDefaultTimeout(9000);

  try {
    await exerciseGlobalChrome(page);
    await exerciseHome(page);
    await exerciseInterns(page);
    await exerciseApply(page);
    await exerciseFaq(page);
    await exerciseDashboards(page);
    await exercisePayments(page);
    await exerciseStaticPages(page);
    await gotoPage(page, "index.html", "Full e2e complete");
    await step(page, "Full Skilf e2e complete: Rich as intern + mentor + board member", 1000);
  } finally {
    coverage.finishedAt = new Date().toISOString();
    coverage.summary = {
      pagesVisited: coverage.pagesVisited.length,
      clicksRecorded: coverage.clicks.length,
      messagesSaved: coverage.messages.length,
      dashboardActionsSaved: coverage.dashboardActions.length,
      paymentsStarted: coverage.payments.length,
      formsSubmitted: coverage.forms.length,
      skillLeavesExercisedPerTree: skillLeaves.length,
    };
    fs.writeFileSync(COVERAGE_PATH, JSON.stringify(coverage, null, 2));
    await page.close();
    await context.close();
    await browser.close();
    if (server) server.kill();
  }

  const videos = fs.readdirSync(VIDEO_DIR).filter((file) => file.endsWith(".webm"));
  if (!videos.length) throw new Error("No Playwright video was produced.");
  const rawVideo = path.join(VIDEO_DIR, videos[0]);
  fs.copyFileSync(rawVideo, WEBM_PATH);
  const converted = await convertToMp4(WEBM_PATH, MP4_PATH);
  if (converted) note(`MP4 written to ${MP4_PATH}`);
  else note(`WebM written to ${WEBM_PATH}`);
  note(`Coverage written to ${COVERAGE_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

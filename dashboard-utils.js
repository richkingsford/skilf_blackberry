export function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

export const CALENDLY_CHECK_IN_URL = "https://calendly.com/richkingsford/30m";

export function calendlyLink(intern, type = "check-in") {
  const id = slugify(intern.internId || intern.partnerId || intern.name || "intern");
  const params = new URLSearchParams({
    hide_gdpr_banner: "1",
    utm_source: "skilf",
    utm_content: id,
    utm_campaign: type,
  });
  return `${CALENDLY_CHECK_IN_URL}?${params.toString()}`;
}

export async function loadInterns() {
  const response = await fetch("prospectivePartners.json");
  if (!response.ok) throw new Error("Could not load interns.");
  const interns = await response.json();
  return interns.map((intern, index) => ({
    ...intern,
    calendlyCheckIn: calendlyLink(intern, "check-in"),
    calendlyDemoDay: calendlyLink(intern, "demo-day"),
    passedCheckins: index % 5,
    checkInDueDays: [6, 13, 24, 31, 44][index % 5],
    suspended: index % 41 === 0,
  }));
}

export function filterInterns(interns, query) {
  const needle = normalize(query);
  if (!needle) return interns;
  return interns.filter((intern) => normalize([
    intern.name,
    intern.internId,
    intern.skill,
    intern.project,
    intern.region,
    ...(intern.tags || []),
    ...(intern.searchTags || []),
  ].join(" ")).includes(needle));
}

export function internCard(intern, options = {}) {
  const showDemo = Boolean(options.showDemo);
  const demoLocked = showDemo && intern.passedCheckins < 4;
  return `<article class="intern-card" data-intern-id="${escapeHtml(intern.internId)}">
    <span class="pill">${escapeHtml(intern.skill)}</span>
    <strong>${escapeHtml(intern.name)}</strong>
    <p>${escapeHtml(intern.project)}</p>
    <span class="meta">${escapeHtml(intern.region)} · ${escapeHtml(intern.internId)} · ${intern.passedCheckins}/4 check-ins passed</span>
    <div class="card-actions">
      <a class="cta" href="${escapeHtml(intern.calendlyCheckIn)}" target="_blank" rel="noopener">Monthly check-in</a>
      ${showDemo ? `<a class="cta ${demoLocked ? "locked" : ""}" href="${demoLocked ? "intern-policies.html#demo-day-gate" : escapeHtml(intern.calendlyDemoDay)}" target="${demoLocked ? "" : "_blank"}" rel="noopener">${demoLocked ? "Demo Day locked" : "Calendly Demo Day"}</a>` : ""}
      ${options.mentorActions ? `<button class="dash-btn" type="button" data-action="offer-mentor" data-intern-id="${escapeHtml(intern.internId)}" data-intern-name="${escapeHtml(intern.name)}">Offer to mentor</button><button class="dash-btn" type="button" data-action="donate-credit" data-intern-id="${escapeHtml(intern.internId)}" data-intern-name="${escapeHtml(intern.name)}">Donate credit</button>` : ""}
    </div>
  </article>`;
}

const CREDIT_FALLBACKS = {
  mentor: 2,
  checkin: 2,
  giveaway: 1,
};

const CREDIT_DATASET_KEYS = {
  mentor: "mentorCredits",
  checkin: "checkinCredits",
  giveaway: "giveawayCredits",
};

function creditKindForAction(action) {
  if (action === "donate-credit") return "mentor";
  if (action === "schedule-check-in") return "checkin";
  if (action === "give-intern-credit") return "giveaway";
  return "";
}

function creditLabel(kind, count) {
  if (kind === "mentor") return `${count} mentor credit${count === 1 ? "" : "s"} available`;
  if (kind === "checkin") return `${count} available`;
  if (kind === "giveaway") return count === 1 ? "1 monthly" : `${count} monthly credits`;
  return String(count);
}

function readCreditCount(kind) {
  const key = CREDIT_DATASET_KEYS[kind];
  const raw = key ? document.body.dataset[key] : "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : CREDIT_FALLBACKS[kind] || 0;
}

function writeCreditCount(kind, count) {
  const key = CREDIT_DATASET_KEYS[kind];
  if (!key) return;
  const next = Math.max(0, count);
  document.body.dataset[key] = String(next);
  for (const display of document.querySelectorAll(`[data-credit-display="${kind}"]`)) {
    display.textContent = creditLabel(kind, next);
  }
  refreshCreditButtons();
}

function refreshCreditButtons() {
  for (const button of document.querySelectorAll("[data-action]")) {
    const kind = creditKindForAction(button.dataset.action);
    if (!kind) continue;
    button.disabled = readCreditCount(kind) <= 0;
  }
}

function creditPayload(kind) {
  if (kind === "mentor") return { creditKind: "mentor-monthly-check-in", creditDelta: -1 };
  if (kind === "checkin") return { creditKind: "intern-check-in", creditDelta: -1 };
  if (kind === "giveaway") return { creditKind: "intern-give-away", creditDelta: -1 };
  return {};
}

function applyLocalDashboardAction(action, payload) {
  const kind = creditKindForAction(action);
  if (!kind) return "";
  const remaining = Math.max(0, readCreditCount(kind) - 1);
  writeCreditCount(kind, remaining);
  if (action === "donate-credit") return `Credit sent to ${payload.internName}. ${remaining} mentor credit${remaining === 1 ? "" : "s"} left.`;
  if (action === "schedule-check-in") return `One check-in credit spent. ${remaining} check-in credit${remaining === 1 ? "" : "s"} left.`;
  if (action === "give-intern-credit") return `Give-away credit sent. ${remaining} monthly give-away credit${remaining === 1 ? "" : "s"} left.`;
  return "";
}

export function wireDashboardActions(root = document) {
  refreshCreditButtons();
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const status = document.querySelector("[data-dashboard-status]");
    const action = button.dataset.action;
    const creditKind = creditKindForAction(action);
    if (creditKind && readCreditCount(creditKind) <= 0) {
      if (status) status.textContent = "No credits left for that action this month.";
      return;
    }
    const payload = {
      action,
      internId: button.dataset.internId || "",
      internName: button.dataset.internName || "",
      sourcePage: location.pathname.split("/").pop() || "dashboard",
      ...creditPayload(creditKind),
    };
    button.disabled = true;
    try {
      if (window.skilfFirebase && window.skilfFirebase.saveDashboardAction) {
        await window.skilfFirebase.saveDashboardAction(payload);
      }
      const localMessage = applyLocalDashboardAction(action, payload);
      if (status) status.textContent = localMessage || dashboardMessage(action, payload);
    } catch (error) {
      console.error("Dashboard action failed.", error);
      if (status) status.textContent = error.message || "Could not record that action yet.";
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        refreshCreditButtons();
      }, 900);
    }
  });
}

function dashboardMessage(action, payload) {
  if (action === "donate-credit") return `Credit marked for ${payload.internName}. That is one less $100 obstacle.`;
  if (action === "offer-mentor") return `Mentor offer drafted for ${payload.internName}.`;
  if (action === "report-problem") return "Problem report saved for Skilf review.";
  if (action === "pass-demo") return "Demo Day pass decision recorded.";
  if (action === "fail-demo") return "Demo Day fail decision recorded with repair notes.";
  if (action === "schedule-check-in") return "Check-in scheduling started. Credits are spent when the meeting is scheduled.";
  if (action === "give-intern-credit") return "Give-away credit marked for another intern.";
  if (action === "become-mentor") return "Mentor unlock request saved.";
  return "Action saved.";
}

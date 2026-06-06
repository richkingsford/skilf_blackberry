const { spawnSync } = require("node:child_process");

const siteUrl = String(process.env.SITE_URL || "https://skilf.netlify.app").replace(/\/$/, "");
const dryRun = process.argv.includes("--dry-run");
const liveMessage = process.argv.includes("--live-message");

const publicChecks = [
  { path: "/", text: "HighBar" },
  { path: "/interns.html", text: "intern" },
  { path: "/privacy.html", text: "Only active registered interns, mentors, and board members can send messages" },
  { path: "/admin.html", text: "Permissions and account safety" },
];

const manualChecks = [
  "Sign out and sign back in on production as richkingsford@gmail.com.",
  "Confirm Rich can see Admin, Intern Dashboard, Board Dashboard, and Mentor Dashboard in the footer and profile menu.",
  "Confirm Rich lands on or can access the Board Member dashboard.",
  "Send one homepage card message and confirm Firestore plus email delivery.",
  "Send one Interns page message and confirm Firestore plus email delivery.",
  "Use one board pass/fail action and confirm only board-authorized Rich can do it.",
  "Confirm a non-board test account cannot pass/fail.",
  "When payments reopen, run one Stripe test checkout and verify webhook reconciliation.",
];

async function fetchPage(pathname) {
  const response = await fetch(`${siteUrl}${pathname}`, {
    headers: { "User-Agent": "HighBar production smoke" },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  return body;
}

async function runPublicChecks() {
  console.log(`Production smoke target: ${siteUrl}`);
  for (const check of publicChecks) {
    const body = await fetchPage(check.path);
    if (!body.includes(check.text)) {
      throw new Error(`${check.path} loaded but did not include expected text: ${check.text}`);
    }
    console.log(`OK       ${check.path}`);
  }
}

function runLiveMessageSmoke() {
  const result = spawnSync(process.execPath, ["scripts/send-production-message-smoke.js"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error("Production message smoke failed.");
  }
}

async function main() {
  if (dryRun) {
    console.log("Production smoke dry run.");
  } else {
    await runPublicChecks();
  }

  if (liveMessage) {
    runLiveMessageSmoke();
  } else {
    console.log("SKIP     live message smoke. Add -- --live-message when you intend to send the production email smoke.");
  }

  console.log("\nManual checks to finish after deploy:");
  manualChecks.forEach((check) => console.log(`- ${check}`));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function loadDotEnvFile(filename) {
  const filePath = path.join(root, filename);
  if (!fs.existsSync(filePath)) return;
  const source = fs.readFileSync(filePath, "utf8");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvFile(".env");
loadDotEnvFile(".env.local");

const includePayments = process.argv.includes("--include-payments");

function hasValue(key) {
  return Boolean(String(process.env[key] || "").trim());
}

function firebaseAdminConfigured() {
  if (hasValue("FIREBASE_SERVICE_ACCOUNT_JSON")) return true;
  return hasValue("FIREBASE_PROJECT_ID") && hasValue("FIREBASE_CLIENT_EMAIL") && hasValue("FIREBASE_PRIVATE_KEY");
}

function firebaseJsonLooksValid() {
  if (!hasValue("FIREBASE_SERVICE_ACCOUNT_JSON")) return true;
  try {
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return true;
  } catch {
    return false;
  }
}

const checks = [
  {
    label: "Firebase Admin credentials",
    ok: firebaseAdminConfigured(),
    help: "Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.",
  },
  {
    label: "Firebase Admin JSON parses",
    ok: firebaseJsonLooksValid(),
    help: "FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON if you use the single-value form.",
  },
  {
    label: "Admin role token",
    ok: hasValue("ADMIN_ROLE_TOKEN"),
    help: "Set ADMIN_ROLE_TOKEN. Generate one with npm run production:admin-token.",
  },
  {
    label: "Resend API key",
    ok: hasValue("RESEND_API_KEY"),
    help: "Set RESEND_API_KEY after verifying the sender/domain.",
  },
  {
    label: "Message recipient",
    ok: hasValue("MESSAGE_TO_EMAIL"),
    help: "Set MESSAGE_TO_EMAIL, normally richkingsford@gmail.com.",
  },
  {
    label: "Message sender",
    ok: hasValue("MESSAGE_FROM_EMAIL"),
    help: "Set MESSAGE_FROM_EMAIL to a verified Skilf sender.",
  },
  {
    label: "Write gate",
    ok: hasValue("SKILF_ALLOW_WRITES"),
    help: "Set SKILF_ALLOW_WRITES=true for production; false for deploy previews.",
  },
];

if (includePayments) {
  checks.push(
    {
      label: "Stripe secret key",
      ok: hasValue("STRIPE_SECRET_KEY"),
      help: "Set STRIPE_SECRET_KEY from Stripe test or live mode.",
    },
    {
      label: "Stripe webhook secret",
      ok: hasValue("STRIPE_WEBHOOK_SECRET"),
      help: "Set STRIPE_WEBHOOK_SECRET from the Stripe webhook endpoint.",
    },
  );
}

let missing = 0;
for (const check of checks) {
  const mark = check.ok ? "OK" : "MISSING";
  console.log(`${mark.padEnd(8)} ${check.label}`);
  if (!check.ok) {
    missing += 1;
    console.log(`         ${check.help}`);
  }
}

if (missing) {
  console.log(`\n${missing} production environment check(s) need attention.`);
  if (!includePayments) console.log("Payment checks are deferred. Run npm run production:env-check:payments when that batch starts.");
  process.exitCode = 1;
} else {
  console.log("\nProduction environment checks passed.");
}

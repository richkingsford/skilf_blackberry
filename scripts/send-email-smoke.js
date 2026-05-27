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

function requireValue(key, help) {
  const value = String(process.env[key] || "").trim();
  if (!value) {
    throw new Error(`${key} is missing. ${help}`);
  }
  return value;
}

function looksLikeEmailAddress(value) {
  const match = String(value || "").match(/<([^>]+)>$/);
  const email = match ? match[1] : value;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(email || "").trim());
}

async function main() {
  loadDotEnvFile(".env");
  loadDotEnvFile(".env.local");

  const resendKey = requireValue("RESEND_API_KEY", "Create a Resend API key and add it to .env.local.");
  const to = requireValue("MESSAGE_TO_EMAIL", "Set MESSAGE_TO_EMAIL=richkingsford@gmail.com.");
  const from = requireValue("MESSAGE_FROM_EMAIL", "Set MESSAGE_FROM_EMAIL to a verified Resend sender.");

  if (!resendKey.startsWith("re_")) {
    console.warn("Warning: RESEND_API_KEY does not start with the usual re_ prefix. Continuing without printing the key.");
  }
  if (!looksLikeEmailAddress(to)) throw new Error("MESSAGE_TO_EMAIL does not look like an email address.");
  if (!looksLikeEmailAddress(from)) throw new Error("MESSAGE_FROM_EMAIL does not look like an email address or Name <email@example.com> sender.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `skilf-email-smoke-${Date.now()}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Skilf email smoke test",
      text: [
        "This is a direct Resend smoke test from the Skilf workspace.",
        "",
        "If this arrived, the local RESEND_API_KEY, MESSAGE_FROM_EMAIL, and MESSAGE_TO_EMAIL values can send mail.",
      ].join("\n"),
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Resend rejected the smoke test (${response.status}). ${body.slice(0, 500)}`);
  }

  let id = "";
  try {
    id = JSON.parse(body).id || "";
  } catch {
    id = "";
  }
  console.log(`Email smoke test sent${id ? `: ${id}` : "."}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

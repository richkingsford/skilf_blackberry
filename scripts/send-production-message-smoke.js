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
  if (!value) throw new Error(`${key} is missing. ${help}`);
  return value;
}

function messageEndpoint() {
  const siteUrl = String(process.env.SITE_URL || "https://skilf.netlify.app").replace(/\/$/, "");
  if (siteUrl.includes("/.netlify/functions/send-message")) return siteUrl;
  return `${siteUrl}/.netlify/functions/send-message`;
}

async function createOwnerIdToken() {
  const { auth, OWNER_EMAIL, OWNER_ROLES } = require("../netlify/functions/_firebase-admin");
  const user = await auth().getUserByEmail(OWNER_EMAIL);
  const customToken = await auth().createCustomToken(user.uid, {
    roles: OWNER_ROLES,
    skilfRoles: OWNER_ROLES,
    admin: true,
    boardMember: true,
    mentor: true,
    intern: true,
    suspended: false,
  });

  const webApiKey = requireValue("FIREBASE_WEB_API_KEY", "Add the Firebase web API key to .env.local.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Firebase rejected the production smoke sign-in (${response.status}). ${body.slice(0, 500)}`);
  }
  const data = JSON.parse(body);
  if (!data.idToken) throw new Error("Firebase did not return an ID token for the production smoke test.");
  return data.idToken;
}

async function main() {
  loadDotEnvFile(".env");
  loadDotEnvFile(".env.local");

  const idToken = await createOwnerIdToken();
  const response = await fetch(messageEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      targetType: "production-smoke",
      targetName: "Skilf email system",
      targetField: "Email delivery",
      targetProject: "Production function verification",
      message: `Production message smoke test sent at ${new Date().toISOString()}.`,
      messageId: `production-smoke-${Date.now()}`,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Production message smoke failed (${response.status}). ${body.slice(0, 500)}`);
  }

  let id = "";
  try {
    id = JSON.parse(body).id || "";
  } catch {
    id = "";
  }
  console.log(`Production message smoke sent${id ? `: ${id}` : "."}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

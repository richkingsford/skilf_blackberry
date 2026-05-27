const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const netlifyApiModulePath = path.join(
  process.env.LOCALAPPDATA || "",
  "npm-cache",
  "_npx",
  "90d26507e643fcc0",
  "node_modules",
  "@netlify",
  "api",
  "lib",
  "index.js",
);

function loadEnvFile(filename) {
  const filePath = path.join(root, filename);
  const values = new Map();
  if (!fs.existsSync(filePath)) return values;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(line.slice(0, index), value);
  }
  return values;
}

async function deleteEnvVar(api, accountId, siteId, key) {
  try {
    await api.deleteEnvVar({ accountId, siteId, key });
  } catch (error) {
    const status = error && (error.status || (error.response && error.response.status));
    if (status !== 404) throw error;
  }
}

async function createEnvVar(api, accountId, siteId, key, value, secret) {
  await deleteEnvVar(api, accountId, siteId, key);
  await api.createEnvVars({
    accountId,
    siteId,
    body: [{
      key,
      is_secret: secret,
      scopes: secret ? ["builds", "functions", "runtime"] : ["builds", "functions", "runtime", "post_processing"],
      values: [{ context: secret ? "production" : "all", value }],
    }],
  });
}

function valueFor(env, key) {
  return String(env.get(key) || "").trim();
}

function hasFirebaseAdmin(env) {
  if (valueFor(env, "FIREBASE_SERVICE_ACCOUNT_JSON")) return true;
  return valueFor(env, "FIREBASE_PROJECT_ID") && valueFor(env, "FIREBASE_CLIENT_EMAIL") && valueFor(env, "FIREBASE_PRIVATE_KEY");
}

async function main() {
  const env = loadEnvFile(".env.local");
  const variables = [
    { key: "RESEND_API_KEY", secret: true, required: true },
    { key: "MESSAGE_TO_EMAIL", secret: false, required: true },
    { key: "MESSAGE_FROM_EMAIL", secret: false, required: true },
    { key: "FIREBASE_WEB_API_KEY", secret: false, required: true },
    { key: "FIREBASE_SERVICE_ACCOUNT_JSON", secret: true, required: false },
    { key: "FIREBASE_PROJECT_ID", secret: false, required: false },
    { key: "FIREBASE_CLIENT_EMAIL", secret: true, required: false },
    { key: "FIREBASE_PRIVATE_KEY", secret: true, required: false },
    { key: "ADMIN_ROLE_TOKEN", secret: true, required: true },
    { key: "SKILF_ALLOW_WRITES", secret: false, required: true },
  ];
  const missing = variables
    .filter((variable) => variable.required && !valueFor(env, variable.key))
    .map((variable) => variable.key);
  if (!hasFirebaseAdmin(env)) {
    missing.push("FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY");
  }
  if (missing.length) throw new Error(`Add missing .env.local values before syncing Netlify env: ${missing.join(", ")}`);

  const configPath = path.join(process.env.APPDATA || "", "netlify", "Config", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const user = config.users[config.userId];
  const { NetlifyAPI } = await import(`file:///${netlifyApiModulePath.replace(/\\/g, "/")}`);
  const api = new NetlifyAPI(user.auth.token);
  const siteId = "91fa8925-8aca-430b-8a76-824c61d91033";
  const site = await api.getSite({ siteId });
  const accountId = site.account_slug;

  for (const variable of variables) {
    const value = valueFor(env, variable.key);
    if (value) await createEnvVar(api, accountId, siteId, variable.key, value, variable.secret);
  }

  console.log("Email and auth environment variables updated for Netlify.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

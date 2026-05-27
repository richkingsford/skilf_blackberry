const fs = require("fs");
const path = require("path");
const {
  FieldValue,
  OWNER_EMAIL,
  OWNER_ROLES,
  auth,
  db,
} = require("../netlify/functions/_firebase-admin");

function loadDotEnvFile(filename) {
  const filePath = path.join(__dirname, "..", filename);
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

async function main() {
  const user = await auth().getUserByEmail(OWNER_EMAIL);
  const existingClaims = user.customClaims || {};
  await auth().setCustomUserClaims(user.uid, {
    ...existingClaims,
    roles: OWNER_ROLES,
    skilfRoles: OWNER_ROLES,
    admin: true,
    boardMember: true,
    mentor: true,
    intern: true,
    suspended: false,
    suspendedRoles: [],
    suspendedReason: "",
  });

  await db().collection("userProfiles").doc(user.uid).set({
    uid: user.uid,
    email: user.email || OWNER_EMAIL,
    displayName: user.displayName || "Rich Kingsford",
    photoURL: user.photoURL || "",
    roles: OWNER_ROLES,
    suspendedRoles: [],
    primaryRole: "admin",
    isRegistered: true,
    authoritySource: "custom-claims",
    status: "active",
    suspended: false,
    suspendedReason: "",
    source: "bootstrap-rich-authority",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db().collection("roleAudit").add({
    targetUid: user.uid,
    targetEmail: user.email || OWNER_EMAIL,
    roles: OWNER_ROLES,
    suspended: false,
    action: "bootstrap-owner-authority",
    source: "bootstrap-rich-authority",
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`Granted ${OWNER_EMAIL}: ${OWNER_ROLES.join(", ")}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

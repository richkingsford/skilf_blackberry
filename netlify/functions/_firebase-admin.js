const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const OWNER_EMAIL = "richkingsford@gmail.com";
const OWNER_ROLES = ["admin", "board-member", "mentor", "intern"];
const VALID_ROLES = ["admin", "board-member", "mentor", "intern"];

function serviceAccountFromEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

function adminApp() {
  if (getApps().length) return getApps()[0];
  const account = serviceAccountFromEnv();
  if (!account) {
    throw new Error("Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.");
  }
  return initializeApp({ credential: cert(account) });
}

function db() {
  adminApp();
  return getFirestore();
}

function auth() {
  adminApp();
  return getAuth();
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function writesAllowed() {
  return String(process.env.SKILF_ALLOW_WRITES || "true").trim().toLowerCase() !== "false";
}

function blockWritesIfDisabled() {
  if (writesAllowed()) return;
  const error = new Error("Production writes are disabled for this deployment.");
  error.statusCode = 403;
  throw error;
}

function readBearerToken(headers = {}) {
  const value = headers.authorization || headers.Authorization || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function registeredRolesFrom(values) {
  return [...new Set((values || []).map((role) => String(role || "").trim().toLowerCase()).filter((role) => VALID_ROLES.includes(role)))];
}

function rolesFromClaims(decodedToken = {}) {
  const claimRoles = registeredRolesFrom([
    ...(Array.isArray(decodedToken.roles) ? decodedToken.roles : []),
    ...(Array.isArray(decodedToken.skilfRoles) ? decodedToken.skilfRoles : []),
  ]);
  if (decodedToken.admin === true) claimRoles.push("admin");
  if (decodedToken.boardMember === true) claimRoles.push("board-member");
  if (decodedToken.mentor === true) claimRoles.push("mentor");
  if (decodedToken.intern === true) claimRoles.push("intern");

  if (decodedToken.suspended === true) return [];

  const isOwner = normalizeEmail(decodedToken.email) === OWNER_EMAIL && decodedToken.email_verified === true;
  return registeredRolesFrom(isOwner ? [...claimRoles, ...OWNER_ROLES] : claimRoles);
}

async function requireUser(event) {
  const token = readBearerToken(event.headers || {});
  if (!token) {
    const error = new Error("Sign in before continuing.");
    error.statusCode = 401;
    throw error;
  }
  const decodedToken = await auth().verifyIdToken(token, true);
  const roles = rolesFromClaims(decodedToken);
  return { decodedToken, roles };
}

function hasRole(roles, role) {
  return roles.includes(role);
}

function isOwner(decodedToken) {
  return normalizeEmail(decodedToken.email) === OWNER_EMAIL && decodedToken.email_verified === true;
}

function isAdmin(decodedToken, roles = rolesFromClaims(decodedToken)) {
  return isOwner(decodedToken) || roles.includes("admin");
}

module.exports = {
  OWNER_EMAIL,
  OWNER_ROLES,
  VALID_ROLES,
  FieldValue,
  auth,
  blockWritesIfDisabled,
  db,
  hasRole,
  isAdmin,
  isOwner,
  json,
  normalizeEmail,
  registeredRolesFrom,
  requireUser,
  rolesFromClaims,
  writesAllowed,
};

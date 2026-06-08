const {
  FieldValue,
  auth,
  blockWritesIfDisabled,
  db,
  json,
} = require("./_firebase-admin");
const {
  clean,
  defaultJourney,
  emailDocId,
  isEmail,
  normalizeEmail,
  stepMapFrom,
} = require("./_founder-journey");
const { sendWelcomeEmail } = require("./_welcome-email");

function readBearerToken(headers = {}) {
  const value = headers.authorization || headers.Authorization || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function optionalUser(event) {
  const token = readBearerToken(event.headers || {});
  if (!token) return null;
  return auth().verifyIdToken(token, true);
}

function isStudentApplicant(role, kind) {
  return ["intern", "founder", "student"].includes(role) || ["intern", "founder", "student"].includes(kind);
}

function isBrowserFormPost(event) {
  const contentType = (event.headers && (event.headers["content-type"] || event.headers["Content-Type"]) || "").toLowerCase();
  return contentType.includes("application/x-www-form-urlencoded");
}

function parseUrlEncodedBody(body = "") {
  return Object.fromEntries(new URLSearchParams(body).entries());
}

function redirectToThanks() {
  return {
    statusCode: 303,
    headers: { Location: "/thanks.html" },
    body: "",
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  const browserFormPost = isBrowserFormPost(event);
  let payload = {};
  try {
    payload = browserFormPost ? parseUrlEncodedBody(event.body || "") : JSON.parse(event.body || "{}");
  } catch {
    return browserFormPost ? redirectToThanks() : json(400, { error: "Invalid application payload." });
  }

  if (clean(payload["bot-field"] || payload.botField, 120)) {
    return browserFormPost ? redirectToThanks() : json(200, { ok: true, spamFiltered: true });
  }

  let verifiedUser = null;
  try {
    blockWritesIfDisabled();
    verifiedUser = await optionalUser(event);
  } catch (error) {
    return browserFormPost ? redirectToThanks() : json(error.statusCode || 401, { error: error.message || "Application authorization failed." });
  }

  const name = clean(payload.name, 160);
  const email = normalizeEmail(payload.email || (verifiedUser && verifiedUser.email));
  const role = clean(payload.role || payload.kind || "intern", 60).toLowerCase();
  const kind = clean(payload.kind || role, 60).toLowerCase();
  const project = clean(payload.project, 1600);
  const message = clean(payload.message, 2000);

  if (!name) return browserFormPost ? redirectToThanks() : json(400, { error: "Name is required." });
  if (!isEmail(email)) return browserFormPost ? redirectToThanks() : json(400, { error: "A valid email is required." });
  if (!project) return browserFormPost ? redirectToThanks() : json(400, { error: "Project or goal is required." });

  try {
    const applicationRef = await db().collection("people").add({
      role,
      kind,
      name,
      email,
      project,
      message,
      source: "highbar-application-function",
      authUid: verifiedUser ? verifiedUser.uid : null,
      authEmail: verifiedUser ? verifiedUser.email || email : null,
      status: "applicant",
      createdAt: FieldValue.serverTimestamp(),
    });

    if (isStudentApplicant(role, kind)) {
      const journeyId = emailDocId(email);
      await db().collection("studentJourneys").doc(journeyId).set({
        ...defaultJourney({ name, email }),
        steps: stepMapFrom(),
        authUid: verifiedUser ? verifiedUser.uid : null,
        applicationId: applicationRef.id,
        source: "submit-application",
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    let welcomeEmail;
    try {
      welcomeEmail = await sendWelcomeEmail({
        to: email,
        name,
        idempotencyKey: `highbar-application-${applicationRef.id}`,
      });
    } catch (error) {
      welcomeEmail = { sent: false, skipped: false, reason: error.message || "welcome-email-failed" };
    }

    if (browserFormPost) return redirectToThanks();

    return json(200, {
      ok: true,
      applicationId: applicationRef.id,
      welcomeEmail,
    });
  } catch (error) {
    return browserFormPost ? redirectToThanks() : json(error.statusCode || 500, { error: error.message || "Could not submit application." });
  }
};

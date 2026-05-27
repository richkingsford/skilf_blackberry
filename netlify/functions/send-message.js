const {
  json,
  requireUser,
} = require("./_firebase-admin");

const MESSAGE_TO_EMAIL = process.env.MESSAGE_TO_EMAIL || "richkingsford@gmail.com";
const MESSAGE_FROM_EMAIL = process.env.MESSAGE_FROM_EMAIL || "Skilf <onboarding@resend.dev>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MESSAGE_ROLES = new Set(["mentor", "intern", "board-member"]);

function writesAllowed() {
  return String(process.env.SKILF_ALLOW_WRITES || "true").trim().toLowerCase() !== "false";
}

function readBearerToken(headers) {
  const value = headers.authorization || headers.Authorization || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function clean(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function authFailureStatus(error) {
  if (error.statusCode) return error.statusCode;
  return String(error.code || "").startsWith("auth/") ? 401 : 500;
}

function canSendMessages(roles = []) {
  return roles.some((role) => MESSAGE_ROLES.has(role));
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });
  if (!writesAllowed()) return json(403, { error: "Production writes are disabled for this deployment." });

  const token = readBearerToken(event.headers || {});
  if (!token) return json(401, { error: "Sign in before sending a message." });

  let verified;
  try {
    verified = await requireUser(event);
  } catch (error) {
    const statusCode = authFailureStatus(error);
    return json(statusCode, {
      error: statusCode === 401 ? "Your sign-in could not be verified." : (error.message || "Message authorization failed."),
    });
  }
  if (!canSendMessages(verified.roles)) {
    return json(403, { error: "Only active registered interns, mentors, and board members can send messages." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid message payload." });
  }

  const targetType = clean(payload.targetType, 40) || "expert";
  const targetName = clean(payload.targetName, 160) || "Unknown recipient";
  const targetField = clean(payload.targetField, 160);
  const targetProject = clean(payload.targetProject, 500);
  const message = clean(payload.message, 2000);
  const senderEmail = clean(verified.decodedToken.email, 240);
  const senderName = clean(verified.decodedToken.name, 160) || senderEmail || "Signed-in Skilf user";

  if (!message) return json(400, { error: "Message is required." });
  if (!RESEND_API_KEY) {
    return json(503, {
      error: "Email provider is not configured. Add RESEND_API_KEY in Netlify environment variables.",
    });
  }

  const subject = `Skilf message for ${targetName}`;
  const text = [
    `From: ${senderName}${senderEmail ? ` <${senderEmail}>` : ""}`,
    `Firebase UID: ${verified.decodedToken.uid || ""}`,
    `Target type: ${targetType}`,
    `Target name: ${targetName}`,
    targetField ? `Target field: ${targetField}` : "",
    targetProject ? `Target project: ${targetProject}` : "",
    payload.messageId ? `Firestore message ID: ${clean(payload.messageId, 120)}` : "",
    "",
    "Message:",
    message,
  ].filter(Boolean).join("\n");

  const resendBody = {
    from: MESSAGE_FROM_EMAIL,
    to: [MESSAGE_TO_EMAIL],
    subject,
    text,
  };
  if (senderEmail) resendBody.reply_to = senderEmail;

  const idempotencyKey = payload.messageId ? `skilf-${clean(payload.messageId, 120)}` : "";
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(resendBody),
  });

  if (!emailResponse.ok) {
    const detail = await emailResponse.text().catch(() => "");
    return json(502, { error: "Email service rejected the message.", detail: detail.slice(0, 400) });
  }

  const emailData = await emailResponse.json().catch(() => ({}));
  return json(200, { ok: true, id: emailData.id || null });
};

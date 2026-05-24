const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || "AIzaSyDU0tW1mgqrnpEciULEIY48gXMivTTq470";
const MESSAGE_TO_EMAIL = process.env.MESSAGE_TO_EMAIL || "richkingsford@gmail.com";
const MESSAGE_FROM_EMAIL = process.env.MESSAGE_FROM_EMAIL || "Skilf <onboarding@resend.dev>";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

function readBearerToken(headers) {
  const value = headers.authorization || headers.Authorization || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function clean(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

async function verifyFirebaseUser(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.users && data.users.length ? data.users[0] : null;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  const token = readBearerToken(event.headers || {});
  if (!token) return json(401, { error: "Sign in before sending a message." });

  const firebaseUser = await verifyFirebaseUser(token);
  if (!firebaseUser) return json(401, { error: "Your sign-in could not be verified." });

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
  const senderEmail = clean(firebaseUser.email, 240);
  const senderName = clean(firebaseUser.displayName, 160) || senderEmail || "Signed-in Skilf user";

  if (!message) return json(400, { error: "Message is required." });
  if (!RESEND_API_KEY) {
    return json(503, {
      error: "Email provider is not configured. Add RESEND_API_KEY in Netlify environment variables.",
    });
  }

  const subject = `Skilf message for ${targetName}`;
  const text = [
    `From: ${senderName}${senderEmail ? ` <${senderEmail}>` : ""}`,
    `Firebase UID: ${firebaseUser.localId || ""}`,
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

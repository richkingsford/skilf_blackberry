const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = process.env.MESSAGE_TO_EMAIL || "richkingsford@gmail.com";
const FROM_EMAIL = process.env.MESSAGE_FROM_EMAIL || "HighBar <onboarding@resend.dev>";

function clean(value, max = 3000) {
  return String(value || "").trim().slice(0, max);
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Use POST." }) };

  if (!RESEND_API_KEY) {
    return {
      statusCode: 503,
      body: JSON.stringify({ error: "Email provider not configured. Add RESEND_API_KEY to Netlify environment variables." }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid payload." }) };
  }

  const name = clean(data.name, 200);
  const email = clean(data.email, 200);
  const role = clean(data.role, 60) || "intern";
  const project = clean(data.project);
  const message = clean(data.message);

  if (!name || !email) {
    return { statusCode: 400, body: JSON.stringify({ error: "Name and email are required." }) };
  }

  const subject = `HighBar application: ${role} — ${name}`;
  const text = [
    `Role: ${role}`,
    `Name: ${name}`,
    `Email: ${email}`,
    project ? `\nProject / intent:\n${project}` : "",
    message ? `\nAdditional notes:\n${message}` : "",
  ].filter(Boolean).join("\n");

  const autoresponseText = `Welcome to HighBar (hbar for short). You are now an applicant.

The path is deliberately honest: try hard to win a real unpaid internship, and if the market still will not give you a fair shot, build the proof yourself as a founder.

Your next steps:
1. Make an honest attempt to win an unpaid internship. Aim for at least 40 applications and keep a simple evidence list.
2. Write a business plan and found your own company.
3. Prepare a 6-20 week plan for board approval.
4. Use the student portal checklist to track each step as it becomes true.

HighBar works because the evidence gets specific. Save links, dates, screenshots, demos, customer notes, and the failures that taught you something.

Reply to Rich at richkingsford@gmail.com whenever you need help getting unstuck.

Welcome aboard,
Rich
HighBar`;

  const sends = [
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [TO_EMAIL], reply_to: email, subject, text }),
    }),
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject: "Welcome to HighBar", text: autoresponseText }),
    }),
  ];

  const [notifyRes] = await Promise.all(sends);

  if (!notifyRes.ok) {
    const detail = await notifyRes.text().catch(() => "");
    console.error("Resend error:", detail);
    return { statusCode: 502, body: JSON.stringify({ error: "Email service rejected the request.", detail: detail.slice(0, 400) }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};

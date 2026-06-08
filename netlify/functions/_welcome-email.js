const { clean } = require("./_founder-journey");

const DEFAULT_GMAIL_USER = "richkingsford@gmail.com";
const DEFAULT_FROM_EMAIL = "Rich Kingsford <richkingsford@gmail.com>";

function welcomeSubject() {
  return "Welcome to HighBar (hbar for short)";
}

function welcomeEmailText({ name } = {}) {
  const greeting = clean(name, 120) ? `Hi ${clean(name, 120)},` : "Hi,";
  return [
    greeting,
    "",
    "Welcome to HighBar (hbar for short). You are now an applicant.",
    "",
    "The path is deliberately honest: try hard to win a real unpaid internship, and if the market still will not give you a fair shot, build the proof yourself as a founder.",
    "",
    "Your next steps:",
    "1. Make an honest attempt to win an unpaid internship. Aim for at least 40 applications and keep a simple evidence list.",
    "2. Write a business plan and found your own company.",
    "3. Prepare a 6-20 week plan for board approval.",
    "4. Use the student portal checklist to track each step as it becomes true.",
    "",
    "HighBar works because the evidence gets specific. Save links, dates, screenshots, demos, customer notes, and the failures that taught you something.",
    "",
    "Reply to this email whenever you need help getting unstuck.",
    "",
    "Welcome aboard,",
    "Rich",
    "HighBar",
  ].join("\n");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function welcomeEmailHtml({ name } = {}) {
  const safeName = escapeHtml(clean(name, 120));
  const greeting = safeName ? `Hi ${safeName},` : "Hi,";
  return `
    <div style="font-family:Segoe UI,Aptos,Arial,sans-serif;line-height:1.55;color:#17202a;max-width:680px">
      <p>${greeting}</p>
      <p>Welcome to <strong>HighBar</strong> (<strong>hbar</strong> for short). You are now an applicant.</p>
      <p>The path is deliberately honest: try hard to win a real unpaid internship, and if the market still will not give you a fair shot, build the proof yourself as a founder.</p>
      <p><strong>Your next steps:</strong></p>
      <ol>
        <li>Make an honest attempt to win an unpaid internship. Aim for at least 40 applications and keep a simple evidence list.</li>
        <li>Write a business plan and found your own company.</li>
        <li>Prepare a 6-20 week plan for board approval.</li>
        <li>Use the student portal checklist to track each step as it becomes true.</li>
      </ol>
      <p>HighBar works because the evidence gets specific. Save links, dates, screenshots, demos, customer notes, and the failures that taught you something.</p>
      <p>Reply to this email whenever you need help getting unstuck.</p>
      <p>Welcome aboard,<br>Rich<br>HighBar</p>
    </div>
  `;
}

async function sendEmail({ to, subject, text, html, replyTo, idempotencyKey } = {}) {
  const recipient = clean(to, 240);
  if (!recipient) return { sent: false, skipped: true, reason: "missing-recipient" };
  const requestedProvider = clean(process.env.WELCOME_EMAIL_PROVIDER, 40).toLowerCase();
  if (requestedProvider === "gmail" || (!requestedProvider && gmailConfigured())) {
    return sendGmailEmail({ to: recipient, subject, text, html, replyTo });
  }
  if (requestedProvider === "gmail") return { sent: false, skipped: true, reason: "missing-gmail-credentials" };
  return sendResendEmail({ to: recipient, subject, text, html, replyTo, idempotencyKey });
}

function gmailConfigured() {
  return Boolean(clean(process.env.GMAIL_USER || DEFAULT_GMAIL_USER, 240) && clean(process.env.GMAIL_APP_PASSWORD, 240));
}

async function sendGmailEmail({ to, subject, text, html, replyTo } = {}) {
  if (!gmailConfigured()) return { sent: false, skipped: true, reason: "missing-gmail-credentials" };
  const nodemailer = require("nodemailer");
  const gmailUser = clean(process.env.GMAIL_USER || DEFAULT_GMAIL_USER, 240);
  const from = process.env.WELCOME_FROM_EMAIL || process.env.GMAIL_FROM_EMAIL || `Rich Kingsford <${gmailUser}>`;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: clean(process.env.GMAIL_APP_PASSWORD, 240),
    },
  });
  const result = await transporter.sendMail({
    from,
    to,
    subject: clean(subject, 200),
    text: String(text || ""),
    html: html ? String(html) : undefined,
    replyTo: replyTo || process.env.WELCOME_REPLY_TO_EMAIL || gmailUser,
  });
  return { sent: true, provider: "gmail", id: result.messageId || null };
}

async function sendResendEmail({ to, subject, text, html, replyTo, idempotencyKey } = {}) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.WELCOME_FROM_EMAIL || process.env.MESSAGE_FROM_EMAIL || DEFAULT_FROM_EMAIL;
  if (!resendKey) return { sent: false, skipped: true, reason: "missing-email-provider" };

  const body = {
    from,
    to: [to],
    subject: clean(subject, 200),
    text: String(text || ""),
  };
  if (html) body.html = String(html);
  if (replyTo) body.reply_to = clean(replyTo, 240);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": clean(idempotencyKey, 120) } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      sent: false,
      skipped: false,
      reason: "resend-rejected",
      status: response.status,
      detail: detail.slice(0, 400),
    };
  }

  const data = await response.json().catch(() => ({}));
  return { sent: true, provider: "resend", id: data.id || null };
}

async function sendWelcomeEmail({ to, name, idempotencyKey } = {}) {
  return sendEmail({
    to,
    subject: welcomeSubject(),
    text: welcomeEmailText({ name }),
    html: welcomeEmailHtml({ name }),
    idempotencyKey,
  });
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  welcomeEmailHtml,
  welcomeEmailText,
  welcomeSubject,
};

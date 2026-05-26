const nodemailer = require('nodemailer');
const { adminEmailTemplate } = require('./templates/adminEmail');
const { proEmailTemplate } = require('./templates/proEmail');
const { clientEmailTemplate } = require('./templates/clientEmail');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER || 'admin@example.com';

const FROM = process.env.MAIL_FROM || `Fidelity Plus <${SMTP_USER}>`;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn('[mailer] ⚠️  SMTP_USER / SMTP_PASS missing in .env — emails will fail.');
}

// =====================================================================
// SMTP only — Gmail via Nodemailer with app password.
// =====================================================================
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: SMTP_USER,
    // Gmail accepts the app password with or without spaces; strip just in case.
    pass: SMTP_PASS ? SMTP_PASS.replace(/\s+/g, '') : undefined,
  },
  pool: true,
  maxConnections: 3,
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

console.log('[mailer] 📨 Using Nodemailer SMTP (Gmail)');

async function verifyTransport() {
  try {
    await transporter.verify();
    console.log('[mailer] ✅ SMTP connection ready.');
    return true;
  } catch (err) {
    console.error('[mailer] ❌ SMTP verify failed:', err.message);
    return false;
  }
}

/**
 * Send via SMTP with up to 3 retries on transient failures (timeout,
 * ECONNRESET, Gmail 421/451). Hard refusals (auth, address) are not retried.
 * Accepts optional bcc so we can keep an audit trail in fidelity.plus45@gmail.com.
 */
async function sendMail({ to, subject, html, label, bcc }) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const info = await transporter.sendMail({ from: FROM, to, subject, html, bcc });
      console.log(
        `[mailer] → ${label} sent via SMTP (try ${i}):`,
        info.messageId,
        bcc ? `(bcc: ${bcc})` : '',
      );
      return info;
    } catch (err) {
      lastErr = err;
      const transient =
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNECTION' ||
        err.code === 'ECONNRESET' ||
        err.responseCode === 421 ||
        err.responseCode === 451;
      console.warn(`[mailer] ${label} attempt ${i}/3 failed: ${err.message}`);
      if (!transient || i === 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
  throw lastErr;
}

async function sendAdminMail(payload) {
  // Already goes to ADMIN_EMAIL — no need for an extra bcc copy.
  return sendMail({
    to: ADMIN_EMAIL,
    subject: `Nouvelle demande pro — ${payload.companyName}`,
    html: adminEmailTemplate(payload),
    label: 'admin email',
  });
}

async function sendProMail(payload) {
  return sendMail({
    to: payload.email,
    // BCC the admin so we always have a copy of every email actually sent.
    // Only add it if it differs from the recipient (avoid Gmail "duplicate").
    bcc: payload.email !== ADMIN_EMAIL ? ADMIN_EMAIL : undefined,
    subject: `Bienvenue sur Fidelity Plus — votre code d'accès`,
    html: proEmailTemplate(payload),
    label: 'pro email',
  });
}

async function sendClientWelcomeMail(payload) {
  return sendMail({
    to: payload.email,
    bcc: payload.email !== ADMIN_EMAIL ? ADMIN_EMAIL : undefined,
    subject: `Bienvenue sur Fidelity Plus — ton code de connexion`,
    html: clientEmailTemplate(payload),
    label: 'client welcome email',
  });
}

module.exports = { sendAdminMail, sendProMail, sendClientWelcomeMail, verifyTransport };

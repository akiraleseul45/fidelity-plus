const nodemailer = require('nodemailer');
const { adminEmailTemplate } = require('./templates/adminEmail');
const { proEmailTemplate } = require('./templates/proEmail');
const { clientEmailTemplate } = require('./templates/clientEmail');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn('[mailer] ⚠️  SMTP_USER / SMTP_PASS missing in .env — emails will fail.');
}

// Gmail SMTP transport using app password.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SMTP_USER,
    // Gmail accepts app passwords with or without spaces; strip just in case.
    pass: SMTP_PASS ? SMTP_PASS.replace(/\s+/g, '') : undefined,
  },
  // Pool + sane timeouts so a transient network glitch doesn't abort the
  // whole signup. Nodemailer will reuse a connection across sends.
  pool: true,
  maxConnections: 3,
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

/**
 * Send a mail with up to N retries on transient failures (timeout, ECONN…).
 * Hard refusals from Gmail (auth, address) are not retried.
 */
async function sendWithRetry(opts, label, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const info = await transporter.sendMail(opts);
      console.log(`[mailer] → ${label} sent (try ${i}):`, info.messageId);
      return info;
    } catch (err) {
      lastErr = err;
      const transient =
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNECTION' ||
        err.code === 'ECONNRESET' ||
        err.code === 'EDNS' ||
        err.responseCode === 421 ||
        err.responseCode === 451;
      console.warn(`[mailer] ${label} attempt ${i}/${attempts} failed: ${err.message}`);
      if (!transient || i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
  throw lastErr;
}

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

async function sendAdminMail(payload) {
  return sendWithRetry(
    {
      from: `"Fidelity Plus" <${SMTP_USER}>`,
      to: ADMIN_EMAIL,
      subject: `Nouvelle demande pro — ${payload.companyName}`,
      html: adminEmailTemplate(payload),
    },
    'admin email',
  );
}

async function sendProMail(payload) {
  return sendWithRetry(
    {
      from: `"Fidelity Plus" <${SMTP_USER}>`,
      to: payload.email,
      subject: `Bienvenue sur Fidelity Plus — votre code d'accès`,
      html: proEmailTemplate(payload),
    },
    'pro email',
  );
}

async function sendClientWelcomeMail(payload) {
  return sendWithRetry(
    {
      from: `"Fidelity Plus" <${SMTP_USER}>`,
      to: payload.email,
      subject: `Bienvenue sur Fidelity Plus — ton code de connexion`,
      html: clientEmailTemplate(payload),
    },
    'client welcome email',
  );
}

module.exports = { sendAdminMail, sendProMail, sendClientWelcomeMail, verifyTransport };

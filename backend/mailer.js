const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const { adminEmailTemplate } = require('./templates/adminEmail');
const { proEmailTemplate } = require('./templates/proEmail');
const { clientEmailTemplate } = require('./templates/clientEmail');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER || 'admin@example.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Resend free tier requires this exact "from" until you verify a domain.
const FROM = process.env.MAIL_FROM || 'Fidelity Plus <onboarding@resend.dev>';

// =====================================================================
// Strategy: prefer Resend (HTTP API — works on any cloud incl. Render).
// Fall back to Nodemailer + SMTP for local dev where SMTP isn't blocked.
// =====================================================================

const useResend = !!RESEND_API_KEY;
const resend = useResend ? new Resend(RESEND_API_KEY) : null;

// Nodemailer transport — only used when Resend is not configured.
let transporter = null;
if (!useResend && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS.replace(/\s+/g, ''),
    },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

if (useResend) {
  console.log('[mailer] 🚀 Using Resend HTTP API');
} else if (transporter) {
  console.log('[mailer] 📨 Using Nodemailer SMTP (Gmail)');
} else {
  console.warn('[mailer] ⚠️  No email backend configured. Set RESEND_API_KEY or SMTP_*.');
}

async function verifyTransport() {
  if (useResend) {
    console.log('[mailer] ✅ Resend ready (no SMTP handshake needed).');
    return true;
  }
  if (!transporter) return false;
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
 * Cross-provider send: tries Resend first if available, otherwise SMTP.
 * Throws on hard failure so the route can return 502.
 */
async function sendMail({ to, subject, html, label }) {
  if (useResend) {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) {
      console.error(`[mailer] Resend ${label} failed:`, error);
      throw new Error(error.message || 'Resend send failed');
    }
    console.log(`[mailer] → ${label} sent via Resend:`, data?.id);
    return data;
  }

  if (!transporter) throw new Error('No mail backend configured');

  // SMTP path with retry on transient failures.
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const info = await transporter.sendMail({ from: FROM, to, subject, html });
      console.log(`[mailer] → ${label} sent via SMTP (try ${i}):`, info.messageId);
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
    subject: `Bienvenue sur Fidelity Plus — votre code d'accès`,
    html: proEmailTemplate(payload),
    label: 'pro email',
  });
}

async function sendClientWelcomeMail(payload) {
  return sendMail({
    to: payload.email,
    subject: `Bienvenue sur Fidelity Plus — ton code de connexion`,
    html: clientEmailTemplate(payload),
    label: 'client welcome email',
  });
}

module.exports = { sendAdminMail, sendProMail, sendClientWelcomeMail, verifyTransport };

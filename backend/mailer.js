const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const { adminEmailTemplate } = require('./templates/adminEmail');
const { proEmailTemplate } = require('./templates/proEmail');
const { clientEmailTemplate } = require('./templates/clientEmail');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER || 'admin@example.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Resend free tier delivers from onboarding@resend.dev until a custom
// domain is verified. Set MAIL_FROM="Fidelity Plus <noreply@your.dom>"
// after you add + verify your domain in the Resend dashboard.
const FROM = process.env.MAIL_FROM || 'Fidelity Plus <onboarding@resend.dev>';

// =====================================================================
// Strategy: prefer Resend (HTTP API — works everywhere, incl. hosts
// that block outbound SMTP such as Render/Vercel/Fly free tiers).
// Fall back to Nodemailer + SMTP for local dev.
// =====================================================================
const useResend = !!RESEND_API_KEY;
const resend = useResend ? new Resend(RESEND_API_KEY) : null;

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
 * Cross-provider send. Resend first when configured, otherwise SMTP.
 * Supports an optional `bcc` so we keep an audit trail copy to admin.
 */
async function sendMail({ to, subject, html, label, bcc }) {
  if (useResend) {
    const payload = { from: FROM, to, subject, html };
    if (bcc) payload.bcc = bcc;
    const { data, error } = await resend.emails.send(payload);
    if (error) {
      console.error(`[mailer] Resend ${label} failed:`, error);
      throw new Error(error.message || 'Resend send failed');
    }
    console.log(
      `[mailer] → ${label} sent via Resend:`,
      data?.id,
      bcc ? `(bcc: ${bcc})` : '',
    );
    return data;
  }

  if (!transporter) throw new Error('No mail backend configured');

  // SMTP path with retry on transient failures (local dev only).
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

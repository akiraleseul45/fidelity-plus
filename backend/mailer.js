const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const { adminEmailTemplate } = require('./templates/adminEmail');
const { proEmailTemplate } = require('./templates/proEmail');
const { clientEmailTemplate } = require('./templates/clientEmail');

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER || 'admin@example.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// Default FROM: Resend's shared sender until a custom domain is verified.
// Set MAIL_FROM="Fidelity Plus <noreply@your.dom>" after domain verification.
const FROM = process.env.MAIL_FROM || 'Fidelity Plus <onboarding@resend.dev>';

// Parse "Name <email@host>" into {name, email}. Brevo wants them split.
function parseFrom(spec) {
  const m = /^\s*(?:"?([^"<]+?)"?\s*)?<\s*([^>\s]+)\s*>\s*$/.exec(spec);
  if (m) return { name: (m[1] || '').trim(), email: m[2].trim() };
  return { name: '', email: spec.trim() };
}

// =====================================================================
// Backend preference: BREVO > RESEND > SMTP.
// Brevo first: 300 emails/day free forever with just a verified sender
// (no domain needed) → ideal when the project doesn't yet own a domain.
// Resend second: 3000/month free but sandbox-only until domain verified.
// SMTP last: works in local dev but Render/Vercel/Fly block port 587.
// =====================================================================
const useBrevo = !!BREVO_API_KEY;
const useResend = !useBrevo && !!RESEND_API_KEY;
const resend = useResend ? new Resend(RESEND_API_KEY) : null;

let transporter = null;
if (!useBrevo && !useResend && SMTP_USER && SMTP_PASS) {
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

if (useBrevo) {
  console.log('[mailer] 🚀 Using Brevo HTTP API');
} else if (useResend) {
  console.log('[mailer] 🚀 Using Resend HTTP API');
} else if (transporter) {
  console.log('[mailer] 📨 Using Nodemailer SMTP (Gmail)');
} else {
  console.warn(
    '[mailer] ⚠️  No email backend configured. Set BREVO_API_KEY, RESEND_API_KEY or SMTP_*.',
  );
}

async function verifyTransport() {
  if (useBrevo) {
    console.log('[mailer] ✅ Brevo ready (no SMTP handshake needed).');
    return true;
  }
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
 * Cross-provider send. Brevo first, then Resend, then SMTP.
 * Supports an optional `bcc` so we keep an audit trail copy to admin.
 */
async function sendMail({ to, subject, html, label, bcc }) {
  if (useBrevo) {
    const sender = parseFrom(FROM);
    const payload = {
      sender: sender.name ? sender : { email: sender.email },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    };
    if (bcc) payload.bcc = [{ email: bcc }];
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[mailer] Brevo ${label} failed:`, resp.status, body);
      throw new Error(`Brevo ${resp.status}: ${body}`);
    }
    const data = await resp.json().catch(() => ({}));
    console.log(
      `[mailer] → ${label} sent via Brevo:`,
      data.messageId,
      bcc ? `(bcc: ${bcc})` : '',
    );
    return data;
  }

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
  // No BCC: the login code must never be copied to the admin (audit FP-11).
  return sendMail({
    to: payload.email,
    subject: `Bienvenue sur Fidelity Plus — votre code d'accès`,
    html: proEmailTemplate(payload),
    label: 'pro email',
  });
}

async function sendClientWelcomeMail(payload) {
  // No BCC: the login code must never be copied to the admin (audit FP-11).
  return sendMail({
    to: payload.email,
    subject: `Bienvenue sur Fidelity Plus — ton code de connexion`,
    html: clientEmailTemplate(payload),
    label: 'client welcome email',
  });
}

module.exports = { sendAdminMail, sendProMail, sendClientWelcomeMail, verifyTransport };

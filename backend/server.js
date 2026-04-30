require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { sendAdminMail, sendProMail, sendClientWelcomeMail, verifyTransport } = require('./mailer');
const clientsStore = require('./clientsStore');

const PORT = process.env.PORT || 3000;
const REQUESTS_FILE = path.join(__dirname, 'requests.json');

const app = express();

// CORS: in prod, set ALLOWED_ORIGINS to a comma-separated list of domains
// (e.g. "https://fidelity-plus.vercel.app"). Default '*' for local dev.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').trim();
app.use(
  cors({
    origin: ALLOWED_ORIGINS
      ? ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : '*',
  }),
);
app.use(express.json({ limit: '100kb' }));

// ---------- helpers ----------

function loadRequests() {
  try {
    if (!fs.existsSync(REQUESTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
  } catch (err) {
    console.error('[storage] failed to read requests.json:', err.message);
    return [];
  }
}

function saveRequests(list) {
  try {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[storage] failed to write requests.json:', err.message);
  }
}

function generateRestoCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function nonEmpty(s, min = 1) {
  return typeof s === 'string' && s.trim().length >= min;
}

// ---------- routes ----------

app.get('/', (_req, res) => {
  res.json({ name: 'fidelity-plus-backend', status: 'ok' });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/**
 * POST /api/pro/signup
 * Body: { ownerName, companyName, address, email, phoneFixed?, phoneMobile?, imageUrl? }
 */
app.post('/api/pro/signup', async (req, res) => {
  const {
    ownerName,
    companyName,
    address,
    lat,
    lng,
    email,
    phoneFixed,
    phoneMobile,
    imageUrl,
  } = req.body || {};

  // ---- validation ----
  if (!nonEmpty(ownerName, 2)) {
    return res.status(400).json({ success: false, error: 'Nom du domaine invalide.' });
  }
  if (!nonEmpty(companyName, 2)) {
    return res.status(400).json({ success: false, error: "Nom de l'entreprise invalide." });
  }
  if (!nonEmpty(address, 5)) {
    return res.status(400).json({ success: false, error: 'Adresse invalide.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ success: false, error: 'Email invalide.' });
  }

  const cleanOwner = ownerName.trim();
  const cleanCompany = companyName.trim();
  const cleanAddress = address.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanFixed = typeof phoneFixed === 'string' ? phoneFixed.trim() : '';
  const cleanMobile = typeof phoneMobile === 'string' ? phoneMobile.trim() : '';
  const cleanImage = typeof imageUrl === 'string' ? imageUrl.trim() : '';

  // ---- dedupe by email (active demand within 24h) ----
  const requests = loadRequests();
  const recent = requests.find(
    (r) => r.email === cleanEmail && Date.now() - r.createdAt < 24 * 60 * 60 * 1000,
  );
  if (recent) {
    return res.status(429).json({
      success: false,
      error: 'Une demande a déjà été envoyée pour cet email dans les dernières 24h.',
    });
  }

  // ---- generate ----
  const code = generateRestoCode();
  const cleanLat = typeof lat === 'number' && Number.isFinite(lat) ? lat : null;
  const cleanLng = typeof lng === 'number' && Number.isFinite(lng) ? lng : null;
  const record = {
    id: crypto.randomUUID(),
    ownerName: cleanOwner,
    companyName: cleanCompany,
    address: cleanAddress,
    lat: cleanLat,
    lng: cleanLng,
    email: cleanEmail,
    phoneFixed: cleanFixed,
    phoneMobile: cleanMobile,
    imageUrl: cleanImage,
    code,
    createdAt: Date.now(),
    status: 'pending',
  };

  // ---- send emails ----
  try {
    await Promise.all([
      sendAdminMail(record),
      sendProMail(record),
    ]);
  } catch (err) {
    console.error('[signup] email failure:', err);
    return res.status(502).json({
      success: false,
      error: "Impossible d'envoyer les emails. Réessaie plus tard.",
    });
  }

  // ---- persist after success ----
  requests.unshift(record);
  saveRequests(requests);

  return res.json({
    success: true,
    code,
    message: 'Demande envoyée. Vérifie ta boîte mail.',
  });
});

/**
 * POST /api/pro/login
 * Body: { code }
 * Validates an access code against the persisted requests.json and returns
 * the restaurant info so the app can hydrate its local state.
 */
app.post('/api/pro/login', (req, res) => {
  const { code } = req.body || {};
  if (!nonEmpty(code, 4)) {
    return res.status(400).json({ success: false, error: 'Code invalide.' });
  }
  const normalized = code.trim().toUpperCase();
  const requests = loadRequests();
  const match = requests.find((r) => r.code && r.code.toUpperCase() === normalized);
  if (!match) {
    return res.status(404).json({ success: false, error: 'Code inconnu.' });
  }
  return res.json({
    success: true,
    restaurant: serializeRestaurant(match),
  });
});

/**
 * GET /api/pro/restaurants
 * Returns the list of registered pro accounts (used by the app to sync its
 * local restaurants memory with the server's source of truth).
 */
app.get('/api/pro/restaurants', (_req, res) => {
  const requests = loadRequests();
  res.json({ success: true, restaurants: requests.map(serializeRestaurant) });
});

function serializeRestaurant(r) {
  return {
    id: r.id,
    code: r.code,
    ownerName: r.ownerName,
    companyName: r.companyName,
    address: r.address || '',
    lat: typeof r.lat === 'number' ? r.lat : null,
    lng: typeof r.lng === 'number' ? r.lng : null,
    phoneFixed: r.phoneFixed || '',
    phoneMobile: r.phoneMobile || '',
    email: r.email,
    imageUrl: r.imageUrl || '',
    createdAt: r.createdAt,
    status: r.status,
  };
}

// =====================================================================
// CLIENT (end-user) routes — instant signup with permanent 5-digit code
// =====================================================================

/**
 * POST /api/client/signup
 * Body: { pseudonym, email? }
 * Generates a permanent 5-digit login code, persists the client, and (if an
 * email is provided) sends a welcome email containing that code.
 */
app.post('/api/client/signup', async (req, res) => {
  const { pseudonym, email } = req.body || {};

  if (!nonEmpty(pseudonym, 2)) {
    return res.status(400).json({ success: false, error: 'Pseudonyme invalide.' });
  }
  if (email && !isEmail(email)) {
    return res.status(400).json({ success: false, error: 'Email invalide.' });
  }

  const { record, isNew } = clientsStore.createClient({ pseudonym, email });

  // Fire-and-log email send: failure to email must NOT block the signup —
  // the user already sees the code on screen.
  if (record.email) {
    try {
      await sendClientWelcomeMail({
        pseudonym: record.pseudonym,
        email: record.email,
        code: record.loginCode,
      });
    } catch (err) {
      console.error('[client/signup] welcome email failed:', err.message);
    }
  }

  return res.json({
    success: true,
    client: {
      id: record.id,
      pseudonym: record.pseudonym,
      email: record.email,
      loginCode: record.loginCode,
    },
    isNew,
  });
});

/**
 * POST /api/client/login
 * Body: { code }
 * Permanent login using the 5-digit code generated at signup.
 */
app.post('/api/client/login', (req, res) => {
  const { code } = req.body || {};
  if (!nonEmpty(code, 4)) {
    return res.status(400).json({ success: false, error: 'Code manquant.' });
  }

  const client = clientsStore.loginByCodeOnly(String(code));
  if (!client) {
    return res.status(404).json({ success: false, error: 'Code inconnu.' });
  }

  return res.json({
    success: true,
    client: {
      id: client.id,
      pseudonym: client.pseudonym,
      loginCode: client.loginCode,
    },
  });
});

// ---------- start ----------

app.listen(PORT, async () => {
  console.log(`\n🚀 Fidelity Plus backend → http://localhost:${PORT}`);
  console.log(`   POST  /api/pro/signup`);
  console.log(`   POST  /api/pro/login`);
  console.log(`   GET   /api/pro/restaurants`);
  console.log(`   POST  /api/client/signup`);
  console.log(`   POST  /api/client/login`);
  console.log(`   GET   /health\n`);
  await verifyTransport();
});

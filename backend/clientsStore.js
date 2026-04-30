const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'clients.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return [];
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    console.error('[clientsStore] read failed:', err.message);
    return [];
  }
}

function save(list) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[clientsStore] write failed:', err.message);
  }
}

function generate5DigitCode(taken = new Set()) {
  for (let i = 0; i < 50; i++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (!taken.has(code)) return code;
  }
  return String(10000 + Math.floor(Math.random() * 90000));
}

/**
 * Create a permanent client account immediately. The 5-digit login code is
 * generated server-side, persisted, and returned to the caller — the client
 * is responsible for keeping it. Each call creates a new client account.
 */
function createClient({ pseudonym, email }) {
  const all = load();

  const taken = new Set(all.map((c) => c.loginCode).filter(Boolean));
  const code = generate5DigitCode(taken);

  const record = {
    id: crypto.randomUUID(),
    pseudonym: pseudonym.trim(),
    email: email && email.trim() ? email.trim().toLowerCase() : undefined,
    loginCode: code,
    createdAt: Date.now(),
  };

  all.unshift(record);
  save(all);
  return { record, isNew: true };
}

function loginByCodeOnly(code) {
  const all = load();
  return all.find((c) => c.loginCode === code.trim()) || null;
}

module.exports = {
  load,
  createClient,
  loginByCodeOnly,
};

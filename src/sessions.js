// Minimal in-memory session store, keyed by a random cookie token (no external deps).
const crypto = require('crypto');

const sessions = new Map(); // token -> { userId, expires }
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = decodeURIComponent(part.slice(i + 1).trim());
    out[k] = v;
  }
  return out;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies['rz_sid'];
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return { token, ...s };
}

function createSession(res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId, expires: Date.now() + TTL_MS });
  setCookie(res, token);
  return token;
}

function setCookie(res, token) {
  const secure = process.env.BASE_URL && process.env.BASE_URL.startsWith('https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `rz_sid=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(TTL_MS / 1000)}; SameSite=Lax${secure}`);
}

function destroySession(req, res) {
  const cookies = parseCookies(req);
  const token = cookies['rz_sid'];
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'rz_sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}

module.exports = { getSession, createSession, destroySession, parseCookies };

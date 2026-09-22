require('./env').loadEnv();
const path = require('path');
const fs = require('fs');
const http = require('http');
const { URL } = require('url');

const discord = require('./discord');
const { upsertUser, getUser, getLeaderboard } = require('./db');
const GAMES = require('./games');
const { MAPS: HIDESEEK_MAPS } = require('./games/hideseek-maps');
const mm = require('./matchmaking');
const sessions = require('./sessions');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { req.destroy(); reject(new Error('too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { return {}; }
}

function currentUser(req) {
  const sess = sessions.getSession(req);
  if (!sess) return null;
  return getUser(sess.userId);
}

// ---------- static file serving ----------
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'forbidden');
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'not found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------- route handlers ----------
const routes = [];
function route(method, matcher, handler) { routes.push({ method, matcher, handler }); }

route('GET', '/auth/discord', async (req, res) => {
  send(res, 302, '', { Location: discord.getAuthUrl() });
});

route('GET', '/auth/discord/callback', async (req, res, url) => {
  const code = url.searchParams.get('code');
  if (!code) return send(res, 302, '', { Location: '/?auth=error' });
  try {
    const token = await discord.exchangeCode(code);
    const du = await discord.fetchDiscordUser(token.access_token);
    const member = await discord.fetchGuildMember(du.id);
    const user = {
      id: du.id,
      username: du.username,
      display_name: discord.displayName(du, member),
      avatar_url: discord.avatarUrl(du, member)
    };
    upsertUser(user);
    sessions.createSession(res, user.id);
    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (e) {
    console.error(e);
    send(res, 302, '', { Location: '/?auth=error' });
  }
});

route('POST', '/auth/logout', async (req, res) => {
  sessions.destroySession(req, res);
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/me', async (req, res) => {
  sendJson(res, 200, { user: currentUser(req) });
});

route('GET', '/api/games', async (req, res) => {
  sendJson(res, 200, { games: GAMES });
});

route('GET', '/api/hideseek-maps', async (req, res) => {
  sendJson(res, 200, { maps: HIDESEEK_MAPS });
});

route('GET', /^\/api\/leaderboard\/([a-z]+)$/, async (req, res, url, m) => {
  const game = m[1];
  if (!GAMES[game]) return sendJson(res, 404, { error: 'not found' });
  sendJson(res, 200, { leaderboard: getLeaderboard(game) });
});

route('GET', '/api/logo', async (req, res) => {
  const dir = path.join(PUBLIC_DIR, 'img');
  const found = fs.existsSync(dir) ? fs.readdirSync(dir).find(f => f.startsWith('logo.')) : null;
  sendJson(res, 200, { url: found ? '/img/' + found + '?t=' + Date.now() : null });
});

route('POST', '/api/logo', async (req, res) => {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'يجب تسجيل الدخول' });
  const ct = req.headers['content-type'] || '';
  const extMap = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' };
  const ext = extMap[ct.split(';')[0].trim()];
  if (!ext) return sendJson(res, 400, { error: 'نوع صورة غير مدعوم' });
  try {
    const buf = await readBody(req, 3 * 1024 * 1024);
    const dir = path.join(PUBLIC_DIR, 'img');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // remove any previous logo.* so only one exists
    for (const f of fs.readdirSync(dir)) if (f.startsWith('logo.')) fs.unlinkSync(path.join(dir, f));
    fs.writeFileSync(path.join(dir, 'logo' + ext), buf);
    sendJson(res, 200, { ok: true, url: '/img/logo' + ext + '?t=' + Date.now() });
  } catch (e) {
    sendJson(res, 400, { error: 'فشل رفع الصورة' });
  }
});

// ---- matchmaking / room API (polled by the client) ----
route('POST', '/api/queue/join', async (req, res) => {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'يجب تسجيل الدخول' });
  const { game } = await readJsonBody(req);
  const player = { id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url };
  const result = mm.enqueue(game, player);
  sendJson(res, 200, result);
});

route('POST', '/api/queue/leave', async (req, res) => {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'يجب تسجيل الدخول' });
  const { game } = await readJsonBody(req);
  mm.dequeue(game, user.id);
  sendJson(res, 200, { ok: true });
});

route('POST', '/api/room/ready', async (req, res) => {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'يجب تسجيل الدخول' });
  const room = mm.getRoomByUser(user.id);
  if (room) mm.setReady(room, user.id);
  sendJson(res, 200, { ok: true });
});

route('POST', '/api/room/leave', async (req, res) => {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'يجب تسجيل الدخول' });
  mm.dequeueAll(user.id);
  mm.leaveRoom(user.id);
  sendJson(res, 200, { ok: true });
});

route('POST', '/api/room/action', async (req, res) => {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'يجب تسجيل الدخول' });
  const { action, payload } = await readJsonBody(req);
  const room = mm.getRoomByUser(user.id);
  if (room) mm.handleAction(room, user.id, action, payload);
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/room/state', async (req, res) => {
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'يجب تسجيل الدخول' });
  sendJson(res, 200, mm.viewFor(user.id));
});

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      if (typeof r.matcher === 'string') {
        if (r.matcher === url.pathname) return await r.handler(req, res, url, null);
      } else {
        const m = url.pathname.match(r.matcher);
        if (m) return await r.handler(req, res, url, m);
      }
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
    send(res, 404, 'not found');
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'خطأ بالسيرفر' });
  }
});

server.listen(PORT, () => {
  console.log(`Razq Store server running on http://localhost:${PORT}`);
});

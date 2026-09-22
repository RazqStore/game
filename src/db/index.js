// Zero-dependency JSON-file database. Fine for a single Discord group's traffic.
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const FILES = {
  users: path.join(dataDir, 'users.json'),
  stats: path.join(dataDir, 'stats.json'),
  matches: path.join(dataDir, 'matches.json')
};

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = readJson(FILES.users, {});       // id -> user
let stats = readJson(FILES.stats, {});       // `${userId}:${game}` -> {wins,losses,played,points}
let matches = readJson(FILES.matches, []);   // array of {id, game, winnerId, players, createdAt}

function upsertUser(user) {
  users[user.id] = { ...(users[user.id] || {}), ...user, id: user.id };
  writeJson(FILES.users, users);
}

function getUser(id) {
  return users[id] || null;
}

function recordResult(game, winnerId, playerIds) {
  matches.push({ id: matches.length + 1, game, winnerId: winnerId || null, players: playerIds, createdAt: Date.now() });
  writeJson(FILES.matches, matches);

  for (const pid of playerIds) {
    const key = `${pid}:${game}`;
    const cur = stats[key] || { userId: pid, game, wins: 0, losses: 0, played: 0, points: 0 };
    cur.played += 1;
    const isWinner = pid === winnerId;
    if (isWinner) { cur.wins += 1; cur.points += 10; }
    else { if (winnerId) cur.losses += 1; cur.points += 1; }
    stats[key] = cur;
  }
  writeJson(FILES.stats, stats);
}

function getLeaderboard(game, limit = 10) {
  return Object.values(stats)
    .filter(s => s.game === game)
    .sort((a, b) => (b.points - a.points) || (b.wins - a.wins))
    .slice(0, limit)
    .map(s => {
      const u = users[s.userId] || {};
      return { ...s, display_name: u.display_name || '؟', avatar_url: u.avatar_url || '' };
    });
}

module.exports = { upsertUser, getUser, recordResult, getLeaderboard };

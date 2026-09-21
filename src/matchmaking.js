const { randomUUID } = require('crypto');
const GAMES = require('./games');
const engines = require('./games/engines');
const { recordResult } = require('./db');

const queues = {};          // game -> [{id, displayName, avatarUrl}]
const rooms = new Map();    // roomId -> Room
const playerRoom = new Map(); // userId -> roomId
const lastSeen = new Map();   // userId -> timestamp (heartbeat via polling /api/room/state)

for (const g of Object.keys(GAMES)) queues[g] = [];

const STALE_MS = 12000; // if a player hasn't polled in this long, treat them as gone

function publicPlayer(p) {
  return { id: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl };
}

class Room {
  constructor(game, players) {
    this.id = randomUUID();
    this.game = game;
    this.players = players;
    this.phase = 'ready'; // ready -> playing -> finished
    this.readySet = new Set();
    this.state = null;
    this.createdAt = Date.now();
    this.events = []; // small log of transient events (playerLeft, cancelled) for clients to read once
    for (const p of players) playerRoom.set(p.id, this.id);
  }
  everyoneReady() { return this.players.every(p => this.readySet.has(p.id)); }
}

function alivePlayers(room) {
  const elim = (room.state && room.state.eliminated) || [];
  return room.players.filter(p => !elim.includes(p.id));
}

function touch(userId) { lastSeen.set(userId, Date.now()); }

function enqueue(game, player) {
  if (!GAMES[game]) return { error: 'لعبة غير معروفة' };
  if (playerRoom.has(player.id)) return { error: 'انت بالفعل داخل لعبة' };
  touch(player.id);
  queues[game] = queues[game].filter(p => p.id !== player.id);
  queues[game].push(player);

  const min = GAMES[game].min;
  if (queues[game].length >= min) {
    const players = queues[game].splice(0, Math.min(GAMES[game].max, queues[game].length));
    const room = new Room(game, players);
    rooms.set(room.id, room);
    return { matched: true, roomId: room.id };
  }
  return { queued: true, position: queues[game].length, needed: min };
}

function dequeue(game, userId) {
  if (queues[game]) queues[game] = queues[game].filter(p => p.id !== userId);
}

function dequeueAll(userId) {
  for (const g of Object.keys(queues)) dequeue(g, userId);
}

function getRoomByUser(userId) {
  const roomId = playerRoom.get(userId);
  return roomId ? rooms.get(roomId) : null;
}

function setReady(room, userId) {
  room.readySet.add(userId);
  if (room.everyoneReady() && room.phase === 'ready') {
    room.phase = 'playing';
    const engine = engines[room.game];
    room.state = engine.init(room.players);
  }
}

function leaveRoom(userId) {
  const roomId = playerRoom.get(userId);
  if (!roomId) return;
  const room = rooms.get(roomId);
  playerRoom.delete(userId);
  if (!room) return;

  room.readySet.delete(userId);
  const leaver = room.players.find(p => p.id === userId);
  room.players = room.players.filter(p => p.id !== userId);

  if (room.phase === 'playing' && engines[room.game] && engines[room.game].onLeave) {
    engines[room.game].onLeave(room, userId);
  }
  room.events.push({ type: 'playerLeft', displayName: leaver ? leaver.displayName : null, at: Date.now() });

  if (room.players.length < 1) { rooms.delete(roomId); return; }

  if (room.phase === 'playing' && room.players.length === 1) {
    finishRoom(room, room.players[0].id);
  } else if (room.phase === 'ready') {
    room.events.push({ type: 'cancelled', reason: 'لاعب غادر قبل بداية اللعبة', at: Date.now() });
    for (const p of room.players) playerRoom.delete(p.id);
    setTimeout(() => rooms.delete(roomId), 4000);
  }
}

function handleAction(room, userId, action, payload) {
  const engine = engines[room.game];
  if (!engine || room.phase !== 'playing') return;
  engine.onAction(room, userId, action, payload);
  if (room.state && room.state.gameOver) finishRoom(room, room.state.winnerId);
}

function finishRoom(room, winnerId) {
  if (room.phase === 'finished') return;
  room.phase = 'finished';
  if (room.state) room.state.gameOver = true;
  room.state.winnerId = winnerId || null;
  const playerIds = room.players.map(p => p.id);
  try { recordResult(room.game, winnerId, playerIds); } catch (e) { console.error('recordResult error', e); }
  // keep the playerRoom mapping so polling clients can see the "over" result,
  // then clean everything up after a short grace period.
  setTimeout(() => {
    for (const p of room.players) {
      if (playerRoom.get(p.id) === room.id) playerRoom.delete(p.id);
    }
    rooms.delete(room.id);
  }, 15000);
}

// Advance any room's timed engine (chairs/bomb/mafia/replika) - called on a global tick.
function tickAll() {
  for (const room of rooms.values()) {
    if (room.phase !== 'playing') continue;
    const engine = engines[room.game];
    if (!engine.tickMs) continue;
    if (!room._lastTick || Date.now() - room._lastTick >= engine.tickMs) {
      room._lastTick = Date.now();
      engine.onTick(room);
      if (room.state && room.state.gameOver) finishRoom(room, room.state.winnerId);
    }
  }
  // sweep stale players (closed tab / lost connection) out of active rooms and queues
  const now = Date.now();
  for (const [userId, roomId] of [...playerRoom.entries()]) {
    const seen = lastSeen.get(userId) || 0;
    if (now - seen > STALE_MS) {
      leaveRoom(userId);
    }
  }
  for (const g of Object.keys(queues)) {
    queues[g] = queues[g].filter(p => (now - (lastSeen.get(p.id) || 0)) <= STALE_MS);
  }
}
setInterval(tickAll, 400);

// Build the JSON view sent to a specific player via polling.
function viewFor(userId) {
  touch(userId);
  const room = getRoomByUser(userId);
  if (!room) {
    // was queued anywhere?
    for (const g of Object.keys(queues)) {
      if (queues[g].some(p => p.id === userId)) {
        return { status: 'queued', game: g, position: queues[g].findIndex(p => p.id === userId) + 1, needed: GAMES[g].min };
      }
    }
    return { status: 'idle' };
  }
  const base = {
    roomId: room.id,
    game: room.game,
    players: room.players.map(publicPlayer),
    events: room.events.splice(0, room.events.length)
  };
  if (room.phase === 'ready') {
    return { ...base, status: 'ready', readySet: [...room.readySet] };
  }
  const engine = engines[room.game];
  const pub = engine.publicState(room.state, room.players);
  const extra = engine.privateFor ? engine.privateFor(room.state, userId) : null;
  const state = extra ? { ...pub, ...extra } : pub;
  if (room.phase === 'finished') {
    const winner = room.players.find(p => p.id === room.state.winnerId);
    return { ...base, status: 'over', state, winnerId: room.state.winnerId, winnerName: winner ? winner.displayName : null };
  }
  return { ...base, status: 'playing', state };
}

module.exports = {
  enqueue, dequeue, dequeueAll, leaveRoom, setReady, handleAction,
  getRoomByUser, viewFor, touch, rooms, queues
};

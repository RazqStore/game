// Server-authoritative game engines. Each engine: { init(players), onAction(room,userId,action,payload,io), publicState(state,players), tickMs?, onTick(room,io)?, onLeave(room,userId)? }
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

function alivePlayers(room) {
  const elim = (room.state && room.state.eliminated) || [];
  return room.players.filter(p => !elim.includes(p.id));
}

// ---------------- XO ----------------
const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const xo = {
  init(players) {
    const [a, b] = players;
    return { board: Array(9).fill(null), turn: a.id, symbols: { [a.id]: 'x', [b.id]: 'o' }, gameOver: false, winnerId: null };
  },
  onAction(room, userId, action, payload) {
    const s = room.state;
    if (action !== 'move' || s.gameOver || s.turn !== userId) return;
    const i = payload && payload.index;
    if (typeof i !== 'number' || i < 0 || i > 8 || s.board[i]) return;
    s.board[i] = s.symbols[userId];
    const other = room.players.find(p => p.id !== userId).id;
    for (const [a, b, c] of WINS) {
      if (s.board[a] && s.board[a] === s.board[b] && s.board[b] === s.board[c]) {
        s.gameOver = true; s.winnerId = userId; return;
      }
    }
    if (s.board.every(x => x)) { s.gameOver = true; s.winnerId = null; return; }
    s.turn = other;
  },
  publicState(s) { return s; }
};

// ---------------- Dice ----------------
const dice = {
  init(players) {
    return { rolls: {}, active: players.map(p => p.id), results: {}, gameOver: false, winnerId: null };
  },
  onAction(room, userId, action) {
    const s = room.state;
    if (action !== 'roll' || s.gameOver) return;
    if (!s.active.includes(userId) || s.rolls[userId]) return;
    s.rolls[userId] = 1 + rand(6);
    if (s.active.every(id => s.rolls[id] != null)) {
      const max = Math.max(...s.active.map(id => s.rolls[id]));
      const top = s.active.filter(id => s.rolls[id] === max);
      s.results = { ...s.rolls };
      if (top.length === 1) { s.gameOver = true; s.winnerId = top[0]; }
      else { s.active = top; s.rolls = {}; s.tie = true; }
    }
  },
  publicState(s) { return s; }
};

// ---------------- RPS ----------------
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const rps = {
  init(players) {
    const [a, b] = players;
    return { choices: {}, score: { [a.id]: 0, [b.id]: 0 }, round: 1, lastResult: null, gameOver: false, winnerId: null };
  },
  onAction(room, userId, action, payload) {
    const s = room.state;
    if (action !== 'choose' || s.gameOver) return;
    if (!['rock', 'paper', 'scissors'].includes(payload && payload.choice)) return;
    if (s.choices[userId]) return;
    s.choices[userId] = payload.choice;
    const ids = room.players.map(p => p.id);
    if (ids.every(id => s.choices[id])) {
      const [p1, p2] = ids;
      const c1 = s.choices[p1], c2 = s.choices[p2];
      let roundWinner = null;
      if (c1 !== c2) roundWinner = BEATS[c1] === c2 ? p1 : p2;
      if (roundWinner) s.score[roundWinner]++;
      s.lastResult = { choices: { ...s.choices }, roundWinner };
      s.choices = {};
      s.round++;
      const winner = ids.find(id => s.score[id] >= 2);
      if (winner) { s.gameOver = true; s.winnerId = winner; }
    }
  },
  publicState(s) {
    // hide in-progress choices from opponents
    return { score: s.score, round: s.round, lastResult: s.lastResult, gameOver: s.gameOver, winnerId: s.winnerId, waitingOn: Object.keys(s.choices || {}) };
  }
};

// ---------------- Chairs ----------------
const chairs = {
  tickMs: 500,
  init(players) {
    return {
      phase: 'walking', eliminated: [], claimed: {}, round: 1,
      phaseEndsAt: Date.now() + 4000 + rand(3000), gameOver: false, winnerId: null
    };
  },
  onTick(room) {
    const s = room.state;
    const active = alivePlayers(room);
    if (active.length <= 1) { s.gameOver = true; s.winnerId = active[0] ? active[0].id : null; return; }
    if (Date.now() < s.phaseEndsAt) return;
    if (s.phase === 'walking') {
      s.phase = 'stopped';
      s.claimed = {};
      s.chairs = active.length - 1;
      s.phaseEndsAt = Date.now() + 3000;
    } else {
      const claimedIds = Object.keys(s.claimed);
      const out = active.map(p => p.id).filter(id => !claimedIds.includes(id));
      // eliminate whoever didn't sit (could be more than one if lag; pick one randomly to keep game fair)
      if (out.length) {
        const loser = out.length === 1 ? out[0] : pick(out);
        s.eliminated.push(loser);
      }
      s.round++;
      s.phase = 'walking';
      s.phaseEndsAt = Date.now() + 4000 + rand(3000);
      const stillActive = alivePlayers(room);
      if (stillActive.length <= 1) { s.gameOver = true; s.winnerId = stillActive[0] ? stillActive[0].id : null; }
    }
  },
  onAction(room, userId, action) {
    const s = room.state;
    if (action !== 'sit' || s.phase !== 'stopped' || s.gameOver) return;
    if (s.eliminated.includes(userId) || s.claimed[userId]) return;
    if (Object.keys(s.claimed).length >= s.chairs) return;
    s.claimed[userId] = true;
  },
  publicState(s) { return s; }
};

// ---------------- Roulette ----------------
const roulette = {
  init(players) {
    const order = players.map(p => p.id);
    return { order, turn: order[0], eliminated: [], lastSpin: null, gameOver: false, winnerId: null };
  },
  onAction(room, userId, action) {
    const s = room.state;
    if (action !== 'spin' || s.gameOver || s.turn !== userId) return;
    const trapChance = 1 / Math.max(2, alivePlayers(room).length);
    const hit = Math.random() < Math.max(0.2, trapChance);
    s.lastSpin = { playerId: userId, hit };
    if (hit) s.eliminated.push(userId);
    const active = alivePlayers(room);
    if (active.length <= 1) { s.gameOver = true; s.winnerId = active[0] ? active[0].id : null; return; }
    const idx = s.order.indexOf(userId);
    for (let step = 1; step <= s.order.length; step++) {
      const next = s.order[(idx + step) % s.order.length];
      if (!s.eliminated.includes(next)) { s.turn = next; break; }
    }
  },
  publicState(s) { return s; }
};

// ---------------- Bomb ----------------
const bomb = {
  tickMs: 300,
  init(players) {
    const holder = pick(players).id;
    return { holder, eliminated: [], explodeAt: Date.now() + 8000 + rand(7000), gameOver: false, winnerId: null, order: players.map(p=>p.id) };
  },
  nextHolder(room, exclude) {
    const active = alivePlayers(room).map(p => p.id).filter(id => id !== exclude);
    return active.length ? pick(active) : null;
  },
  onTick(room) {
    const s = room.state;
    const active = alivePlayers(room);
    if (active.length <= 1) { s.gameOver = true; s.winnerId = active[0] ? active[0].id : null; return; }
    if (Date.now() >= s.explodeAt) {
      s.eliminated.push(s.holder);
      const remain = alivePlayers(room);
      if (remain.length <= 1) { s.gameOver = true; s.winnerId = remain[0] ? remain[0].id : null; return; }
      s.holder = pick(remain).id;
      s.explodeAt = Date.now() + 6000 + rand(6000);
    }
  },
  onAction(room, userId, action) {
    const s = room.state;
    if (action !== 'pass' || s.gameOver || s.holder !== userId) return;
    const next = bomb.nextHolder(room, userId);
    if (next) s.holder = next;
  },
  publicState(s) { return { holder: s.holder, eliminated: s.eliminated, gameOver: s.gameOver, winnerId: s.winnerId }; } // explodeAt hidden = suspense
};

// ---------------- Hide & Seek ----------------
const hideseek = {
  init(players) {
    const seeker = pick(players).id;
    return {
      seekerId: seeker, spots: 6, hidden: {}, caught: [], round: 1, maxRounds: 4,
      lastSearch: null, gameOver: false, winnerId: null
    };
  },
  onAction(room, userId, action, payload) {
    const s = room.state;
    if (s.gameOver) return;
    if (action === 'hide' && userId !== s.seekerId) {
      if (s.caught.includes(userId) || s.hidden[userId]) return;
      const spot = payload && payload.spot;
      if (typeof spot !== 'number' || spot < 0 || spot >= s.spots) return;
      s.hidden[userId] = spot;
    } else if (action === 'search' && userId === s.seekerId) {
      if (s.lastSearch && s.lastSearch.round === s.round) return;
      const spot = payload && payload.spot;
      if (typeof spot !== 'number' || spot < 0 || spot >= s.spots) return;
      const caughtNow = Object.entries(s.hidden).filter(([pid, sp]) => sp === spot && !s.caught.includes(pid)).map(([pid]) => pid);
      s.caught.push(...caughtNow);
      s.lastSearch = { round: s.round, spot, caughtNow };
      const hiders = room.players.filter(p => p.id !== s.seekerId);
      const allCaught = hiders.every(p => s.caught.includes(p.id));
      if (allCaught) { s.gameOver = true; s.winnerId = s.seekerId; return; }
      s.round++;
      s.hidden = {};
      if (s.round > s.maxRounds) {
        const survivor = hiders.find(p => !s.caught.includes(p.id));
        s.gameOver = true; s.winnerId = survivor ? survivor.id : s.seekerId;
      }
    }
  },
  publicState(s, players) {
    return {
      seekerId: s.seekerId, spots: s.spots, round: s.round, maxRounds: s.maxRounds,
      caught: s.caught, lastSearch: s.lastSearch, gameOver: s.gameOver, winnerId: s.winnerId,
      hiddenCount: Object.keys(s.hidden).length
    };
  },
  privateFor(s, playerId) {
    if (playerId === s.seekerId) return { isSeeker: true };
    return { isSeeker: false, yourSpot: s.hidden[playerId] != null ? s.hidden[playerId] : null };
  }
};

// ---------------- Mafia ----------------
const mafia = {
  tickMs: 1000,
  init(players) {
    const n = players.length;
    const mafiaCount = Math.max(1, Math.floor(n / 3));
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const roles = {};
    shuffled.forEach((p, i) => { roles[p.id] = i < mafiaCount ? 'mafia' : 'citizen'; });
    return {
      roles, phase: 'night', eliminated: [], nightVotes: {}, dayVotes: {},
      phaseEndsAt: Date.now() + 20000, log: [], gameOver: false, winnerId: null, dayNum: 1
    };
  },
  checkWin(room) {
    const s = room.state;
    const active = alivePlayers(room);
    const mafiaAlive = active.filter(p => s.roles[p.id] === 'mafia').length;
    const citizenAlive = active.length - mafiaAlive;
    if (mafiaAlive === 0) { s.gameOver = true; const c = active.find(p=>s.roles[p.id]==='citizen'); s.winnerId = c ? c.id : null; s.winSide='citizens'; return true; }
    if (mafiaAlive >= citizenAlive) { s.gameOver = true; const m = active.find(p=>s.roles[p.id]==='mafia'); s.winnerId = m ? m.id : null; s.winSide='mafia'; return true; }
    return false;
  },
  resolveNight(room) {
    const s = room.state;
    const votes = Object.values(s.nightVotes);
    let victim = null;
    if (votes.length) {
      const counts = {};
      votes.forEach(v => counts[v] = (counts[v]||0)+1);
      victim = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
    }
    if (victim) s.eliminated.push(victim);
    s.log.push({ type: 'night', dayNum: s.dayNum, victim });
    s.nightVotes = {};
    if (mafia.checkWin(room)) return;
    s.phase = 'day';
    s.phaseEndsAt = Date.now() + 30000;
  },
  resolveDay(room) {
    const s = room.state;
    const votes = Object.values(s.dayVotes);
    let out = null;
    if (votes.length) {
      const counts = {};
      votes.forEach(v => counts[v] = (counts[v]||0)+1);
      out = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
    }
    if (out) s.eliminated.push(out);
    s.log.push({ type: 'day', dayNum: s.dayNum, out });
    s.dayVotes = {};
    if (mafia.checkWin(room)) return;
    s.dayNum++;
    s.phase = 'night';
    s.phaseEndsAt = Date.now() + 20000;
  },
  onTick(room) {
    const s = room.state;
    if (s.gameOver || Date.now() < s.phaseEndsAt) return;
    if (s.phase === 'night') mafia.resolveNight(room); else mafia.resolveDay(room);
  },
  onAction(room, userId, action, payload) {
    const s = room.state;
    if (s.gameOver) return;
    const active = alivePlayers(room).map(p => p.id);
    if (!active.includes(userId)) return;
    if (action === 'nightVote' && s.phase === 'night' && s.roles[userId] === 'mafia') {
      if (active.includes(payload && payload.targetId)) s.nightVotes[userId] = payload.targetId;
    } else if (action === 'dayVote' && s.phase === 'day') {
      if (active.includes(payload && payload.targetId)) s.dayVotes[userId] = payload.targetId;
    }
  },
  publicState(s, players) {
    return {
      phase: s.phase, dayNum: s.dayNum, eliminated: s.eliminated, log: s.log,
      phaseEndsAt: s.phaseEndsAt, gameOver: s.gameOver, winnerId: s.winnerId, winSide: s.winSide,
    };
  },
  privateFor(s, playerId) {
    const role = s.roles[playerId];
    const extra = { yourRole: role };
    if (role === 'mafia') {
      extra.mafiaTeam = Object.entries(s.roles).filter(([id, r]) => r === 'mafia').map(([id]) => id);
    }
    if (s.gameOver) extra.allRoles = s.roles;
    return extra;
  }
};

// ---------------- Replika ----------------
const COLORS = ['red', 'blue', 'green', 'yellow'];
const replika = {
  tickMs: 1000,
  init(players) {
    return {
      sequence: [pick(COLORS)], eliminated: [], submissions: {}, round: 1,
      phaseEndsAt: Date.now() + 15000, gameOver: false, winnerId: null
    };
  },
  onTick(room) {
    const s = room.state;
    const active = alivePlayers(room);
    if (active.length <= 1) { s.gameOver = true; s.winnerId = active[0] ? active[0].id : null; return; }
    if (Date.now() < s.phaseEndsAt) return;
    // timeout: anyone who hasn't submitted is eliminated
    for (const p of active) {
      if (!s.submissions[p.id]) s.eliminated.push(p.id);
    }
    replika.nextRound(room);
  },
  nextRound(room) {
    const s = room.state;
    const stillActive = alivePlayers(room);
    if (stillActive.length <= 1) { s.gameOver = true; s.winnerId = stillActive[0] ? stillActive[0].id : null; return; }
    s.sequence.push(pick(COLORS));
    s.round++;
    s.submissions = {};
    s.phaseEndsAt = Date.now() + 15000;
  },
  onAction(room, userId, action, payload) {
    const s = room.state;
    if (action !== 'submit' || s.gameOver) return;
    if (alivePlayers(room).every(p => p.id !== userId)) return;
    if (s.submissions[userId]) return;
    const seq = (payload && payload.sequence) || [];
    const correct = seq.length === s.sequence.length && seq.every((c, i) => c === s.sequence[i]);
    s.submissions[userId] = true;
    if (!correct) s.eliminated.push(userId);
    if (alivePlayers(room).length <= 1) {
      const last = alivePlayers(room);
      s.gameOver = true; s.winnerId = last[0] ? last[0].id : null; return;
    }
    if (alivePlayers(room).every(p => s.submissions[p.id])) {
      replika.nextRound(room);
    }
  },
  publicState(s) {
    return { round: s.round, eliminated: s.eliminated, gameOver: s.gameOver, winnerId: s.winnerId,
      phaseEndsAt: s.phaseEndsAt, sequence: s.sequence, submitted: Object.keys(s.submissions) };
  }
};

module.exports = { xo, dice, rps, chairs, roulette, bomb, hideseek, mafia, replika };

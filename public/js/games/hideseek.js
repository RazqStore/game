// Hide & Seek - real top-down movement game (canvas + keyboard/touch controls).
let mapsCache = null;
let currentMap = null;
let localPos = null;       // {x,y} - client-predicted position of "me"
let serverState = null;    // latest state from the server
let keys = { up: false, down: false, left: false, right: false };
let rafHandle = null;
let sendHandle = null;
let flickerHandle = null;
let lastFrameAt = 0;
let lastStepSoundAt = 0;
let iAmCaught = false;
let gameEnded = false;
let hintCooldownHandle = null;

const HS_SPEED = 230; // px/sec, must stay <= server HS_MAX_SPEED
const CANVAS_W = 560, CANVAS_H = 360;

RZShell.init({
  gameId: 'hideseek',
  pollMs: 150,
  onStart(state) { setup(state); },
  onUpdate(state) { applyServerState(state); }
});

async function getMaps() {
  if (!mapsCache) {
    const { maps } = await fetch('/api/hideseek-maps').then(r => r.json());
    mapsCache = maps;
  }
  return mapsCache;
}

async function setup(state) {
  gameEnded = false;
  iAmCaught = false;
  const maps = await getMaps();
  currentMap = maps.find(m => m.id === state.mapId) || maps[0];
  serverState = state;

  const me = RZShell.meId;
  localPos = { ...(state.pos[me] || currentMap.spawnHiders[0]) };

  const stage = document.getElementById('stage');
  stage.innerHTML = `
    <div class="hs-hud">
      <div class="hs-phase" id="hs-phase"></div>
      <div class="hs-timer" id="hs-timer"></div>
    </div>
    <div class="hs-wrap">
      <canvas class="hs-canvas" id="hs-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
      <div class="hs-flicker" id="hs-flicker"></div>
    </div>
    <div id="hs-seeker-panel"></div>
    <div class="hs-hints" id="hs-hints"></div>
    <div class="hs-dpad" id="hs-dpad">
      <button class="hs-up">⬆️</button>
      <button class="hs-left">⬅️</button>
      <button class="hs-down">⬇️</button>
      <button class="hs-right">➡️</button>
    </div>
    <div class="state-msg" style="margin-top:8px;">حرّك بـ WASD أو الأسهم، أو استخدم الأزرار بالأسفل</div>
  `;

  wireKeyboard();
  wireDpad();
  startFlicker();
  startLoop();

  applyServerState(state);
}

function wireKeyboard() {
  document.onkeydown = (e) => setKey(e.key, true);
  document.onkeyup = (e) => setKey(e.key, false);
}
function setKey(key, val) {
  const k = key.toLowerCase();
  if (k === 'w' || k === 'arrowup') keys.up = val;
  else if (k === 's' || k === 'arrowdown') keys.down = val;
  else if (k === 'a' || k === 'arrowleft') keys.left = val;
  else if (k === 'd' || k === 'arrowright') keys.right = val;
}

function wireDpad() {
  const map = { 'hs-up': 'up', 'hs-down': 'down', 'hs-left': 'left', 'hs-right': 'right' };
  document.querySelectorAll('#hs-dpad button').forEach(btn => {
    const dir = map[btn.className];
    const on = (v) => (e) => { e.preventDefault(); keys[dir] = v; };
    btn.addEventListener('pointerdown', on(true));
    btn.addEventListener('pointerup', on(false));
    btn.addEventListener('pointerleave', on(false));
    btn.addEventListener('pointercancel', on(false));
  });
}

function startFlicker() {
  clearInterval(flickerHandle);
  const el = document.getElementById('hs-flicker');
  flickerHandle = setInterval(() => {
    if (!el) return;
    const base = 0.75;
    const jitter = (Math.random() - 0.5) * 0.3;
    el.style.opacity = Math.max(0.4, Math.min(0.92, base + jitter)).toFixed(2);
  }, 160 + Math.random() * 140);
}

function startLoop() {
  cancelAnimationFrame(rafHandle);
  clearInterval(sendHandle);
  lastFrameAt = performance.now();
  const tick = (t) => {
    const dt = Math.min(0.05, (t - lastFrameAt) / 1000);
    lastFrameAt = t;
    if (!gameEnded) step(dt);
    render();
    rafHandle = requestAnimationFrame(tick);
  };
  rafHandle = requestAnimationFrame(tick);
  sendHandle = setInterval(sendPosition, 130);
}

function stopLoop() {
  cancelAnimationFrame(rafHandle);
  clearInterval(sendHandle);
  clearInterval(flickerHandle);
  clearInterval(hintCooldownHandle);
  document.onkeydown = null;
  document.onkeyup = null;
}

function canIMove() {
  if (!serverState || iAmCaught || gameEnded) return false;
  const isSeeker = serverState.seekerId === RZShell.meId;
  if (serverState.phase === 'hiding' && isSeeker) return false;
  return true;
}

function step(dt) {
  if (!canIMove() || !currentMap) return;
  let dx = 0, dy = 0;
  if (keys.up) dy -= 1;
  if (keys.down) dy += 1;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  if (dx || dy) {
    const len = Math.hypot(dx, dy) || 1;
    localPos.x += (dx / len) * HS_SPEED * dt;
    localPos.y += (dy / len) * HS_SPEED * dt;
    localPos.x = Math.min(currentMap.w - 13, Math.max(13, localPos.x));
    localPos.y = Math.min(currentMap.h - 13, Math.max(13, localPos.y));
    const now = performance.now();
    if (now - lastStepSoundAt > 260) { RZ.sound.step(); lastStepSoundAt = now; }
  }
}

function sendPosition() {
  if (!canIMove()) return;
  RZShell.action('move', { x: localPos.x, y: localPos.y });
}

function applyServerState(state) {
  serverState = state;
  const me = RZShell.meId;
  const wasCaught = iAmCaught;
  iAmCaught = (state.caught || []).includes(me);
  if (iAmCaught && !wasCaught) RZ.sound.catch();

  // reconcile my own predicted position gently toward server truth (in case of clamps)
  if (state.pos && state.pos[me] && localPos) {
    const sp = state.pos[me];
    const drift = Math.hypot(sp.x - localPos.x, sp.y - localPos.y);
    if (drift > 40) { localPos.x = sp.x; localPos.y = sp.y; }
  }

  renderHud(state);
  renderSeekerPanel(state);

  if (state.gameOver && !gameEnded) {
    gameEnded = true;
    stopLoop();
  }
}

function renderHud(state) {
  const isSeeker = state.seekerId === RZShell.meId;
  const phaseEl = document.getElementById('hs-phase');
  const timerEl = document.getElementById('hs-timer');
  if (!phaseEl || !timerEl) return;
  if (state.phase === 'hiding') {
    phaseEl.textContent = isSeeker ? '🙈 الكل يختبئ... انتظر' : '🏃 اختبئ بسرعة!';
  } else {
    phaseEl.textContent = isSeeker ? '🔦 دورك تدور عليهم' : (iAmCaught ? '👻 انكشفت - تتفرج بس' : '🤫 اختبئ ولا تتحرك وقت اقترابه');
  }
  const remain = Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
  timerEl.textContent = `⏱️ ${remain}s`;
}

function renderSeekerPanel(state) {
  const panel = document.getElementById('hs-seeker-panel');
  const hintsBox = document.getElementById('hs-hints');
  if (!panel || !hintsBox) return;
  const isSeeker = state.seekerId === RZShell.meId;
  if (isSeeker && state.phase === 'seeking' && !state.gameOver) {
    const remainMs = state.nextHintAt - Date.now();
    const ready = remainMs <= 0;
    panel.innerHTML = `<div class="actions-row" style="margin-top:10px;">
      <button class="btn btn-accent" id="hint-btn" ${ready ? '' : 'disabled'}>💡 ${ready ? 'اطلب تلميح' : 'تلميح خلال ' + Math.ceil(remainMs / 1000) + 's'}</button>
    </div>`;
    const btn = document.getElementById('hint-btn');
    if (btn && ready) btn.onclick = () => { RZ.sound.hint(); RZShell.action('hint', {}); };
  } else {
    panel.innerHTML = '';
  }
  if (state.hints && state.hints.length) {
    hintsBox.innerHTML = state.hints.slice(-3).map(h => `<div class="hs-hint-msg">${RZ.escapeHtml(h.text)}</div>`).join('');
  }
}

function render() {
  const canvas = document.getElementById('hs-canvas');
  if (!canvas || !currentMap || !serverState) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#0a0b0d';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // rooms
  ctx.strokeStyle = '#33373d';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#8b8f9670';
  ctx.font = '11px Tajawal, sans-serif';
  currentMap.rooms.forEach(r => {
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillText(r.name, r.x + 8, r.y + 16);
  });

  const me = RZShell.meId;
  const isSeeker = serverState.seekerId === me;
  const caughtSet = new Set(serverState.caught || []);
  const myPos = localPos;
  const VISION_RADIUS = 110;

  // draw other players
  for (const p of RZShell.players) {
    const isMe = p.id === me;
    const pos = isMe ? localPos : (serverState.pos && serverState.pos[p.id]);
    if (!pos) continue;
    const pSeeker = serverState.seekerId === p.id;
    const pCaught = caughtSet.has(p.id);

    if (!isMe && !pCaught && serverState.phase === 'seeking') {
      if (isSeeker && !pSeeker) {
        // fog of war: the seeker only spots an uncaught hider within flashlight range
        const dist = Math.hypot(pos.x - myPos.x, pos.y - myPos.y);
        if (dist > VISION_RADIUS) continue;
      } else if (!isSeeker && !pSeeker) {
        // a hider can't see other hiders, only the approaching seeker
        continue;
      }
    }

    ctx.globalAlpha = pCaught ? 0.35 : 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = pSeeker ? '#c9a227' : (isMe ? '#7fb3e2' : '#c14b4b');
    ctx.fill();
    if (isMe) { ctx.lineWidth = 3; ctx.strokeStyle = '#f2f2f3'; ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#0e0f11';
    ctx.textAlign = 'center';
    ctx.fillText(pSeeker ? '👁️' : (pCaught ? '👻' : '🙂'), pos.x, pos.y + 5);
    ctx.textAlign = 'start';
  }
}

// Shared "game shell": header, tutorial, leaderboard, queue -> ready -> play -> result flow.
// Talks to the server over plain polling (GET /api/room/state) instead of websockets.
const RZShell = (() => {
  let gameId, meta, players = [], meId = null, hooks = {};
  let pollHandle = null, lastStatus = null, lastReadySet = null;

  function el(id) { return document.getElementById(id); }
  function api(url, body) {
    return fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)
      .then(r => r.json())
      .catch(() => ({ error: null, _networkFail: true })); // server waking up / hiccup - never crash the poll loop
  }

  function buildLayout() {
    document.querySelector('main.game-shell').innerHTML = `
      <div class="panel">
        <div class="game-header">
          <h2><span class="icon" id="g-icon"></span><span id="g-name"></span></h2>
          <div class="actions-row">
            <a class="btn btn-sm" href="/">🏠 الرئيسية</a>
            <button class="btn btn-sm" id="howto-btn">📖 طريقة اللعب</button>
            <button class="btn btn-sm btn-danger" id="leave-btn" style="display:none;">مغادرة</button>
          </div>
        </div>
        <div class="players-row" id="players-row"></div>
        <div class="stage" id="stage"></div>
        <div class="actions-row" id="main-actions"></div>
      </div>
      <div>
        <div class="panel side-panel">
          <div class="side-title">🏆 المتصدرين</div>
          <div id="leaderboard"></div>
        </div>
        <div class="panel side-panel">
          <div class="side-title">👥 معك / ضدك</div>
          <div class="vs-lists">
            <div class="vs-col"><h4>معك</h4><div id="with-list"></div></div>
            <div class="vs-col"><h4>ضدك</h4><div id="against-list"></div></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderHowto() {
    el('howto-btn').onclick = () => el('howto-modal').classList.add('show');
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="howto-modal">
        <div class="modal-box">
          <h3>${meta.icon} ${meta.name}</h3>
          <img src="/img/games/${gameId}.svg" alt="${meta.name}" style="width:100%;max-width:300px;border-radius:10px;border:1px solid var(--line);margin:0 auto 12px;display:block;">
          <p style="color:var(--text-1);">${meta.desc}</p>
          <ol>${meta.howto.map(s => `<li>${s}</li>`).join('')}</ol>
          <button class="btn btn-accent" id="howto-close">فهمت</button>
        </div>
      </div>
    `);
    el('howto-close').onclick = () => el('howto-modal').classList.remove('show');
  }

  function loadLeaderboard() {
    fetch('/api/leaderboard/' + gameId).then(r => r.json()).then(({ leaderboard }) => {
      const box = el('leaderboard');
      if (!leaderboard.length) { box.innerHTML = '<div class="state-msg">لا يوجد نتائج بعد</div>'; return; }
      box.innerHTML = leaderboard.map((row, i) => `
        <div class="leader-row">
          <span class="leader-rank">#${i + 1}</span>
          <img src="${row.avatar_url}">
          <span class="leader-name">${RZ.escapeHtml(row.display_name)}</span>
          <span class="leader-pts">${row.points} نقطة</span>
        </div>
      `).join('');
    });
  }

  function chip(p, cls = '') {
    return `<span class="chip ${cls}" data-id="${p.id}"><img src="${p.avatarUrl}"><span>${RZ.escapeHtml(p.displayName)}</span><span class="dot"></span></span>`;
  }

  function renderPlayers(readySet) {
    el('players-row').innerHTML = players.map(p => {
      let cls = p.id === meId ? 'me' : '';
      if (readySet && readySet.includes(p.id)) cls += ' ready';
      return chip(p, cls);
    }).join('');
  }

  function renderVsLists(eliminated) {
    const elimSet = new Set(eliminated || []);
    const withMe = players.filter(p => p.id === meId);
    const against = players.filter(p => p.id !== meId);
    el('with-list').innerHTML = withMe.map(p => `<div class="leader-row">${chip(p, elimSet.has(p.id) ? 'out' : '')}</div>`).join('') || '<span style="color:var(--text-2);font-size:12px;">—</span>';
    el('against-list').innerHTML = against.map(p => `<div class="leader-row">${chip(p, elimSet.has(p.id) ? 'out' : '')}</div>`).join('') || '<span style="color:var(--text-2);font-size:12px;">—</span>';
  }

  function stopPolling() { if (pollHandle) clearInterval(pollHandle); pollHandle = null; }

  function idleStage() {
    stopPolling();
    lastStatus = null; lastReadySet = null;
    el('leave-btn').style.display = 'none';
    el('players-row').innerHTML = '';
    el('with-list').innerHTML = '';
    el('against-list').innerHTML = '';
    el('stage').innerHTML = `<div class="state-msg">اضغط الزر عشان تدخل قائمة الانتظار (${meta.min}-${meta.max} لاعبين)</div>`;
    el('main-actions').innerHTML = `<button class="btn btn-accent" id="find-btn">🔎 ابحث عن لاعبين</button>`;
    el('find-btn').onclick = async () => {
      if (!RZ.requireLogin()) return;
      const result = await api('/api/queue/join', { game: gameId });
      if (result.error) return RZ.toast(result.error);
      el('stage').innerHTML = `<div class="state-msg">⏳ بالبحث عن لاعبين...</div>`;
      el('main-actions').innerHTML = `<button class="btn btn-danger" id="cancel-find">إلغاء البحث</button>`;
      el('cancel-find').onclick = async () => { await api('/api/queue/leave', { game: gameId }); idleStage(); };
      startPolling();
    };
  }

  function readyStage(data) {
    players = data.players;
    el('leave-btn').style.display = 'inline-flex';
    renderPlayers(data.readySet || []);
    const iAmReady = (data.readySet || []).includes(meId);
    el('stage').innerHTML = `<div class="state-msg">✅ تم إيجاد لاعبين! اضغط <b>جاهز</b> للبدء</div>`;
    el('main-actions').innerHTML = `<button class="btn btn-accent" id="ready-btn" ${iAmReady ? 'disabled' : ''}>${iAmReady ? 'بالانتظار...' : 'أنا جاهز'}</button>`;
    const btn = el('ready-btn');
    if (btn && !iAmReady) btn.onclick = async () => {
      RZ.sound.ready();
      btn.disabled = true; btn.textContent = 'جاري الإرسال...';
      const result = await api('/api/room/ready');
      if (result._networkFail || result.error) {
        // didn't actually register - let them retry instead of freezing forever
        btn.disabled = false;
        btn.textContent = 'أنا جاهز';
        RZ.toast(result.error || 'تعذر الاتصال بالسيرفر، جرب مرة ثانية');
        if (result.error && !result._networkFail && /مالقيناك/.test(result.error)) idleStage();
        return;
      }
      btn.textContent = 'بالانتظار...';
    };
  }

  function handleEvents(events) {
    for (const ev of (events || [])) {
      if (ev.type === 'playerLeft') RZ.toast(`${ev.displayName || 'لاعب'} غادر اللعبة`);
      if (ev.type === 'cancelled') { RZ.toast(ev.reason || 'تم إلغاء اللعبة'); idleStage(); }
    }
  }

  async function poll() {
    const data = await api('/api/room/state');
    if (data._networkFail || data.error) return; // stay on current screen, try again next tick
    handleEvents(data.events);

    if (data.status === 'idle') {
      if (lastStatus && lastStatus !== 'idle') idleStage();
      return;
    }

    if (data.status === 'queued') {
      lastStatus = 'queued';
      return;
    }

    players = data.players || players;

    if (data.status === 'ready') {
      const readyChanged = JSON.stringify(data.readySet) !== JSON.stringify(lastReadySet);
      if (lastStatus !== 'ready' || readyChanged) {
        lastReadySet = data.readySet;
        readyStage(data);
      }
      lastStatus = 'ready';
      return;
    }

    if (data.status === 'playing') {
      if (lastStatus !== 'playing') {
        el('main-actions').innerHTML = '';
        renderPlayers(null);
      }
      renderVsLists(data.state.eliminated);
      if (lastStatus !== 'playing') hooks.onStart && hooks.onStart(data.state, players, meId);
      else hooks.onUpdate && hooks.onUpdate(data.state, players, meId);
      lastStatus = 'playing';
      return;
    }

    if (data.status === 'over') {
      if (lastStatus !== 'over') {
        lastStatus = 'over';
        const iWon = data.winnerId === meId;
        if (data.winnerId) { iWon ? RZ.sound.win() : RZ.sound.lose(); } else { RZ.sound.tick(); }
        renderVsLists(data.state.eliminated);
        hooks.onUpdate && hooks.onUpdate(data.state, players, meId);
        el('main-actions').innerHTML = `<button class="btn btn-accent" id="again-btn">🔁 العب مرة أخرى</button>`;
        const msg = data.winnerId ? (iWon ? '🎉 مبروك! فزت باللعبة' : `فاز اللاعب: ${RZ.escapeHtml(data.winnerName || '')}`) : 'انتهت اللعبة بدون فائز';
        const banner = document.createElement('div');
        banner.className = 'state-msg';
        banner.style.marginTop = '14px';
        banner.innerHTML = `<b>${msg}</b>`;
        el('stage').appendChild(banner);
        el('again-btn').onclick = async () => { await api('/api/room/leave'); idleStage(); };
        loadLeaderboard();
      }
      return;
    }
  }

  function startPolling() {
    stopPolling();
    poll();
    pollHandle = setInterval(poll, hooks.pollMs || 700);
  }

  function action(name, payload) {
    api('/api/room/action', { action: name, payload });
  }

  async function init(opts) {
    hooks = opts;
    gameId = opts.gameId;
    const { games } = await fetch('/api/games').then(r => r.json());
    meta = games[gameId];
    document.title = `${meta.name} | Razq Store`;
    RZ.renderHeader();
    const me = await RZ.fetchMe();
    meId = me && me.id;

    buildLayout();
    el('g-icon').textContent = meta.icon;
    el('g-name').textContent = meta.name;
    renderHowto();
    loadLeaderboard();
    idleStage();

    el('leave-btn').onclick = async () => {
      await api('/api/room/leave');
      idleStage();
    };

    if (me) startPolling(); // resume any in-progress queue/room on page load/refresh
  }

  return { init, action, get players() { return players; }, get meId() { return meId; } };
})();

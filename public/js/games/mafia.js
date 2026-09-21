let votedFor = null;
let lastPhaseSeen = null;

RZShell.init({
  gameId: 'mafia',
  onStart(state) { votedFor = null; render(state); },
  onUpdate(state) {
    if (state.phase !== lastPhaseSeen) { votedFor = null; RZ.sound.alert(); lastPhaseSeen = state.phase; }
    render(state);
  }
});

function render(state) {
  const me = RZShell.meId;
  const players = RZShell.players;
  const eliminated = (state.eliminated || []).includes(me);
  const stage = document.getElementById('stage');
  const isMafia = state.yourRole === 'mafia';
  const canVote = !eliminated && !state.gameOver &&
    ((state.phase === 'night' && isMafia) || state.phase === 'day');

  const roleBadge = `<span class="mafia-role-badge ${state.yourRole}">${state.yourRole === 'mafia' ? '🕵️ أنت مافيا' : '👤 أنت مواطن'}</span>`;
  const teamInfo = isMafia && state.mafiaTeam ? `<div class="state-msg">زملاؤك بالمافيا: ${state.mafiaTeam.map(id => {
    const p = players.find(pp => pp.id === id); return p ? RZ.escapeHtml(p.displayName) : '';
  }).join('، ')}</div>` : '';

  const alive = players.filter(p => !(state.eliminated || []).includes(p.id));
  const targets = alive.filter(p => p.id !== me);

  const lastLog = (state.log || []).slice(-1)[0];
  let logMsg = '';
  if (lastLog) {
    const name = (id) => { const p = players.find(pp => pp.id === id); return p ? RZ.escapeHtml(p.displayName) : 'لا أحد'; };
    logMsg = lastLog.type === 'night'
      ? `🌙 الليلة الماضية: ${lastLog.victim ? name(lastLog.victim) + ' تم اغتياله' : 'ما صار شي'}`
      : `☀️ التصويت: ${lastLog.out ? name(lastLog.out) + ' تم طرده' : 'ما حد اتفقوا عليه'}`;
  }

  let overMsg = '';
  if (state.gameOver) {
    overMsg = `<div class="state-msg"><b>${state.winSide === 'mafia' ? '🕵️ فازت المافيا' : '👤 فاز المواطنون'}</b></div>`;
  }

  stage.innerHTML = `
    <div class="state-msg">${roleBadge}</div>
    ${teamInfo}
    <div class="state-msg">${state.phase === 'night' ? '🌙 الليل — المافيا تختار ضحية' : '☀️ النهار — صوّتوا لطرد مشتبه فيه'} (اليوم ${state.dayNum})</div>
    ${logMsg ? `<div class="state-msg">${logMsg}</div>` : ''}
    ${overMsg}
    <div class="timer-bar"><div id="timer-fill" style="width:100%"></div></div>
    ${eliminated ? '<div class="state-msg">❌ تم إقصاؤك — تقدر تتفرج على الباقي</div>' : ''}
    <div class="players-row" id="vote-targets" style="margin-top:14px;"></div>
  `;

  if (canVote) {
    const box = document.getElementById('vote-targets');
    box.innerHTML = targets.map(p => `<button class="chip ${votedFor === p.id ? 'ready' : ''}" data-id="${p.id}"><img src="${p.avatarUrl}"><span>${RZ.escapeHtml(p.displayName)}</span></button>`).join('');
    box.querySelectorAll('.chip').forEach(b => {
      b.onclick = () => {
        votedFor = b.dataset.id;
        RZ.sound.click();
        RZShell.action(state.phase === 'night' ? 'nightVote' : 'dayVote', { targetId: votedFor });
        render(state);
      };
    });
  }

  const fill = document.getElementById('timer-fill');
  if (fill && state.phaseEndsAt) {
    const total = state.phase === 'night' ? 20000 : 30000;
    const tickIt = () => {
      const remain = Math.max(0, state.phaseEndsAt - Date.now());
      fill.style.width = Math.min(100, (remain / total) * 100) + '%';
    };
    tickIt();
    clearInterval(render._t);
    render._t = setInterval(tickIt, 300);
  }
}

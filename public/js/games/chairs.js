let lastPhase = null;
let tickHandle = null;

RZShell.init({
  gameId: 'chairs',
  onStart(state) { render(state); },
  onUpdate(state) { render(state); }
});

function render(state) {
  const me = RZShell.meId;
  if (state.phase !== lastPhase) {
    if (state.phase === 'stopped') RZ.sound.alert();
    lastPhase = state.phase;
  }
  const stage = document.getElementById('stage');
  const claimedCount = Object.keys(state.claimed || {}).length;
  const iClaimed = !!(state.claimed || {})[me];
  const eliminated = (state.eliminated || []).includes(me);

  stage.innerHTML = `
    <div class="state-msg">${state.phase === 'walking' ? '🎵 الموسيقى تشتغل... استعد!' : '🛑 توقفت الموسيقى! اقفز على كرسي بسرعة'}</div>
    <div class="timer-bar"><div id="timer-fill" style="width:100%"></div></div>
    <div class="chairs-ring">${Array.from({ length: state.chairs || 0 }).map((_, i) => `
      <button class="chair ${i < claimedCount ? 'taken' : ''}" data-i="${i}">🪑</button>
    `).join('')}</div>
    <div class="state-msg">الجولة ${state.round} — الكراسي المتاحة: ${state.chairs || 0}</div>
  `;

  if (state.phase === 'stopped' && !iClaimed && !eliminated) {
    stage.querySelectorAll('.chair:not(.taken)').forEach(btn => {
      btn.onclick = () => { RZ.sound.click(); RZShell.action('sit', {}); };
    });
  }

  if (tickHandle) clearInterval(tickHandle);
  const fill = document.getElementById('timer-fill');
  tickHandle = setInterval(() => {
    if (!state.phaseEndsAt || !fill) return;
    const remain = Math.max(0, state.phaseEndsAt - Date.now());
    const total = state.phase === 'walking' ? 7000 : 3000;
    fill.style.width = Math.min(100, (remain / total) * 100) + '%';
    if (remain <= 0) clearInterval(tickHandle);
  }, 100);
}

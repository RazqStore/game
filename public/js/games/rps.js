const ICONS = { rock: '✊', paper: '✋', scissors: '✌️' };
let picked = null;

RZShell.init({
  gameId: 'rps',
  onStart(state) { picked = null; render(state); },
  onUpdate(state) {
    if (state.lastResult) picked = null;
    render(state);
  }
});

function render(state) {
  const me = RZShell.meId;
  const players = RZShell.players;
  const opp = players.find(p => p.id !== me);
  const stage = document.getElementById('stage');
  let resultMsg = '';
  if (state.lastResult) {
    const mine = state.lastResult.choices[me];
    const theirs = state.lastResult.choices[opp.id];
    const w = state.lastResult.roundWinner;
    resultMsg = `أنت: ${ICONS[mine] || ''} — الخصم: ${ICONS[theirs] || ''} — ${w ? (w === me ? '✅ فزت بالجولة' : '❌ خسرت الجولة') : '🤝 تعادل'}`;
  }
  stage.innerHTML = `
    <div class="state-msg">النتيجة: أنت ${state.score[me] || 0} — الخصم ${state.score[opp.id] || 0} (جولة ${state.round})</div>
    ${resultMsg ? `<div class="state-msg">${resultMsg}</div>` : ''}
    <div class="rps-choices">
      ${['rock', 'paper', 'scissors'].map(c => `<button class="rps-btn ${picked === c ? 'picked' : ''}" data-c="${c}">${ICONS[c]}</button>`).join('')}
    </div>
    <div class="state-msg">${picked ? 'بانتظار الخصم...' : 'اختر بسرعة'}</div>
  `;
  stage.querySelectorAll('.rps-btn').forEach(b => {
    b.onclick = () => {
      if (picked || state.gameOver) return;
      picked = b.dataset.c;
      RZ.sound.click();
      RZShell.action('choose', { choice: picked });
      render(state);
    };
  });
}

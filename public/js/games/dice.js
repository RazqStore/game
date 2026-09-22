RZShell.init({
  gameId: 'dice',
  onStart(state) { render(state); },
  onUpdate(state) { render(state); }
});

function render(state) {
  const me = RZShell.meId;
  const players = RZShell.players;
  const rolled = state.rolls[me] != null;
  const stage = document.getElementById('stage');
  const rows = players.filter(p => state.active.includes(p.id)).map(p => {
    const val = state.rolls[p.id];
    return `<div class="die">${val != null ? val : '?'}</div>`;
  }).join('');
  stage.innerHTML = `
    <div class="state-msg">${state.tie ? 'تعادل! أعيدوا الرمي بين المتعادلين' : (state.gameOver ? '' : 'اضغط زر الرمي')}</div>
    <div class="dice-row">${rows}</div>
    <div class="actions-row"><button class="btn btn-accent" id="roll-btn" ${(!state.active.includes(me) || rolled || state.gameOver) ? 'disabled' : ''}>🎲 ارمِ النرد</button></div>
  `;
  const btn = document.getElementById('roll-btn');
  if (btn) btn.onclick = () => { RZ.sound.click(); RZShell.action('roll', {}); };
}

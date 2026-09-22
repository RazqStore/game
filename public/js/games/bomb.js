RZShell.init({
  gameId: 'bomb',
  onStart(state) { render(state); },
  onUpdate(state) { render(state); }
});

function render(state) {
  const me = RZShell.meId;
  const holderP = RZShell.players.find(p => p.id === state.holder);
  const iHold = state.holder === me;
  const eliminated = (state.eliminated || []).includes(me);
  const stage = document.getElementById('stage');
  stage.innerHTML = `
    <div class="state-msg">${eliminated ? '💥 خرجت من اللعبة' : (iHold ? '<b>القنبلة عندك! مررها بسرعة</b>' : `القنبلة عند: ${RZ.escapeHtml(holderP ? holderP.displayName : '')}`)}</div>
    <div class="bomb-wrap">💣</div>
    <div class="actions-row"><button class="btn btn-accent" id="pass-btn" ${!iHold ? 'disabled' : ''}>➡️ مرر القنبلة</button></div>
  `;
  const btn = document.getElementById('pass-btn');
  if (btn) btn.onclick = () => { RZ.sound.click(); RZShell.action('pass', {}); };
}

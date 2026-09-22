RZShell.init({
  gameId: 'roulette',
  onStart(state) { render(state); },
  onUpdate(state) {
    if (state.lastSpin) { state.lastSpin.hit ? RZ.sound.alert() : RZ.sound.tick(); }
    render(state);
  }
});

function render(state) {
  const me = RZShell.meId;
  const myTurn = state.turn === me && !state.gameOver;
  const eliminated = (state.eliminated || []).includes(me);
  const stage = document.getElementById('stage');
  const rot = Math.floor(Math.random() * 360) + 720;
  stage.innerHTML = `
    <div class="state-msg">${eliminated ? '❌ خرجت من اللعبة' : (myTurn ? '<b>دورك! أدر العجلة</b>' : 'بانتظار دور اللاعب الآخر...')}</div>
    <div class="roulette-wheel" id="wheel"></div>
    ${state.lastSpin ? `<div class="state-msg">${state.lastSpin.hit ? '💥 وقعت بالفخ!' : '✅ نجا!'}</div>` : ''}
    <div class="actions-row"><button class="btn btn-accent" id="spin-btn" ${(!myTurn) ? 'disabled' : ''}>🎯 أدر العجلة</button></div>
  `;
  const btn = document.getElementById('spin-btn');
  if (btn) btn.onclick = () => {
    RZ.sound.click();
    document.getElementById('wheel').style.transform = `rotate(${rot}deg)`;
    RZShell.action('spin', {});
  };
}

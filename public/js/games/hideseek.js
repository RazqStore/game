let chosenSpot = null;

RZShell.init({
  gameId: 'hideseek',
  onStart(state) { chosenSpot = null; render(state); },
  onUpdate(state) {
    if (state.lastSearch && state.lastSearch.round < state.round) chosenSpot = null;
    render(state);
  }
});

function render(state) {
  const me = RZShell.meId;
  const stage = document.getElementById('stage');
  const spots = Array.from({ length: state.spots });
  const caughtSet = new Set(state.caught || []);
  const iAmCaught = caughtSet.has(me);

  let statusMsg;
  if (state.isSeeker) {
    statusMsg = iAmCaught ? '' : '🔍 أنت الباحث — اختر مكان تفتش فيه';
  } else if (iAmCaught) {
    statusMsg = '❌ انكشفت وخرجت من اللعبة';
  } else if (chosenSpot != null) {
    statusMsg = '🙈 مختبئ... بانتظار الباحث';
  } else {
    statusMsg = '🙈 اختر مكان تختبئ فيه';
  }

  stage.innerHTML = `
    <div class="state-msg">${statusMsg} (الجولة ${state.round} من ${state.maxRounds})</div>
    <div class="spot-grid">${spots.map((_, i) => `<button class="spot" data-i="${i}">📦</button>`).join('')}</div>
    ${state.lastSearch ? `<div class="state-msg">آخر تفتيش: مكان رقم ${state.lastSearch.spot + 1} — ${state.lastSearch.caughtNow.length ? 'انكشف ' + state.lastSearch.caughtNow.length + ' لاعب' : 'ما فيه أحد!'}</div>` : ''}
  `;

  stage.querySelectorAll('.spot').forEach(btn => {
    const i = Number(btn.dataset.i);
    if (state.isSeeker && btn.dataset.i === String(state.lastSearch && state.lastSearch.spot)) btn.classList.add('caught');
    if (!state.isSeeker && chosenSpot === i) btn.classList.add('chosen');
    btn.onclick = () => {
      if (iAmCaught || state.gameOver) return;
      RZ.sound.click();
      if (state.isSeeker) {
        RZShell.action('search', { spot: i });
      } else {
        if (chosenSpot != null) return;
        chosenSpot = i;
        RZShell.action('hide', { spot: i });
        render(state);
      }
    };
  });
}

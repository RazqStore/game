const COLORS = ['red', 'blue', 'green', 'yellow'];
let inputSeq = [];
let lastRoundPlayed = 0;
let submitted = false;

RZShell.init({
  gameId: 'replika',
  onStart(state) { lastRoundPlayed = 0; inputSeq = []; submitted = false; render(state); },
  onUpdate(state) {
    if (state.round !== lastRoundPlayed) { inputSeq = []; submitted = false; }
    render(state);
  }
});

function render(state) {
  const me = RZShell.meId;
  const eliminated = (state.eliminated || []).includes(me);
  const stage = document.getElementById('stage');
  stage.innerHTML = `
    <div class="state-msg">${eliminated ? '❌ خرجت من اللعبة' : `الجولة ${state.round} — احفظ التسلسل (${state.sequence.length} خطوة)`}</div>
    <div class="replika-pad" id="pad">${COLORS.map(c => `<button class="replika-btn ${c}" data-c="${c}"></button>`).join('')}</div>
    <div class="state-msg" id="hint">👀 بيتم عرض التسلسل...</div>
  `;
  const pad = document.getElementById('pad');
  pad.querySelectorAll('.replika-btn').forEach(b => b.style.pointerEvents = 'none');

  if (state.round !== lastRoundPlayed) {
    lastRoundPlayed = state.round;
    playSequence(state.sequence, () => {
      if (eliminated) return;
      document.getElementById('hint').textContent = '🎯 كررها الحين بنفس الترتيب';
      pad.querySelectorAll('.replika-btn').forEach(b => b.style.pointerEvents = 'auto');
      wireInput(state, pad);
    });
  } else if (!eliminated && !submitted) {
    document.getElementById('hint').textContent = '🎯 كررها الحين بنفس الترتيب';
    pad.querySelectorAll('.replika-btn').forEach(b => b.style.pointerEvents = 'auto');
    wireInput(state, pad);
  } else {
    document.getElementById('hint').textContent = submitted ? 'بانتظار باقي اللاعبين...' : '';
  }
}

function playSequence(seq, done) {
  const pad = document.getElementById('pad');
  seq.forEach((c, i) => {
    setTimeout(() => {
      const btn = pad.querySelector(`[data-c="${c}"]`);
      if (btn) { btn.classList.add('flash'); RZ.sound.tick(); setTimeout(() => btn.classList.remove('flash'), 300); }
      if (i === seq.length - 1) setTimeout(done, 500);
    }, i * 650);
  });
}

function wireInput(state, pad) {
  pad.querySelectorAll('.replika-btn').forEach(b => {
    b.onclick = () => {
      if (submitted) return;
      const c = b.dataset.c;
      b.classList.add('flash');
      RZ.sound.click();
      setTimeout(() => b.classList.remove('flash'), 200);
      inputSeq.push(c);
      if (inputSeq.length >= state.sequence.length) {
        submitted = true;
        RZShell.action('submit', { sequence: inputSeq });
        document.getElementById('hint').textContent = 'بانتظار باقي اللاعبين...';
        pad.querySelectorAll('.replika-btn').forEach(x => x.style.pointerEvents = 'none');
      }
    };
  });
}

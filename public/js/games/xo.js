RZShell.init({
  gameId: 'xo',
  onStart(state) { render(state); },
  onUpdate(state) { render(state); }
});

function render(state) {
  const me = RZShell.meId;
  const mySymbol = state.symbols[me];
  const myTurn = state.turn === me && !state.gameOver;
  const stage = document.getElementById('stage');
  stage.innerHTML = `
    <div class="state-msg">${state.gameOver ? '' : (myTurn ? '<b>دورك الآن</b>' : 'بانتظار دور الخصم...')}</div>
    <div class="xo-board" id="board"></div>
  `;
  const board = document.getElementById('board');
  board.innerHTML = state.board.map((v, i) => `<div class="xo-cell ${v || ''}" data-i="${i}">${v ? (v === 'x' ? '✕' : '○') : ''}</div>`).join('');
  board.querySelectorAll('.xo-cell').forEach(cell => {
    cell.onclick = () => {
      if (!myTurn || cell.textContent) return;
      RZ.sound.move();
      RZShell.action('move', { index: Number(cell.dataset.i) });
    };
  });
}

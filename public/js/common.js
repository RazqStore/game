// Shared across every page: header, auth state, toast, tiny sound synth.
const RZ = (() => {
  let me = null;

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // --- tiny synth sounds (no audio files needed) ---
  let actx = null;
  function ctx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    return actx;
  }
  function beep(freq = 440, dur = 0.12, type = 'sine', vol = 0.18, delay = 0) {
    try {
      const c = ctx();
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* audio not available */ }
  }
  const sound = {
    click: () => beep(520, 0.08, 'triangle', 0.15),
    move: () => beep(660, 0.09, 'square', 0.12),
    win: () => { beep(523, 0.14); beep(659, 0.14, 'sine', 0.18, 0.12); beep(784, 0.22, 'sine', 0.2, 0.24); },
    lose: () => { beep(300, 0.18, 'sawtooth', 0.15); beep(220, 0.28, 'sawtooth', 0.15, 0.15); },
    tick: () => beep(880, 0.05, 'square', 0.08),
    alert: () => { beep(200, 0.1, 'square', 0.2); beep(160, 0.16, 'square', 0.2, 0.1); },
    ready: () => beep(700, 0.1, 'sine', 0.14)
  };

  async function fetchMe() {
    const res = await fetch('/api/me');
    const data = await res.json();
    me = data.user;
    return me;
  }

  function renderHeader() {
    const header = document.getElementById('site-header');
    if (!header) return;
    fetchMe().then((user) => {
      fetch('/api/logo').then(r => r.json()).then(({ url }) => {
        const logoImg = url ? `<img class="brand-logo" src="${url}" alt="logo">` : `<div class="brand-logo"></div>`;
        header.innerHTML = `
          <div class="container header-row">
            <a class="brand" href="/">
              ${logoImg}
              <span class="brand-name">Razq Store<small>منصة ألعاب القروبات</small></span>
            </a>
            <div class="user-box" id="user-box"></div>
          </div>
        `;
        renderUserBox(user);
      });
    });
  }

  function renderUserBox(user) {
    const box = document.getElementById('user-box');
    if (!box) return;
    if (user) {
      box.innerHTML = `
        <img class="user-avatar" src="${user.avatar_url}" alt="">
        <span>${escapeHtml(user.display_name)}</span>
        <button class="btn btn-sm btn-ghost" id="logout-btn">خروج</button>
      `;
      document.getElementById('logout-btn').onclick = async () => {
        await fetch('/auth/logout', { method: 'POST' });
        location.reload();
      };
    } else {
      box.innerHTML = `<a class="btn btn-accent btn-sm" href="/auth/discord">تسجيل الدخول عبر ديسكورد</a>`;
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function requireLogin() {
    if (!me) {
      toast('لازم تسجل الدخول عشان تلعب');
      return false;
    }
    return true;
  }

  return { toast, sound, fetchMe, renderHeader, escapeHtml, requireLogin, getMe: () => me };
})();

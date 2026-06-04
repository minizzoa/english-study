// Web Audio API 기반 효과음 (파일 없이 합성)
let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

const MUTE_KEY = 'eng_muted';
export function isMuted() { return localStorage.getItem(MUTE_KEY) === '1'; }
export function toggleMute() {
  const next = !isMuted();
  localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  return next;
}

function beep(freq, dur, type = 'sine', gain = 0.25, delay = 0) {
  if (isMuted()) return;
  try {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, c.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
    o.start(c.currentTime + delay);
    o.stop(c.currentTime + delay + dur);
  } catch (_) {}
}

export function playCorrect() {
  beep(523, 0.08); beep(659, 0.12, 'sine', 0.2, 0.09);
}
export function playCombo() {
  beep(523, 0.07); beep(659, 0.07, 'sine', 0.2, 0.08); beep(784, 0.18, 'sine', 0.25, 0.16);
}
export function playWrong() {
  beep(220, 0.22, 'sawtooth', 0.18);
}
export function playTimeout() {
  beep(330, 0.15, 'triangle', 0.18); beep(262, 0.2, 'triangle', 0.15, 0.16);
}
export function playGameOver() {
  beep(392, 0.18); beep(330, 0.18, 'sine', 0.2, 0.2); beep(262, 0.35, 'sine', 0.25, 0.4);
}
export function playLevelUp() {
  [0, 0.1, 0.2, 0.3].forEach((d, i) =>
    beep([523, 659, 784, 1047][i], 0.12, 'sine', 0.22, d)
  );
}
export function playTick() {
  beep(880, 0.05, 'sine', 0.1);
}

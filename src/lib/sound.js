let ctx = null;

function context() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, duration = 0.12, delay = 0, type = 'sine', volume = 0.045) {
  const audio = context();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

export function playCorrect() {
  tone(523.25, 0.12, 0, 'sine', 0.04);
  tone(659.25, 0.16, 0.08, 'sine', 0.035);
  tone(783.99, 0.2, 0.16, 'sine', 0.03);
}

export function playIncorrect() {
  tone(196, 0.15, 0, 'triangle', 0.035);
  tone(146.83, 0.24, 0.1, 'triangle', 0.03);
}

export function playComplete() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.24, i * 0.1, 'sine', 0.035));
}

export function playTap() {
  tone(880, 0.045, 0, 'sine', 0.015);
}

export function haptic(pattern = 8) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

export function soundEnabled(settings) {
  return settings?.sound !== false;
}

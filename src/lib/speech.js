let voices = [];
let loaded = false;

function loadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  voices = window.speechSynthesis.getVoices();
  loaded = voices.length > 0;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}

function germanVoice() {
  if (!loaded) loadVoices();
  return voices.find((v) => v.lang === 'de-DE')
    || voices.find((v) => v.lang?.toLowerCase().startsWith('de'))
    || null;
}

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakGerman(text, { rate = 0.88, onEnd } = {}) {
  if (!canSpeak() || !text) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = rate;
    utterance.pitch = 1;
    const voice = germanVoice();
    if (voice) utterance.voice = voice;
    if (onEnd) utterance.onend = onEnd;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

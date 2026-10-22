/**
 * German speech, native first.
 *
 * Android uses the platform TextToSpeech engine through the Capacitor plugin.
 * That is the important fix over v1: WebView speechSynthesis is often silent
 * on Android and never exposes the installed Google voice packs. The browser
 * path stays as a genuine fallback for desktop preview and non-Android web.
 */
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

export const SPEECH_ERROR_EVENT = 'wort:speech-error';

const isNative = () => Capacitor.isNativePlatform();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const state = {
  nativeReady: false,
  nativeVoices: [],
  selectedVoice: null,
  nativeSupported: false,
  voiceLoaded: false,
  lastError: '',
  webVoices: [],
  webLoaded: false,
};

let requestSeq = 0;
let nativeVoicesPromise = null;

function emitError(message) {
  state.lastError = message;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SPEECH_ERROR_EVENT, { detail: { message } }));
  }
}

function normalizeLang(lang) {
  return String(lang || '').replace('_', '-').toLowerCase();
}

function isGerman(voice) {
  return normalizeLang(voice?.lang).startsWith('de');
}

function isGermanGermany(voice) {
  return normalizeLang(voice?.lang) === 'de-de';
}

function qualityScore(voice) {
  const uri = `${voice?.voiceURI || ''} ${voice?.name || ''}`.toLowerCase();
  let score = 0;
  if (isGermanGermany(voice)) score += 100;
  else if (isGerman(voice)) score += 55;
  if (voice?.localService) score += 22;
  if (voice?.default) score += 3;
  if (uri.includes('google')) score += 5;
  if (/neural|premium|enhanced|natural|wavenet|studio|high|hq/.test(uri)) score += 34;
  // Local Google German packs are named de-de-x-deg/deb/nfh. German 2 (deg)
  // is the most natural of the commonly installed local packs; keep this
  // ordering deterministic so a user always gets the same voice.
  if (uri.includes('de-de-x-deg')) score += 36;
  else if (uri.includes('de-de-x-deb')) score += 28;
  else if (uri.includes('de-de-x-nfh')) score += 18;
  else if (uri.includes('de-de-x-dea')) score += 10;
  if (uri.includes('network')) score -= 16;
  if (uri.includes('language')) score -= 6;
  return score;
}

function pickGermanVoice(voices = []) {
  const german = voices.filter(isGerman);
  if (!german.length) return null;
  return [...german].sort((a, b) => qualityScore(b) - qualityScore(a))[0];
}

function voiceLabel(voice) {
  if (!voice) return 'Almanca ses bulunamadı';
  const uri = voice.voiceURI || voice.name || '';
  if (/de-de-x-deg/i.test(uri)) return 'Almanca · Google kaliteli ses';
  if (/de-de-x-deb/i.test(uri)) return 'Almanca · Google sesi';
  if (/de-de-x-nfh/i.test(uri)) return 'Almanca · Google alternatif';
  if (voice.localService) return 'Almanca · çevrimdışı ses';
  return 'Almanca · çevrimiçi ses';
}

function loadWebVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const voices = window.speechSynthesis.getVoices() || [];
  if (voices.length) {
    state.webVoices = voices;
    state.webLoaded = true;
  }
  return state.webVoices;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadWebVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadWebVoices);
}

function waitForWebVoices(timeout = 1200) {
  if (state.webLoaded && state.webVoices.length) return Promise.resolve(state.webVoices);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(loadWebVoices());
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', finish, { once: true });
    setTimeout(finish, timeout);
    // Some WebViews populate voices synchronously only after getVoices().
    loadWebVoices();
    if (state.webVoices.length) finish();
  });
}

async function loadNativeVoices() {
  if (nativeVoicesPromise) return nativeVoicesPromise;
  nativeVoicesPromise = (async () => {
    let supported = false;
    try {
      const result = await TextToSpeech.isLanguageSupported({ lang: 'de-DE' });
      supported = Boolean(result?.supported);
    } catch {
      // The engine can still be initializing; voices are the better signal.
    }

    let voices = [];
    let voiceQueryWorked = false;
    // The Android engine is initialized asynchronously. A cold first tap used
    // to hit "not initialized"; retry briefly instead of failing silently.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const result = await TextToSpeech.getSupportedVoices();
        voiceQueryWorked = true;
        voices = result?.voices || [];
        if (voices.length || supported) break;
      } catch {
        // keep retrying
      }
      await sleep(140);
    }

    state.nativeVoices = voices;
    state.nativeSupported = supported;
    state.selectedVoice = pickGermanVoice(voices);
    // If both native queries failed, leave the cache unready so the next tap
    // gets a fresh attempt instead of showing a permanent "voice missing".
    state.nativeReady = supported || voiceQueryWorked;
    state.voiceLoaded = state.nativeReady;
    return voices;
  })().finally(() => {
    if (!state.nativeReady) nativeVoicesPromise = null;
  });
  return nativeVoicesPromise;
}

/** True when this runtime has any usable speech route. */
export function canSpeak() {
  return isNative() || (typeof window !== 'undefined' && 'speechSynthesis' in window);
}

/** Read the currently selected German voice without speaking. */
export async function getSpeechInfo({ refresh = false } = {}) {
  if (isNative()) {
    if (refresh || !state.voiceLoaded) {
      nativeVoicesPromise = null;
      state.nativeReady = false;
      await loadNativeVoices();
    }
    const voice = state.selectedVoice;
    return {
      platform: 'android',
      native: true,
      available: Boolean(voice || state.nativeSupported),
      canInstall: !voice && !state.nativeSupported,
      voice: voice ? { uri: voice.voiceURI, lang: voice.lang, label: voiceLabel(voice) } : null,
      voiceCount: state.nativeVoices.length,
      message: voice
        ? voiceLabel(voice)
        : state.nativeSupported
          ? 'Almanca dil desteği var; ses listesi henüz hazır değil.'
          : 'Almanca ses paketi bulunamadı. Android ayarlarından Google konuşma sentezini yükle.',
    };
  }
  const voices = await waitForWebVoices();
  const voice = pickGermanVoice(voices);
  return {
    platform: 'web',
    native: false,
    available: Boolean(voice),
    canInstall: false,
    voice: voice ? { uri: voice.voiceURI, lang: voice.lang, label: voiceLabel(voice) } : null,
    voiceCount: voices.length,
    message: voice ? voiceLabel(voice) : 'Tarayıcıda Almanca ses bulunamadı.',
  };
}

/** Open Android's TTS data installer when no German voice exists. */
export async function openTtsInstall() {
  if (!isNative()) return false;
  try {
    await TextToSpeech.openInstall();
    return true;
  } catch {
    return false;
  }
}

// Preload native voices when the app becomes interactive, without speaking.
export async function warmUpSpeech() {
  if (isNative()) {
    try { await loadNativeVoices(); } catch { /* silent until first tap */ }
  } else {
    loadWebVoices();
  }
}

function speakWeb(text, { rate = 0.92, pitch = 1 } = {}) {
  return new Promise(async (resolve, reject) => {
    const voices = state.webLoaded ? state.webVoices : await waitForWebVoices();
    const voice = pickGermanVoice(voices);
    if (!voice) {
      reject(new Error('Tarayıcıda Almanca ses bulunamadı.'));
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      utterance.rate = Math.min(1.3, Math.max(0.5, rate));
      utterance.pitch = Math.min(1.5, Math.max(0.5, pitch));
      utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = (event) => {
        if (event?.error === 'canceled' || event?.error === 'interrupted') resolve();
        else reject(new Error('Tarayıcı sesi oynatılamadı.'));
      };
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      reject(err);
    }
  });
}

async function speakNative(text, { rate = 0.92, pitch = 1 } = {}) {
  if (!state.nativeReady) await loadNativeVoices();
  const selected = state.selectedVoice;
  if (!selected && !state.nativeSupported) {
    throw new Error('Almanca ses paketi bulunamadı. Ayarlardan ses paketini yükle.');
  }

  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await TextToSpeech.speak({
        text,
        lang: 'de-DE',
        rate: Math.min(1.25, Math.max(0.55, rate)),
        pitch: Math.min(1.4, Math.max(0.6, pitch)),
        volume: 1,
        ...(selected ? { voice: state.nativeVoices.indexOf(selected) } : {}),
        category: 'playback',
        queueStrategy: 0,
      });
      return;
    } catch (err) {
      lastError = err;
      const message = String(err?.message || err || '');
      if (/not yet initialized|not available/i.test(message)) {
        await sleep(140 + attempt * 50);
        if (!state.nativeReady) await loadNativeVoices();
        continue;
      }
      break;
    }
  }
  throw lastError || new Error('Almanca ses oynatılamadı.');
}

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[_/]+/g, ' ')
    .trim();
}

/**
 * Speak German. Resolves true when the utterance finished, false if no speech
 * route was available. Always stops the previous utterance first.
 */
export async function speakGerman(text, { rate, slow = false, pitch = 1, onEnd, onError } = {}) {
  const value = cleanText(text);
  if (!value || !canSpeak()) return false;

  const id = ++requestSeq;
  const speechRate = rate ?? (slow ? 0.76 : 0.92);

  try {
    if (isNative()) {
      try { await TextToSpeech.stop(); } catch { /* first run may not be ready */ }
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (id !== requestSeq) return false;

    if (isNative()) await speakNative(value, { rate: speechRate, pitch });
    else await speakWeb(value, { rate: speechRate, pitch });

    if (id === requestSeq) onEnd?.();
    return true;
  } catch (err) {
    const message = String(err?.message || err || 'Ses oynatılamadı.');
    if (id === requestSeq) {
      emitError(message);
      onError?.(message);
    }
    return false;
  }
}

export function stopSpeaking() {
  requestSeq += 1;
  try {
    if (isNative()) TextToSpeech.stop().catch(() => {});
    else if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch {
    // no-op
  }
}

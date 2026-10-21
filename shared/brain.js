/**
 * Learner-brain model.
 * Combines a short calibration prior with recency-weighted evidence from real
 * answers. It never claims to "read" a brain: every number is traceable to a
 * behavior (accuracy, latency, modality gap, consistency) and the UI says so.
 */
import { recencyStats, recencyContext, wordState } from './fsrs.js';

const DAY = 86_400_000;

const TYPE_LABELS = {
  choice: 'Anlam tanıma',
  choice_tr_de: 'Almanca üretme',
  choice_de_tr: 'Almanca anlama',
  listen: 'Dinleme',
  type: 'Yazarak üretme',
  build: 'Cümle kurma',
  article: 'Artikeller',
  cloze: 'Boşluk doldurma',
  match: 'Eşleştirme',
  flashcard: 'Aktif hatırlama',
  lesson: 'Ders',
  checkpoint: 'Checkpoint',
  review: 'Tekrar',
};

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function accuracyByType(reviews) {
  const map = new Map();
  for (const r of reviews) {
    const key = r.exercise_type || 'review';
    if (!map.has(key)) map.set(key, { type: key, label: TYPE_LABELS[key] || key, total: 0, correct: 0, latency: [] });
    const row = map.get(key);
    row.total += 1;
    row.correct += r.correct ? 1 : 0;
    if (r.latency_ms) row.latency.push(r.latency_ms);
  }
  return [...map.values()].map((row) => ({
    ...row,
    accuracy: row.total ? row.correct / row.total : 0,
    avgLatencyMs: row.latency.length ? Math.round(average(row.latency)) : null,
  })).sort((a, b) => b.total - a.total);
}

export function brainprint(seedMetrics) {
  // A small, reproducible signature of the learner — not an icon, data.
  const base = seedMetrics.join('-');
  let h = 2166136261;
  for (let i = 0; i < base.length; i += 1) h = Math.imul(h ^ base.charCodeAt(i), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  return Array.from({ length: 22 }, (_, i) => {
    const metric = seedMetrics[i % seedMetrics.length] / 100;
    return clamp(0.18 + metric * 0.48 + rand() * 0.34, 0.12, 0.98);
  });
}

/**
 * @param {object} input
 * @param {object} input.user
 * @param {Array} input.words user_words + state
 * @param {Array} input.reviews
 * @param {Array} input.dailyStats
 * @param {Array} input.progress lesson_progress
 */
export function computeBrain({ user, words = [], reviews = [], dailyStats = [], progress = [], now = new Date() }) {
  const calibration = user?.profile?.calibration || {};
  const calibrationMemory = clamp(Number(calibration.memory) || 0.76, 0, 1);
  const calibrationSpeed = Number(calibration.speedMs) || 5200;
  const calibrationModality = calibration.modality === 'auditory' ? 'auditory' : calibration.modality === 'visual' ? 'visual' : 'balanced';
  const calibrationConfidence = clamp(Number(calibration.confidence) || 0.35, 0, 1);

  const recent = recencyStats(reviews, now);
  const recent30 = reviews.filter((r) => now - new Date(r.reviewed_at) < 30 * DAY);
  const byType = accuracyByType(recent30);
  const listening = byType.filter((r) => r.type === 'listen');
  const listeningStats = listening.reduce((acc, r) => ({ correct: acc.correct + r.correct, total: acc.total + r.total }), { correct: 0, total: 0 });
  const listeningAccuracy = listeningStats.total ? listeningStats.correct / listeningStats.total : null;

  const seen = words.filter((w) => w.reps > 0);
  const mastered = words.filter((w) => w.state === 'mastered');
  const avgStability = average(seen.map((w) => Number(w.stability) || 0));
  const retention = recent.accuracy ?? calibrationMemory;
  const weightedAccuracy = recent.weightedAccuracy ?? retention;
  const masteryRatio = seen.length ? mastered.length / seen.length : 0;

  const latencySamples = recent30.map((r) => r.latency_ms).filter(Boolean);
  const medianLatency = median(latencySamples) || calibrationSpeed;
  const expectedLatency = 6200;
  const pace = Math.round(clamp(116 - (medianLatency / expectedLatency) * 62, 18, 98));
  const accuracy = Math.round(weightedAccuracy * 100);
  const memory = Math.round(clamp(
    (weightedAccuracy * 0.48 + calibrationMemory * 0.22 + clamp((avgStability || 0) / 22, 0, 1) * 0.3) * 100,
    20,
    98
  ));

  const activeDays = new Set(dailyStats.map((d) => d.day)).size;
  const last14 = dailyStats.filter((d) => now - new Date(`${d.day}T12:00:00`) < 14 * DAY).length;
  const consistency = Math.round(clamp((last14 / 10) * 100 + Math.min(12, (user?.streak || 0) * 1.2), 0, 100));

  let modality = calibrationModality;
  if (listeningAccuracy != null && recent30.length >= 8) {
    const other = recent30.filter((r) => r.exercise_type !== 'listen');
    const otherAccuracy = other.length ? other.filter((r) => r.correct).length / other.length : retention;
    if (listeningAccuracy - otherAccuracy > 0.08) modality = 'auditory';
    else if (otherAccuracy - listeningAccuracy > 0.1) modality = 'visual';
    else modality = 'balanced';
  } else if (calibrationModality === 'balanced' && recent30.length < 8) {
    modality = 'visual';
  }

  const listeningScore = listeningAccuracy == null
    ? Math.round(clamp(calibrationMemory * 100 * 0.92, 25, 90))
    : Math.round(clamp(listeningAccuracy * 100, 10, 99));

  const confidence = Math.round(clamp(22 + Math.min(55, recent.evidence * 1.6) + calibrationConfidence * 22, 18, 98));
  const fast = pace >= 58;
  const strong = accuracy >= 78;
  const modalityWord = modality === 'auditory' ? 'İşitsel' : modality === 'visual' ? 'Görsel' : 'Dengeli';
  const profileLabel = `${fast ? 'Hızlı' : 'Titiz'} ${modalityWord}`;
  const taglines = {
    'Hızlı Görsel': 'Desenleri çabuk yakalıyor, görerek sağlamlaştırıyorsun.',
    'Hızlı İşitsel': 'Kulakların hızlı çalışıyor; duyduğun kelime hemen yerleşiyor.',
    'Hızlı Dengeli': 'Hız ve doğruluk dengede; tempoyu yükseltebiliriz.',
    'Titiz Görsel': 'Dikkatle okuyor, kalıcı bir temel kuruyorsun.',
    'Titiz İşitsel': 'Dinleyerek derinleşiyorsun; her tekrar daha net oturuyor.',
    'Titiz Dengeli': 'Sağlam ilerliyorsun; küçük tempolar büyük fark yaratacak.',
  };
  const speedLabel = pace >= 75 ? 'çok hızlı' : pace >= 58 ? 'akıcı' : pace >= 40 ? 'ölçülü' : 'temkinli';

  const weakest = [...byType].filter((t) => t.total >= 2).sort((a, b) => a.accuracy - b.accuracy)[0];
  const strongest = [...byType].filter((t) => t.total >= 2).sort((a, b) => b.accuracy - a.accuracy)[0];

  const insights = [];
  insights.push({
    kind: 'speed',
    label: 'Tepki hızı',
    value: `${(medianLatency / 1000).toFixed(1)} sn`,
    text: `Ortalama cevap süren ${(medianLatency / 1000).toFixed(1)} saniye. ${speedLabel[0].toUpperCase() + speedLabel.slice(1)} bir ritimdesin.`,
    tone: 'blue',
  });
  insights.push({
    kind: 'memory',
    label: 'Hatırlama',
    value: `%${accuracy}`,
    text: recent.evidence
      ? `Son ${Math.min(21, recent.evidence)} ölçümlü kayıtta recency ağırlıklı doğruluk %${accuracy}. Öğrenme eğrin bunu takip ediyor.`
      : 'Henüz yeterli cevap yok; kalibrasyon sonuçları başlangıç noktası olarak kullanılıyor.',
    tone: 'green',
  });
  insights.push({
    kind: 'modality',
    label: 'Öğrenme kanalı',
    value: modalityWord,
    text: listeningAccuracy != null && recent30.length >= 8
      ? `Dinleme doğruluğun %${listeningScore}; genel doğruluğun %${accuracy}. ${modality === 'auditory' ? 'Dinleyerek daha net öğreniyorsun.' : modality === 'visual' ? 'Okuyarak daha net öğreniyorsun.' : 'İki kanal da yakın çalışıyor.'}`
      : `Başlangıç tercihin ${modalityWord.toLowerCase()} öğrenme. Dinleme egzersizleriyle bunu doğruluyoruz.`,
    tone: 'violet',
  });
  if (weakest) {
    insights.push({
      kind: 'weak',
      label: 'Gelişim alanı',
      value: weakest.label,
      text: `${weakest.label} egzersizlerinde doğruluk %${Math.round(weakest.accuracy * 100)}. Bu hafta bu türü biraz daha sık getireceğiz.`,
      tone: 'amber',
    });
  }
  if (strongest && strongest.type !== weakest?.type) {
    insights.push({
      kind: 'strong',
      label: 'Güçlü taraf',
      value: strongest.label,
      text: `${strongest.label} senin en güvenilir kanalın: %${Math.round(strongest.accuracy * 100)} doğruluk.`,
      tone: 'coral',
    });
  }

  const goal = Number(user?.goal_minutes) || 15;
  let newWordsPerDay = goal <= 5 ? 3 : goal <= 10 ? 5 : goal <= 15 ? 7 : 9;
  if (memory >= 78 && pace >= 58) newWordsPerDay += 1;
  if (accuracy < 70 || memory < 48) newWordsPerDay -= 1;
  newWordsPerDay = Math.round(clamp(newWordsPerDay, 2, 12));

  const dueBacklog = words.filter((w) => w.due_at && new Date(w.due_at) <= now).length;
  const context = recencyContext({
    recentAccuracy: weightedAccuracy,
    recentReviews: recent.evidence,
    backlog: dueBacklog,
    capacity: Math.max(20, Math.round(goal * 2.2)),
  });

  const mix = {
    listening: listeningAccuracy != null && listeningAccuracy < accuracy / 100 - 0.06 ? 'high' : 'normal',
    typing: weakest?.type === 'type' ? 'high' : 'normal',
    grammar: weakest?.type === 'article' ? 'high' : 'normal',
  };

  const calibrationNote = confidence < 42
    ? 'Profilin hâlâ kalibre oluyor. Yaklaşık 20 cevaptan sonra daha keskin olacak.'
    : `${recent.evidence} son cevabın profili güncelliyor.`;

  return {
    profileLabel,
    tagline: taglines[profileLabel] || 'Her cevapla profilin biraz daha netleşiyor.',
    modality,
    modalityLabel: modalityWord,
    confidence,
    metrics: {
      pace,
      memory,
      consistency,
      accuracy,
      listening: listeningScore,
    },
    stats: {
      medianLatencyMs: Math.round(medianLatency),
      accuracy,
      reviews: recent.evidence,
      activeDays,
      seenWords: seen.length,
      masteredWords: mastered.length,
      retention: Math.round(weightedAccuracy * 100),
      avgStability: Number((avgStability || 0).toFixed(1)),
    },
    insights,
    byType,
    personalization: {
      newWordsPerDay,
      desiredRetention: Number(context.desiredRetention.toFixed(3)),
      reviewCap: Math.round(clamp(goal * 1.8, 12, 40)),
      sessionMinutes: goal,
      exerciseMix: mix,
      hintMode: confidence < 42 ? 'generous' : accuracy >= 88 && pace >= 65 ? 'minimal' : 'balanced',
      overload: context.overload,
    },
    brainprint: brainprint([pace, memory, consistency, accuracy, listeningScore]),
    evidence: recent.evidence,
    calibrationNote,
    dueBacklog,
    weakest,
    strongest,
  };
}

export { TYPE_LABELS };

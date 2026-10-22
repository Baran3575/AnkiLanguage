/**
 * FSRS-7 · Recency
 * ----------------
 * A faithful JavaScript port of the finished 34-parameter dual-stability
 * FSRS-7 memory model (long-term stability, short-term stability, difficulty)
 * from the open SRS benchmark, plus wort.'s recency calibration layer.
 *
 * The FSRS-7 recurrence is deliberately kept pure: no DOM, network, storage or
 * platform APIs. That makes it safe to run in the browser, in the local Android
 * engine and in the Node server, and it lets us test the exact same code.
 *
 * Recency layer:
 *   - review outcomes are weighted with an exponential 7-day half-life;
 *   - recent lapses lower the stability gain and raise desired retention;
 *   - backlog pressure lowers desired retention slightly so the queue stays
 *     humane;
 *   - every adjustment is clamped to a narrow band. FSRS-7 remains the memory
 *     model; the recency layer only calibrates it for this learner.
 *
 * Rating scale: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
 */

/** Finished 34-parameter FSRS-7 defaults (srs-benchmark). */
export const FSRS_WEIGHTS = Object.freeze([
  0.1104, 2.2395, 3.9221, 11.7841, // 0–3 initial stability by rating
  6.1686, 0.6457, 3.6807, 1.9795,  // 4–7 initial difficulty
  0.0, 1.3826, 0.7024, 0.5999,     // 8–11 long-term stability
  0.8146, 0.6398, 1.0, 1.3207,     // 12–15 long-term stability (cont.)
  0.6707, 3.8668, 0.4416, 0.0934,  // 16–19 long-term + fail
  1.8631, 0.6162, 1.0869,          // 20–22 short-term stability
  0.1567, 0.0801, 0.2421, 0.9464,  // 23–26 forgetting curve: decay/base
  0.1433, 0.7145, 0.0, 0.5667,     // 27–30 forgetting curve: weights
  0.3734, 0.5333, 0.3048,          // 31–33 forgetting curve: difficulty/decay
]);

export const FSRS_MODEL = 'FSRS-7';
const W = FSRS_WEIGHTS;

const DAY = 86_400_000;
const MINUTE = 60_000;
const S_MIN = 0.001;
const S_MAX = 36_500;
const D_MIN = 1;
const D_MAX = 10;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round4 = (n) => Number(n.toFixed(4));
const finite = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const normalizeGrade = (grade) => clamp(Math.round(finite(grade, 3)), 1, 4);

/**
 * Raw initial difficulty for a rating, per FSRS-7. This is intentionally not
 * clamped: the model uses init_d(4) ≈ 0.23 as its mean-reversion target, while
 * the first memory state itself is clamped to [1, 10].
 */
export function initialDifficulty(grade) {
  const g = normalizeGrade(grade);
  return W[4] - Math.exp(W[5] * (g - 1)) + 1;
}

/** Initial long-term stability for a first rating. */
export function initialStability(grade) {
  return W[normalizeGrade(grade) - 1];
}

/** FSRS-7 short-term recall component r1. */
export function shortTermRetrievability(elapsedDays, stabilityShort) {
  const t = Math.max(0, Number(elapsedDays) || 0);
  const sShort = clamp(Number(stabilityShort) || S_MIN, S_MIN, S_MAX);
  const tOverS = t / sShort;
  const decayMag = clamp(W[23] * Math.pow(sShort, W[33] - 0.3), 0.01, 0.95);
  const decay = -decayMag;
  const factor = Math.exp(Math.min(60, Math.log(W[25]) / decay)) - 1;
  return Math.pow(tOverS * factor + 1, decay);
}

/**
 * FSRS-7 dual-stability forgetting curve. Returns P(recall).
 * Defaults make the function usable from older call sites without a full
 * three-component state.
 */
export function retrievability(elapsedDays, stability, stabilityShort = stability * 0.8, difficulty = 5) {
  const t = Math.max(0, Number(elapsedDays) || 0);
  const s = clamp(Number(stability) || S_MIN, S_MIN, S_MAX);
  const sShort = clamp(Number(stabilityShort) || s * 0.8, S_MIN, S_MAX);
  const d = clamp(Number(difficulty) || 5, D_MIN, D_MAX);
  const tOverLong = t / s;

  const r1 = shortTermRetrievability(t, sShort);
  const decay2 = -clamp(W[24], 0.01, 0.95);
  const factor2 = Math.pow(W[26], 1 / decay2) - 1;
  const dTimescale = Math.exp((d - 5) * (W[32] - 0.3));
  const r2 = Math.pow(tOverLong * factor2 * dTimescale + 1, decay2);

  const weight1 = W[27] * Math.pow(sShort, -W[29]);
  const weight2 = W[28] * Math.pow(s, W[30]) * Math.exp((d - 5) * (W[31] - 0.5));
  const retention = (weight1 * r1 + weight2 * r2) / (weight1 + weight2);
  return retention * (1 - 2e-5) + 1e-5;
}

/** FSRS-7 stability update. `start` is 7 long-term, 15 short-term. */
export function nextStability(lastStability, lastDifficulty, recall, grade, start) {
  const s = clamp(Number(lastStability) || S_MIN, S_MIN, S_MAX);
  const d = clamp(Number(lastDifficulty) || 5, D_MIN, D_MAX);
  const r = clamp(Number(recall) || 0, 0, 1);
  const g = normalizeGrade(grade);
  const hardPenalty = g === 2 ? W[start + 6] : 1;
  const easyBonus = g === 4 ? W[start + 7] : 1;

  const fail = W[start + 3]
    * (Math.pow(s + 1, W[start + 4]) - 1)
    * Math.exp((1 - r) * W[start + 5]);
  const pls = Math.min(s, fail);

  const sinc = Math.exp(W[start] - 1.5)
    * (11 - d)
    * Math.pow(s, -W[start + 1])
    * (Math.exp((1 - r) * W[start + 2]) - 1)
    * hardPenalty
    * easyBonus
    + 1;
  const success = Math.max(pls, s * sinc);
  return g > 1 ? success : pls;
}

/** FSRS-7 difficulty update, including surprise-weighted lapse and 1% reversion. */
export function nextDifficulty(lastDifficulty, grade, recall) {
  const d = clamp(Number(lastDifficulty) || initialDifficulty(3), D_MIN, D_MAX);
  const g = normalizeGrade(grade);
  const r = clamp(finite(recall), 0, 1);
  let delta = -W[6] * (g - 3);
  if (g === 1) delta *= r + 0.1;
  const damped = delta * (10 - d) / 9;
  const reverted = 0.01 * initialDifficulty(4) + 0.99 * (d + damped);
  return clamp(reverted, D_MIN, D_MAX);
}

/** One FSRS-7 step. State is [long-term S, short-term S, difficulty]. */
export function stepMemory(state, elapsedDays, grade) {
  const g = normalizeGrade(grade);
  const priorLong = Number(state?.stability) || 0;
  const priorShort = Number(state?.stabilityShort ?? state?.stability_short) || 0;
  const priorD = Number(state?.difficulty) || 0;

  if (!priorLong) {
    const stability = clamp(W[g - 1], S_MIN, S_MAX);
    return {
      stability,
      stabilityShort: clamp(0.8 * stability, S_MIN, S_MAX),
      difficulty: clamp(initialDifficulty(g), D_MIN, D_MAX),
      retrievability: 0,
      first: true,
    };
  }

  const s = clamp(priorLong, S_MIN, S_MAX);
  const sShort = clamp(priorShort || 0.8 * s, S_MIN, S_MAX);
  const d = clamp(priorD || initialDifficulty(g), D_MIN, D_MAX);
  const t = Math.max(0, finite(elapsedDays));
  const recall = retrievability(t, s, sShort, d);
  const r1 = shortTermRetrievability(t, sShort);

  let stability = nextStability(s, d, recall, g, 7);
  let stabilityShort = nextStability(sShort, d, r1, g, 15);
  if (g === 1) stabilityShort = Math.min(stabilityShort, 0.8 * stability);

  return {
    stability: clamp(stability, S_MIN, S_MAX),
    stabilityShort: clamp(stabilityShort, S_MIN, S_MAX),
    difficulty: nextDifficulty(d, g, recall),
    retrievability: recall,
    first: false,
  };
}

/** Solve FSRS-7's monotonic forgetting curve for the interval at target R. */
export function intervalForRetention(stability, stabilityShort, difficulty, desiredRetention = 0.9) {
  const target = clamp(Number(desiredRetention) || 0.9, 0.75, 0.97);
  const s = clamp(Number(stability) || S_MIN, S_MIN, S_MAX);
  const sShort = clamp(Number(stabilityShort) || s * 0.8, S_MIN, S_MAX);
  const d = clamp(Number(difficulty) || 5, D_MIN, D_MAX);
  let lo = 0;
  let hi = 36_500;
  for (let i = 0; i < 64; i += 1) {
    const mid = (lo + hi) / 2;
    if (retrievability(mid, s, sShort, d) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Backwards-compatible helper: interval for a target recall probability. */
export function nextInterval(stability, desiredRetention = 0.9) {
  return intervalForRetention(stability, stability * 0.8, 5, desiredRetention);
}

/**
 * Recency-weighted context. The half-life is seven days, matching the way the
 * FSRS-7 "recency" benchmark weights recent reviews more heavily.
 */
export function recencyContext({
  recentAccuracy = 0.82,
  recentReviews = 0,
  backlog = 0,
  capacity = 20,
  lapseRate = 0,
} = {}) {
  const accuracy = clamp(finite(recentAccuracy, 0.82), 0, 1);
  const lapses = clamp(finite(lapseRate), 0, 1);
  const evidence = clamp(finite(recentReviews) / 60, 0, 1);
  const backlogCount = Math.max(0, finite(backlog));
  const dailyCapacity = Math.max(1, finite(capacity, 20));
  const overload = backlogCount > dailyCapacity * 1.4;
  const desiredRetention = clamp(
    0.9
      + (accuracy - 0.84) * 0.18
      + evidence * 0.004
      - (overload ? 0.02 : 0)
      - lapses * 0.05,
    0.87,
    0.94,
  );
  const stabilityMultiplier = clamp(
    0.985 + (accuracy - 0.80) * 0.10 - lapses * 0.08,
    0.95,
    1.025,
  );
  return { desiredRetention, stabilityMultiplier, overload, evidence, lapseRate: lapses };
}

/**
 * Review a word. Pure function: pass a word row and get the next row values.
 * `word` fields: stability, stability_short/stabilityShort, difficulty, reps,
 * lapses, last_review.
 */
export function reviewWord(word, grade, now = new Date(), context = {}) {
  const g = normalizeGrade(grade);
  const reps = Number(word?.reps) || 0;
  const priorLong = Number(word?.stability) || 0;
  const priorShort = Number(word?.stabilityShort ?? word?.stability_short) || 0;
  const priorD = Number(word?.difficulty) || 0;
  const lastReview = word?.last_review || word?.lastReview || null;
  const elapsedDays = lastReview
    ? Math.max(0, (now.getTime() - new Date(lastReview).getTime()) / DAY)
    : 0;

  const state = stepMemory(
    { stability: priorLong, stabilityShort: priorShort, difficulty: priorD },
    elapsedDays,
    g,
  );

  let stability = state.stability;
  let stabilityShort = state.stabilityShort;
  const difficulty = state.difficulty;
  let intervalDays;

  if (state.first) {
    if (g === 1) {
      intervalDays = 10 / (24 * 60);
    } else {
      // A first meeting always gets a 24-hour consolidation review. This is a
      // product guard on top of FSRS-7, not a change to the memory equation.
      intervalDays = 1;
    }
  } else {
    const retentionTarget = clamp(context.desiredRetention ?? 0.9, 0.87, 0.94);
    if (g > 1) {
      const recencyGain = clamp(context.stabilityMultiplier ?? 1, 0.95, 1.025);
      stability = clamp(stability * recencyGain, S_MIN, S_MAX);
      stabilityShort = clamp(stabilityShort * recencyGain, S_MIN, S_MAX);
      intervalDays = intervalForRetention(stability, stabilityShort, difficulty, retentionTarget);
      intervalDays = clamp(intervalDays, 1, 365);
    } else {
      intervalDays = 10 / (24 * 60);
    }
  }

  const due = new Date(now.getTime() + intervalDays * DAY);
  return {
    stability: round4(stability),
    stabilityShort: round4(stabilityShort),
    difficulty: round4(difficulty),
    reps: reps + 1,
    lapses: (Number(word?.lapses) || 0) + (g === 1 ? 1 : 0),
    last_review: now.toISOString(),
    due_at: due.toISOString(),
    intervalDays,
    recallBefore: round4(state.retrievability),
    last_grade: g,
  };
}

/** Preview the four rating intervals for the flashcard UI. */
export function previewRatings(word, context = {}, now = new Date()) {
  return [1, 2, 3, 4].map((grade) => {
    const next = reviewWord(word, grade, now, context);
    return {
      grade,
      days: next.intervalDays,
      intervalDays: next.intervalDays,
      dueAt: next.due_at,
      stability: next.stability,
      stabilityShort: next.stabilityShort,
      difficulty: next.difficulty,
      recallBefore: next.recallBefore,
    };
  });
}

/**
 * Recency-weighted performance from recent reviews.
 * Each review gets exp(-age / 7) weight, so last week explains most of today.
 */
export function recencyStats(reviews = [], now = new Date()) {
  const list = Array.isArray(reviews) ? reviews : [];
  let total = 0;
  let correct = 0;
  let lapses = 0;
  let weightedCorrect = 0;
  let weightedTotal = 0;
  let weightedLapses = 0;
  let latencyWeighted = 0;
  let latencyTotal = 0;
  let latest = null;
  const windowDays = 21;
  for (const r of list) {
    const at = new Date(r.reviewed_at || r.reviewedAt);
    if (Number.isNaN(at.getTime())) continue;
    const age = (now.getTime() - at.getTime()) / DAY;
    if (age < 0 || age > windowDays) continue;
    const weight = Math.exp(-age / 7);
    const isCorrect = r.correct != null ? Boolean(r.correct) : Number(r.grade) > 1;
    const lapse = Number(r.grade) === 1 || (r.correct === false && r.grade == null);
    total += 1;
    correct += isCorrect ? 1 : 0;
    lapses += lapse ? 1 : 0;
    weightedTotal += weight;
    weightedCorrect += isCorrect ? weight : 0;
    weightedLapses += lapse ? weight : 0;
    if (r.latency_ms || r.latencyMs) {
      latencyWeighted += (r.latency_ms || r.latencyMs) * weight;
      latencyTotal += weight;
    }
    if (!latest || at > latest) latest = at;
  }
  return {
    reviews: total,
    accuracy: total ? correct / total : null,
    weightedAccuracy: weightedTotal ? weightedCorrect / weightedTotal : null,
    lapseRate: weightedTotal ? weightedLapses / weightedTotal : null,
    avgLatencyMs: latencyTotal ? Math.round(latencyWeighted / latencyTotal) : null,
    evidence: total,
    lastReviewAt: latest ? latest.toISOString() : null,
  };
}

/** 0–100 "freshness" of a word's memory, for progress surfaces. */
export function recencyScore(lastReview, stability, now = new Date()) {
  if (!lastReview) return 0;
  const at = new Date(lastReview).getTime();
  if (!Number.isFinite(at)) return 0;
  const elapsed = Math.max(0, (now.getTime() - at) / DAY);
  const freshness = Math.exp(-elapsed / 14);
  const strength = clamp(finite(stability) / 21, 0, 1);
  return Math.round(clamp(freshness * (0.65 + 0.35 * strength), 0, 1) * 100);
}

export function wordState(word) {
  const reps = Number(word?.reps) || 0;
  const stability = Number(word?.stability) || 0;
  if (!reps) return 'new';
  if (stability >= 21 && reps >= 4) return 'mastered';
  if (stability >= 7 && reps >= 3) return 'review';
  return 'learning';
}

export function isDue(word, now = new Date()) {
  return Boolean(word?.due_at) && new Date(word.due_at).getTime() <= now.getTime();
}

export function gradeFromAnswers(answers = [], { isNew = false } = {}) {
  const total = answers.length || 1;
  const correct = answers.filter((a) => a.correct).length;
  const ratio = correct / total;
  const avgLatency = answers.reduce((sum, a) => sum + (a.latencyMs || 0), 0) / total;
  if (ratio === 0) return 1;
  if (ratio < 0.5) return 1;
  if (ratio < 0.8) return 2;
  if (ratio >= 1 && !isNew && avgLatency > 0 && avgLatency < 4200) return 4;
  return 3;
}

export const RATING_LABELS = {
  1: { tr: 'Tekrar', de: 'Again', tone: 'again' },
  2: { tr: 'Zor', de: 'Hard', tone: 'hard' },
  3: { tr: 'İyi', de: 'Good', tone: 'good' },
  4: { tr: 'Kolay', de: 'Easy', tone: 'easy' },
};

export function formatInterval(days) {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))} dk`;
  if (days < 1) return `${Math.round(days * 24)} sa`;
  if (days < 30) return `${Math.round(days)} gün`;
  if (days < 365) return `${Math.round(days / 30)} ay`;
  return `${(days / 365).toFixed(1)} yıl`;
}

export const DAY_MS = DAY;
export const MINUTE_MS = MINUTE;

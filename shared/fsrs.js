/**
 * FSRS-7R · Recency
 * -----------------
 * A practical adaptation of the open FSRS scheduler for short-horizon language
 * learning. The memory model is FSRS-5 (power forgetting curve, stability +
 * difficulty); the "7R" layer adds a 7-day recency weighting on top:
 *
 *   1. Recent performance nudges stability gains (recent recall is more
 *      predictive of the current brain state than old recall).
 *   2. First exposures get a deliberate 24-hour consolidation review instead
 *      of a multi-day jump, which is how vocabulary sticks early on.
 *   3. Desired retention adapts between 86% and 93% using recent accuracy and
 *      review backlog.
 *   4. Lapses are re-seeded quickly (10 minutes), then rebuilt.
 *
 * The rating scale is the standard 1–4: Again, Hard, Good, Easy.
 */

export const FSRS_WEIGHTS = [
  0.40255, 1.18385, 3.173, 15.69105, // initial stability by rating
  7.1949, 0.5345, 1.4604, 0.0046,    // initial difficulty + difficulty update
  1.54575, 0.1192, 1.01925,          // stability after recall
  1.9395, 0.11, 0.29605, 2.2698,     // stability after lapse
  0.2315, 2.9898,                     // hard penalty, easy bonus
];

const W = FSRS_WEIGHTS;
const FACTOR = 19 / 81;
const DECAY = -0.5;
const DAY = 86_400_000;
const MINUTE = 60_000;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function retrievability(elapsedDays, stability) {
  if (!stability || stability <= 0) return 0;
  const t = Math.max(0, elapsedDays);
  return Math.pow(1 + FACTOR * (t / stability), DECAY);
}

export function nextInterval(stability, desiredRetention = 0.9) {
  const r = clamp(desiredRetention, 0.75, 0.97);
  const interval = (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
  return clamp(interval, 0, 365);
}

export function initialStability(grade) {
  return Math.max(0.2, W[clamp(grade, 1, 4) - 1]);
}

export function initialDifficulty(grade) {
  return clamp(W[4] - Math.exp(W[5] * (clamp(grade, 1, 4) - 1)) + 1, 1, 10);
}

export function nextDifficulty(difficulty, grade) {
  const delta = -W[6] * (clamp(grade, 1, 4) - 3);
  const candidate = difficulty + delta;
  const meanReversion = W[7] * initialDifficulty(3) + (1 - W[7]) * candidate;
  return clamp(meanReversion, 1, 10);
}

export function recallStability(difficulty, stability, recall, grade) {
  if (grade === 1) return stability;
  const hardPenalty = grade === 2 ? W[15] : 1;
  const easyBonus = grade === 4 ? W[16] : 1;
  return stability * (
    1 +
    Math.exp(W[8]) *
    (11 - difficulty) *
    Math.pow(stability, -W[9]) *
    (Math.exp(W[10] * (1 - recall)) - 1) *
    hardPenalty *
    easyBonus
  );
}

export function forgetStability(difficulty, stability, recall) {
  return clamp(
    W[11] * Math.pow(difficulty, -W[12]) * (Math.pow(stability + 1, W[13]) - 1) * Math.exp(W[14] * (1 - recall)),
    0.1,
    3650
  );
}

/**
 * Compute a learner-specific desired retention and stability multiplier from
 * recency-weighted performance. `recentAccuracy` is 0–1.
 */
export function recencyContext({ recentAccuracy = 0.82, recentReviews = 0, backlog = 0, capacity = 20 } = {}) {
  const accuracy = clamp(recentAccuracy, 0, 1);
  const evidence = clamp(recentReviews / 60, 0, 1);
  const overload = backlog > capacity * 1.4;
  const desiredRetention = clamp(
    0.9 + (accuracy - 0.8) * 0.22 - (overload ? 0.025 : 0) + evidence * 0.005,
    0.86,
    0.94
  );
  const stabilityMultiplier = clamp(0.92 + (accuracy - 0.72) * 0.32, 0.9, 1.08);
  return { desiredRetention, stabilityMultiplier, overload, evidence };
}

/**
 * Review a word. Pure function: pass a word row and get the next row values.
 * `word` fields: stability, difficulty, reps, lapses, last_review.
 */
export function reviewWord(word, grade, now = new Date(), context = {}) {
  const g = clamp(Math.round(grade), 1, 4);
  const priorStability = Number(word.stability) || 0;
  const priorDifficulty = Number(word.difficulty) || 0;
  const reps = Number(word.reps) || 0;
  const elapsedDays = word.last_review
    ? Math.max(0, (now.getTime() - new Date(word.last_review).getTime()) / DAY)
    : 0;
  const recall = reps > 0 && priorStability > 0
    ? retrievability(elapsedDays, priorStability)
    : 0;

  let stability;
  let difficulty;
  let intervalDays;

  if (reps === 0 || priorStability <= 0) {
    stability = initialStability(g);
    difficulty = initialDifficulty(g);
    intervalDays = nextInterval(stability, context.desiredRetention ?? 0.9);
    // A first encounter should always come back the next day.
    intervalDays = Math.min(intervalDays, 1);
    if (g === 1) intervalDays = 10 / (24 * 60);
  } else {
    difficulty = nextDifficulty(priorDifficulty || initialDifficulty(g), g);
    if (g === 1) {
      stability = forgetStability(difficulty, priorStability, recall);
      stability = Math.max(0.1, stability);
      intervalDays = 10 / (24 * 60); // 10 minutes
    } else {
      stability = recallStability(difficulty, priorStability, recall, g);
      // 7R: recent performance weights the gain, but never overrides memory.
      stability *= context.stabilityMultiplier ?? 1;
      // A fast, confident "easy" on a recently seen word gets a small bonus.
      if (g === 4 && elapsedDays < 3) stability *= 1.06;
      stability = clamp(stability, 0.1, 3650);
      intervalDays = nextInterval(stability, context.desiredRetention ?? 0.9);
      intervalDays = clamp(intervalDays, 1, 180);
    }
  }

  const due = new Date(now.getTime() + intervalDays * DAY);
  return {
    stability: Number(stability.toFixed(4)),
    difficulty: Number(difficulty.toFixed(4)),
    reps: reps + 1,
    lapses: (Number(word.lapses) || 0) + (g === 1 ? 1 : 0),
    last_review: now.toISOString(),
    due_at: due.toISOString(),
    intervalDays: Number(intervalDays.toFixed(4)),
    recallBefore: Number(recall.toFixed(4)),
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
      dueAt: next.due_at,
      stability: next.stability,
      difficulty: next.difficulty,
    };
  });
}

/**
 * Recency-weighted performance from recent reviews.
 * Each review gets exp(-age/7) weight, so last week explains most of today.
 */
export function recencyStats(reviews = [], now = new Date()) {
  let total = 0;
  let correct = 0;
  let weightedCorrect = 0;
  let weightedTotal = 0;
  let latencyWeighted = 0;
  let latencyTotal = 0;
  const windowDays = 21;
  for (const r of reviews) {
    const age = (now.getTime() - new Date(r.reviewed_at).getTime()) / DAY;
    if (age < 0 || age > windowDays) continue;
    const weight = Math.exp(-age / 7);
    total += 1;
    correct += r.correct ? 1 : 0;
    weightedTotal += weight;
    weightedCorrect += r.correct ? weight : 0;
    if (r.latency_ms) {
      latencyWeighted += r.latency_ms * weight;
      latencyTotal += weight;
    }
  }
  return {
    reviews: total,
    accuracy: total ? correct / total : null,
    weightedAccuracy: weightedTotal ? weightedCorrect / weightedTotal : null,
    avgLatencyMs: latencyTotal ? Math.round(latencyWeighted / latencyTotal) : null,
    evidence: total,
  };
}

/** 0–100 "freshness" of a word's memory, for progress surfaces. */
export function recencyScore(lastReview, stability, now = new Date()) {
  if (!lastReview) return 0;
  const elapsed = Math.max(0, (now.getTime() - new Date(lastReview).getTime()) / DAY);
  const freshness = Math.exp(-elapsed / 14);
  const strength = clamp((stability || 0) / 21, 0, 1);
  return Math.round(clamp(freshness * (0.65 + 0.35 * strength), 0, 1) * 100);
}

export function wordState(word) {
  const reps = Number(word.reps) || 0;
  const stability = Number(word.stability) || 0;
  if (!reps) return 'new';
  if (stability >= 21 && reps >= 4) return 'mastered';
  if (stability >= 7 && reps >= 3) return 'review';
  return 'learning';
}

export function isDue(word, now = new Date()) {
  return Boolean(word.due_at) && new Date(word.due_at).getTime() <= now.getTime();
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

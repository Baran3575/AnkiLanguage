import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FSRS_WEIGHTS, FSRS_MODEL, initialDifficulty, initialStability,
  retrievability, shortTermRetrievability, stepMemory,
  intervalForRetention, reviewWord, previewRatings, recencyContext,
  recencyStats, recencyScore, wordState, isDue, formatInterval,
} from '../shared/fsrs.js';

const close = (actual, expected, tolerance = 1e-4, label = '') => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label || 'value'}: expected ${expected}, got ${actual}`,
  );
};

const DAY = 86_400_000;
const iso = (offsetDays, base = new Date('2026-10-21T12:00:00.000Z')) =>
  new Date(base.getTime() + offsetDays * DAY).toISOString();

test('FSRS-7 exposes the finished 34-parameter model', () => {
  assert.equal(FSRS_MODEL, 'FSRS-7');
  assert.equal(FSRS_WEIGHTS.length, 34);
  assert.ok(FSRS_WEIGHTS.every(Number.isFinite));
  close(initialStability(1), 0.1104, 1e-12);
  close(initialStability(3), 3.9221, 1e-12);
  close(initialDifficulty(1), 6.1686, 1e-9);
  close(initialDifficulty(3), 3.530723981, 1e-8);
  close(initialDifficulty(4), 0.230000174, 1e-8);
});

test('dual-stability trace matches the independent FSRS-7 reference', () => {
  let state = { stability: 0, stabilityShort: 0, difficulty: 0 };
  const steps = [
    [0, 3],
    [3, 3],
    [10, 2],
    [1, 1],
    [1 / 144, 3],
    [20, 4],
    [30, 3],
  ];
  const expected = [
    [3.922100, 3.137680, 3.530724],
    [9.848705, 163.404335, 3.497717],
    [17.270018, 371.110678, 6.097665],
    [3.370760, 0.658142, 9.445407],
    [4.316220, 7.568399, 9.353253],
    [9.477760, 67.043966, 9.000167],
    [19.739658, 170.403854, 8.912465],
  ];

  steps.forEach(([elapsed, grade], i) => {
    state = stepMemory(state, elapsed, grade);
    close(state.stability, expected[i][0], 0.01, `S step ${i}`);
    close(state.stabilityShort, expected[i][1], 0.1, `S_short step ${i}`);
    close(state.difficulty, expected[i][2], 0.0002, `D step ${i}`);
    assert.ok(state.stability >= 0.001 && state.stability <= 36500);
    assert.ok(state.stabilityShort >= 0.001 && state.stabilityShort <= 36500);
    assert.ok(state.difficulty >= 1 && state.difficulty <= 10);
  });
});

test('forgetting curve is bounded, dual and monotonically decreasing', () => {
  const stability = 12.5;
  const stabilityShort = 4.2;
  const difficulty = 5.5;
  let previous = 1.1;
  for (let t = 0; t <= 120; t += 0.25) {
    const r = retrievability(t, stability, stabilityShort, difficulty);
    assert.ok(r >= 0 && r <= 1.000001, `R at ${t} out of range: ${r}`);
    assert.ok(r <= previous + 1e-9, `R increased at ${t}: ${previous} -> ${r}`);
    previous = r;
  }
  close(retrievability(0, stability, stabilityShort, difficulty), 1, 2e-5);
  assert.ok(shortTermRetrievability(0, stabilityShort) >= 0.999);
});

test('interval inversion hits the requested retention on the monotonic curve', () => {
  const s = 18.4;
  const sShort = 3.8;
  const d = 4.7;
  let previousInterval = Infinity;
  for (const target of [0.8, 0.87, 0.9, 0.94, 0.97]) {
    const interval = intervalForRetention(s, sShort, d, target);
    close(retrievability(interval, s, sShort, d), target, 5e-4, `R target ${target}`);
    assert.ok(interval <= previousInterval, 'higher retention must schedule sooner');
    previousInterval = interval;
  }
  assert.ok(intervalForRetention(s, sShort, d, 0.9) > 1);
});

test('first exposure gets a 24-hour consolidation review', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  for (const grade of [2, 3, 4]) {
    const next = reviewWord({ reps: 0 }, grade, now, { desiredRetention: 0.9 });
    assert.equal(next.intervalDays, 1, `grade ${grade}`);
    assert.equal(new Date(next.due_at).getTime(), now.getTime() + DAY);
    assert.equal(next.reps, 1);
    assert.equal(next.lapses, 0);
    close(next.stabilityShort, next.stability * 0.8, 1e-4);
  }
});

test('a lapse returns in ten minutes and increments the lapse count', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const next = reviewWord({
    stability: 8,
    stabilityShort: 6,
    difficulty: 5,
    reps: 4,
    lapses: 1,
    last_review: iso(-7),
  }, 1, now, { desiredRetention: 0.9 });
  assert.equal(next.lapses, 2);
  assert.equal(next.reps, 5);
  close(next.intervalDays, 10 / 1440, 1e-9);
  close(new Date(next.due_at).getTime(), now.getTime() + 10 * 60_000, 1);
  assert.ok(next.stability < 8);
});

test('legacy rows without short-term stability still update safely', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const next = reviewWord({
    stability: 9,
    difficulty: 4,
    reps: 3,
    last_review: iso(-9),
  }, 3, now, { desiredRetention: 0.9 });
  assert.ok(Number.isFinite(next.stability));
  assert.ok(Number.isFinite(next.stabilityShort));
  assert.ok(next.intervalDays >= 1);
  assert.ok(next.recallBefore > 0 && next.recallBefore < 1);
});

test('review previews expose four ordered ratings with valid intervals', () => {
  const preview = previewRatings({
    stability: 5,
    stabilityShort: 2,
    difficulty: 6,
    reps: 2,
    last_review: iso(-4),
  }, { desiredRetention: 0.9 }, new Date('2026-10-21T12:00:00.000Z'));
  assert.equal(preview.length, 4);
  assert.deepEqual(preview.map((p) => p.grade), [1, 2, 3, 4]);
  assert.ok(preview[0].intervalDays < preview[2].intervalDays);
  assert.ok(preview[2].intervalDays < preview[3].intervalDays);
  assert.ok(preview.every((p) => Number.isFinite(p.days) && p.days > 0));
});

test('recency context stays inside its safety rails', () => {
  const cases = [
    {},
    { recentAccuracy: 1, recentReviews: 1000, backlog: 100, capacity: 10, lapseRate: 1 },
    { recentAccuracy: 0, recentReviews: -10, backlog: -20, capacity: 0, lapseRate: 2 },
    { recentAccuracy: Number.NaN, recentReviews: Number.NaN, lapseRate: Number.NaN },
  ];
  for (const input of cases) {
    const context = recencyContext(input);
    assert.ok(context.desiredRetention >= 0.87 && context.desiredRetention <= 0.94);
    assert.ok(context.stabilityMultiplier >= 0.95 && context.stabilityMultiplier <= 1.025);
    assert.ok(context.evidence >= 0 && context.evidence <= 1);
    assert.ok(context.lapseRate >= 0 && context.lapseRate <= 1);
    assert.equal(typeof context.overload, 'boolean');
  }
  assert.ok(recencyContext({ recentAccuracy: 0.98, backlog: 0 }).stabilityMultiplier
    > recencyContext({ recentAccuracy: 0.55, backlog: 0 }).stabilityMultiplier);
});

test('recency stats weight fresh reviews above stale ones', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const reviews = [
    { correct: false, grade: 1, reviewed_at: iso(-1, now) },
    { correct: true, grade: 3, reviewed_at: iso(-14, now) },
    { correct: true, grade: 3, reviewed_at: iso(-30, now) },
  ];
  const stats = recencyStats(reviews, now);
  assert.equal(stats.reviews, 2);
  assert.equal(stats.accuracy, 0.5);
  assert.ok(stats.weightedAccuracy < stats.accuracy, 'fresh failure must pull weighted accuracy down');
  assert.ok(stats.lapseRate > 0.5);
  assert.equal(stats.lastReviewAt, iso(-1, now));
});

test('memory labels and freshness stay bounded', () => {
  assert.equal(wordState({ reps: 0 }), 'new');
  assert.equal(wordState({ reps: 1, stability: 2 }), 'learning');
  assert.equal(wordState({ reps: 5, stability: 30 }), 'mastered');
  for (const days of [0, 1, 7, 30, 365]) {
    const score = recencyScore(iso(-days), 20);
    assert.ok(score >= 0 && score <= 100);
  }
  assert.equal(formatInterval(10 / 1440), '10 dk');
  assert.equal(formatInterval(1), '1 gün');
});

test('due checks accept ISO timestamps and ignore missing dates', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  assert.equal(isDue({ due_at: iso(-1, now) }, now), true);
  assert.equal(isDue({ due_at: iso(1, now) }, now), false);
  assert.equal(isDue({}, now), false);
});

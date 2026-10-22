/**
 * Deterministic 3-week demo history. Powers the "Demo ile keşfet" account and
 * the offline mobile build's first-run content. Everything is synthetic and
 * labeled as such in the UI.
 */
import { ALL_LESSONS, UNITS, VOCAB_BY_ID } from './content.js';
import { reviewWord, wordState, recencyStats, recencyContext } from './fsrs.js';
import { mulberry32 } from './exercises.js';

const DAY = 86_400_000;
const rng = mulberry32(3575);

function rand() {
  return rng();
}

function pickGrade(lesson = false) {
  const r = rand();
  if (lesson) {
    if (r < 0.08) return 1;
    if (r < 0.24) return 2;
    if (r < 0.86) return 3;
    return 4;
  }
  if (r < 0.12) return 1;
  if (r < 0.28) return 2;
  if (r < 0.82) return 3;
  return 4;
}

function latencyFor(type) {
  const base = type === 'listen' ? 3200 : type === 'type' || type === 'build' ? 6800 : 4200;
  return Math.round(base + rand() * 4200);
}

function exerciseTypeFor(vocab, checkpoint = false) {
  const types = ['choice', 'listen', 'type', 'article', 'build', 'cloze'];
  if (vocab.gender && rand() < 0.32) return 'article';
  if (rand() < 0.18) return 'listen';
  if (rand() < 0.25) return 'type';
  if (rand() < 0.2) return 'build';
  return checkpoint ? 'checkpoint' : types[Math.floor(rand() * types.length)];
}

function atHour(base, hour, minute = 0) {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function buildDemoState(now = new Date()) {
  const todayStart = atHour(now, 12);
  const days = [];
  for (let offset = -20; offset <= 0; offset += 1) {
    days.push(new Date(todayStart.getTime() + offset * DAY));
  }

  const completed = [
    ['u1l1', -20], ['u1l2', -19], ['u1-checkpoint', -18],
    ['u1l3', -17], ['u2l1', -16], ['u2l2', -14],
    ['u2-checkpoint', -13], ['u2l3', -12],
    ['u3l1', -11], ['u3l2', -9], ['u3-checkpoint', -8],
    ['u3l3', -7], ['u4l1', -6], ['u4l2', -5],
  ];
  const lessonDays = new Map(completed.map(([id, offset]) => [id, offset]));
  const reviewDays = new Set([-18, -15, -13, -10, -8, -4, -3, -2, -1, 0]);

  const words = new Map();
  const reviews = [];
  const progress = [];
  const daily = new Map();
  const activeUntil = new Date(now);
  let reviewId = 1;

  const getDay = (day) => {
    if (!daily.has(day)) {
      daily.set(day, {
        user_id: 'demo', day, minutes: 0, xp: 0, reviews: 0, correct: 0,
        new_words: 0, learning_words: 0, review_words: 0, mastered_words: 0, accuracy: 0,
      });
    }
    return daily.get(day);
  };

  function applyReview(vocabId, grade, at, { lessonId = null, exerciseType = null, force = false } = {}) {
    const vocab = VOCAB_BY_ID[vocabId];
    if (!vocab) return null;
    let word = words.get(vocabId);
    const isNew = !word;
    if (!word) {
      word = {
        vocab_id: vocabId, state: 'new', stability: 0, difficulty: 0, reps: 0, lapses: 0,
        exposures: 0, correct_count: 0, wrong_count: 0, first_seen: at.toISOString(),
        last_review: null, due_at: null, last_grade: null,
      };
    }
    const recent = recencyStats(reviews.slice(-80), at);
    const context = recencyContext({
      recentAccuracy: recent.weightedAccuracy ?? 0.84,
      recentReviews: recent.reviews,
      backlog: [...words.values()].filter((w) => w.due_at && new Date(w.due_at) <= at).length,
      capacity: 24,
      lapseRate: recent.lapseRate ?? 0,
    });
    const next = reviewWord(word, grade, at, context);
    const correct = grade > 1;
    const updated = {
      ...word,
      ...next,
      vocab_id: vocabId,
      state: wordState({ ...word, ...next }),
      exposures: (word.exposures || 0) + 1,
      correct_count: (word.correct_count || 0) + (correct ? 1 : 0),
      wrong_count: (word.wrong_count || 0) + (correct ? 0 : 1),
      first_seen: word.first_seen || at.toISOString(),
    };
    words.set(vocabId, updated);
    const type = exerciseType || exerciseTypeFor(vocab, lessonId?.includes('checkpoint'));
    const latency = latencyFor(type);
    reviews.push({
      id: reviewId++,
      user_id: 'demo',
      vocab_id: vocabId,
      lesson_id: lessonId,
      exercise_type: type,
      grade,
      correct: correct ? 1 : 0,
      latency_ms: latency,
      stability_before: word.stability,
      stability_short_before: word.stabilityShort ?? word.stability_short ?? 0,
      stability_after: next.stability,
      stability_short_after: next.stabilityShort,
      difficulty_after: next.difficulty,
      predicted_recall: next.recallBefore,
      interval_days: next.intervalDays,
      reviewed_at: at.toISOString(),
    });
    const day = getDay(at.toISOString().slice(0, 10));
    day.reviews += 1;
    day.correct += correct ? 1 : 0;
    day.xp += 2 + (correct ? 1 : 0);
    return { word: updated, correct, type };
  }

  function runLesson(lessonId, offset) {
    const lesson = ALL_LESSONS[lessonId];
    if (!lesson) return;
    const day = days.find((d) => Math.round((d - todayStart) / DAY) === offset) || todayStart;
    const at = atHour(day, lesson.isCheckpoint ? 17 : 9, lesson.isCheckpoint ? 30 : 0);
    const vocabIds = lesson.vocab || [];
    let correct = 0;
    for (const vocabId of vocabIds) {
      const grade = pickGrade(!lesson.isCheckpoint);
      const res = applyReview(vocabId, grade, new Date(at.getTime() + Math.random() * 0), {
        lessonId: lesson.id,
        exerciseType: lesson.isCheckpoint ? 'checkpoint' : null,
      });
      if (res?.correct) correct += 1;
    }
    const dayRow = getDay(at.toISOString().slice(0, 10));
    dayRow.minutes += lesson.minutes || 7;
    dayRow.xp += lesson.isCheckpoint ? 40 : 24;
    progress.push({
      user_id: 'demo',
      lesson_id: lessonId,
      completed: 1,
      best_score: lesson.isCheckpoint ? 0.9 : 0.84 + rand() * 0.14,
      attempts: 1,
      last_at: at.toISOString(),
      completed_at: at.toISOString(),
    });
  }

  function runReviewSession(offset, { limit = 12, includeEarly = true } = {}) {
    const day = days.find((d) => Math.round((d - todayStart) / DAY) === offset) || todayStart;
    const at = atHour(day, offset === 0 ? 8 : 19, offset === 0 ? 15 : 30);
    const due = [...words.values()]
      .filter((w) => w.due_at && new Date(w.due_at) <= at)
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
    let queue = due.slice(0, limit);
    if (includeEarly && queue.length < 4) {
      const early = [...words.values()]
        .filter((w) => w.reps > 0 && !queue.some((q) => q.vocab_id === w.vocab_id))
        .sort((a, b) => (a.stability || 0) - (b.stability || 0))
        .slice(0, 4 - queue.length);
      queue = [...queue, ...early];
    }
    if (!queue.length) return;
    for (const word of queue) {
      applyReview(word.vocab_id, pickGrade(false), new Date(at.getTime() + Math.random() * 60_000), {
        exerciseType: rand() < 0.2 ? 'flashcard' : undefined,
      });
    }
    const dayRow = getDay(at.toISOString().slice(0, 10));
    dayRow.minutes += 2 + queue.length * 0.35;
    dayRow.xp += 4;
  }

  // Run the timeline day by day so snapshots are historically truthful.
  for (const day of days) {
    const offset = Math.round((day - todayStart) / DAY);
    const lessons = completed.filter(([, o]) => o === offset);
    for (const [id] of lessons) runLesson(id, offset);
    if (reviewDays.has(offset) && !lessons.length) {
      runReviewSession(offset, { limit: offset === 0 ? 8 : 12, includeEarly: true });
    } else if (reviewDays.has(offset) && lessons.length) {
      // checkpoints and teaching blocks can share a day with a short review
      runReviewSession(offset, { limit: 6, includeEarly: true });
    }

    const snapshotAt = atHour(day, 21, 0);
    if (snapshotAt > activeUntil && offset !== 0) snapshotAt.setTime(day.getTime() + 12 * 3_600_000);
    const counts = { learning: 0, review: 0, mastered: 0 };
    for (const word of words.values()) {
      const state = wordState(word);
      word.state = state;
      if (state !== 'new') counts[state] += 1;
    }
    const row = getDay(day.toISOString().slice(0, 10));
    row.learning_words = counts.learning;
    row.review_words = counts.review;
    row.mastered_words = counts.mastered;
    row.new_words = 224 - words.size;
    row.accuracy = row.reviews ? row.correct / row.reviews : 0;
    row.minutes = Math.round(row.minutes * 10) / 10;
  }

  for (const word of words.values()) {
    word.state = wordState(word);
  }

  // Leave a realistic review backlog for today. The simulation clears most due
  // words each evening; a real learner would still have a morning queue.
  const backlogCandidates = [...words.values()]
    .filter((w) => w.reps > 0 && w.state !== 'new')
    .sort((a, b) => (b.stability || 0) - (a.stability || 0))
    .slice(0, 16);
  backlogCandidates.forEach((word, index) => {
    word.due_at = new Date(now.getTime() - (1 + index * 1.4) * 3_600_000).toISOString();
  });

  const dailyStats = [...daily.values()].sort((a, b) => a.day.localeCompare(b.day));
  const xp = dailyStats.reduce((sum, row) => sum + row.xp, 0);

  // Current streak: consecutive active days ending today.
  const activeDays = new Set(dailyStats.filter((d) => d.minutes > 0 || d.reviews > 0).map((d) => d.day));
  let streak = 0;
  let cursor = new Date(now);
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY);
  }
  let bestStreak = 0;
  let run = 0;
  let prev = null;
  for (const day of [...activeDays].sort()) {
    run = prev && new Date(`${day}T12:00:00`) - new Date(`${prev}T12:00:00`) === DAY ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = day;
  }

  const user = {
    id: 'demo',
    name: 'Elif',
    goal_minutes: 15,
    motivation: 'seyahat',
    level: 'A1.1',
    xp,
    streak,
    best_streak: Math.max(bestStreak, streak),
    created_at: new Date(now.getTime() - 24 * DAY).toISOString(),
    last_active: now.toISOString(),
    profile: {
      demo: true,
      calibration: {
        memory: 0.84,
        speedMs: 3900,
        modality: 'visual',
        confidence: 0.88,
        source: 'calibration',
        goal: 'seyahat',
        completedAt: new Date(now.getTime() - 20 * DAY).toISOString(),
      },
    },
    settings: { sound: true, tts: true, reducedMotion: false },
  };

  return {
    user,
    words: [...words.values()],
    reviews,
    progress,
    dailyStats,
  };
}

export function demoPathInfo() {
  return {
    completed: [
      'u1l1', 'u1l2', 'u1l3', 'u1-checkpoint',
      'u2l1', 'u2l2', 'u2l3', 'u2-checkpoint',
      'u3l1', 'u3l2', 'u3l3', 'u3-checkpoint',
      'u4l1', 'u4l2',
    ],
    current: 'u4l3',
    units: UNITS.length,
  };
}

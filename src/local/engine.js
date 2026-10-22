/**
 * Offline engine for the Capacitor Android build.
 *
 * It mirrors the REST surface in `server/index.js` and reuses the exact same
 * content, exercise generator, brain model and FSRS-7 scheduler. State lives
 * in localStorage so the app works with no network and no hosted API.
 */
import {
  ALL_LESSONS, LEVELS, UNITS, VOCAB_BY_ID, VOCAB_LIST, UNIT_COLORS,
} from '../../shared/content.js';
import {
  reviewWord, previewRatings, recencyStats, recencyContext, wordState, isDue,
  gradeFromAnswers, formatInterval,
} from '../../shared/fsrs.js';
import { publicLesson, unitForLesson } from '../../shared/exercises.js';
import { computeBrain, TYPE_LABELS } from '../../shared/brain.js';

const STORE_KEY = 'wort.local.v1';
const DAY = 86_400_000;

// The compact vocab table in shared/content.js does not repeat level/unit
// metadata. Derive it once from the unit graph so offline progress and review
// cards can show the same level labels as the API.
const VOCAB_META = Object.fromEntries(
  UNITS.flatMap((unit) => (unit.vocabIds || []).map((id) => [id, { level: unit.level, unitId: unit.id }]))
);

let memoryState = null;

function blankState() {
  return {
    version: 1,
    users: {},
    words: {},
    reviews: {},
    progress: {},
    daily: {},
    events: [],
  };
}

function normalize(state) {
  const base = blankState();
  const s = state && typeof state === 'object' ? state : base;
  return {
    ...base,
    ...s,
    users: s.users || {},
    words: s.words || {},
    reviews: s.reviews || {},
    progress: s.progress || {},
    daily: s.daily || {},
    events: s.events || [],
  };
}

function load() {
  if (memoryState) return memoryState;
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    memoryState = raw ? normalize(JSON.parse(raw)) : blankState();
  } catch {
    memoryState = blankState();
  }
  return memoryState;
}

function save(state) {
  memoryState = state;
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private webviews. The in-memory session
    // still works; persistence simply degrades.
  }
}

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return dayKey();
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    goalMinutes: user.goal_minutes,
    motivation: user.motivation,
    level: user.level,
    xp: user.xp,
    streak: user.streak,
    bestStreak: user.best_streak,
    createdAt: user.created_at,
    lastActive: user.last_active,
    profile: user.profile,
    settings: user.settings,
  };
}

function wordsMap(s, userId) {
  return s.words[userId] || {};
}

function joinedWords(s, userId) {
  const map = wordsMap(s, userId);
  return Object.values(map)
    .map((w) => {
      const vocab = VOCAB_BY_ID[w.vocab_id];
      if (!vocab) return null;
      return {
        ...w,
        de: vocab.de,
        tr: vocab.tr,
        pos: vocab.pos,
        gender: vocab.gender,
        plural: vocab.plural,
        example: vocab.example,
        exampleTr: vocab.example_tr,
        note: vocab.note,
        level: vocab.level || VOCAB_META[vocab.id]?.level,
        unitId: vocab.unitId || vocab.unit_id || VOCAB_META[vocab.id]?.unitId,
        state: wordState(w),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.first_seen || '').localeCompare(String(b.first_seen || '')));
}

function reviewsFor(s, userId) {
  return (s.reviews[userId] || []).slice().sort((a, b) => String(a.reviewed_at).localeCompare(String(b.reviewed_at)));
}

function dailyFor(s, userId, days = 120) {
  const since = dayKey(new Date(Date.now() - days * DAY));
  return Object.values(s.daily[userId] || {})
    .filter((row) => row.day >= since)
    .sort((a, b) => a.day.localeCompare(b.day));
}

function progressFor(s, userId) {
  return Object.values(s.progress[userId] || {});
}

function countsFor(s, userId) {
  const words = Object.values(wordsMap(s, userId));
  return {
    seen: words.length,
    learning: words.filter((w) => w.state === 'learning').length,
    review: words.filter((w) => w.state === 'review').length,
    mastered: words.filter((w) => w.state === 'mastered').length,
  };
}

function brainFor(s, userId, words, reviews, dailyStats, progress) {
  const user = s.users[userId];
  return computeBrain({ user, words, reviews, dailyStats, progress });
}

function brainContext(brain) {
  return {
    desiredRetention: brain?.personalization?.desiredRetention ?? 0.9,
    stabilityMultiplier: brain?.personalization?.stabilityMultiplier ?? 1,
  };
}

function buildPath(s, userId) {
  const progressRows = progressFor(s, userId);
  const completed = new Map(progressRows.map((p) => [p.lesson_id, p]));
  const currentLessonId = (() => {
    for (const unit of UNITS) {
      for (const lesson of unit.path) {
        if (!completed.get(lesson.id)?.completed) return lesson.id;
      }
    }
    return null;
  })();

  const units = UNITS.map((unit, index) => {
    const previous = UNITS[index - 1];
    const previousDone = !previous || previous.path.every((l) => completed.get(l.id)?.completed);
    const unitLessons = unit.path.map((lesson) => {
      const row = completed.get(lesson.id);
      const isDone = Boolean(row?.completed);
      const status = isDone ? 'completed' : lesson.id === currentLessonId ? 'current' : 'locked';
      return {
        id: lesson.id,
        title: lesson.title,
        subtitle: lesson.subtitle,
        type: lesson.type,
        isCheckpoint: Boolean(lesson.isCheckpoint),
        minutes: lesson.minutes,
        vocabCount: lesson.vocab.length,
        grammarTitle: lesson.grammar?.title,
        status,
        score: row?.best_score ?? null,
        completedAt: row?.completed_at ?? null,
        xp: lesson.isCheckpoint ? 45 : 24,
      };
    });
    const done = unitLessons.filter((l) => l.status === 'completed').length;
    const hasCurrent = unitLessons.some((l) => l.status === 'current');
    const status = done === unitLessons.length ? 'completed' : hasCurrent ? 'current' : previousDone ? 'available' : 'locked';
    return {
      id: unit.id,
      number: unit.number,
      level: unit.level,
      title: unit.title,
      subtitle: unit.subtitle,
      canDo: unit.canDo,
      color: unit.color,
      colorMain: UNIT_COLORS[unit.color]?.main,
      colorSoft: UNIT_COLORS[unit.color]?.soft,
      code: unit.code,
      status,
      completedCount: done,
      totalCount: unitLessons.length,
      progress: unitLessons.length ? done / unitLessons.length : 0,
      lessons: unitLessons,
    };
  });

  const currentUnit = units.find((u) => u.lessons.some((l) => l.status === 'current')) || null;
  const current = currentLessonId ? ALL_LESSONS[currentLessonId] : null;
  const totalDone = units.reduce((sum, u) => sum + u.completedCount, 0);
  const totalNodes = units.reduce((sum, u) => sum + u.totalCount, 0);

  return {
    units,
    currentLessonId,
    currentUnit: currentUnit ? {
      id: currentUnit.id, number: currentUnit.number, title: currentUnit.title,
      subtitle: currentUnit.subtitle, color: currentUnit.color, level: currentUnit.level,
    } : null,
    current: current ? {
      id: current.id, title: current.title, subtitle: current.subtitle,
      level: current.level, unitNumber: current.unitNumber, unitTitle: current.unitTitle,
      minutes: current.minutes, isCheckpoint: Boolean(current.isCheckpoint),
      newWords: current.vocab.filter((id) => !wordsMap(s, userId)[id]).length,
    } : null,
    levels: LEVELS.map((level) => {
      const levelUnits = units.filter((u) => u.level === level.id);
      const got = levelUnits.reduce((sum, u) => sum + u.completedCount, 0);
      const all = levelUnits.reduce((sum, u) => sum + u.totalCount, 0);
      return {
        id: level.id, title: level.title, subtitle: level.subtitle,
        progress: all ? got / all : 0, completed: got, total: all,
      };
    }),
    totalDone,
    totalNodes,
    progress: totalNodes ? totalDone / totalNodes : 0,
  };
}

function buildDashboard(s, userId) {
  const user = s.users[userId];
  if (!user) return null;
  const words = joinedWords(s, userId);
  const reviews = reviewsFor(s, userId);
  const dailyStats = dailyFor(s, userId, 120);
  const progress = progressFor(s, userId);
  const brain = brainFor(s, userId, words, reviews, dailyStats, progress);
  const path = buildPath(s, userId);
  const dueWords = words.filter((w) => isDue(w));
  const counts = countsFor(s, userId);
  const todayRow = s.daily[userId]?.[todayKey()];
  const today = todayRow || {
    day: todayKey(), minutes: 0, xp: 0, reviews: 0, correct: 0,
    accuracy: 0, new_words: 0, learning_words: 0, review_words: 0, mastered_words: 0,
  };
  const now = new Date();

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * DAY);
    const key = dayKey(d);
    const row = dailyStats.find((entry) => entry.day === key);
    return {
      day: key,
      label: d.toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'Europe/Istanbul' }),
      minutes: row ? Math.round(row.minutes * 10) / 10 : 0,
      xp: row?.xp || 0,
      reviews: row?.reviews || 0,
      accuracy: row?.accuracy || 0,
    };
  });

  const forecast = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() + i * DAY);
    const key = dayKey(d);
    return {
      day: key,
      label: i === 0 ? 'Bugün' : d.toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'Europe/Istanbul' }),
      count: i === 0
        ? dueWords.length
        : words.filter((w) => w.due_at && dayKey(new Date(w.due_at)) === key).length,
      dateLabel: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }),
    };
  });

  const nextWords = path.current
    ? (ALL_LESSONS[path.current.id]?.vocab || [])
      .filter((id) => !words.some((w) => w.vocab_id === id))
      .slice(0, 5)
      .map((id) => VOCAB_BY_ID[id])
      .filter(Boolean)
    : [];
  const recent = recencyStats(reviews, now);
  const retention = recent.weightedAccuracy != null ? Math.round(recent.weightedAccuracy * 100) : null;
  const goal = user.goal_minutes || 15;
  const planMinutes = Math.max(3, Math.round(dueWords.length * 0.32 + (path.current?.minutes || 0)));
  const weekMinutes = week.reduce((sum, d) => sum + d.minutes, 0);
  const lessonsToday = progress.filter((p) => p.completed_at && p.completed_at.slice(0, 10) === todayKey()).length;

  return {
    user: publicUser(user),
    today: {
      day: today.day,
      minutes: Math.round((today.minutes || 0) * 10) / 10,
      goalMinutes: goal,
      percent: Math.min(100, Math.round(((today.minutes || 0) / goal) * 100)),
      xp: today.xp || 0,
      reviews: today.reviews || 0,
      correct: today.correct || 0,
      accuracy: today.reviews ? Math.round((today.correct / today.reviews) * 100) : null,
      lessons: lessonsToday,
    },
    stats: {
      xp: user.xp || 0,
      streak: user.streak || 0,
      bestStreak: user.best_streak || 0,
      activeDays: dailyStats.filter((d) => d.minutes > 0).length,
      level: path.current?.level || user.level,
      weekMinutes: Math.round(weekMinutes),
      weekGoalDays: week.filter((d) => d.minutes >= goal * 0.6).length,
      retention,
    },
    vocab: {
      total: VOCAB_LIST.length,
      seen: counts.seen,
      new: VOCAB_LIST.length - counts.seen,
      learning: counts.learning,
      review: counts.review,
      mastered: counts.mastered,
      due: dueWords.length,
      masteryPct: counts.seen ? Math.round((counts.mastered / counts.seen) * 100) : 0,
    },
    plan: {
      dueReviews: dueWords.length,
      newWords: path.current
        ? Math.min(brain.personalization.newWordsPerDay, ALL_LESSONS[path.current.id].vocab.filter((id) => !wordsMap(s, userId)[id]).length)
        : 0,
      minutes: planMinutes,
      desiredRetention: brain.personalization.desiredRetention,
      lesson: path.current,
    },
    week,
    forecast,
    nextWords,
    brain,
    path: {
      current: path.current,
      currentUnit: path.currentUnit,
      levels: path.levels,
      totalDone: path.totalDone,
      totalNodes: path.totalNodes,
      progress: path.progress,
    },
    generatedAt: new Date().toISOString(),
  };
}

function buildProgress(s, userId, range = 30) {
  const user = s.users[userId];
  if (!user) return null;
  const words = joinedWords(s, userId);
  const reviews = reviewsFor(s, userId);
  const dailyStats = dailyFor(s, userId, 365);
  const progress = progressFor(s, userId);
  const path = buildPath(s, userId);
  const brain = brainFor(s, userId, words, reviews, dailyStats, progress);
  const now = new Date();
  const days = Math.max(7, Math.min(365, Number(range) || 30));
  const start = new Date(now.getTime() - (days - 1) * DAY);
  const counts = countsFor(s, userId);

  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY);
    const key = dayKey(d);
    const row = dailyStats.find((entry) => entry.day === key);
    return {
      day: key,
      label: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }),
      shortLabel: d.toLocaleDateString('tr-TR', { weekday: 'narrow', timeZone: 'Europe/Istanbul' }),
      minutes: row ? Math.round(row.minutes * 10) / 10 : 0,
      xp: row?.xp || 0,
      reviews: row?.reviews || 0,
      accuracy: row?.accuracy ? Math.round(row.accuracy * 100) : 0,
      learning: row?.learning_words || 0,
      review: row?.review_words || 0,
      mastered: row?.mastered_words || 0,
      seen: (row?.learning_words || 0) + (row?.review_words || 0) + (row?.mastered_words || 0),
      newWords: row?.new_words || VOCAB_LIST.length - counts.seen,
    };
  });

  const byTypeMap = new Map();
  for (const r of reviews) {
    const key = r.exercise_type || 'review';
    if (!byTypeMap.has(key)) byTypeMap.set(key, { type: key, label: TYPE_LABELS[key] || key, total: 0, correct: 0 });
    const row = byTypeMap.get(key);
    row.total += 1;
    row.correct += r.correct ? 1 : 0;
  }
  const byType = [...byTypeMap.values()]
    .map((row) => ({ ...row, accuracy: row.total ? Math.round((row.correct / row.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  const weeks = [];
  for (let w = 7; w >= 0; w -= 1) {
    const end = new Date(now.getTime() - w * 7 * DAY);
    const startWeek = new Date(end.getTime() - 6 * DAY);
    const rows = dailyStats.filter((d) => d.day >= dayKey(startWeek) && d.day <= dayKey(end));
    const reviewRows = reviews.filter((r) => {
      const t = new Date(r.reviewed_at);
      return t >= startWeek && t <= end;
    });
    weeks.push({
      label: end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }),
      minutes: Math.round(rows.reduce((sum, d) => sum + d.minutes, 0)),
      accuracy: reviewRows.length ? Math.round((reviewRows.filter((r) => r.correct).length / reviewRows.length) * 100) : null,
      reviews: reviewRows.length,
    });
  }

  const heatmap = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(now.getTime() - (83 - i) * DAY);
    const key = dayKey(d);
    const row = dailyStats.find((entry) => entry.day === key);
    const minutes = row?.minutes || 0;
    return {
      day: key,
      dateLabel: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }),
      minutes: Math.round(minutes * 10) / 10,
      level: minutes === 0 ? 0 : minutes < 5 ? 1 : minutes < 10 ? 2 : minutes < 20 ? 3 : 4,
    };
  });

  const dueWords = words.filter((w) => isDue(w));
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() + i * DAY);
    const key = dayKey(d);
    return {
      day: key,
      label: i === 0 ? 'Bugün' : d.toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'Europe/Istanbul' }),
      count: i === 0 ? dueWords.length : words.filter((w) => w.due_at && dayKey(new Date(w.due_at)) === key).length,
    };
  });

  const cefr = LEVELS.map((level) => {
    const levelVocab = VOCAB_LIST.filter((v) => VOCAB_META[v.id]?.level === level.id);
    const seen = words.filter((w) => w.level === level.id);
    const mastered = seen.filter((w) => w.state === 'mastered');
    const levelUnits = path.units.filter((u) => u.level === level.id);
    const nodes = levelUnits.reduce((sum, u) => sum + u.totalCount, 0);
    const done = levelUnits.reduce((sum, u) => sum + u.completedCount, 0);
    return {
      id: level.id,
      title: level.title,
      subtitle: level.subtitle,
      vocabTotal: levelVocab.length,
      vocabSeen: seen.length,
      vocabMastered: mastered.length,
      vocabProgress: levelVocab.length ? seen.length / levelVocab.length : 0,
      nodeProgress: nodes ? done / nodes : 0,
      nodesDone: done,
      nodesTotal: nodes,
    };
  });

  const totalMinutes = dailyStats.reduce((sum, d) => sum + d.minutes, 0);
  const totalReviews = reviews.length;
  const totalCorrect = reviews.filter((r) => r.correct).length;
  const activeDays = dailyStats.filter((d) => d.minutes > 0).length;

  return {
    range: days,
    user: publicUser(user),
    vocab: {
      total: VOCAB_LIST.length,
      seen: counts.seen,
      new: VOCAB_LIST.length - counts.seen,
      learning: counts.learning,
      review: counts.review,
      mastered: counts.mastered,
      due: dueWords.length,
      masteryPct: counts.seen ? Math.round((counts.mastered / counts.seen) * 100) : 0,
    },
    series,
    weeks,
    heatmap,
    forecast,
    byType,
    cefr,
    units: path.units,
    brain,
    totals: {
      minutes: Math.round(totalMinutes),
      xp: user.xp || 0,
      reviews: totalReviews,
      accuracy: totalReviews ? Math.round((totalCorrect / totalReviews) * 100) : 0,
      activeDays,
      bestStreak: user.best_streak || 0,
      streak: user.streak || 0,
      wordsPerActiveDay: activeDays ? Math.round((counts.seen / activeDays) * 10) / 10 : 0,
    },
  };
}

function reviewQueueData(s, userId) {
  const user = s.users[userId];
  if (!user) return null;
  const words = joinedWords(s, userId);
  const reviews = reviewsFor(s, userId);
  const dailyStats = dailyFor(s, userId, 120);
  const progress = progressFor(s, userId);
  const brain = brainFor(s, userId, words, reviews, dailyStats, progress);
  const context = brainContext(brain);
  const now = new Date();
  const due = words
    .filter((w) => isDue(w, now))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 30);
  const queue = due.map((w) => ({
    vocabId: w.vocab_id,
    de: w.de,
    tr: w.tr,
    pos: w.pos,
    gender: w.gender,
    plural: w.plural,
    example: w.example,
    exampleTr: w.exampleTr,
    note: w.note,
    level: w.level,
    unitId: w.unitId,
    state: w.state,
    stability: Number((w.stability || 0).toFixed(2)),
    difficulty: Number((w.difficulty || 0).toFixed(2)),
    reps: w.reps,
    dueAt: w.due_at,
    overdueHours: Math.max(0, Math.round((now - new Date(w.due_at)) / 3_600_000)),
    preview: previewRatings(w, context, now).map((p) => ({ ...p, label: formatInterval(p.days) })),
    accepted: null,
  }));
  const upcoming = words
    .filter((w) => w.due_at && new Date(w.due_at) > now)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 5)
    .map((w) => ({
      vocabId: w.vocab_id,
      de: w.de,
      tr: w.tr,
      dueAt: w.due_at,
      dueLabel: new Date(w.due_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }),
    }));
  return {
    queue,
    dueCount: words.filter((w) => isDue(w, now)).length,
    totalSeen: words.length,
    upcoming,
    brain,
    desiredRetention: brain.personalization.desiredRetention,
  };
}

function ensureUser(s, userId) {
  const user = s.users[userId];
  if (!user) fail('Kullanıcı bulunamadı.', 404);
  return user;
}

function upsertWord(s, userId, vocabId, values) {
  if (!s.words[userId]) s.words[userId] = {};
  const existing = s.words[userId][vocabId] || null;
  const payload = {
    ...existing,
    ...values,
    user_id: userId,
    vocab_id: vocabId,
    state: values.state ?? existing?.state ?? 'new',
    stability: values.stability ?? existing?.stability ?? 0,
    difficulty: values.difficulty ?? existing?.difficulty ?? 0,
    reps: values.reps ?? existing?.reps ?? 0,
    lapses: values.lapses ?? existing?.lapses ?? 0,
    exposures: values.exposures ?? existing?.exposures ?? 0,
    correct_count: values.correct_count ?? existing?.correct_count ?? 0,
    wrong_count: values.wrong_count ?? existing?.wrong_count ?? 0,
    first_seen: values.first_seen ?? existing?.first_seen ?? new Date().toISOString(),
    last_review: values.last_review ?? existing?.last_review ?? null,
    due_at: values.due_at ?? existing?.due_at ?? null,
    last_grade: values.last_grade ?? existing?.last_grade ?? null,
  };
  s.words[userId][vocabId] = payload;
  return payload;
}

function insertReview(s, userId, {
  vocabId, lessonId = null, exerciseType = 'flashcard', grade, correct,
  latencyMs, stabilityBefore, stabilityShortBefore, stabilityAfter,
  stabilityShortAfter, difficultyAfter, predictedRecall, intervalDays,
  reviewedAt = new Date().toISOString(),
}) {
  if (!s.reviews[userId]) s.reviews[userId] = [];
  const list = s.reviews[userId];
  const id = list.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
  list.push({
    id,
    user_id: userId,
    vocab_id: vocabId,
    lesson_id: lessonId,
    exercise_type: exerciseType,
    grade,
    correct: correct ? 1 : 0,
    latency_ms: latencyMs ?? null,
    stability_before: stabilityBefore ?? null,
    stability_short_before: stabilityShortBefore ?? null,
    stability_after: stabilityAfter ?? null,
    stability_short_after: stabilityShortAfter ?? null,
    difficulty_after: difficultyAfter ?? null,
    predicted_recall: predictedRecall ?? null,
    interval_days: intervalDays ?? null,
    reviewed_at: reviewedAt,
  });
}

function markLesson(s, userId, lessonId, { completed = true, score = 0, at = new Date().toISOString() } = {}) {
  if (!s.progress[userId]) s.progress[userId] = {};
  const existing = s.progress[userId][lessonId];
  if (existing) {
    existing.completed = completed ? 1 : 0;
    existing.best_score = Math.max(existing.best_score || 0, score);
    existing.attempts = (existing.attempts || 0) + 1;
    existing.last_at = at;
    existing.completed_at = existing.completed_at || (completed ? at : null);
  } else {
    s.progress[userId][lessonId] = {
      user_id: userId,
      lesson_id: lessonId,
      completed: completed ? 1 : 0,
      best_score: score,
      attempts: 1,
      last_at: at,
      completed_at: completed ? at : null,
    };
  }
}

function syncWordCounts(s, userId, day = todayKey()) {
  if (!s.daily[userId]) s.daily[userId] = {};
  if (!s.daily[userId][day]) {
    s.daily[userId][day] = {
      user_id: userId, day, minutes: 0, xp: 0, reviews: 0, correct: 0,
      new_words: 0, learning_words: 0, review_words: 0, mastered_words: 0, accuracy: 0,
    };
  }
  const row = s.daily[userId][day];
  const c = countsFor(s, userId);
  row.new_words = Math.max(0, VOCAB_LIST.length - c.seen);
  row.learning_words = c.learning;
  row.review_words = c.review;
  row.mastered_words = c.mastered;
}

function recomputeStreak(s, userId) {
  const rows = Object.values(s.daily[userId] || {})
    .filter((row) => row.minutes > 0 || row.reviews > 0 || row.xp > 0)
    .map((row) => row.day)
    .sort()
    .reverse();
  const user = s.users[userId];
  if (!rows.length) {
    user.streak = 0;
    return { current: 0, best: user.best_streak || 0, activeDays: 0 };
  }
  const set = new Set(rows);
  const today = todayKey();
  const yesterday = dayKey(new Date(Date.now() - DAY));
  let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor && set.has(cursor)) {
    current += 1;
    cursor = dayKey(new Date(new Date(`${cursor}T12:00:00`).getTime() - DAY));
  }
  const sorted = [...rows].sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const day of sorted) {
    if (previous && (new Date(`${day}T12:00:00`) - new Date(`${previous}T12:00:00`)) === DAY) run += 1;
    else run = 1;
    best = Math.max(best, run);
    previous = day;
  }
  user.streak = current;
  user.best_streak = Math.max(best, user.best_streak || 0);
  return { current, best: user.best_streak, activeDays: rows.length };
}

function recordStudy(s, userId, { minutes = 0, xp = 0, reviews = 0, correct = 0, day = todayKey() } = {}) {
  if (!s.daily[userId]) s.daily[userId] = {};
  if (!s.daily[userId][day]) {
    s.daily[userId][day] = {
      user_id: userId, day, minutes: 0, xp: 0, reviews: 0, correct: 0,
      new_words: 0, learning_words: 0, review_words: 0, mastered_words: 0, accuracy: 0,
    };
  }
  const row = s.daily[userId][day];
  row.minutes += minutes;
  row.xp += xp;
  row.reviews += reviews;
  row.correct += correct;
  row.accuracy = row.reviews > 0 ? row.correct / row.reviews : 0;
  syncWordCounts(s, userId, day);
  const user = s.users[userId];
  user.xp = (user.xp || 0) + xp;
  user.last_active = new Date().toISOString();
  recomputeStreak(s, userId);
}

function updateUser(s, userId, patch) {
  const user = s.users[userId];
  if (!user) return null;
  const allowed = ['name', 'goal_minutes', 'motivation', 'level', 'xp', 'streak', 'best_streak', 'last_active', 'profile', 'settings'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) user[key] = patch[key];
  }
  return user;
}

export const localApi = {
  async meta() {
    return {
      name: 'wort.',
      levels: LEVELS.map((l) => ({ id: l.id, title: l.title, subtitle: l.subtitle, description: l.description, units: l.units.length })),
      versions: { scheduler: 'FSRS-7', brain: 'brain-v1', content: 'A1.1-A1.2', storage: 'local' },
      totalVocab: VOCAB_LIST.length,
      totalLessons: Object.keys(ALL_LESSONS).length,
    };
  },

  async createUser(payload = {}) {
    const { name, goalMinutes = 15, motivation = 'alltag', calibration = {} } = payload;
    if (!name || !String(name).trim()) fail('İsim gerekli.');
    const s = load();
    const id = `u_${globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 14) || Date.now().toString(36)}`;
    const now = new Date().toISOString();
    s.users[id] = {
      id,
      name: String(name).trim().slice(0, 40),
      goal_minutes: [5, 10, 15, 20].includes(Number(goalMinutes)) ? Number(goalMinutes) : 15,
      motivation,
      level: 'A1.1',
      xp: 0,
      streak: 0,
      best_streak: 0,
      created_at: now,
      last_active: now,
      profile: {
        calibration: {
          memory: Number(calibration.memory) || 0.76,
          speedMs: Number(calibration.speedMs) || 5400,
          modality: calibration.modality || 'visual',
          confidence: Number(calibration.confidence) || 0.5,
          source: 'calibration',
          goal: motivation,
          completedAt: now,
        },
      },
      settings: { sound: true, tts: true, reducedMotion: false },
    };
    s.words[id] = {};
    s.reviews[id] = [];
    s.progress[id] = {};
    s.daily[id] = {};
    save(s);
    const user = s.users[id];
    return {
      user: publicUser(user),
      bootstrap: {
        user: publicUser(user),
        dashboard: buildDashboard(s, id),
        path: buildPath(s, id),
        brain: brainFor(s, id, [], [], [], []),
      },
    };
  },

  async bootstrap(userId) {
    const s = load();
    const user = ensureUser(s, userId);
    const dashboard = buildDashboard(s, userId);
    return {
      user: publicUser(user),
      dashboard,
      path: buildPath(s, userId),
      brain: dashboard.brain,
      meta: { scheduler: 'FSRS-7', totalVocab: VOCAB_LIST.length, totalLessons: Object.keys(ALL_LESSONS).length, storage: 'local' },
    };
  },

  async dashboard(userId) {
    const s = load();
    return buildDashboard(s, userId) || fail('Kullanıcı bulunamadı.', 404);
  },

  async path(userId) {
    const s = load();
    const user = ensureUser(s, userId);
    return { ...buildPath(s, userId), user: publicUser(user) };
  },

  async lesson(userId, lessonId) {
    const s = load();
    const user = ensureUser(s, userId);
    const lesson = ALL_LESSONS[lessonId];
    if (!lesson) fail('Ders bulunamadı.', 404);
    const unit = unitForLesson(lesson.id);
    const words = joinedWords(s, userId);
    const reviews = reviewsFor(s, userId);
    const dailyStats = dailyFor(s, userId, 120);
    const progress = progressFor(s, userId);
    const brain = brainFor(s, userId, words, reviews, dailyStats, progress);
    const data = publicLesson(lesson, unit, {
      seed: `${userId}:${todayKey()}:${Math.floor(Date.now() / 60_000)}`,
      mode: lesson.isCheckpoint ? 'checkpoint' : 'lesson',
      mix: brain.personalization.exerciseMix,
    });
    return {
      ...data,
      brain: { profileLabel: brain.profileLabel, confidence: brain.confidence },
      progress: progress.find((p) => p.lesson_id === lesson.id) || null,
    };
  },

  async completeLesson(userId, lessonId, payload = {}) {
    const s = load();
    const user = ensureUser(s, userId);
    const lesson = ALL_LESSONS[lessonId];
    if (!lesson) fail('Ders bulunamadı.', 404);
    const { answers = [], durationSec = 0 } = payload;
    if (!Array.isArray(answers) || !answers.length) fail('Cevaplar eksik.');

    const validVocab = new Set(lesson.vocab);
    const cleanAnswers = answers.filter((a) => a && (a.vocabId == null || validVocab.has(a.vocabId)));
    const correctTotal = cleanAnswers.filter((a) => a.correct).length;
    const total = cleanAnswers.length;
    const score = total ? correctTotal / total : 0;
    const passed = !lesson.isCheckpoint || score >= 0.8;
    const priorProgress = progressFor(s, userId).find((p) => p.lesson_id === lesson.id);
    const firstTime = !priorProgress?.completed;
    const words = joinedWords(s, userId);
    const reviews = reviewsFor(s, userId);
    const dailyStats = dailyFor(s, userId, 120);
    const progress = progressFor(s, userId);
    const brain = brainFor(s, userId, words, reviews, dailyStats, progress);
    const context = brainContext(brain);
    const now = new Date();
    let newWordCount = 0;
    let touched = 0;

    for (const vocabId of lesson.vocab) {
      if (!VOCAB_BY_ID[vocabId]) continue;
      const existing = s.words[userId]?.[vocabId] || null;
      if (!existing) newWordCount += 1;
      const related = cleanAnswers.filter((a) => a.vocabId === vocabId);
      const grade = related.length
        ? gradeFromAnswers(related, { isNew: !existing })
        : existing ? 3 : 2;
      const next = reviewWord(existing || { stability: 0, difficulty: 0, reps: 0, lapses: 0, last_review: null }, grade, now, context);
      const correctCount = related.filter((a) => a.correct).length;
      const wrongCount = related.length - correctCount;
      upsertWord(s, userId, vocabId, {
        ...next,
        state: wordState({ ...existing, ...next }),
        exposures: (existing?.exposures || 0) + Math.max(1, related.length),
        correct_count: (existing?.correct_count || 0) + correctCount,
        wrong_count: (existing?.wrong_count || 0) + wrongCount,
        first_seen: existing?.first_seen || now.toISOString(),
      });
      if (related.length) {
        const latency = Math.round(related.reduce((sum, a) => sum + (a.latencyMs || 0), 0) / related.length);
        insertReview(s, userId, {
          vocabId,
          lessonId: lesson.id,
          exerciseType: lesson.isCheckpoint ? 'checkpoint' : 'lesson',
          grade,
          correct: grade > 1,
          latencyMs: latency,
          stabilityBefore: existing?.stability || 0,
          stabilityShortBefore: existing?.stabilityShort ?? existing?.stability_short ?? 0,
          stabilityAfter: next.stability,
          stabilityShortAfter: next.stabilityShort,
          difficultyAfter: next.difficulty,
          predictedRecall: next.recallBefore,
          intervalDays: next.intervalDays,
          reviewedAt: now.toISOString(),
        });
      }
      touched += 1;
    }

    markLesson(s, userId, lesson.id, { completed: passed, score, at: now.toISOString() });
    const xp = (firstTime ? (lesson.isCheckpoint ? 45 : 24) : 8) + correctTotal * 2;
    const minutes = Math.min(30, Math.max(2, Math.round(((Number(durationSec) || 0) / 60) * 10) / 10));
    recordStudy(s, userId, { minutes, xp, reviews: total, correct: correctTotal, day: todayKey(now) });
    s.events.push({ id: s.events.length + 1, user_id: userId, type: 'lesson_completed', payload: { lessonId: lesson.id, score, xp, newWords: newWordCount }, created_at: now.toISOString() });
    save(s);

    const nextPath = buildPath(s, userId);
    const freshUser = s.users[userId];
    return {
      ok: true,
      passed,
      score: Math.round(score * 100),
      correct: correctTotal,
      total,
      xp,
      newWords: newWordCount,
      touched,
      streak: freshUser.streak,
      nextLesson: nextPath.current,
      path: nextPath,
      message: !passed
        ? 'Checkpoint %80 gerektiriyor. Blokları tekrar edip yeniden dene.'
        : newWordCount > 0
          ? `${newWordCount} yeni kelime hafızana eklendi. Yarın kısa bir tekrar seni bekliyor.`
          : 'Tekrar tamam. FSRS-7 bir sonraki buluşmayı planladı.',
    };
  },

  async reviewQueue(userId) {
    const s = load();
    return reviewQueueData(s, userId) || fail('Kullanıcı bulunamadı.', 404);
  },

  async submitReview(userId, payload = {}) {
    const s = load();
    ensureUser(s, userId);
    const { vocabId, grade, latencyMs = 0, exerciseType = 'flashcard' } = payload;
    const g = Number(grade);
    if (!vocabId || !(g >= 1 && g <= 4)) fail('Geçersiz tekrar.');
    if (!VOCAB_BY_ID[vocabId]) fail('Kelime bulunamadı.', 404);
    const existing = s.words[userId]?.[vocabId];
    if (!existing) fail('Bu kelime henüz öğrenilmedi.');

    const words = joinedWords(s, userId);
    const reviews = reviewsFor(s, userId);
    const dailyStats = dailyFor(s, userId, 120);
    const progress = progressFor(s, userId);
    const brain = brainFor(s, userId, words, reviews, dailyStats, progress);
    const next = reviewWord(existing, g, new Date(), brainContext(brain));
    upsertWord(s, userId, vocabId, {
      ...next,
      state: wordState({ ...existing, ...next }),
      exposures: (existing.exposures || 0) + 1,
      correct_count: (existing.correct_count || 0) + (g > 1 ? 1 : 0),
      wrong_count: (existing.wrong_count || 0) + (g === 1 ? 1 : 0),
    });
    insertReview(s, userId, {
      vocabId,
      exerciseType,
      grade: g,
      correct: g > 1,
      latencyMs,
      stabilityBefore: existing.stability,
      stabilityShortBefore: existing.stabilityShort ?? existing.stability_short ?? 0,
      stabilityAfter: next.stability,
      stabilityShortAfter: next.stabilityShort,
      difficultyAfter: next.difficulty,
      predictedRecall: next.recallBefore,
      intervalDays: next.intervalDays,
    });
    recordStudy(s, userId, { minutes: 0.25, xp: 3, reviews: 1, correct: g > 1 ? 1 : 0 });
    s.events.push({ id: s.events.length + 1, user_id: userId, type: 'review_completed', payload: { vocabId, grade: g, latencyMs }, created_at: new Date().toISOString() });
    save(s);
    const fresh = s.users[userId];
    return {
      ok: true,
      nextDue: next.due_at,
      intervalDays: next.intervalDays,
      intervalLabel: formatInterval(next.intervalDays),
      stability: next.stability,
      difficulty: next.difficulty,
      streak: fresh.streak,
      xp: fresh.xp,
    };
  },

  async progress(userId, range = 30) {
    const s = load();
    return buildProgress(s, userId, range) || fail('Kullanıcı bulunamadı.', 404);
  },

  async brain(userId) {
    const s = load();
    const user = ensureUser(s, userId);
    const words = joinedWords(s, userId);
    const reviews = reviewsFor(s, userId);
    const dailyStats = dailyFor(s, userId, 120);
    const progress = progressFor(s, userId);
    return brainFor(s, userId, words, reviews, dailyStats, progress);
  },

  async updateSettings(userId, payload = {}) {
    const s = load();
    const user = ensureUser(s, userId);
    const { name, goalMinutes, settings, motivation } = payload;
    const patch = {};
    if (name && String(name).trim()) patch.name = String(name).trim().slice(0, 40);
    if ([5, 10, 15, 20].includes(Number(goalMinutes))) patch.goal_minutes = Number(goalMinutes);
    if (motivation) patch.motivation = String(motivation).slice(0, 30);
    if (settings && typeof settings === 'object') patch.settings = { ...user.settings, ...settings };
    updateUser(s, userId, patch);
    save(s);
    return { user: publicUser(s.users[userId]), dashboard: buildDashboard(s, userId) };
  },

  async resetProgress(userId) {
    const s = load();
    ensureUser(s, userId);
    s.words[userId] = {};
    s.reviews[userId] = [];
    s.progress[userId] = {};
    s.daily[userId] = {};
    updateUser(s, userId, { xp: 0, streak: 0 });
    save(s);
    return { ok: true };
  },
};

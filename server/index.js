import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  db, seedContent, getUser, createUser, updateUser, getUserWords, getUserWord,
  upsertUserWord, insertReview, getReviews, getAllReviews, getLessonProgress, markLesson,
  recordStudy, todayStats, getDailyStats, recomputeStreak, vocabCounts, dayKey,
  listUsers, addEvent,
} from './db.js';
import {
  reviewWord, previewRatings, recencyStats, recencyContext, wordState, isDue,
  gradeFromAnswers, formatInterval,
} from './fsrs.js';
import { ALL_LESSONS, LEVELS, UNITS, VOCAB_BY_ID, VOCAB_LIST, UNIT_COLORS } from '../shared/content.js';
import { publicLesson, buildExercises, unitForLesson } from '../shared/exercises.js';
import { computeBrain, TYPE_LABELS } from '../shared/brain.js';
import { buildDemoState } from '../shared/demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3001;
const DAY = 86_400_000;

seedContent();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ── Helpers ───────────────────────────────────────────────────── */

const todayKey = () => dayKey();

function joinedWords(userId) {
  return db.prepare(`
    SELECT uw.*, v.de, v.tr, v.pos, v.gender, v.plural, v.example, v.example_tr AS exampleTr,
           v.note, v.level, v.unit_id AS unitId
    FROM user_words uw JOIN vocab v ON v.id = uw.vocab_id
    WHERE uw.user_id = ?
    ORDER BY uw.first_seen ASC
  `).all(userId).map((w) => ({ ...w, state: wordState(w) }));
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

function loadBrain(user, words, reviews, dailyStats, progress) {
  return computeBrain({ user, words, reviews, dailyStats, progress });
}

function brainContext(brain) {
  return {
    desiredRetention: brain?.personalization?.desiredRetention ?? 0.9,
    stabilityMultiplier: brain?.personalization?.stabilityMultiplier ?? 1,
  };
}

function buildPath(userId) {
  const progressRows = getLessonProgress(userId);
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
      newWords: current.vocab.filter((id) => !getUserWord(userId, id)).length,
    } : null,
    levels: LEVELS.map((level) => {
      const levelUnits = units.filter((u) => u.level === level.id);
      const got = levelUnits.reduce((s, u) => s + u.completedCount, 0);
      const all = levelUnits.reduce((s, u) => s + u.totalCount, 0);
      return { id: level.id, title: level.title, subtitle: level.subtitle, progress: all ? got / all : 0, completed: got, total: all };
    }),
    totalDone,
    totalNodes,
    progress: totalNodes ? totalDone / totalNodes : 0,
  };
}

function buildDashboard(userId) {
  const user = getUser(userId);
  if (!user) return null;
  const words = joinedWords(userId);
  const reviews = getReviews(userId, { sinceDays: 60 });
  const allReviews = getAllReviews(userId);
  const dailyStats = getDailyStats(userId, 120);
  const progress = getLessonProgress(userId);
  const brain = loadBrain(user, words, allReviews, dailyStats, progress);
  const path = buildPath(userId);
  const dueWords = words.filter((w) => isDue(w));
  const today = todayStats(userId);
  const counts = vocabCounts(userId);
  const now = new Date();

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * DAY);
    const key = dayKey(d);
    const row = dailyStats.find((s) => s.day === key);
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
    const count = i === 0
      ? dueWords.length
      : words.filter((w) => w.due_at && dayKey(new Date(w.due_at)) === key).length;
    return {
      day: key,
      label: i === 0 ? 'Bugün' : d.toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'Europe/Istanbul' }),
      count,
      dateLabel: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }),
    };
  });

  const nextWords = path.current
    ? (ALL_LESSONS[path.current.id]?.vocab || []).filter((id) => !words.some((w) => w.vocab_id === id)).slice(0, 5).map((id) => VOCAB_BY_ID[id])
    : [];
  const recent = recencyStats(allReviews, now);
  const retention = recent.weightedAccuracy != null ? Math.round(recent.weightedAccuracy * 100) : null;
  const goal = user.goal_minutes;
  const planMinutes = Math.max(3, Math.round(dueWords.length * 0.32 + (path.current?.minutes || 0)));
  const latestWeekMinutes = week.reduce((s, d) => s + d.minutes, 0);

  return {
    user: publicUser(user),
    today: {
      day: today.day,
      minutes: Math.round(today.minutes * 10) / 10,
      goalMinutes: goal,
      percent: Math.min(100, Math.round((today.minutes / goal) * 100)),
      xp: today.xp,
      reviews: today.reviews,
      correct: today.correct,
      accuracy: today.reviews ? Math.round((today.correct / today.reviews) * 100) : null,
      lessons: progress.filter((p) => p.completed_at && p.completed_at.slice(0, 10) === todayKey()).length,
    },
    stats: {
      xp: user.xp,
      streak: user.streak,
      bestStreak: user.best_streak,
      activeDays: dailyStats.filter((d) => d.minutes > 0).length,
      level: path.current?.level || user.level,
      weekMinutes: Math.round(latestWeekMinutes),
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
        ? Math.min(brain.personalization.newWordsPerDay, ALL_LESSONS[path.current.id].vocab.filter((id) => !getUserWord(userId, id)).length)
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
    demo: Boolean(user.profile?.demo),
    generatedAt: new Date().toISOString(),
  };
}

function buildProgress(userId, range = 30) {
  const user = getUser(userId);
  if (!user) return null;
  const words = joinedWords(userId);
  const reviews = getAllReviews(userId);
  const dailyStats = getDailyStats(userId, 365);
  const progress = getLessonProgress(userId);
  const path = buildPath(userId);
  const brain = loadBrain(user, words, reviews, dailyStats, progress);
  const now = new Date();
  const days = Math.max(7, Math.min(365, Number(range) || 30));
  const start = new Date(now.getTime() - (days - 1) * DAY);
  const counts = vocabCounts(userId);

  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY);
    const key = dayKey(d);
    const row = dailyStats.find((s) => s.day === key);
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
    .map((r) => ({ ...r, accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0 }))
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
      minutes: Math.round(rows.reduce((s, d) => s + d.minutes, 0)),
      accuracy: reviewRows.length ? Math.round((reviewRows.filter((r) => r.correct).length / reviewRows.length) * 100) : null,
      reviews: reviewRows.length,
    });
  }

  const heatmap = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(now.getTime() - (83 - i) * DAY);
    const key = dayKey(d);
    const row = dailyStats.find((s) => s.day === key);
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
    const levelVocab = VOCAB_LIST.filter((v) => v.level === level.id);
    const seen = words.filter((w) => w.level === level.id);
    const mastered = seen.filter((w) => w.state === 'mastered');
    const levelUnits = path.units.filter((u) => u.level === level.id);
    const nodes = levelUnits.reduce((s, u) => s + u.totalCount, 0);
    const done = levelUnits.reduce((s, u) => s + u.completedCount, 0);
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

  const totalMinutes = dailyStats.reduce((s, d) => s + d.minutes, 0);
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
      xp: user.xp,
      reviews: totalReviews,
      accuracy: totalReviews ? Math.round((totalCorrect / totalReviews) * 100) : 0,
      activeDays,
      bestStreak: user.best_streak,
      streak: user.streak,
      wordsPerActiveDay: activeDays ? Math.round((counts.seen / activeDays) * 10) / 10 : 0,
    },
    demo: Boolean(user.profile?.demo),
  };
}

function reviewQueue(userId) {
  const user = getUser(userId);
  if (!user) return null;
  const words = joinedWords(userId);
  const reviews = getAllReviews(userId);
  const dailyStats = getDailyStats(userId, 120);
  const progress = getLessonProgress(userId);
  const brain = loadBrain(user, words, reviews, dailyStats, progress);
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
      vocabId: w.vocab_id, de: w.de, tr: w.tr, dueAt: w.due_at,
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

/* ── Demo seeding ──────────────────────────────────────────────── */

function seedDemo() {
  if (getUser('demo')) return;
  const state = buildDemoState(new Date());
  const insertWord = db.prepare(`
    INSERT INTO user_words (user_id, vocab_id, state, stability, stability_short, difficulty, reps, lapses, exposures, correct_count, wrong_count, first_seen, last_review, due_at, last_grade)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO users (id, name, goal_minutes, motivation, level, xp, streak, best_streak, created_at, last_active, profile_json, settings_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      state.user.id, state.user.name, state.user.goal_minutes, state.user.motivation, state.user.level,
      state.user.xp, state.user.streak, state.user.best_streak, state.user.created_at, state.user.last_active,
      JSON.stringify(state.user.profile), JSON.stringify(state.user.settings)
    );
    for (const w of state.words) {
      insertWord.run('demo', w.vocab_id, w.state, w.stability, w.stability_short ?? w.stabilityShort ?? 0, w.difficulty, w.reps, w.lapses, w.exposures,
        w.correct_count, w.wrong_count, w.first_seen, w.last_review, w.due_at, w.last_grade);
    }
    const insertRev = db.prepare(`
      INSERT INTO reviews (id, user_id, vocab_id, lesson_id, exercise_type, grade, correct, latency_ms, stability_before, stability_short_before, stability_after, stability_short_after, difficulty_after, predicted_recall, interval_days, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of state.reviews) {
      insertRev.run(r.id, 'demo', r.vocab_id, r.lesson_id, r.exercise_type, r.grade, r.correct, r.latency_ms,
        r.stability_before, r.stability_short_before, r.stability_after, r.stability_short_after,
        r.difficulty_after, r.predicted_recall, r.interval_days, r.reviewed_at);
    }
    const insertProgress = db.prepare(`
      INSERT INTO lesson_progress (user_id, lesson_id, completed, best_score, attempts, last_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of state.progress) {
      insertProgress.run('demo', p.lesson_id, p.completed, p.best_score, p.attempts, p.last_at, p.completed_at);
    }
    const insertStats = db.prepare(`
      INSERT INTO daily_stats (user_id, day, minutes, xp, reviews, correct, new_words, learning_words, review_words, mastered_words, accuracy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of state.dailyStats) {
      insertStats.run('demo', d.day, d.minutes, d.xp, d.reviews, d.correct, d.new_words, d.learning_words, d.review_words, d.mastered_words, d.accuracy);
    }
    db.exec('COMMIT');
    console.log(`[demo] seeded ${state.words.length} words, ${state.reviews.length} reviews`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[demo] seed failed', err);
    throw err;
  }
}

seedDemo();

/* ── Routes ────────────────────────────────────────────────────── */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'wort', fsrs: 'FSRS-7', users: listUsers().length, db: process.env.WORT_DB || 'data/wort.db' });
});

app.get('/api/meta', (req, res) => {
  res.json({
    name: 'wort.',
    levels: LEVELS.map((l) => ({ id: l.id, title: l.title, subtitle: l.subtitle, description: l.description, units: l.units.length })),
    versions: { scheduler: 'FSRS-7', brain: 'brain-v1', content: 'A1.1-A1.2' },
    totalVocab: VOCAB_LIST.length,
    totalLessons: Object.keys(ALL_LESSONS).length,
  });
});

app.get('/api/users', (req, res) => {
  res.json({ users: listUsers() });
});

app.post('/api/users', (req, res) => {
  const { name, goalMinutes = 15, motivation = 'alltag', calibration = {} } = req.body || {};
  if (!name || String(name).trim().length < 1) {
    return res.status(400).json({ error: 'İsim gerekli.' });
  }
  const id = `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const user = createUser({
    id,
    name: String(name).trim().slice(0, 40),
    goalMinutes: [5, 10, 15, 20].includes(Number(goalMinutes)) ? Number(goalMinutes) : 15,
    motivation,
    level: 'A1.1',
    profile: {
      calibration: {
        memory: Number(calibration.memory) || 0.76,
        speedMs: Number(calibration.speedMs) || 5400,
        modality: calibration.modality || 'visual',
        confidence: Number(calibration.confidence) || 0.5,
        source: 'calibration',
        goal: motivation,
        completedAt: new Date().toISOString(),
      },
    },
    settings: { sound: true, tts: true, reducedMotion: false },
  });
  addEvent(id, 'user_created', { goalMinutes, motivation, calibration });
  res.status(201).json({ user: publicUser(user), bootstrap: { user: publicUser(user), dashboard: buildDashboard(id), path: buildPath(id), brain: loadBrain(user, joinedWords(id), [], [], []) } });
});

app.post('/api/demo', (req, res) => {
  seedDemo();
  const user = getUser('demo');
  if (!user) return res.status(500).json({ error: 'Demo hazırlanamadı.' });
  res.json({ user: publicUser(user) });
});

app.get('/api/users/:id/bootstrap', (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  const dashboard = buildDashboard(req.params.id);
  res.json({
    user: publicUser(user),
    dashboard,
    path: buildPath(req.params.id),
    brain: dashboard.brain,
    meta: { scheduler: 'FSRS-7', totalVocab: VOCAB_LIST.length, totalLessons: Object.keys(ALL_LESSONS).length },
  });
});

app.get('/api/users/:id/dashboard', (req, res) => {
  const dashboard = buildDashboard(req.params.id);
  if (!dashboard) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json(dashboard);
});

app.get('/api/users/:id/path', (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json({ ...buildPath(req.params.id), user: publicUser(user) });
});

app.get('/api/users/:id/progress', (req, res) => {
  const data = buildProgress(req.params.id, req.query.range);
  if (!data) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json(data);
});

app.get('/api/users/:id/brain', (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  const words = joinedWords(req.params.id);
  const reviews = getAllReviews(req.params.id);
  const dailyStats = getDailyStats(req.params.id, 120);
  const progress = getLessonProgress(req.params.id);
  res.json(computeBrain({ user, words, reviews, dailyStats, progress }));
});

app.get('/api/users/:id/lesson/:lessonId', (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  const lesson = ALL_LESSONS[req.params.lessonId];
  if (!lesson) return res.status(404).json({ error: 'Ders bulunamadı.' });
  const unit = unitForLesson(lesson.id);
  const words = joinedWords(req.params.id);
  const reviews = getAllReviews(req.params.id);
  const dailyStats = getDailyStats(req.params.id, 120);
  const progress = getLessonProgress(req.params.id);
  const brain = loadBrain(user, words, reviews, dailyStats, progress);
  const data = publicLesson(lesson, unit, {
    seed: `${req.params.id}:${todayKey()}:${Date.now() % 5}`,
    mode: lesson.isCheckpoint ? 'checkpoint' : 'lesson',
    mix: brain.personalization.exerciseMix,
  });
  res.json({ ...data, brain: { profileLabel: brain.profileLabel, confidence: brain.confidence }, progress: progress.find((p) => p.lesson_id === lesson.id) || null });
});

app.post('/api/users/:id/lesson/:lessonId/complete', (req, res) => {
  const userId = req.params.id;
  const user = getUser(userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  const lesson = ALL_LESSONS[req.params.lessonId];
  if (!lesson) return res.status(404).json({ error: 'Ders bulunamadı.' });
  const { answers = [], durationSec = 0 } = req.body || {};
  if (!Array.isArray(answers) || !answers.length) return res.status(400).json({ error: 'Cevaplar eksik.' });

  const validVocab = new Set(lesson.vocab);
  const cleanAnswers = answers.filter((a) => a && (a.vocabId == null || validVocab.has(a.vocabId)));
  const correctTotal = cleanAnswers.filter((a) => a.correct).length;
  const total = cleanAnswers.length;
  const score = total ? correctTotal / total : 0;
  const passed = !lesson.isCheckpoint || score >= 0.8;
  const before = getUserWord(userId, lesson.vocab[0]);
  const priorProgress = getLessonProgress(userId).find((p) => p.lesson_id === lesson.id);
  const firstTime = !priorProgress?.completed;

  const words = joinedWords(userId);
  const allReviews = getAllReviews(userId);
  const dailyStats = getDailyStats(userId, 120);
  const progressRows = getLessonProgress(userId);
  const brain = loadBrain(user, words, allReviews, dailyStats, progressRows);
  const context = brainContext(brain);
  const now = new Date();
  let newWordCount = 0;
  let touched = 0;

  const tx = db.prepare('BEGIN');
  try {
    tx.run();
    for (const vocabId of lesson.vocab) {
      const vocab = VOCAB_BY_ID[vocabId];
      if (!vocab) continue;
      const existing = getUserWord(userId, vocabId);
      if (!existing) newWordCount += 1;
      const related = cleanAnswers.filter((a) => a.vocabId === vocabId);
      let grade;
      if (related.length) {
        grade = gradeFromAnswers(related, { isNew: !existing });
      } else {
        grade = existing ? 3 : 2;
      }
      const next = reviewWord(existing || {
        stability: 0, difficulty: 0, reps: 0, lapses: 0, last_review: null,
      }, grade, now, context);
      const touchedBefore = related.length > 0;
      const correctCount = related.filter((a) => a.correct).length;
      const wrongCount = related.length - correctCount;
      upsertUserWord(userId, vocabId, {
        ...next,
        vocab_id: vocabId,
        state: wordState({ ...existing, ...next }),
        exposures: (existing?.exposures || 0) + Math.max(1, related.length),
        correct_count: (existing?.correct_count || 0) + correctCount,
        wrong_count: (existing?.wrong_count || 0) + wrongCount,
        first_seen: existing?.first_seen || now.toISOString(),
      });
      if (touchedBefore) {
        const latency = Math.round(related.reduce((s, a) => s + (a.latencyMs || 0), 0) / related.length);
        insertReview(userId, {
          vocabId,
          lessonId: lesson.id,
          exerciseType: lesson.isCheckpoint ? 'checkpoint' : 'lesson',
          grade,
          correct: grade > 1,
          latencyMs: latency,
          stabilityBefore: existing?.stability || 0,
          stabilityShortBefore: existing?.stability_short ?? 0,
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

    markLesson(userId, lesson.id, { completed: passed, score, at: now.toISOString() });
    const xpBase = lesson.isCheckpoint ? 45 : 24;
    const xp = (firstTime ? xpBase : 8) + correctTotal * 2;
    const minutes = Math.min(30, Math.max(2, Math.round((Number(durationSec) || 0) / 60 * 10) / 10));
    recordStudy(userId, {
      minutes,
      xp,
      reviews: total,
      correct: correctTotal,
      day: dayKey(now),
    });
    addEvent(userId, 'lesson_completed', { lessonId: lesson.id, score, xp, newWords: newWordCount, durationSec });
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    console.error(err);
    return res.status(500).json({ error: 'Ders kaydedilemedi.' });
  }

  const nextPath = buildPath(userId);
  const nextLesson = nextPath.current;
  const freshUser = getUser(userId);
  res.json({
    ok: true,
    passed,
    score: Math.round(score * 100),
    correct: correctTotal,
    total,
    xp: (firstTime ? (lesson.isCheckpoint ? 45 : 24) : 8) + correctTotal * 2,
    newWords: newWordCount,
    touched,
    streak: freshUser.streak,
    nextLesson,
    path: nextPath,
    message: !passed
      ? 'Checkpoint %80 gerektiriyor. Blokları tekrar edip yeniden dene.'
      : newWordCount > 0
        ? `${newWordCount} yeni kelime hafızana eklendi. Yarın kısa bir tekrar seni bekliyor.`
        : 'Tekrar tamam. FSRS-7 bir sonraki buluşmayı planladı.',
  });
});

app.get('/api/users/:id/review', (req, res) => {
  const data = reviewQueue(req.params.id);
  if (!data) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json(data);
});

app.post('/api/users/:id/review', (req, res) => {
  const userId = req.params.id;
  const user = getUser(userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  const { vocabId, grade, latencyMs = 0, exerciseType = 'flashcard' } = req.body || {};
  const g = Number(grade);
  if (!vocabId || !(g >= 1 && g <= 4)) return res.status(400).json({ error: 'Geçersiz tekrar.' });
  const vocab = VOCAB_BY_ID[vocabId];
  if (!vocab) return res.status(404).json({ error: 'Kelime bulunamadı.' });
  const existing = getUserWord(userId, vocabId);
  if (!existing) return res.status(400).json({ error: 'Bu kelime henüz öğrenilmedi.' });

  const words = joinedWords(userId);
  const allReviews = getAllReviews(userId);
  const dailyStats = getDailyStats(userId, 120);
  const progressRows = getLessonProgress(userId);
  const brain = loadBrain(user, words, allReviews, dailyStats, progressRows);
  const next = reviewWord(existing, g, new Date(), brainContext(brain));
  upsertUserWord(userId, vocabId, {
    ...next,
    vocab_id: vocabId,
    state: wordState({ ...existing, ...next }),
    exposures: (existing.exposures || 0) + 1,
    correct_count: (existing.correct_count || 0) + (g > 1 ? 1 : 0),
    wrong_count: (existing.wrong_count || 0) + (g === 1 ? 1 : 0),
  });
  insertReview(userId, {
    vocabId,
    exerciseType,
    grade: g,
    correct: g > 1,
    latencyMs,
    stabilityBefore: existing.stability,
    stabilityShortBefore: existing.stability_short ?? 0,
    stabilityAfter: next.stability,
    stabilityShortAfter: next.stabilityShort,
    difficultyAfter: next.difficulty,
    predictedRecall: next.recallBefore,
    intervalDays: next.intervalDays,
  });
  recordStudy(userId, { minutes: 0.25, xp: 3, reviews: 1, correct: g > 1 ? 1 : 0 });
  addEvent(userId, 'review_completed', { vocabId, grade: g, latencyMs });
  const fresh = getUser(userId);
  res.json({
    ok: true,
    nextDue: next.due_at,
    intervalDays: next.intervalDays,
    intervalLabel: formatInterval(next.intervalDays),
    stability: next.stability,
    difficulty: next.difficulty,
    streak: fresh.streak,
    xp: fresh.xp,
  });
});

app.get('/api/users/:id/settings', (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json({ user: publicUser(user) });
});

app.patch('/api/users/:id/settings', (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  const { name, goalMinutes, settings, motivation } = req.body || {};
  const patch = {};
  if (name && String(name).trim()) patch.name = String(name).trim().slice(0, 40);
  if ([5, 10, 15, 20].includes(Number(goalMinutes))) patch.goal_minutes = Number(goalMinutes);
  if (motivation) patch.motivation = String(motivation).slice(0, 30);
  if (settings && typeof settings === 'object') patch.settings = { ...user.settings, ...settings };
  const updated = updateUser(req.params.id, patch);
  res.json({ user: publicUser(updated), dashboard: buildDashboard(req.params.id) });
});

app.post('/api/users/:id/reset', (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  db.prepare('DELETE FROM user_words WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM reviews WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM lesson_progress WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM daily_stats WHERE user_id = ?').run(req.params.id);
  updateUser(req.params.id, { xp: 0, streak: 0 });
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API yolu bulunamadı.' }));

/* ── Static app ────────────────────────────────────────────────── */

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`wort. api listening on http://localhost:${PORT}`);
  console.log(`[content] ${UNITS.length} units · ${Object.keys(ALL_LESSONS).length} blocks · ${VOCAB_LIST.length} words`);
});

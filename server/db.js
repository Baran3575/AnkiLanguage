import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { UNITS, VOCAB_LIST } from '../shared/content.js';

const DATA_DIR = path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.WORT_DB || path.join(DATA_DIR, 'wort.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    goal_minutes INTEGER NOT NULL DEFAULT 15,
    motivation TEXT,
    level TEXT NOT NULL DEFAULT 'A1.1',
    xp INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_active TEXT,
    profile_json TEXT,
    settings_json TEXT
  );

  CREATE TABLE IF NOT EXISTS vocab (
    id TEXT PRIMARY KEY,
    de TEXT NOT NULL,
    tr TEXT NOT NULL,
    pos TEXT,
    gender TEXT,
    plural TEXT,
    example TEXT,
    example_tr TEXT,
    note TEXT,
    level TEXT NOT NULL,
    unit_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS units (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL,
    level TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    can_do TEXT,
    color TEXT,
    code TEXT
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    type TEXT,
    vocab_json TEXT,
    grammar_json TEXT,
    is_checkpoint INTEGER NOT NULL DEFAULT 0,
    minutes INTEGER NOT NULL DEFAULT 7
  );

  CREATE TABLE IF NOT EXISTS user_words (
    user_id TEXT NOT NULL,
    vocab_id TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'new',
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    exposures INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT,
    last_review TEXT,
    due_at TEXT,
    last_grade INTEGER,
    PRIMARY KEY (user_id, vocab_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lesson_progress (
    user_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    best_score REAL NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_at TEXT,
    completed_at TEXT,
    PRIMARY KEY (user_id, lesson_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    vocab_id TEXT NOT NULL,
    lesson_id TEXT,
    exercise_type TEXT,
    grade INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    latency_ms INTEGER,
    stability_before REAL,
    stability_after REAL,
    difficulty_after REAL,
    interval_days REAL,
    reviewed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_stats (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    minutes REAL NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    reviews INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    new_words INTEGER NOT NULL DEFAULT 0,
    learning_words INTEGER NOT NULL DEFAULT 0,
    review_words INTEGER NOT NULL DEFAULT 0,
    mastered_words INTEGER NOT NULL DEFAULT 0,
    accuracy REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reviews_user_time ON reviews(user_id, reviewed_at);
  CREATE INDEX IF NOT EXISTS idx_user_words_due ON user_words(user_id, due_at);
  CREATE INDEX IF NOT EXISTS idx_daily_user_day ON daily_stats(user_id, day);
`);

export function nowIso() {
  return new Date().toISOString();
}

export function dayKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function j(value) {
  return JSON.stringify(value ?? null);
}

function parse(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

/* ── Content seeding ───────────────────────────────────────────── */

export function seedContent() {
  const unitStmt = db.prepare(`
    INSERT INTO units (id, number, level, title, subtitle, can_do, color, code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      number=excluded.number, level=excluded.level, title=excluded.title,
      subtitle=excluded.subtitle, can_do=excluded.can_do, color=excluded.color, code=excluded.code
  `);
  const vocabStmt = db.prepare(`
    INSERT INTO vocab (id, de, tr, pos, gender, plural, example, example_tr, note, level, unit_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      de=excluded.de, tr=excluded.tr, pos=excluded.pos, gender=excluded.gender,
      plural=excluded.plural, example=excluded.example, example_tr=excluded.example_tr,
      note=excluded.note, level=excluded.level, unit_id=excluded.unit_id
  `);
  const lessonStmt = db.prepare(`
    INSERT INTO lessons (id, unit_id, title, subtitle, type, vocab_json, grammar_json, is_checkpoint, minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      unit_id=excluded.unit_id, title=excluded.title, subtitle=excluded.subtitle,
      type=excluded.type, vocab_json=excluded.vocab_json, grammar_json=excluded.grammar_json,
      is_checkpoint=excluded.is_checkpoint, minutes=excluded.minutes
  `);

  db.exec('BEGIN');
  try {
    for (const unit of UNITS) {
      unitStmt.run(unit.id, unit.number, unit.level, unit.title, unit.subtitle, unit.canDo, unit.color, unit.code);
      for (const lesson of unit.path) {
        lessonStmt.run(
          lesson.id, unit.id, lesson.title, lesson.subtitle, lesson.type,
          j(lesson.vocab), j(lesson.grammar), lesson.isCheckpoint ? 1 : 0, lesson.minutes || 7
        );
      }
    }
    for (const vocab of VOCAB_LIST) {
      const unit = UNITS.find((u) => u.lessons.some((l) => l.vocab.includes(vocab.id)));
      vocabStmt.run(
        vocab.id, vocab.de, vocab.tr, vocab.pos, vocab.gender, vocab.plural,
        vocab.example, vocab.exampleTr, vocab.note, unit?.level || 'A1.1', unit?.id || 'u1'
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* ── Users ─────────────────────────────────────────────────────── */

export function getUser(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    profile: parse(row.profile_json, {}),
    settings: parse(row.settings_json, {}),
  };
}

export function createUser({ id, name, goalMinutes = 15, motivation = 'alltag', level = 'A1.1', profile = {}, settings = {} }) {
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO users (id, name, goal_minutes, motivation, level, created_at, last_active, profile_json, settings_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, goalMinutes, motivation, level, createdAt, createdAt, j(profile), j(settings));
  return getUser(id);
}

export function updateUser(id, patch) {
  const allowed = ['name', 'goal_minutes', 'motivation', 'level', 'xp', 'streak', 'best_streak', 'last_active'];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  if (patch.profile) {
    fields.push('profile_json = ?');
    values.push(j(patch.profile));
  }
  if (patch.settings) {
    fields.push('settings_json = ?');
    values.push(j(patch.settings));
  }
  if (fields.length) {
    values.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  return getUser(id);
}

export function listUsers() {
  return db.prepare('SELECT id, name, xp, streak, last_active FROM users ORDER BY last_active DESC').all();
}

/* ── Words ─────────────────────────────────────────────────────── */

export function getUserWord(userId, vocabId) {
  return db.prepare('SELECT * FROM user_words WHERE user_id = ? AND vocab_id = ?').get(userId, vocabId);
}

export function getUserWords(userId, { dueOnly = false, now = new Date(), limit = 500 } = {}) {
  const rows = dueOnly
    ? db.prepare('SELECT * FROM user_words WHERE user_id = ? AND due_at IS NOT NULL AND due_at <= ? ORDER BY due_at ASC LIMIT ?').all(userId, now.toISOString(), limit)
    : db.prepare('SELECT * FROM user_words WHERE user_id = ? ORDER BY first_seen ASC').all(userId);
  return rows;
}

export function upsertUserWord(userId, vocabId, values) {
  const existing = getUserWord(userId, vocabId);
  const payload = { ...existing, ...values };
  db.prepare(`
    INSERT INTO user_words (user_id, vocab_id, state, stability, difficulty, reps, lapses, exposures, correct_count, wrong_count, first_seen, last_review, due_at, last_grade)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, vocab_id) DO UPDATE SET
      state=excluded.state, stability=excluded.stability, difficulty=excluded.difficulty,
      reps=excluded.reps, lapses=excluded.lapses, exposures=excluded.exposures,
      correct_count=excluded.correct_count, wrong_count=excluded.wrong_count,
      first_seen=excluded.first_seen, last_review=excluded.last_review,
      due_at=excluded.due_at, last_grade=excluded.last_grade
  `).run(
    userId, vocabId,
    payload.state ?? 'new',
    payload.stability ?? 0,
    payload.difficulty ?? 0,
    payload.reps ?? 0,
    payload.lapses ?? 0,
    payload.exposures ?? 0,
    payload.correct_count ?? 0,
    payload.wrong_count ?? 0,
    payload.first_seen ?? null,
    payload.last_review ?? null,
    payload.due_at ?? null,
    payload.last_grade ?? null
  );
}

export function insertReview(userId, { vocabId, lessonId = null, exerciseType = 'flashcard', grade, correct, latencyMs, stabilityBefore, stabilityAfter, difficultyAfter, intervalDays, reviewedAt = nowIso() }) {
  db.prepare(`
    INSERT INTO reviews (user_id, vocab_id, lesson_id, exercise_type, grade, correct, latency_ms, stability_before, stability_after, difficulty_after, interval_days, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, vocabId, lessonId, exerciseType, grade, correct ? 1 : 0, latencyMs ?? null, stabilityBefore ?? null, stabilityAfter ?? null, difficultyAfter ?? null, intervalDays ?? null, reviewedAt);
}

export function getReviews(userId, { sinceDays = 60, limit = 2000 } = {}) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  return db.prepare('SELECT * FROM reviews WHERE user_id = ? AND reviewed_at >= ? ORDER BY reviewed_at ASC LIMIT ?').all(userId, since, limit);
}

export function getAllReviews(userId, limit = 5000) {
  return db.prepare('SELECT * FROM reviews WHERE user_id = ? ORDER BY reviewed_at ASC LIMIT ?').all(userId, limit);
}

/* ── Lesson progress ───────────────────────────────────────────── */

export function getLessonProgress(userId) {
  return db.prepare('SELECT * FROM lesson_progress WHERE user_id = ?').all(userId);
}

export function markLesson(userId, lessonId, { completed = true, score = 0, at = nowIso() } = {}) {
  const existing = db.prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId);
  if (existing) {
    db.prepare(`
      UPDATE lesson_progress SET completed = ?, best_score = MAX(best_score, ?), attempts = attempts + 1, last_at = ?, completed_at = COALESCE(completed_at, ?)
      WHERE user_id = ? AND lesson_id = ?
    `).run(completed ? 1 : 0, score, at, completed ? at : null, userId, lessonId);
  } else {
    db.prepare(`
      INSERT INTO lesson_progress (user_id, lesson_id, completed, best_score, attempts, last_at, completed_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(userId, lessonId, completed ? 1 : 0, score, at, completed ? at : null);
  }
}

/* ── Daily stats + streak ──────────────────────────────────────── */

export function vocabCounts(userId) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS seen,
      SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) AS learning,
      SUM(CASE WHEN state = 'review' THEN 1 ELSE 0 END) AS review,
      SUM(CASE WHEN state = 'mastered' THEN 1 ELSE 0 END) AS mastered
    FROM user_words WHERE user_id = ?
  `).get(userId);
  return {
    seen: Number(row.seen) || 0,
    learning: Number(row.learning) || 0,
    review: Number(row.review) || 0,
    mastered: Number(row.mastered) || 0,
  };
}

export function syncWordCounts(userId, day = dayKey()) {
  const c = vocabCounts(userId);
  db.prepare(`
    INSERT INTO daily_stats (user_id, day, new_words, learning_words, review_words, mastered_words)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, day) DO UPDATE SET
      new_words=excluded.new_words, learning_words=excluded.learning_words,
      review_words=excluded.review_words, mastered_words=excluded.mastered_words
  `).run(userId, day, Math.max(0, 224 - c.seen), c.learning, c.review, c.mastered);
}

export function recordStudy(userId, { minutes = 0, xp = 0, reviews = 0, correct = 0, day = dayKey() } = {}) {
  db.prepare(`
    INSERT INTO daily_stats (user_id, day, minutes, xp, reviews, correct)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, day) DO UPDATE SET
      minutes = daily_stats.minutes + excluded.minutes,
      xp = daily_stats.xp + excluded.xp,
      reviews = daily_stats.reviews + excluded.reviews,
      correct = daily_stats.correct + excluded.correct
  `).run(userId, day, minutes, xp, reviews, correct);
  db.prepare('UPDATE daily_stats SET accuracy = CASE WHEN reviews > 0 THEN CAST(correct AS REAL) / reviews ELSE 0 END WHERE user_id = ? AND day = ?').run(userId, day);
  syncWordCounts(userId, day);
  const user = getUser(userId);
  if (user) updateUser(userId, { xp: user.xp + xp, last_active: nowIso() });
  return recomputeStreak(userId);
}

export function getDailyStats(userId, days = 90) {
  const since = dayKey(new Date(Date.now() - days * 86_400_000));
  return db.prepare('SELECT * FROM daily_stats WHERE user_id = ? AND day >= ? ORDER BY day ASC').all(userId, since);
}

export function recomputeStreak(userId) {
  const rows = db.prepare(`
    SELECT day FROM daily_stats
    WHERE user_id = ? AND (minutes > 0 OR reviews > 0 OR xp > 0)
    ORDER BY day DESC
  `).all(userId).map((r) => r.day);
  if (!rows.length) {
    updateUser(userId, { streak: 0 });
    return { current: 0, best: 0, activeDays: 0 };
  }
  const set = new Set(rows);
  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  let cursor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor && set.has(cursor)) {
    current += 1;
    cursor = dayKey(new Date(new Date(`${cursor}T12:00:00`).getTime() - 86_400_000));
  }

  const sorted = [...rows].sort();
  let best = 0;
  let run = 0;
  let previous = null;
  for (const day of sorted) {
    if (previous && (new Date(`${day}T12:00:00`) - new Date(`${previous}T12:00:00`)) === 86_400_000) {
      run += 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    previous = day;
  }
  const user = getUser(userId);
  updateUser(userId, { streak: current, best_streak: Math.max(best, user?.best_streak || 0) });
  return { current, best: Math.max(best, user?.best_streak || 0), activeDays: rows.length };
}

export function todayStats(userId) {
  const row = db.prepare('SELECT * FROM daily_stats WHERE user_id = ? AND day = ?').get(userId, dayKey());
  return row || { user_id: userId, day: dayKey(), minutes: 0, xp: 0, reviews: 0, correct: 0, accuracy: 0, new_words: 0, learning_words: 0, review_words: 0, mastered_words: 0 };
}

export function addEvent(userId, type, payload = {}) {
  db.prepare('INSERT INTO events (user_id, type, payload, created_at) VALUES (?, ?, ?, ?)').run(userId, type, j(payload), nowIso());
}

export { j as json, parse as parseJson };

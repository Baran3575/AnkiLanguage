/**
 * Shared exercise generator. Used by the API and the offline mobile build.
 */
import { VOCAB_BY_ID, UNITS } from './content.js';

const ARTICLES = ['der', 'die', 'das'];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle(list, rand = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function articleOf(vocab) {
  return vocab?.gender || null;
}

export function stripArticle(de = '') {
  return de.replace(/^(der|die|das)\s+/i, '').trim();
}

export function normalizeAnswer(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/^(der|die|das)\s+/i, '')
    .replace(/[.,!?;:„“"']/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/\s+/g, ' ');
}

export function answersMatch(actual, expected, accepted = []) {
  const a = normalizeAnswer(actual);
  if (!a) return false;
  return [expected, ...accepted].some((candidate) => normalizeAnswer(candidate) === a);
}

function uniqueBy(list, key) {
  const seen = new Set();
  return list.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function pickDistractors(answer, pool, count, rand, samePos = true) {
  const candidates = pool.filter((v) => {
    if (v.id === answer.id) return false;
    if (samePos && answer.pos && v.pos !== answer.pos) return false;
    return true;
  });
  const fallback = pool.filter((v) => v.id !== answer.id);
  const chosen = uniqueBy(shuffle(candidates.length >= count ? candidates : fallback, rand), (v) => v.de)
    .slice(0, count);
  return chosen;
}

function vocabOf(ids) {
  return ids.map((id) => VOCAB_BY_ID[id]).filter(Boolean);
}

function explanation(vocab) {
  const gender = vocab.gender ? `${vocab.gender} · ` : '';
  return `${gender}${vocab.de} — ${vocab.tr}${vocab.note ? ` · ${vocab.note}` : ''}`;
}

function makeChoice({ vocab, pool, rand, direction, index, lessonId }) {
  const trToDe = direction === 'tr_de';
  const answer = trToDe ? vocab.de : vocab.tr;
  const distractors = pickDistractors(vocab, pool, 3, rand, true);
  const options = shuffle([answer, ...distractors.map((v) => (trToDe ? v.de : v.tr))], rand);
  return {
    id: `${lessonId}:${index}:${trToDe ? 'choice-tr-de' : 'choice-de-tr'}`,
    type: trToDe ? 'choice_tr_de' : 'choice_de_tr',
    vocabId: vocab.id,
    prompt: trToDe ? vocab.tr : vocab.de,
    instruction: trToDe ? 'Almancasını seç' : 'Türkçesini seç',
    answer,
    options,
    audioText: vocab.de,
    explain: explanation(vocab),
    xp: 2,
  };
}

function makeListen({ vocab, pool, rand, index, lessonId }) {
  const distractors = pickDistractors(vocab, pool, 3, rand, true);
  return {
    id: `${lessonId}:${index}:listen`,
    type: 'listen',
    vocabId: vocab.id,
    prompt: 'Dinle',
    instruction: 'Dinle ve anlamını seç',
    answer: vocab.tr,
    options: shuffle([vocab.tr, ...distractors.map((v) => v.tr)], rand),
    audioText: vocab.de,
    explain: explanation(vocab),
    xp: 2,
  };
}

function makeType({ vocab, index, lessonId }) {
  const accepted = [vocab.de, stripArticle(vocab.de)];
  if (vocab.gender) accepted.push(`${vocab.gender} ${stripArticle(vocab.de)}`);
  return {
    id: `${lessonId}:${index}:type`,
    type: 'type',
    vocabId: vocab.id,
    prompt: vocab.tr,
    instruction: 'Almancasını yaz',
    answer: vocab.de,
    accepted: [...new Set(accepted)],
    hint: `${vocab.de.slice(0, 1)}${'·'.repeat(Math.max(1, stripArticle(vocab.de).length - 1))}`,
    explain: explanation(vocab),
    xp: 3,
  };
}

function makeArticle({ vocab, index, lessonId, rand }) {
  const noun = stripArticle(vocab.de);
  return {
    id: `${lessonId}:${index}:article`,
    type: 'article',
    vocabId: vocab.id,
    prompt: `___ ${noun}`,
    instruction: 'Doğru artikeli seç',
    answer: vocab.gender,
    options: shuffle(ARTICLES, rand),
    audioText: vocab.de,
    explain: explanation(vocab),
    xp: 2,
  };
}

function makeBuild({ vocab, index, lessonId, rand }) {
  const display = vocab.example;
  const clean = display.replace(/[.!?]+$/g, '');
  const tokens = clean.split(/\s+/);
  let shuffled = shuffle(tokens, rand);
  if (shuffled.join(' ') === clean && tokens.length > 1) shuffled = [...shuffled.slice(1), shuffled[0]];
  return {
    id: `${lessonId}:${index}:build`,
    type: 'build',
    vocabId: vocab.id,
    prompt: vocab.exampleTr,
    instruction: 'Cümleyi doğru sırayla kur',
    answer: clean,
    tokens: shuffled,
    audioText: display,
    explain: `${display} — ${vocab.exampleTr}`,
    xp: 4,
  };
}

function makeCloze({ vocab, pool, index, lessonId, rand }) {
  const lemma = stripArticle(vocab.de);
  if (!lemma || !vocab.example.toLocaleLowerCase('de').includes(lemma.toLocaleLowerCase('de'))) return null;
  if (lemma.includes(' ')) return null;
  const blanked = vocab.example.replace(new RegExp(lemma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '___');
  if (!blanked.includes('___')) return null;
  const candidates = pool.filter((v) => v.id !== vocab.id && v.pos === vocab.pos && !stripArticle(v.de).includes(' '));
  const distractors = shuffle(candidates, rand).slice(0, 3).map((v) => stripArticle(v.de));
  if (distractors.length < 2) return null;
  return {
    id: `${lessonId}:${index}:cloze`,
    type: 'cloze',
    vocabId: vocab.id,
    prompt: blanked,
    instruction: 'Boşluğu tamamla',
    answer: lemma,
    options: shuffle([lemma, ...distractors], rand),
    translation: vocab.exampleTr,
    audioText: vocab.example,
    explain: `${vocab.example} — ${vocab.exampleTr}`,
    xp: 2,
  };
}

function poolFor(lesson, unit) {
  const unitVocab = unit ? unit.vocabIds : [];
  return uniqueBy(vocabOf([...lesson.vocab, ...unitVocab]), (v) => v.id);
}

/**
 * Build a varied, personalized block.
 * `mode` = 'lesson' | 'checkpoint'.
 */
export function buildExercises(lesson, { seed = 'wort', mode = 'lesson', unit = null, mix = {} } = {}) {
  const rand = mulberry32(seedFrom(`${seed}:${lesson.id}:${new Date().toDateString()}`));
  const isCheckpoint = mode === 'checkpoint' || lesson.isCheckpoint;
  const lessonVocab = vocabOf(lesson.vocab);
  const pool = poolFor(lesson, unit);
  if (!lessonVocab.length) return [];

  if (isCheckpoint) {
    const shuffled = shuffle(lessonVocab, rand);
    const items = [];
    const chosen = shuffled.slice(0, 12);
    const firstFour = shuffled.slice(0, 4);
    items.push({
      id: `${lesson.id}:match`,
      type: 'match',
      instruction: 'Kelime çiftlerini eşleştir',
      pairs: firstFour.map((v) => ({ vocabId: v.id, de: v.de, tr: v.tr })),
      xp: 4,
    });
    const rest = chosen.filter((v) => !firstFour.includes(v));
    const roles = [
      (v, i) => makeChoice({ vocab: v, pool, rand, direction: 'tr_de', index: i, lessonId: lesson.id }),
      (v, i) => makeChoice({ vocab: v, pool, rand, direction: 'de_tr', index: i, lessonId: lesson.id }),
      (v, i) => makeListen({ vocab: v, pool, rand, index: i, lessonId: lesson.id }),
      (v, i) => makeType({ vocab: v, index: i, lessonId: lesson.id }),
      (v, i) => makeBuild({ vocab: v, index: i, lessonId: lesson.id, rand }),
      (v, i) => makeChoice({ vocab: v, pool, rand, direction: 'tr_de', index: i, lessonId: lesson.id }),
      (v, i) => makeListen({ vocab: v, pool, rand, index: i, lessonId: lesson.id }),
      (v, i) => makeType({ vocab: v, index: i, lessonId: lesson.id }),
      (v, i) => makeBuild({ vocab: v, index: i, lessonId: lesson.id, rand }),
    ];
    rest.slice(0, roles.length).forEach((v, i) => {
      items.push(roles[i](v, i + 1));
    });
    const noun = shuffled.find((v) => v.gender);
    if (noun && items.length < 12) items.push(makeArticle({ vocab: noun, index: 20, lessonId: lesson.id, rand }));
    const cloze = makeCloze({ vocab: shuffled[7] || shuffled[0], pool, index: 21, lessonId: lesson.id, rand });
    if (cloze && items.length < 12) items.push(cloze);
    return shuffle(items, rand).sort((a, b) => (a.type === 'match' ? -1 : b.type === 'match' ? 1 : 0));
  }

  const words = shuffle(lessonVocab, rand);
  const matchWords = words.slice(0, Math.min(4, words.length));
  const items = [{
    id: `${lesson.id}:match`,
    type: 'match',
    instruction: 'Yeni kelimeleri eşleştir',
    pairs: matchWords.map((v) => ({ vocabId: v.id, de: v.de, tr: v.tr })),
    xp: 4,
  }];

  const remaining = words.length > 4 ? words.slice(4) : words;
  const used = new Set(matchWords.map((v) => v.id));
  const nextUnused = () => words.find((v) => !used.has(v.id));
  const mark = (v) => {
    if (v) used.add(v.id);
    return v;
  };
  const mixBias = mix.listening === 'high' ? 1 : 0;
  const next = (index) => {
    const v = nextUnused() || words[index % words.length];
    return mark(v) || v;
  };

  items.push(makeChoice({ vocab: next(1), pool, rand, direction: 'tr_de', index: 1, lessonId: lesson.id }));
  items.push(makeChoice({ vocab: next(2), pool, rand, direction: 'de_tr', index: 2, lessonId: lesson.id }));
  items.push(makeListen({ vocab: next(3), pool, rand, index: 3, lessonId: lesson.id }));
  if (mixBias) items.push(makeListen({ vocab: next(4), pool, rand, index: 4, lessonId: lesson.id }));

  const noun = words.find((v) => v.gender);
  if (noun) items.push(makeArticle({ vocab: noun, index: 5, lessonId: lesson.id, rand }));

  const buildWord = next(6);
  items.push(makeBuild({ vocab: buildWord, index: 6, lessonId: lesson.id, rand }));

  const clozeWord = words.find((v) => makeCloze({ vocab: v, pool, index: 7, lessonId: lesson.id, rand }));
  if (clozeWord) {
    const cloze = makeCloze({ vocab: clozeWord, pool, index: 7, lessonId: lesson.id, rand });
    if (cloze) items.push(cloze);
  }

  items.push(makeType({ vocab: next(8), index: 8, lessonId: lesson.id }));

  const finalWord = next(9);
  items.push(makeChoice({ vocab: finalWord, pool, rand, direction: rand() > 0.5 ? 'tr_de' : 'de_tr', index: 9, lessonId: lesson.id }));

  // Keep the warm-up match first, otherwise interleave for desirable difficulty.
  return [items[0], ...shuffle(items.slice(1), rand)];
}

export function publicLesson(lesson, unit, options = {}) {
  const exercises = buildExercises(lesson, { ...options, unit });
  return {
    id: lesson.id,
    unitId: unit?.id,
    unitNumber: unit?.number,
    unitTitle: unit?.title,
    level: unit?.level,
    color: unit?.color,
    title: lesson.title,
    subtitle: lesson.subtitle,
    type: lesson.type,
    isCheckpoint: Boolean(lesson.isCheckpoint),
    minutes: lesson.minutes,
    grammar: lesson.grammar,
    newWords: (lesson.vocab || []).map((id) => VOCAB_BY_ID[id]).filter(Boolean),
    exercises,
    passScore: lesson.isCheckpoint ? 0.8 : 0.6,
  };
}

export function unitForLesson(lessonId) {
  return UNITS.find((unit) => unit.path.some((l) => l.id === lessonId)) || null;
}

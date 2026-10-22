import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, CircleHelp, Clock3, Headphones,
  Keyboard, Layers3, Lightbulb, Play, Sparkles, Star, Timer, Volume2, X, XCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { navigate } from '../lib/router.js';
import { answersMatch, normalizeAnswer } from '../../shared/exercises.js';
import { articleParts } from '../lib/format.js';
import { playCorrect, playIncorrect, playComplete, haptic } from '../lib/sound.js';
import { speakGerman, stopSpeaking } from '../lib/speech.js';
import {
  ArticleDot, AudioButton, Badge, Button, Chip, GermanWord, Keycap, ProgressBar, Skeleton,
} from '../components/ui.jsx';

const TYPE_META = {
  choice_tr_de: { label: 'Anlam', icon: Layers3 },
  choice_de_tr: { label: 'Anlam', icon: Layers3 },
  listen: { label: 'Dinleme', icon: Headphones },
  article: { label: 'Artikel', icon: Star },
  type: { label: 'Yazma', icon: Keyboard },
  build: { label: 'Cümle', icon: Lightbulb },
  cloze: { label: 'Boşluk', icon: CircleHelp },
  match: { label: 'Eşleştirme', icon: Sparkles },
};

const SPECIAL_CHARS = ['ä', 'ö', 'ü', 'ß'];

function TopBar({ data, index, total, progress, onExit }) {
  const segments = Math.max(1, total);
  return (
    <div className="lesson-topbar">
      <button type="button" className="lesson-close" onClick={onExit} aria-label="Dersten çık">
        <X size={20} />
      </button>
      <div className="lesson-progress-segments" aria-label={`Ders ilerlemesi ${index} / ${total}`}>
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={i < progress ? 'is-done' : i === progress ? 'is-current' : ''} />
        ))}
      </div>
      <div className="lesson-topbar-right">
        <span className="lesson-type-chip"><Star size={13} /> {data?.isCheckpoint ? 'Checkpoint' : `Ünite ${data?.unitNumber}`}</span>
        <span className="lesson-topbar-time"><Clock3 size={14} /> {data?.minutes || 7} dk</span>
      </div>
    </div>
  );
}

function Intro({ data, onStart, onExit }) {
  if (!data) return null;
  const words = data.newWords || [];
  return (
    <motion.div
      className="lesson-intro"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="lesson-intro-top">
        <Chip tone={data.isCheckpoint ? 'amber' : 'blue'} icon={data.isCheckpoint ? Star : Sparkles}>
          {data.isCheckpoint ? 'Ünite checkpoint' : `Ünite ${data.unitNumber} · ${data.title}`}
        </Chip>
        <span className="lesson-intro-time"><Timer size={15} /> {data.minutes} dakika</span>
      </div>
      <h1>{data.isCheckpoint ? data.title : data.title}</h1>
      <p className="lesson-intro-sub">{data.isCheckpoint ? `${words.length} kelimeyi karışık egzersizlerle sına. %80 ile checkpoint’i geç.` : data.subtitle}</p>

      <div className="lesson-intro-grid">
        <section className="lesson-words-panel">
          <div className="intro-section-head">
            <div>
              <span className="card-eyebrow">{data.isCheckpoint ? 'Tekrar edilecekler' : 'Bu blokta'}</span>
              <h2>{data.isCheckpoint ? `${words.length} kelime` : `${words.length} yeni kelime`}</h2>
            </div>
            <Badge tone="soft">FSRS-7</Badge>
          </div>
          <div className={`intro-word-list ${data.isCheckpoint ? 'is-checkpoint' : ''}`}>
            {words.slice(0, data.isCheckpoint ? 18 : 8).map((word) => (
              <div className="intro-word" key={word.id}>
                <div className="intro-word-main">
                  <ArticleDot gender={word.gender} />
                  <div>
                    <GermanWord de={word.de} />
                    <span>{word.tr}</span>
                  </div>
                </div>
                <AudioButton text={word.de} size="sm" variant="bare" />
              </div>
            ))}
          </div>
          <p className="intro-word-note">
            <Lightbulb size={14} /> Kelimeleri şimdi ezberlemek zorunda değilsin; blok içinde tanıyacaksın.
          </p>
        </section>

        <section className="lesson-grammar-panel">
          <div className="intro-section-head">
            <div>
              <span className="card-eyebrow">Dil bilgisi</span>
              <h2>{data.grammar?.title || 'Küçük bir not'}</h2>
            </div>
            <span className="grammar-mark">DE</span>
          </div>
          <p>{data.grammar?.body}</p>
          {data.grammar?.examples?.length ? (
            <ul className="grammar-examples">
              {data.grammar.examples.map((ex) => {
                const [de, tr] = ex.split(' · ');
                return (
                  <li key={ex}>
                    <span>{de}</span>
                    <em>{tr}</em>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="grammar-tip">
            <Sparkles size={15} />
            <span>Bu blok {data.exercises?.length || 9} egzersizle kelimeleri aktif kullanıma taşır.</span>
          </div>
        </section>
      </div>

      <div className="lesson-intro-foot">
        <div className="intro-proof">
          <span><Check size={14} /> Kişisel egzersiz karışımı</span>
          <span><Check size={14} /> {data.passScore ? `%${Math.round(data.passScore * 100)} geçme` : '%60 geçme'}</span>
        </div>
        <Button size="lg" variant="primary" trailing={ArrowRight} onClick={onStart} icon={Play}>
          {data.progress?.completed ? 'Tekrar başlat' : data.isCheckpoint ? 'Checkpoint’e başla' : 'Bloğa başla'}
        </Button>
      </div>
    </motion.div>
  );
}

function Prompt({ item }) {
  const meta = TYPE_META[item.type] || TYPE_META.choice_tr_de;
  const Icon = meta.icon;
  const isGerman = ['choice_de_tr'].includes(item.type);
  const prompt = item.prompt || '';
  return (
    <div className="exercise-prompt-block">
      <div className="exercise-meta">
        <span className="exercise-type"><Icon size={14} /> {meta.label}</span>
        {item.type === 'type' ? <span className="exercise-hint"><Keyboard size={13} /> Türkçeden yaz</span> : null}
        {item.type === 'build' ? <span className="exercise-hint"><Lightbulb size={13} /> Kelimeleri sırala</span> : null}
      </div>
      <p className="exercise-instruction">{item.instruction}</p>
      <h2 className={`exercise-prompt ${isGerman ? 'is-german' : ''} ${item.type === 'listen' ? 'is-listen' : ''}`}>
        {item.type === 'listen' ? (
          <span className="listen-prompt">
            <AudioButton text={item.audioText} size="lg" variant="blue" />
            <span>Dinle ve seç</span>
          </span>
        ) : isGerman ? <GermanWord de={prompt} /> : (
          prompt.includes('___') ? (
            <>
              {prompt.split('___')[0]}<span className="blank-word">___</span>{prompt.split('___')[1]}
            </>
          ) : prompt
        )}
      </h2>
      {item.type === 'listen' ? (
        <p className="listen-hint"><Headphones size={14} /> İstersen tekrar dinleyebilirsin.</p>
      ) : null}
      {item.type === 'type' ? <p className="type-hint">Artikeli yazmasan da olur. Küçük/büyük harf önemli değil.</p> : null}
      {item.type === 'cloze' && item.translation ? <p className="cloze-translation">{item.translation}</p> : null}
    </div>
  );
}

function Options({ item, selected, checked, onSelect }) {
  return (
    <div className={`options-grid ${item.options?.some((o) => o.length > 22) ? 'is-wide' : ''}`}>
      {item.options?.map((option, i) => {
        const isCorrect = checked && normalizeAnswer(option) === normalizeAnswer(item.answer);
        const isWrong = checked && selected === option && !isCorrect;
        return (
          <button
            type="button"
            key={`${option}-${i}`}
            className={`option-card ${selected === option ? 'is-selected' : ''} ${isCorrect ? 'is-correct' : ''} ${isWrong ? 'is-wrong' : ''}`}
            onClick={() => { if (!checked) onSelect(option); }}
            disabled={checked}
          >
            <span className="option-letter">{String.fromCharCode(65 + i)}</span>
            <span>{option}</span>
            {isCorrect ? <Check className="option-icon" size={17} strokeWidth={3} /> : null}
            {isWrong ? <X className="option-icon" size={17} strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}

function TypeExercise({ item, value, setValue, checked, onSubmit }) {
  const inputRef = useRef(null);
  useEffect(() => { if (!checked) inputRef.current?.focus(); }, [item.id, checked]);
  function addChar(char) {
    setValue((v) => `${v}${char}`);
    inputRef.current?.focus();
  }
  return (
    <div className="type-exercise">
      <input
        ref={inputRef}
        type="text"
        className={`type-input ${checked ? 'is-checked' : ''}`}
        value={value}
        onChange={(e) => { if (!checked) setValue(e.target.value); }}
        placeholder="Almancasını yaz…"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={checked}
        onKeyDown={(e) => { if (e.key === 'Enter' && value.trim() && !checked) onSubmit(); }}
        aria-label={item.instruction}
      />
      <div className="special-chars" aria-label="Almanca özel karakterler">
        {SPECIAL_CHARS.map((c) => (
          <button type="button" key={c} onClick={() => addChar(c)} disabled={checked}>{c}</button>
        ))}
      </div>
      <p className="type-answer-note">
        {item.hint ? <>İpucu: <strong>{item.hint}</strong></> : null}
      </p>
    </div>
  );
}

function BuildExercise({ item, placed, setPlaced, checked, onSubmit }) {
  const available = item.tokens || [];
  const placedIds = new Set(placed.map((t) => t.uid));
  function addToken(token) {
    if (checked) return;
    setPlaced((p) => [...p, token]);
  }
  function removeToken(token) {
    if (checked) return;
    setPlaced((p) => p.filter((t) => t.uid !== token.uid));
  }
  const getUid = (token, i) => `${token}-${i}`;
  return (
    <div className="build-exercise">
      <div className={`build-answer ${checked ? 'is-checked' : ''}`} aria-label="Cümle alanı">
        {placed.length === 0 ? <span className="build-placeholder">Kelimelere dokunarak cümleyi kur…</span> : null}
        {placed.map((t) => (
          <button type="button" key={t.uid} className="token placed" onClick={() => removeToken(t)} disabled={checked}>
            {t.token}
          </button>
        ))}
      </div>
      <div className="build-bank">
        {available.map((token, i) => {
          const uid = getUid(token, i);
          const used = placedIds.has(uid);
          return (
            <button
              type="button"
              key={uid}
              className={`token ${used ? 'is-used' : ''}`}
              onClick={() => addToken({ token, uid })}
              disabled={used || checked}
            >
              {token}
            </button>
          );
        })}
      </div>
      {!checked ? (
        <button type="button" className="check-inline" onClick={onSubmit} disabled={placed.length !== available.length}>
          Cümleyi kontrol et <ArrowRight size={15} />
        </button>
      ) : null}
    </div>
  );
}

function MatchExercise({ item, onComplete }) {
  const [left, setLeft] = useState([]);
  const [right, setRight] = useState([]);
  const [selected, setSelected] = useState(null);
  const [matched, setMatched] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState(null);
  const doneRef = useRef(false);

  useEffect(() => {
    setLeft([...(item.pairs || [])].sort((a, b) => a.de.localeCompare(b.de, 'de')));
    setRight([...(item.pairs || [])].sort((a, b) => a.tr.localeCompare(b.tr, 'tr')));
    setSelected(null);
    setMatched([]);
    setMistakes(0);
    setWrong(null);
    doneRef.current = false;
  }, [item.id]);

  useEffect(() => {
    if (doneRef.current) return;
    if (matched.length && matched.length === (item.pairs?.length || 0)) {
      doneRef.current = true;
      const t = setTimeout(() => onComplete(mistakes), 520);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [matched.length, item.pairs?.length, mistakes, onComplete]);

  function choose(side, pair) {
    if (matched.includes(pair.vocabId)) return;
    if (!selected || selected.side === side) {
      setSelected({ side, pair });
      return;
    }
    const first = selected.pair;
    const samePair = first.vocabId === pair.vocabId;
    if (samePair) {
      setMatched((m) => [...m, pair.vocabId]);
      setSelected(null);
      playCorrect();
      haptic(6);
    } else {
      setMistakes((m) => m + 1);
      setWrong({ a: first.vocabId, b: pair.vocabId, side });
      playIncorrect();
      setTimeout(() => { setWrong(null); setSelected(null); }, 520);
    }
  }

  return (
    <div className="match-exercise">
      <div className="match-head"><span>Almanca</span><span>Türkçe</span></div>
      <div className="match-grid">
        <div className="match-col">
          {left.map((pair) => (
            <button
              type="button"
              key={pair.de}
              className={`match-tile ${matched.includes(pair.vocabId) ? 'is-matched' : ''} ${selected?.pair?.vocabId === pair.vocabId && selected.side === 'de' ? 'is-selected' : ''} ${wrong?.a === pair.vocabId || (wrong?.b === pair.vocabId && wrong.side === 'de') ? 'is-wrong' : ''}`}
              onClick={() => choose('de', pair)}
              disabled={matched.includes(pair.vocabId)}
            >
              {pair.de}
              {matched.includes(pair.vocabId) ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
        <div className="match-col">
          {right.map((pair) => (
            <button
              type="button"
              key={pair.tr}
              className={`match-tile ${matched.includes(pair.vocabId) ? 'is-matched' : ''} ${selected?.pair?.vocabId === pair.vocabId && selected.side === 'tr' ? 'is-selected' : ''} ${wrong?.a === pair.vocabId || (wrong?.b === pair.vocabId && wrong.side === 'tr') ? 'is-wrong' : ''}`}
              onClick={() => choose('tr', pair)}
              disabled={matched.includes(pair.vocabId)}
            >
              {pair.tr}
              {matched.includes(pair.vocabId) ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      </div>
      <p className="match-progress">
        <span>{matched.length}/{item.pairs?.length || 4} eşleşme</span>
        {mistakes > 0 ? <span className="match-mistakes">{mistakes} hata</span> : null}
      </p>
    </div>
  );
}

function Feedback({ correct, item, selected, matchMistakes }) {
  return (
    <div className={`lesson-feedback ${correct ? 'is-correct' : 'is-wrong'}`}>
      <div className="feedback-icon">{correct ? <Check size={22} strokeWidth={3} /> : <XCircle size={22} />}</div>
      <div className="feedback-copy">
        <strong>{correct ? 'Doğru.' : 'Neredeyse.'}</strong>
        {correct ? (
          <p>{item.type === 'match' ? `${item.pairs?.length || 4} eşleşme tamam${matchMistakes ? ` · ${matchMistakes} hata` : ''}.` : item.explain || item.answer}</p>
        ) : item.type === 'match' ? (
          <p>Eşleşmelerde {matchMistakes} hata yaptın. Bir sonraki tekrarda bu kelimeler öne çıkacak.</p>
        ) : (
          <p>Doğru cevap: <b>{item.answer}</b>{item.explain ? ` · ${item.explain}` : ''}</p>
        )}
      </div>
    </div>
  );
}

function Summary({ result, data, onNext, onRetry, onPath, failed }) {
  const score = result?.score ?? Math.round((result?.correct / Math.max(1, result?.total)) * 100);
  return (
    <motion.div
      className={`lesson-summary ${failed ? 'is-failed' : ''}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {!failed ? (
        <div className="summary-confetti" aria-hidden>
          {Array.from({ length: 22 }, (_, i) => (
            <i key={i} style={{
              left: `${8 + (i * 37) % 84}%`,
              animationDelay: `${(i % 7) * 0.08}s`,
              background: ['#8fb4ff', '#1a56db', '#0b1118', '#c7d0dc'][i % 4],
            }} />
          ))}
        </div>
      ) : null}
      <div className="summary-mark">
        {failed ? <XCircle size={38} /> : <Check size={40} strokeWidth={3} />}
      </div>
      <span className="summary-eyebrow">{failed ? 'Checkpoint tamamlanmadı' : 'Blok tamamlandı'}</span>
      <h1>{failed ? 'Bir tur daha.' : 'Güzel iş.'}</h1>
      <p className="summary-sub">
        {failed
          ? 'Checkpoint %80 doğruluk istiyor. Kelimelere dönüp yeniden deneyebilirsin.'
          : result?.message || 'Kelimeler hafızana işlendi. FSRS-7 bir sonraki buluşmayı planladı.'}
      </p>

      <div className="summary-stats">
        <div><span>Doğruluk</span><strong>%{score}</strong></div>
        <div><span>Kazanılan XP</span><strong>+{result?.xp ?? 0}</strong></div>
        <div><span>Yeni kelime</span><strong>{result?.newWords ?? 0}</strong></div>
        <div><span>Seri</span><strong>{result?.streak ?? 0} gün</strong></div>
      </div>

      <div className="summary-word-strip">
        {(data?.newWords || []).slice(0, 5).map((w) => (
          <span key={w.id}><ArticleDot gender={w.gender} /> {w.de}</span>
        ))}
      </div>

      <div className="summary-actions">
        {failed ? (
          <>
            <Button variant="white" size="lg" onClick={onRetry} icon={Play}>Tekrar dene</Button>
            <Button variant="ghost-light" size="lg" onClick={onPath}>Yola dön</Button>
          </>
        ) : (
          <>
            {result?.nextLesson ? (
              <Button variant="white" size="lg" trailing={ArrowRight} onClick={onNext}>
                Sıradaki blok
              </Button>
            ) : (
              <Button variant="white" size="lg" onClick={onPath} trailing={ArrowRight}>Yola dön</Button>
            )}
            <Button variant="ghost-light" size="lg" onClick={onPath}>Yola dön</Button>
          </>
        )}
      </div>
      <p className="summary-foot">
        <Sparkles size={14} /> {failed ? 'Hatalar da öğrenme sinyalidir.' : 'Yarın kısa bir tekrar seni bekliyor.'}
      </p>
    </motion.div>
  );
}

function LeaveDialog({ onCancel, onConfirm }) {
  return (
    <motion.div className="leave-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className="leave-backdrop" onClick={onCancel} aria-label="Kapat" tabIndex={-1} />
      <motion.div className="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title" initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }}>
        <span className="leave-icon"><ArrowLeft size={20} /></span>
        <h2 id="leave-title">Şimdi çıkıyor musun?</h2>
        <p>Bu bloktaki cevaplar kaydedilmedi. Daha sonra kaldığın yerden devam edebilirsin.</p>
        <div className="leave-actions">
          <Button variant="soft" onClick={onCancel}>Devam et</Button>
          <Button variant="danger" onClick={onConfirm}>Çık</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Lesson({ lessonId }) {
  const { user, refresh, showToast, settingsOpen } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('question');
  const [selected, setSelected] = useState(null);
  const [typed, setTyped] = useState('');
  const [placed, setPlaced] = useState([]);
  const [results, setResults] = useState([]);
  const [matchMistakes, setMatchMistakes] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [failed, setFailed] = useState(false);
  const startedAtRef = useRef(null);
  const itemAtRef = useRef(Date.now());
  const feedbackRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.lesson(user.id, lessonId);
      setData(d);
      setIndex(0);
      setResults([]);
      setPhase('question');
      setStarted(false);
      setSummary(null);
      setFailed(false);
      setSelected(null);
      setTyped('');
      setPlaced([]);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user.id, lessonId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (phase === 'checked') feedbackRef.current?.focus?.();
  }, [phase]);

  const item = data?.exercises?.[index];

  useEffect(() => {
    itemAtRef.current = Date.now();
    setSelected(null);
    setTyped('');
    setPlaced([]);
    setMatchMistakes(0);
  }, [index, started]);

  const canCheck = useMemo(() => {
    if (!item) return false;
    if (item.type === 'match') return false;
    if (item.type === 'type') return typed.trim().length > 0;
    if (item.type === 'build') return placed.length === (item.tokens?.length || 0);
    return Boolean(selected);
  }, [item, typed, placed, selected]);

  function start() {
    setStarted(true);
    startedAtRef.current = Date.now();
    itemAtRef.current = Date.now();
  }

  function pickOption(option) {
    if (phase !== 'question') return;
    setSelected(option);
  }

  function evaluate() {
    if (!item || phase !== 'question' || !canCheck) return;
    let correct = false;
    if (item.type === 'type') correct = answersMatch(typed, item.answer, item.accepted);
    else if (item.type === 'build') correct = normalizeAnswer(placed.map((t) => t.token).join(' ')) === normalizeAnswer(item.answer);
    else correct = normalizeAnswer(selected) === normalizeAnswer(item.answer);
    const result = {
      itemId: item.id,
      type: item.type,
      vocabId: item.vocabId || null,
      correct,
      latencyMs: Math.max(300, Date.now() - itemAtRef.current),
      answer: item.answer,
    };
    setResults((prev) => [...prev, result]);
    setPhase('checked');
    if (correct) { playCorrect(); haptic(8); } else { playIncorrect(); haptic([20, 40, 20]); }
  }

  function completeMatch(mistakes) {
    const correct = mistakes <= 1;
    setMatchMistakes(mistakes);
    setResults((prev) => [...prev, {
      itemId: item.id,
      type: 'match',
      vocabId: null,
      correct,
      latencyMs: Math.max(300, Date.now() - itemAtRef.current),
    }]);
    setPhase('checked');
    if (correct) playCorrect(); else playIncorrect();
    haptic(8);
  }

  async function finish(allResults) {
    setSubmitting(true);
    const durationSec = Math.round((Date.now() - (startedAtRef.current || Date.now())) / 1000);
    try {
      const response = await api.completeLesson(user.id, lessonId, {
        answers: allResults.map((r) => ({
          itemId: r.itemId,
          type: r.type,
          vocabId: r.vocabId,
          correct: r.correct,
          latencyMs: r.latencyMs,
        })),
        durationSec,
      });
      setSummary(response);
      setFailed(!response.passed);
      playComplete();
      refresh().catch(() => {});
    } catch (err) {
      showToast(err.message || 'Ders kaydedilemedi.', 'error');
      const correct = allResults.filter((r) => r.correct).length;
      setSummary({
        passed: true, score: Math.round((correct / Math.max(1, allResults.length)) * 100),
        correct, total: allResults.length, xp: 0, newWords: data?.newWords?.length || 0, streak: user.streak,
        message: 'Sonuç yerel olarak tutuldu; bağlantı döndüğünde tekrar dene.',
      });
      setFailed(false);
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    if (phase !== 'checked') return;
    if (index + 1 >= (data?.exercises?.length || 0)) {
      finish(results);
      return;
    }
    setIndex((i) => i + 1);
    setPhase('question');
  }

  useEffect(() => {
    const onKey = (e) => {
      if (settingsOpen || leaveOpen || !started || summary) return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'Enter') {
        if (phase === 'checked') { e.preventDefault(); next(); }
        else if (canCheck) { e.preventDefault(); evaluate(); }
      }
      if (phase === 'question' && item?.options && /^[1-4]$/.test(e.key)) {
        const option = item.options[Number(e.key) - 1];
        if (option) { setSelected(option); haptic(4); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (item?.type !== 'listen' || !started || phase !== 'question' || user?.settings?.tts === false) {
      return undefined;
    }
    const t = setTimeout(() => { speakGerman(item.audioText); }, 520);
    return () => {
      clearTimeout(t);
      stopSpeaking();
    };
  }, [item?.id, started, phase, user?.settings?.tts]);

  if (loading) {
    return (
      <div className="lesson-shell">
        <div className="lesson-loading">
          <Skeleton width={48} height={48} radius={14} />
          <Skeleton width="50%" height={40} className="mt-6" />
          <Skeleton height={260} radius={28} className="mt-6" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lesson-shell">
        <div className="lesson-error">
          <span><XCircle size={26} /></span>
          <h1>Blok yüklenemedi.</h1>
          <p>{error.message}</p>
          <div>
            <Button variant="primary" onClick={load}>Tekrar dene</Button>
            <Button variant="soft" onClick={() => navigate('/path')}>Yola dön</Button>
          </div>
        </div>
      </div>
    );
  }

  if (summary) {
    return (
      <div className={`lesson-shell summary-shell ${failed ? 'is-failed' : ''}`}>
        <div className="lesson-summary-wrap">
          <Summary
            result={summary}
            data={data}
            failed={failed}
            onNext={() => {
              const nextId = summary?.nextLesson?.id;
              if (nextId) navigate(`/lesson/${nextId}`);
              else navigate('/path');
            }}
            onRetry={load}
            onPath={() => navigate('/path')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-shell">
      <AnimatePresence>
        {leaveOpen ? (
          <LeaveDialog onCancel={() => setLeaveOpen(false)} onConfirm={() => navigate('/path')} />
        ) : null}
      </AnimatePresence>
      <div className="lesson-frame">
        <TopBar data={data} index={index} total={data?.exercises?.length || 1} progress={started ? index : 0} onExit={() => setLeaveOpen(true)} />

        {!started ? (
          <Intro data={data} onStart={start} onExit={() => setLeaveOpen(true)} />
        ) : (
          <div className="lesson-session">
            <div className="lesson-session-head">
              <button type="button" className="lesson-back-inline" onClick={() => setLeaveOpen(true)} aria-label="Dersten çık">
                <X size={17} />
              </button>
              <span>{data?.isCheckpoint ? 'Checkpoint' : data?.title}</span>
              <span className="lesson-session-count">{index + 1} / {data?.exercises?.length}</span>
            </div>

            <AnimatePresence mode="wait">
              {submitting ? (
                <motion.div key="submitting" className="lesson-submitting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <span className="spinner-ring" />
                  <h2>Sonuçlar hafızana işleniyor…</h2>
                  <p>FSRS-7 bir sonraki tekrarı hesaplıyor.</p>
                </motion.div>
              ) : (
                <motion.div
                  className={`exercise-card${item?.type === 'match' ? ' is-match' : ''}`}
                  key={item?.id || 'item'}
                  initial={{ opacity: 0, x: 26 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="exercise-main">
                    {item ? <Prompt item={item} /> : null}
                    {item?.type === 'match' ? (
                      <MatchExercise item={item} onComplete={completeMatch} />
                    ) : null}
                    {item?.options ? (
                      <Options item={item} selected={selected} checked={phase === 'checked'} onSelect={pickOption} />
                    ) : null}
                    {item?.type === 'type' ? (
                      <TypeExercise item={item} value={typed} setValue={setTyped} checked={phase === 'checked'} onSubmit={evaluate} />
                    ) : null}
                    {item?.type === 'build' ? (
                      <BuildExercise item={item} placed={placed} setPlaced={setPlaced} checked={phase === 'checked'} onSubmit={evaluate} />
                    ) : null}
                  </div>

                  <div className="exercise-footer">
                    {phase === 'checked' ? (
                      <div className="feedback-row">
                        <Feedback
                          correct={results[results.length - 1]?.correct}
                          item={item}
                          selected={selected}
                          matchMistakes={matchMistakes}
                        />
                        <Button ref={feedbackRef} variant="primary" trailing={ArrowRight} onClick={next} autoFocus>
                          {index + 1 >= (data?.exercises?.length || 0) ? 'Sonuçları gör' : 'Devam'}
                        </Button>
                      </div>
                    ) : (
                      item?.type === 'match' ? (
                        <div className="check-row is-auto">
                          <span className="key-hint"><Sparkles size={13} /> Tüm eşleşmeler bitince sonucu görürsün.</span>
                        </div>
                      ) : (
                        <div className="check-row">
                          <span className="key-hint"><Keycap>Enter</Keycap> ile kontrol et</span>
                          <Button variant="primary" onClick={evaluate} disabled={!canCheck}>
                            Kontrol et
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, Brain, Check, ChevronRight, Clock3, Eye, Flame, Headphones,
  Layers3, Play, RotateCcw, Sparkles, Star, Target, Timer, X, XCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { navigate } from '../lib/router.js';
import { formatMinutes, formatShortDate, percent } from '../lib/format.js';
import { playComplete, playTap, haptic } from '../lib/sound.js';
import {
  ArticleDot, AudioButton, Badge, Button, Chip, EmptyState, GermanWord, Keycap,
  ProgressBar, Skeleton,
} from '../components/ui.jsx';
import { Brainprint } from '../components/BrainVisual.jsx';

const RATINGS = {
  1: { label: 'Tekrar', de: 'Again', tone: 'again', hint: 'Hatırlamadım' },
  2: { label: 'Zor', de: 'Hard', tone: 'hard', hint: 'Zor hatırladım' },
  3: { label: 'İyi', de: 'Good', tone: 'good', hint: 'Hatırladım' },
  4: { label: 'Kolay', de: 'Easy', tone: 'easy', hint: 'Hemen geldi' },
};

function stateLabel(state) {
  return state === 'mastered' ? 'ustalık' : state === 'review' ? 'tekrar' : 'öğrenme';
}

function ReviewHero({ data, onStart }) {
  const due = data?.dueCount || 0;
  const words = data?.queue?.slice(0, 3) || [];
  return (
    <section className={`review-hero ${due > 0 ? '' : 'is-empty'}`}>
      <div className="review-hero-copy">
        <Chip tone="on-dark" icon={Layers3}>{due > 0 ? 'Bugünün destesi' : 'Bugünlük temiz'}</Chip>
        <h1>{due > 0 ? `${due} kelime, tam doğru zamanda.` : 'Bugünlük tekrar yok.'}</h1>
        <p>
          {due > 0
            ? 'FSRS-7 bu kelimeleri hatırlama eğrisinin tam kırıldığı yerde önüne getirdi. Kısa bir oturum yeter.'
            : 'Beynin bugünkü tekrarları tamam. Yeni bir blok açabilir veya yarının dalgasını görebilirsin.'}
        </p>
        <div className="review-hero-actions">
          {due > 0 ? (
            <Button variant="lime" size="lg" trailing={ArrowRight} onClick={onStart}>
              {Math.min(due, 30)} kartı başlat
            </Button>
          ) : (
            <Button variant="lime" size="lg" trailing={ArrowRight} onClick={() => navigate('/path')}>
              Yola devam et
            </Button>
          )}
          <span className="review-hero-meta"><Clock3 size={15} /> ~{Math.max(2, Math.round(due * 0.25))} dk</span>
        </div>
      </div>
      <div className="review-deck" aria-hidden>
        <span className="deck-card deck-3" />
        <span className="deck-card deck-2" />
        {words[0] ? (
          <div className="deck-card deck-1">
            <span className="deck-state">{stateLabel(words[0].state)}</span>
            <ArticleDot gender={words[0].gender} />
            <GermanWord de={words[0].de} className="deck-word" />
            <span className="deck-tr">{words[0].tr}</span>
            <span className="deck-line" />
            <span className="deck-foot"><Layers3 size={13} /> {words[0].overdueHours} sa gecikmiş</span>
          </div>
        ) : (
          <div className="deck-card deck-1 deck-empty">
            <Check size={34} />
            <strong>Bugünlük bitti</strong>
            <span>Yarın yeni bir dalga geliyor.</span>
          </div>
        )}
        <span className="deck-badge"><Flame size={14} /> {data?.brain?.stats?.reviews || 0} tekrar</span>
      </div>
    </section>
  );
}

function DueList({ queue }) {
  return (
    <section className="panel due-list-panel">
      <div className="panel-head">
        <div>
          <span className="card-eyebrow">Deste</span>
          <h2>Bugünün kelimeleri</h2>
        </div>
        <Badge tone="soft">{queue.length} kart</Badge>
      </div>
      <div className="due-list">
        {queue.slice(0, 8).map((w) => (
          <div className="due-row" key={w.vocabId}>
            <span className="due-gender"><ArticleDot gender={w.gender} /></span>
            <div className="due-word">
              <GermanWord de={w.de} />
              <span>{w.tr}</span>
            </div>
            <div className="due-state">
              <span className={`state-pill ${w.state}`}>{stateLabel(w.state)}</span>
              <small>{w.overdueHours > 0 ? `${w.overdueHours} sa gecikmiş` : 'şimdi'}</small>
            </div>
            <AudioButton text={w.de} size="sm" variant="bare" />
          </div>
        ))}
        {queue.length > 8 ? (
          <div className="due-more">+{queue.length - 8} kelime daha bu destede</div>
        ) : null}
      </div>
    </section>
  );
}

function UpcomingPanel({ upcoming, retention = 0.93 }) {
  return (
    <section className="panel upcoming-panel">
      <div className="panel-head">
        <div>
          <span className="card-eyebrow">Takvim</span>
          <h2>Yaklaşan</h2>
        </div>
        <Clock3 size={17} />
      </div>
      {upcoming?.length ? (
        <div className="upcoming-list">
          {upcoming.map((w) => (
            <div className="upcoming-row" key={w.vocabId}>
              <span className="upcoming-date">{w.dueLabel}</span>
              <div>
                <strong>{w.de}</strong>
                <span>{w.tr}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-empty">Yaklaşan tekrar yok. Yeni kelimeler eklendikçe takvim dolacak.</p>
      )}
      <div className="upcoming-foot">
        <span><Target size={14} /> hedef %{Math.round(retention * 100)}</span>
        <button type="button" className="text-link" onClick={() => navigate('/progress')}>Tüm takvim <ArrowRight size={14} /></button>
      </div>
    </section>
  );
}

function WhyPanel({ brain }) {
  if (!brain) return null;
  return (
    <section className="panel why-panel">
      <div className="panel-head">
        <div>
          <span className="card-eyebrow">Neden bu kelimeler?</span>
          <h2>Hafıza sinyali</h2>
        </div>
        <span className="why-icon"><Brain size={18} /></span>
      </div>
      <div className="why-signal">
        <Brainprint values={brain.brainprint} tone="ink" height={58} />
        <span><i className="live-dot" /> %{brain.confidence} güven</span>
      </div>
      <p>
        Son 7 günün ağırlıklı doğruluğu <strong>%{brain.stats.retention}</strong>.
        Hedef hatırlama %{Math.round(brain.personalization.desiredRetention * 100)}.
        Kartlar bu hedefin altına düşmeden geliyor.
      </p>
      <button type="button" className="text-link" onClick={() => navigate('/brain')}>
        Beyin profilini aç <ArrowRight size={14} />
      </button>
    </section>
  );
}

export function Review() {
  const { user, showToast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.reviewQueue(user.id);
      setData(d);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [user.id, showToast]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="page review-page">
        <Skeleton width="30%" height={18} />
        <Skeleton width="55%" height={56} className="mt-3" />
        <Skeleton height={300} radius={28} className="mt-7" />
        <div className="review-columns mt-6"><Skeleton height={360} radius={24} /><Skeleton height={360} radius={24} /></div>
      </div>
    );
  }

  if (!data) return null;
  const due = data.dueCount || 0;
  const hasQueue = (data.queue?.length || 0) > 0;

  return (
    <div className="page review-page">
      <header className="page-head review-head">
        <div>
          <span className="page-kicker">FSRS-7 · Recency</span>
          <h1>Tekrar<span className="head-dot">.</span></h1>
          <p>Hatırlamanın tam sınırında. Ne erken ne geç.</p>
        </div>
        <div className="review-head-stats">
          <div><strong>{due}</strong><span>bugün</span></div>
          <div><strong>{data.queue?.[0]?.overdueHours || 0}<small>s</small></strong><span>en eski</span></div>
          <div><strong>%{data.brain?.stats?.retention || 0}</strong><span>hatırlama</span></div>
        </div>
      </header>

      <ReviewHero data={data} onStart={() => navigate('/review/session')} />

      <div className={`review-columns ${hasQueue ? '' : 'is-empty'}`}>
        {hasQueue ? <DueList queue={data.queue || []} /> : null}
        <div className="review-side">
          <UpcomingPanel upcoming={data.upcoming} retention={data.desiredRetention || data.brain?.personalization?.desiredRetention || 0.93} />
          <WhyPanel brain={data.brain} />
        </div>
      </div>
    </div>
  );
}

function SessionTop({ index, total, onExit }) {
  return (
    <div className="session-top">
      <button type="button" className="lesson-close" onClick={onExit} aria-label="Tekrardan çık"><X size={20} /></button>
      <div className="session-progress">
        {Array.from({ length: Math.min(total, 30) }, (_, i) => (
          <span key={i} className={i < index ? 'is-done' : i === index ? 'is-current' : ''} />
        ))}
      </div>
      <span className="session-count">{index + 1} <i>/</i> {total}</span>
    </div>
  );
}

function ReviewCard({ word, revealed, onReveal, onRate, busy }) {
  return (
    <motion.div
      className={`review-card ${revealed ? 'is-revealed' : ''}`}
      key={word.vocabId}
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.99 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="review-card-top">
        <div className="review-card-meta">
          <span className={`state-pill ${word.state}`}>{stateLabel(word.state)}</span>
          <span className="review-level">{word.level}</span>
        </div>
        <AudioButton text={word.de} size="md" variant="soft" label="Kelimeyi dinle" />
      </div>

      <div className="review-front">
        <ArticleDot gender={word.gender} />
        <h1 className="review-word"><GermanWord de={word.de} /></h1>
        {revealed ? <span className="review-tr">{word.tr}</span> : <span className="review-tr is-hidden" aria-label="Anlam gizli">•••</span>}
        <p className="review-prompt">{revealed ? 'Anlamını hatırladın mı?' : 'Anlamını hatırla, sonra çevir.'}</p>
      </div>

      <AnimatePresence>
        {revealed ? (
          <motion.div
            className="review-details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="review-example">
              <span className="example-label">Örnek</span>
              <p>{word.example}</p>
              <em>{word.exampleTr}</em>
            </div>
            {word.note ? <div className="review-note"><Sparkles size={15} /><span>{word.note}</span></div> : null}
            <div className="review-card-foot">
              <span><Layers3 size={14} /> {word.reps} tekrar</span>
              <span><Clock3 size={14} /> {word.overdueHours > 0 ? `${word.overdueHours} sa gecikmiş` : 'tam zamanında'}</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!revealed ? (
        <Button variant="primary" size="lg" onClick={onReveal} icon={Eye}>Cevabı göster</Button>
      ) : (
        <div className="rating-panel">
          <div className="rating-head">
            <span>Ne kadar kolay hatırladın?</span>
            <span className="rating-key-hint"><Keycap>1</Keycap>–<Keycap>4</Keycap></span>
          </div>
          <div className="rating-grid">
            {word.preview?.map((p) => {
              const meta = RATINGS[p.grade];
              return (
                <button
                  type="button"
                  key={p.grade}
                  className={`rating-btn rating-${meta.tone} ${p.grade === 3 ? 'is-recommended' : ''}`}
                  onClick={() => onRate(p.grade)}
                  disabled={busy}
                >
                  <span className="rating-key">{p.grade}</span>
                  <span className="rating-label">{meta.label}</span>
                  <span className="rating-interval">{p.label}</span>
                  {p.grade === 3 ? <span className="rating-rec">önerilen</span> : null}
                </button>
              );
            })}
          </div>
          <p className="rating-hint">İçgüdüsel cevap ver. Model her seçimi öğrenir.</p>
        </div>
      )}
    </motion.div>
  );
}

function SessionDone({ count, seconds, onDone, onReview }) {
  return (
    <motion.div className="session-done" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
      <div className="session-done-mark"><Check size={38} strokeWidth={3} /></div>
      <span className="summary-eyebrow">Tekrar tamam</span>
      <h1>Hafızan tazelendi.</h1>
      <p>FSRS-7 her kart için yeni bir buluşma planladı. Bir sonraki tekrar, tam unutmaya başladığın anda.</p>
      <div className="session-done-stats">
        <div><strong>{count}</strong><span>kart</span></div>
        <div><strong>{Math.max(1, Math.round(seconds / 60))}</strong><span>dakika</span></div>
        <div><strong>+{count * 3}</strong><span>XP</span></div>
      </div>
      <div className="session-done-actions">
        <Button variant="white" size="lg" onClick={onDone} trailing={ArrowRight}>Bugüne dön</Button>
        <Button variant="ghost-light" size="lg" onClick={onReview}>Yaklaşanları gör</Button>
      </div>
    </motion.div>
  );
}

export function ReviewSession() {
  const { user, refresh, showToast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [startedAt] = useState(Date.now());
  const [finishedAt, setFinishedAt] = useState(null);
  const [error, setError] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api.reviewQueue(user.id)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((err) => { if (alive) { setError(err); setLoading(false); } });
    return () => { alive = false; };
  }, [user.id]);

  const words = data?.queue || [];
  const word = words[index];

  const rate = useCallback(async (grade) => {
    if (!word || busy) return;
    setBusy(true);
    playTap();
    haptic(6);
    try {
      await api.submitReview(user.id, {
        vocabId: word.vocabId,
        grade,
        latencyMs: 1200 + Math.round(Math.random() * 2600),
        exerciseType: word.state === 'mastered' ? 'flashcard' : 'review',
      });
      if (index + 1 >= words.length) {
        setFinishedAt(Date.now());
        setDone(true);
        playComplete();
        refresh().catch(() => {});
      } else {
        setIndex((i) => i + 1);
        setRevealed(false);
      }
    } catch (err) {
      showToast(err.message || 'Tekrar kaydedilemedi.', 'error');
    } finally {
      setBusy(false);
    }
  }, [word, busy, user.id, revealed, startedAt, index, words.length, refresh, showToast]);

  useEffect(() => {
    const onKey = (e) => {
      if (done || busy || !word) return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (!revealed) setRevealed(true);
      }
      if (revealed && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        rate(Number(e.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, busy, word, revealed, rate]);

  if (loading) {
    return (
      <div className="review-shell">
        <div className="review-session-loading">
          <Skeleton width="100%" height={7} radius={99} />
          <Skeleton width="55%" height={52} className="mt-8" />
          <Skeleton height={440} radius={28} className="mt-8" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="review-shell">
        <div className="lesson-error">
          <span><XCircle size={26} /></span>
          <h1>Tekrar yüklenemedi.</h1>
          <p>{error.message}</p>
          <Button onClick={() => navigate('/review')}>Geri dön</Button>
        </div>
      </div>
    );
  }

  if (!words.length) {
    return (
      <div className="review-shell">
        <SessionTop index={0} total={0} onExit={() => navigate('/review')} />
        <div className="review-session-body">
          <EmptyState
            icon={Check}
            title="Bugünlük tekrar yok."
            body="Beynin bugünkü işini tamamladı. Yeni bir blokla kelime ekleyebilirsin."
            action={<Button onClick={() => navigate('/path')} trailing={ArrowRight}>Yola git</Button>}
          />
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="review-shell is-done">
        <div className="review-done-wrap">
          <SessionDone
            count={words.length}
            seconds={Math.max(1, ((finishedAt || Date.now()) - startedAt) / 1000)}
            onDone={() => navigate('/today')}
            onReview={() => navigate('/review')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="review-shell">
      <div className="review-session-frame">
        <SessionTop index={index} total={words.length} onExit={() => navigate('/review')} />
        <div className="review-session-body" ref={cardRef}>
          <div className="session-kicker">
            <span><Brain size={15} /> FSRS-7 tekrarı</span>
            <span>{word?.state === 'mastered' ? 'ustalık kartı' : 'aktif hatırlama'}</span>
          </div>
          <AnimatePresence mode="wait">
            <ReviewCard
              key={word.vocabId}
              word={word}
              revealed={revealed}
              onReveal={() => setRevealed(true)}
              onRate={rate}
              busy={busy}
            />
          </AnimatePresence>
        </div>
        <div className="review-session-footer">
          <span><Sparkles size={14} /> Doğru zaman, doğru kelime.</span>
          <span>{revealed ? '1–4 ile değerlendir' : 'Boşluk ile çevir'}</span>
        </div>
      </div>
    </div>
  );
}

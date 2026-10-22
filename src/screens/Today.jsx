import { motion } from 'framer-motion';
import {
  ArrowRight, BrainCircuit, ChevronRight, Clock3, Flame, Layers3,
  Play, Sparkles, Target, Timer, BookOpen, Check,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { navigate } from '../lib/router.js';
import { ALL_LESSONS, VOCAB_BY_ID } from '../../shared/content.js';
import { articleParts, formatMinutes, greeting, percent, todayLong } from '../lib/format.js';
import {
  ArticleDot, AudioButton, Button, Chip, EmptyState, GermanWord, ProgressBar, Skeleton,
} from '../components/ui.jsx';
import { Brainprint, GoalGauge, MetricBars } from '../components/BrainVisual.jsx';
import { ForecastBars, MinutesBars, VocabSplit } from '../components/charts.jsx';

function ContinueCard({ plan, path, nextWords, onStart }) {
  const lesson = plan?.lesson;
  const unit = path?.units?.find((u) => u.lessons?.some((l) => l.id === lesson?.id));
  const all = lesson ? ALL_LESSONS[lesson.id] : null;
  const fallbackIds = all?.vocab?.slice(0, 5) || [];
  const tiles = (nextWords?.length ? nextWords : fallbackIds.map((id) => VOCAB_BY_ID[id])).filter(Boolean).slice(0, 3);
  const progress = unit ? unit.progress : 0;

  if (!lesson) {
    return (
      <article className="continue-card is-done">
        <div className="continue-head">
          <Chip tone="on-dark" icon={Check}>A1 yolu tamam</Chip>
        </div>
        <h2>Bütün bloklar cebinde.</h2>
        <p>Şimdi tekrar ve ustalık zamanı. Beyin modeli kelimelerini canlı tutmaya devam ediyor.</p>
        <Button variant="lime" trailing={ArrowRight} onClick={() => navigate('/review')}>Tekrarlara git</Button>
      </article>
    );
  }

  return (
    <article className="continue-card">
      <div className="continue-glow" aria-hidden />
      <div className="continue-head">
        <Chip tone="on-dark" icon={Sparkles}>
          {lesson.isCheckpoint ? 'Checkpoint zamanı' : 'Sıradaki blok'}
        </Chip>
        <span className="continue-unit">Ünite {String(lesson.unitNumber || unit?.number || 1).padStart(2, '0')}</span>
      </div>

      <div className="continue-copy">
        <div className="continue-kicker">
          <span>{lesson.unitTitle || unit?.title}</span>
          <i />
          <span>{lesson.isCheckpoint ? 'tekrar' : `${lesson.newWords || all?.vocab?.length || 0} yeni kelime`}</span>
        </div>
        <h2>{lesson.title}</h2>
        <p>{lesson.isCheckpoint ? 'Ünitenin tamamını karışık egzersizlerle sına.' : lesson.subtitle}</p>
      </div>

      <div className="continue-words" aria-hidden>
        {tiles.map((word, i) => {
          const { article, noun } = articleParts(word.de);
          return (
            <span className={`continue-word cw-${i + 1}`} key={word.id}>
              <span className={`cw-article ${article === 'der' ? 'der' : article === 'die' ? 'die' : article === 'das' ? 'das' : 'verb'}`}>
                {article || '·'}
              </span>
              <strong>{article ? noun : word.de}</strong>
              <small>{word.tr}</small>
            </span>
          );
        })}
      </div>

      <div className="continue-foot">
        <div className="continue-meta">
          <span><Timer size={15} /> {lesson.minutes || 7} dk</span>
          {unit ? <span className="continue-progress"><i style={{ '--p': `${progress * 100}%` }} /> {unit.completedCount}/{unit.totalCount}</span> : null}
        </div>
        <Button variant="lime" trailing={ArrowRight} onClick={onStart}>
          {lesson.isCheckpoint ? 'Sınava gir' : 'Devam et'}
        </Button>
      </div>
    </article>
  );
}

function GoalCard({ today, plan, onPlan }) {
  const minutes = today?.minutes || 0;
  const goal = today?.goalMinutes || 15;
  const newWords = plan?.newWords || 0;
  return (
    <article className="goal-card">
      <div className="card-head">
        <div>
          <span className="card-eyebrow">Bugünkü hedef</span>
          <h3>Küçük bir adım.</h3>
        </div>
        <Chip tone="lime" icon={Target}>%{today?.percent || 0}</Chip>
      </div>
      <div className="goal-visual">
        <GoalGauge minutes={minutes} goal={goal} size={166} />
        <div className="goal-copy">
          <strong>{minutes < goal ? `${Math.round((goal - minutes) * 10) / 10} dk kaldı` : 'Hedef tamam'}</strong>
          <p>{minutes < goal ? 'Bugünün ritmini yakaladın. Kısa bir oturum yeter.' : 'Bugünkü hedefi tamamladın. İstersen bir blok daha.'}</p>
        </div>
      </div>
      <div className="goal-plan">
        <div>
          <span><Layers3 size={15} /> Tekrar</span>
          <strong>{plan?.dueReviews || 0}</strong>
        </div>
        <div>
          <span><BookOpen size={15} /> Yeni</span>
          <strong>{newWords}</strong>
        </div>
        <div>
          <span><Clock3 size={15} /> Süre</span>
          <strong>~{plan?.minutes || 0} dk</strong>
        </div>
      </div>
      <Button variant="primary" full trailing={ArrowRight} onClick={onPlan}>
        {plan?.dueReviews > 0 ? 'Bugünün planını başlat' : 'İlk bloğa başla'}
      </Button>
    </article>
  );
}

function BrainSignalCard({ brain }) {
  if (!brain) return null;
  return (
    <article className="brain-signal-card">
      <div className="brain-signal-head">
        <div>
          <span className="card-eyebrow">Beyin sinyali</span>
          <h3>{brain.profileLabel}</h3>
        </div>
        <button type="button" className="text-link dark" onClick={() => navigate('/brain')}>
          Profili aç <ArrowRight size={14} />
        </button>
      </div>
      <p className="brain-signal-tagline">{brain.tagline}</p>
      <div className="brain-signal-visual">
        <Brainprint values={brain.brainprint} tone="ink" height={76} />
        <div className="brain-signal-side">
          <span><i className="live-dot" /> {brain.evidence} cevap</span>
          <strong>%{brain.confidence}</strong>
          <small>kalibrasyon güveni</small>
        </div>
      </div>
      <MetricBars metrics={brain.metrics} compact />
      <div className="brain-signal-foot">
        <span><Target size={14} /> %{Math.round(brain.personalization.desiredRetention * 100)} hedef hatırlama</span>
        <span><Sparkles size={14} /> {brain.personalization.newWordsPerDay} yeni kelime / gün</span>
      </div>
    </article>
  );
}

function WeekCard({ stats, week, minutes, goal = 15 }) {
  const active = week?.filter((d) => d.minutes > 0).length || 0;
  return (
    <article className="week-card">
      <div className="card-head">
        <div>
          <span className="card-eyebrow">Bu hafta</span>
          <h3>{formatMinutes(minutes)}</h3>
        </div>
        <Chip tone="amber" icon={Flame}>{stats?.streak || 0} gün</Chip>
      </div>
      <MinutesBars data={week || []} goal={goal} height={118} />
      <div className="week-foot">
        <div>
          <strong>{active}/7</strong>
          <span>aktif gün</span>
        </div>
        <div>
          <strong>{stats?.bestStreak || 0}</strong>
          <span>en iyi seri</span>
        </div>
        <div>
          <strong>%{stats?.retention ?? 0}</strong>
          <span>hatırlama</span>
        </div>
      </div>
    </article>
  );
}

function VocabCard({ vocab, stats }) {
  return (
    <article className="vocab-card">
      <div className="card-head">
        <div>
          <span className="card-eyebrow">Kelime hazinesi</span>
          <h3><span className="big-number">{vocab?.seen || 0}</span> kelime</h3>
        </div>
        <button type="button" className="text-link" onClick={() => navigate('/progress')}>
          Gelişim <ArrowRight size={14} />
        </button>
      </div>
      <p className="vocab-sub">
        {vocab?.new || 0} kelime daha seni bekliyor. Öğrendiklerinin
        <strong> %{vocab?.masteryPct || 0}</strong>’i ustalıkta.
      </p>
      <VocabSplit vocab={vocab || { total: 224, new: 224, learning: 0, review: 0, mastered: 0 }} />
      <div className="vocab-foot-row">
        <span>{vocab?.total || 224} toplam kelime</span>
        <button type="button" className="text-link" onClick={() => navigate('/review')}>
          Tekrarlar <ChevronRight size={14} />
        </button>
      </div>
    </article>
  );
}

function ForecastCard({ forecast, due }) {
  const peak = forecast?.reduce((best, d) => (d.count > best.count ? d : best), forecast[0] || { count: 0, label: '—' });
  return (
    <article className="forecast-card">
      <div className="card-head">
        <div>
          <span className="card-eyebrow">Tekrar dalgası</span>
          <h3>{due || 0} kelime bugün</h3>
        </div>
        <Chip tone="blue" icon={Layers3}>FSRS-7</Chip>
      </div>
      <ForecastBars data={forecast || []} height={142} />
      <div className="forecast-foot">
        <span>En yoğun gün: <strong>{peak?.label}</strong></span>
        <Button size="sm" variant="soft" onClick={() => navigate(due > 0 ? '/review/session' : '/review')}>
          {due > 0 ? 'Tekrara başla' : 'Tekrarları gör'}
        </Button>
      </div>
    </article>
  );
}

function NextWords({ words }) {
  if (!words?.length) return null;
  return (
    <section className="next-words-strip">
      <div className="next-words-head">
        <div>
          <span className="card-eyebrow">Sıradaki bloktan</span>
          <h3>Yeni kelimeler</h3>
        </div>
        <button type="button" className="text-link" onClick={() => navigate('/path')}>Yolu gör <ArrowRight size={14} /></button>
      </div>
      <div className="next-words-row">
        {words.map((w) => (
          <div className="next-word" key={w.id}>
            <div className="next-word-main">
              <ArticleDot gender={w.gender} />
              <div>
                <GermanWord de={w.de} />
                <span>{w.tr}</span>
              </div>
            </div>
            <AudioButton text={w.de} size="sm" variant="bare" />
          </div>
        ))}
      </div>
    </section>
  );
}

function TodaySkeleton() {
  return (
    <div className="page today-page">
      <Skeleton width="40%" height={20} />
      <Skeleton width="55%" height={52} radius={14} className="mt-3" />
      <div className="today-hero-grid mt-8">
        <Skeleton height={340} radius={26} />
        <Skeleton height={340} radius={26} />
      </div>
      <div className="today-mid-grid">
        <Skeleton height={300} radius={26} />
        <Skeleton height={300} radius={26} />
      </div>
    </div>
  );
}

export default function Today() {
  const { user, dashboard, path, loading, refresh } = useApp();
  if (loading && !dashboard) return <TodaySkeleton />;
  if (!dashboard) return <TodaySkeleton />;

  const { today, stats, vocab, plan, week, forecast, nextWords, brain } = dashboard;
  const currentLesson = plan?.lesson;
  const due = plan?.dueReviews || 0;

  function startPlan() {
    if (currentLesson) navigate(`/lesson/${currentLesson.id}`);
    else if (due > 0) navigate('/review/session');
    else navigate('/path');
  }

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <div className="page today-page">
      <motion.header className="today-header" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <div>
          <span className="page-kicker">{todayLong()}</span>
          <h1>{greeting(user?.name || 'öğrenci')}<span className="head-dot">.</span></h1>
          <p>
            {due > 0 ? `Bugün ${due} kelime tekrarı ve ${plan?.newWords || 0} yeni kelime seni bekliyor.` : 'Bugünün planı hazır. Küçük bir başlangıç yeter.'}
          </p>
        </div>
        <div className="today-header-actions">
          <Chip tone="blue" icon={BrainCircuit} className="clickable-chip" onClick={() => navigate('/brain')}>
            {brain?.profileLabel || 'Profil'}
          </Chip>
          <Chip tone="amber" icon={Flame}>{stats?.streak || 0} gün seri</Chip>
        </div>
      </motion.header>

      <motion.div className="today-hero-grid" variants={container} initial="hidden" animate="show">
        <motion.div variants={item}>
          <ContinueCard plan={plan} path={path} nextWords={nextWords} onStart={startPlan} />
        </motion.div>
        <motion.div variants={item}>
          <GoalCard today={today} plan={plan} onPlan={startPlan} />
        </motion.div>
      </motion.div>

      <motion.div className="today-mid-grid" variants={container} initial="hidden" animate="show">
        <motion.div variants={item}><BrainSignalCard brain={brain} /></motion.div>
        <motion.div variants={item}><WeekCard stats={stats} week={week} minutes={stats?.weekMinutes || 0} goal={today.goalMinutes} /></motion.div>
      </motion.div>

      <motion.div className="today-bottom-grid" variants={container} initial="hidden" animate="show">
        <motion.div variants={item}><VocabCard vocab={vocab} stats={stats} /></motion.div>
        <motion.div variants={item}><ForecastCard forecast={forecast} due={due} /></motion.div>
      </motion.div>

      <NextWords words={nextWords} />

      <footer className="today-footer">
        <span><i className="live-dot" /> FSRS-7 · 7 günlük recency katmanı</span>
        <span>Son güncelleme: {new Date(dashboard.generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
      </footer>
    </div>
  );
}

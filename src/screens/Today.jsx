import {
  ArrowRight, BookOpen, Check, Flame, Layers3, Sparkles, Timer,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { navigate } from '../lib/router.js';
import { ALL_LESSONS, VOCAB_BY_ID } from '../../shared/content.js';
import { articleParts, formatMinutes, greeting, todayLong } from '../lib/format.js';
import {
  AudioButton, Button, GermanWord, ProgressBar, Skeleton,
} from '../components/ui.jsx';
import { MinutesBars } from '../components/charts.jsx';

function FocusCard({ plan, path, nextWords, onStart }) {
  const lesson = plan?.lesson;
  const unit = path?.units?.find((u) => u.lessons?.some((l) => l.id === lesson?.id));
  const all = lesson ? ALL_LESSONS[lesson.id] : null;
  const fallbackIds = all?.vocab?.slice(0, 3) || [];
  const words = (nextWords?.length ? nextWords : fallbackIds.map((id) => VOCAB_BY_ID[id]))
    .filter(Boolean)
    .slice(0, 3);

  if (!lesson) {
    return (
      <section className="today-focus is-done">
        <div className="focus-head">
          <span className="focus-number">01</span>
          <span className="focus-label">A1 yolu tamamlandı</span>
        </div>
        <div className="focus-main">
          <div>
            <h2>Bütün bloklar cebinde.</h2>
            <p>Şimdi tekrar ve ustalık zamanı. Beyin modeli kelimelerini canlı tutmaya devam ediyor.</p>
          </div>
          <Button variant="white" size="lg" trailing={ArrowRight} onClick={() => navigate('/review')}>
            Tekrarlara git
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="today-focus">
      <div className="focus-head">
        <span className="focus-number">01</span>
        <span className="focus-label">
          {lesson.isCheckpoint ? 'Checkpoint' : 'Sıradaki blok'} · Ünite {String(lesson.unitNumber || unit?.number || 1).padStart(2, '0')}
        </span>
        <span className="focus-minutes"><Timer size={14} /> {lesson.minutes || 7} dk</span>
      </div>

      <div className="focus-main">
        <div className="focus-copy">
          <span className="focus-unit">{lesson.unitTitle || unit?.title}</span>
          <h2>{lesson.title}</h2>
          <p>{lesson.isCheckpoint ? 'Ünitenin tamamını karışık egzersizlerle sına.' : lesson.subtitle}</p>
          <div className="focus-meta">
            <span><BookOpen size={14} /> {plan?.newWords || all?.vocab?.length || 0} yeni kelime</span>
            {unit ? <span><Layers3 size={14} /> {unit.completedCount}/{unit.totalCount} blok</span> : null}
          </div>
        </div>

        <button type="button" className="focus-cta" onClick={onStart}>
          <span>{lesson.isCheckpoint ? 'Sınava gir' : 'Devam et'}</span>
          <ArrowRight size={19} />
        </button>
      </div>

      <div className="focus-words" aria-label="Sıradaki bloktan kelimeler">
        {words.map((word) => {
          const { article } = articleParts(word.de);
          return (
            <div className="focus-word" key={word.id}>
              {article ? <span className={`focus-article tone-${article}`}>{article}</span> : null}
              <GermanWord de={word.de} showArticle={false} className="focus-word-de" />
              <small>{word.tr}</small>
              <AudioButton text={word.de} size="sm" variant="bare" />
            </div>
          );
        })}
        {words.length === 0 ? <span className="focus-noun">{lesson.title}</span> : null}
      </div>
    </section>
  );
}

function OverviewPanel({ today, plan, stats, week }) {
  const minutes = today?.minutes || 0;
  const goal = today?.goalMinutes || 15;
  const percent = Math.min(100, Math.max(0, today?.percent || 0));
  const remaining = Math.max(0, Math.round((goal - minutes) * 10) / 10);
  const activeDays = week?.filter((d) => d.minutes > 0).length || 0;

  return (
    <section className="today-overview">
      <div className="overview-goal">
        <div className="panel-heading">
          <span className="panel-number">02</span>
          <div>
            <span className="panel-label">Günlük hedef</span>
            <h3>{minutes} <span className="goal-sep">/</span> <small>{goal} dk</small></h3>
          </div>
          <b className="panel-percent">%{percent}</b>
        </div>
        <ProgressBar value={percent} height={7} label="Günlük hedef" />
        <div className="goal-caption">
          <span>{remaining > 0 ? `${remaining} dk kaldı` : 'Hedef tamamlandı'}</span>
          <span>{plan?.dueReviews || 0} tekrar · {plan?.newWords || 0} yeni</span>
        </div>
      </div>

      <div className="overview-week">
        <div className="panel-heading">
          <span className="panel-number">03</span>
          <div>
            <span className="panel-label">Bu hafta</span>
            <h3>{formatMinutes(stats?.weekMinutes || 0).replace('dk', ' dk')}</h3>
          </div>
          <span className="week-streak"><Flame size={14} /> {stats?.streak || 0}</span>
        </div>
        <MinutesBars data={week || []} goal={goal} height={72} />
        <div className="week-caption">
          <span>{activeDays}/7 aktif gün</span>
          <span>%{stats?.retention ?? 0} hatırlama</span>
        </div>
      </div>
    </section>
  );
}

function ReviewBand({ due, onReview }) {
  if (!due) return null;
  return (
    <section className="today-review-band">
      <span className="review-band-icon"><Sparkles size={17} /></span>
      <div>
        <span>Tekrar zamanı</span>
        <strong>{due} kelime hazır</strong>
      </div>
      <Button variant="white" size="sm" trailing={ArrowRight} onClick={onReview}>
        Tekrara başla
      </Button>
    </section>
  );
}

function NextCue({ lesson }) {
  if (!lesson) return null;
  return (
    <p className="today-next-cue">
      <Check size={14} /> Bugünkü odak: {lesson.title.toLowerCase()} · kısa bir oturum yeter.
    </p>
  );
}

function TodaySkeleton() {
  return (
    <div className="page today-page">
      <Skeleton width="35%" height={14} />
      <Skeleton width="58%" height={38} radius={8} className="mt-3" />
      <Skeleton height={260} radius={14} className="mt-6" />
      <Skeleton height={210} radius={14} className="mt-4" />
    </div>
  );
}

export default function Today() {
  const { user, dashboard, path, loading } = useApp();
  if (loading && !dashboard) return <TodaySkeleton />;
  if (!dashboard) return <TodaySkeleton />;

  const { today, stats, plan, week } = dashboard;
  const lesson = plan?.lesson;
  const due = plan?.dueReviews || 0;

  function startPlan() {
    if (lesson) navigate(`/lesson/${lesson.id}`);
    else if (due > 0) navigate('/review/session');
    else navigate('/path');
  }

  return (
    <div className="page today-page">
      <header className="today-header">
        <span className="page-kicker">{todayLong()}</span>
        <h1>{greeting(user?.name || 'öğrenci')}</h1>
        <p>
          {due > 0
            ? `Bugün ${due} kelime tekrarı ve ${plan?.newWords || 0} yeni kelime var.`
            : 'Bugünün planı hazır. Kısa bir oturum yeter.'}
        </p>
      </header>

      <FocusCard plan={plan} path={path} nextWords={dashboard.nextWords} onStart={startPlan} />
      <OverviewPanel today={today} plan={plan} stats={stats} week={week} />
      <ReviewBand due={due} onReview={() => navigate('/review/session')} />
      <NextCue lesson={lesson} />

      <footer className="today-footer">
        <span><i className="live-dot" /> FSRS-7 · son 7 gün kalibrasyonu</span>
        <span>Son güncelleme: {new Date(dashboard.generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
      </footer>
    </div>
  );
}

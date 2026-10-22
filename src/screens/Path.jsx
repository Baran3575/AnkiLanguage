import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, Check, ChevronDown, ChevronRight, Lock, Map, Play, Sparkles, Star, Timer,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { navigate } from '../lib/router.js';
import { Button, Chip, ProgressBar, Skeleton } from '../components/ui.jsx';

function NodeIcon({ status, isCheckpoint }) {
  if (status === 'completed') return <Check size={26} strokeWidth={3} />;
  if (status === 'locked') return <Lock size={22} strokeWidth={2.2} />;
  if (isCheckpoint) return <Star size={25} strokeWidth={2.1} />;
  return <Play size={25} fill="currentColor" strokeWidth={0} />;
}

function PathNode({ lesson, index, unit, onOpen }) {
  const status = lesson.status;
  const isCheckpoint = lesson.isCheckpoint;
  const shiftClass = index % 2 === 0 ? 'node-left' : 'node-right';
  const labelSide = index % 2 === 0 ? 'label-right' : 'label-left';
  const unitColor = unit.colorMain || 'var(--blue)';
  const statusText = status === 'completed'
    ? `Tamamlandı${lesson.score ? ` · %${Math.round(lesson.score * 100)}` : ''}`
    : status === 'current'
      ? `Şimdi · ${lesson.minutes} dk`
      : 'Kilitli';
  return (
    <div className={`path-node-wrap ${shiftClass} ${labelSide} status-${status}`}>
      <button
        type="button"
        className={`path-node ${isCheckpoint ? 'is-checkpoint' : ''} ${status === 'current' ? 'is-current' : ''}`}
        style={{ '--unit-color': unitColor }}
        onClick={() => onOpen(lesson)}
        aria-label={`${lesson.title} — ${statusText}`}
        aria-disabled={status === 'locked'}
      >
        {status === 'current' ? <span className="node-halo" aria-hidden /> : null}
        <span className="node-core"><NodeIcon status={status} isCheckpoint={isCheckpoint} /></span>
        {isCheckpoint ? <span className="checkpoint-badge">S</span> : null}
      </button>
      <div className="path-node-label">
        <span className="path-node-index">
          {isCheckpoint ? 'Checkpoint' : `Blok ${String(index + 1).padStart(2, '0')}`}
        </span>
        <strong>{lesson.title}</strong>
        <span className="path-node-sub">{lesson.subtitle}</span>
        <span className={`path-node-status ${status}`}>
          {status === 'current' ? <Sparkles size={12} /> : null}
          {statusText}
        </span>
        {status === 'current' ? (
          <button type="button" className="path-node-cta" onClick={() => onOpen(lesson)}>
            {isCheckpoint ? 'Sınava gir' : 'Devam et'} <ArrowRight size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function UnitSection({ unit, onOpen, expanded, onToggle }) {
  const Icon = unit.status === 'locked' ? Lock : unit.status === 'completed' ? Check : Map;
  const panelId = `unit-panel-${unit.id}`;
  return (
    <motion.section
      className={`unit-section unit-${unit.color} status-${unit.status} ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      style={{
        '--unit-color': unit.colorMain || 'var(--blue)',
        '--unit-soft': unit.colorSoft || 'var(--blue-soft)',
      }}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="unit-header">
        <div className="unit-badge">
          <span>{unit.code || `U${unit.number}`}</span>
          <Icon size={14} />
        </div>
        <div className="unit-title-block">
          <div className="unit-title-top">
            <span>Ünite {String(unit.number).padStart(2, '0')} · {unit.level}</span>
            {unit.status === 'current' ? <Chip tone="lime" icon={Sparkles}>şimdi</Chip> : null}
            {unit.status === 'completed' ? <Chip tone="green" icon={Check}>tamam</Chip> : null}
            {unit.status === 'locked' ? <Chip tone="neutral" icon={Lock}>kilitli</Chip> : null}
          </div>
          <h2>{unit.title}</h2>
          <p>{unit.subtitle} · <span>{unit.canDo}</span></p>
        </div>
        <div className="unit-progress">
          <div className="unit-progress-top">
            <strong>{unit.completedCount}<span>/{unit.totalCount}</span></strong>
            <button
              type="button"
              className="unit-toggle"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={panelId}
            >
              {expanded ? 'Kapat' : 'Aç'}
              <ChevronDown size={13} aria-hidden />
            </button>
          </div>
          <ProgressBar value={unit.progress * 100} tone="blue" height={7} label={`${unit.title} ilerlemesi`} />
        </div>
      </header>

      {expanded ? (
        <div className="path-map" id={panelId}>
          <div className="path-rail" aria-hidden />
          {unit.lessons.map((lesson, i) => (
            <PathNode key={lesson.id} lesson={lesson} index={i} unit={unit} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="unit-collapsed-meta" id={panelId}>
          <span>{unit.lessons.filter((l) => l.status === 'completed').length}/{unit.lessons.length} blok tamam</span>
          <span>{unit.lessons.find((l) => l.status === 'current')?.title || (unit.status === 'locked' ? 'Checkpoint ile açılır' : 'Tüm bloklar tamam')}</span>
        </div>
      )}
    </motion.section>
  );
}

export default function Path() {
  const { path, user, dashboard, showToast } = useApp();
  const [level, setLevel] = useState(dashboard?.stats?.level || 'A1.1');
  const [hydrating, setHydrating] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState(() => new Set());

  useEffect(() => {
    if (dashboard?.stats?.level) setLevel(dashboard.stats.level);
  }, [dashboard?.stats?.level]);

  const levelInfo = path?.levels?.find((l) => l.id === level);
  const units = useMemo(() => (path?.units || []).filter((u) => u.level === level), [path, level]);
  const currentUnit = units.find((u) => u.status === 'current');

  useEffect(() => {
    const focus = units.find((u) => u.status === 'current') || units[0];
    if (focus) setExpandedUnits(new Set([focus.id]));
  }, [level, units.length]);

  function toggleUnit(unitId) {
    setExpandedUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  if (!path) {
    return (
      <div className="page path-page">
        <Skeleton width="35%" height={18} />
        <Skeleton width="50%" height={48} className="mt-3" />
        <Skeleton height={300} radius={26} className="mt-8" />
      </div>
    );
  }

  function openLesson(lesson) {
    if (lesson.status === 'locked') {
      showToast('Önce bu ünitenin checkpoint’ini tamamlaman gerekiyor.', 'default');
      return;
    }
    navigate(`/lesson/${lesson.id}`);
  }

  const overall = path.progress || 0;

  return (
    <div className="page path-page">
      <header className="path-header">
        <div>
          <span className="page-kicker">Türkçe → Almanca · A1</span>
          <h1>Yolun.</h1>
          <p>Her blok bir sonrakinin temeli. Checkpoint’ler üniteyi kilitler, kelimeler hafızanda kalır.</p>
        </div>
        <div className="path-overall">
          <div className="path-overall-top">
            <span>Toplam ilerleme</span>
            <strong>%{Math.round(overall * 100)}</strong>
          </div>
          <ProgressBar value={overall * 100} tone="lime" height={8} label="Toplam yol ilerlemesi" />
          <small>{path.totalDone} / {path.totalNodes} blok tamamlandı</small>
        </div>
      </header>

      <div className="level-switch">
        <div className="segmented level-tabs" role="tablist" aria-label="Seviye seç">
          {path.levels.map((l) => {
            const locked = l.id === 'A1.2' && (path.levels.find((x) => x.id === 'A1.1')?.progress || 0) < 0.8;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={level === l.id}
                key={l.id}
                className={`level-tab ${level === l.id ? 'is-active' : ''}`}
                onClick={() => setLevel(l.id)}
              >
                <span className="level-tab-id">{l.id}</span>
                <span className="level-tab-copy">
                  <strong>{l.title}</strong>
                  <small>{l.subtitle} · {l.completed}/{l.total}</small>
                </span>
                {locked ? <Lock size={14} /> : <ChevronRight size={15} />}
              </button>
            );
          })}
        </div>
        <div className="level-summary">
          <span className="level-pill">{levelInfo?.title}</span>
          <p>{levelInfo?.id === 'A1.1' ? 'Temelleri kur. Selamlaş, kendini tanıt, günlük hayatı anlat.' : 'Günlük hayata geç. Ev, iş, sağlık ve seyahat.'}</p>
        </div>
      </div>

      <div className="path-level-head">
        <div>
          <span className="page-kicker">{levelInfo?.progress ? `%${Math.round(levelInfo.progress * 100)} tamamlandı` : 'Yeni seviye'}</span>
          <h2>{levelInfo?.id === 'A1.1' ? 'İlk altı ünite' : 'Son altı ünite'}</h2>
        </div>
        <div className="path-level-stats">
          <span><strong>{levelInfo?.completed || 0}</strong> tamamlanan</span>
          <span><strong>{levelInfo?.total || 24}</strong> toplam blok</span>
          <span><strong>~{levelInfo?.id === 'A1.1' ? 112 : 112}</strong> kelime</span>
        </div>
      </div>

      {currentUnit ? (
        <div className="path-current-strip">
          <span className="confetti-mark"><Sparkles size={16} /></span>
          <p><strong>Şu an buradasın:</strong> Ünite {currentUnit.number} · {currentUnit.title}. {currentUnit.totalCount - currentUnit.completedCount} blok kaldı.</p>
          <Button size="sm" variant="dark" trailing={ArrowRight} onClick={() => {
            const current = currentUnit.lessons.find((l) => l.status === 'current');
            if (current) navigate(`/lesson/${current.id}`);
          }}>Devam et</Button>
        </div>
      ) : null}

      <div className="units">
        {units.map((unit) => (
          <div id={`unit-${unit.id}`} key={unit.id}>
            <UnitSection
              unit={unit}
              onOpen={openLesson}
              expanded={expandedUnits.has(unit.id)}
              onToggle={() => toggleUnit(unit.id)}
            />
          </div>
        ))}
      </div>

      <div className="path-end">
        <div className="path-end-mark"><Star size={22} /></div>
        <h3>{level === 'A1.1' ? 'A1.1 sonu görünüyor.' : 'A1.2 sonu.'}</h3>
        <p>
          {level === 'A1.1'
            ? 'Altı üniteyi bitirince A1.2’ye geçeceksin. Checkpoint’ler açılan kapıların anahtarı.'
            : 'Tüm yolu tamamladığında kelimelerin canlı kalmaya devam edecek. FSRS-7 tekrarları hiç durmaz.'}
        </p>
      </div>
    </div>
  );
}

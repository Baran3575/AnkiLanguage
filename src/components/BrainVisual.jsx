import { useMemo, useState } from 'react';
import { Flame, Target, Zap } from 'lucide-react';

const METRIC_META = [
  { key: 'pace', label: 'Tepki hızı', tone: 'blue' },
  { key: 'memory', label: 'Bellek', tone: 'green' },
  { key: 'accuracy', label: 'İsabet', tone: 'coral' },
  { key: 'consistency', label: 'Tutarlılık', tone: 'violet' },
  { key: 'listening', label: 'Dinleme', tone: 'amber' },
];

export function Brainprint({ values = [], tone = 'lime', height = 72, className = '' }) {
  const bars = values.length ? values : Array.from({ length: 22 }, () => 0.3);
  return (
    <svg
      className={`brainprint brainprint-${tone} ${className}`}
      viewBox="0 0 220 64"
      preserveAspectRatio="none"
      style={{ height }}
      role="img"
      aria-label="Öğrenci beyin imzası"
    >
      {bars.map((v, i) => {
        const h = Math.max(4, Math.round(v * 58));
        return (
          <rect
            key={i}
            x={i * 10 + 1}
            y={64 - h}
            width="6"
            height={h}
            rx="3"
            fill="currentColor"
            opacity={0.3 + (i % 4) * 0.16 + v * 0.18}
          />
        );
      })}
    </svg>
  );
}

export function MetricBars({ metrics = {}, compact = false, limit = 5 }) {
  return (
    <div className={`metric-bars ${compact ? 'is-compact' : ''}`}>
      {METRIC_META.slice(0, limit).map((m) => {
        const value = Math.round(metrics[m.key] || 0);
        return (
          <div className="metric-row" key={m.key}>
            <div className="metric-label">
              <span>{m.label}</span>
              <strong>{value}</strong>
            </div>
            <span className={`metric-track tone-${m.tone}`}>
              <span style={{ width: `${value}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function GoalGauge({ minutes = 0, goal = 15, size = 178 }) {
  const pct = Math.min(1, goal ? minutes / goal : 0);
  const radius = 62;
  const cx = 78;
  const cy = 78;
  const circumference = 2 * Math.PI * radius;
  const arc = 0.75;
  const filled = circumference * arc * pct;
  const remaining = circumference - filled;
  const ticks = 12;
  return (
    <div className="goal-gauge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 156 156" role="img" aria-label={`Günlük hedef: ${minutes} / ${goal} dakika`}>
        <circle
          cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" strokeWidth="12"
          strokeLinecap="round" className="gauge-track"
          strokeDasharray={`${circumference * arc} ${circumference}`}
          transform={`rotate(135 ${cx} ${cy})`}
        />
        <circle
          cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" strokeWidth="12"
          strokeLinecap="round" className="gauge-value"
          strokeDasharray={`${filled} ${remaining + circumference}`}
          transform={`rotate(135 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 700ms cubic-bezier(.22,1,.36,1)' }}
        />
        {Array.from({ length: ticks }, (_, i) => {
          const angle = (135 + (270 / (ticks - 1)) * i) * (Math.PI / 180);
          const active = i / (ticks - 1) <= pct;
          return (
            <line
              key={i}
              x1={cx + Math.cos(angle) * 72}
              y1={cy + Math.sin(angle) * 72}
              x2={cx + Math.cos(angle) * 76}
              y2={cy + Math.sin(angle) * 76}
              className={active ? 'gauge-tick is-on' : 'gauge-tick'}
              strokeWidth="2"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="gauge-center">
        <span className="gauge-big">{Number(minutes).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span>
        <span className="gauge-small">/ {goal} dk</span>
      </div>
    </div>
  );
}

export function MiniStreak({ streak = 0, best = 0, week = [] }) {
  return (
    <div className="mini-streak">
      <div className="streak-big">
        <Flame size={30} strokeWidth={1.8} />
        <strong>{streak}</strong>
        <span>günlük seri</span>
      </div>
      <div className="streak-week" aria-label="Son 7 gün">
        {week.map((day) => (
          <span key={day.day} className={`streak-day ${day.minutes > 0 ? 'is-on' : ''}`} title={`${day.label}: ${day.minutes} dk`}>
            <i style={{ height: `${Math.min(100, 22 + day.minutes * 4.5)}%` }} />
            <b>{day.label.slice(0, 1)}</b>
          </span>
        ))}
      </div>
      <p className="streak-note">En iyi serin <strong>{best} gün</strong>. Bugünü de sayarsak yeni bir eşik.</p>
    </div>
  );
}

export function LearningSignal({ brain }) {
  if (!brain) return null;
  return (
    <div className="learning-signal">
      <div className="signal-head">
        <span className="signal-live"><i /> canlı</span>
        <span>{brain.evidence} cevap · recency ağırlıklı</span>
      </div>
      <Brainprint values={brain.brainprint} height={64} />
      <div className="signal-foot">
        <span><Zap size={14} /> {brain.profileLabel}</span>
        <span><Target size={14} /> %{Math.round((1 - brain.personalization.desiredRetention) * 100)} unutma toleransı</span>
      </div>
    </div>
  );
}

export function ConfidenceRing({ value = 0, size = 34 }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span className="confidence-ring" style={{ width: size, height: size }} title={`Kalibrasyon güveni: %${value}`}>
      <svg viewBox="0 0 34 34">
        <circle cx="17" cy="17" r={r} fill="none" stroke="currentColor" strokeWidth="3" opacity=".15" />
        <circle
          cx="17" cy="17" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`} transform="rotate(-90 17 17)"
        />
      </svg>
      <b>{value}</b>
    </span>
  );
}

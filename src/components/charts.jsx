import { useMemo, useRef, useState } from 'react';

const COLORS = {
  learning: '#8a96a5',
  review: '#1a56db',
  mastered: '#0b1118',
  blue: '#1a56db',
  coral: '#0b1118',
  lime: '#8fb4ff',
};

function niceMax(value) {
  if (value <= 10) return 10;
  const step = value <= 50 ? 10 : value <= 100 ? 20 : 50;
  return Math.ceil(value / step) * step;
}

function curvePath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function VocabChart({ series = [], height = 230 }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const width = 760;
  const pad = { left: 38, right: 18, top: 16, bottom: 30 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const stacks = useMemo(() => series.map((d) => {
    const learning = d.learning || 0;
    const review = d.review || 0;
    const mastered = d.mastered || 0;
    return { learning, review, mastered, total: learning + review + mastered };
  }), [series]);

  const max = niceMax(Math.max(1, ...stacks.map((s) => s.total)));
  const n = Math.max(1, series.length - 1);
  const x = (i) => pad.left + (i / n) * innerW;
  const y = (v) => pad.top + innerH - (v / max) * innerH;

  const layers = useMemo(() => {
    const areaPath = (topValue, baseValue) => {
      const topPoints = stacks.map((s, i) => ({ x: x(i), y: y(topValue(s)) }));
      const bottomPoints = stacks.map((s, i) => ({ x: x(i), y: y(baseValue(s)) }));
      const reversed = [...bottomPoints].reverse();
      const tail = reversed.map((p) => `L ${p.x} ${p.y}`).join(' ');
      return `${curvePath(topPoints)} ${tail} Z`;
    };
    return [
      { key: 'learning', path: areaPath((s) => s.learning, () => 0), color: COLORS.learning },
      { key: 'review', path: areaPath((s) => s.learning + s.review, (s) => s.learning), color: COLORS.review },
      { key: 'mastered', path: areaPath((s) => s.total, (s) => s.learning + s.review), color: COLORS.mastered },
    ];
  }, [stacks, series.length]);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const labelIndexes = series.length > 4
    ? [0, Math.floor(n / 2), n]
    : series.map((_, i) => i);

  const onMove = (event) => {
    if (!wrapRef.current || !series.length) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const rel = ((event.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((rel - pad.left) / innerW) * n);
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  if (!series.length) {
    return <div className="chart-empty" style={{ height }}>Grafik için henüz veri yok.</div>;
  }

  const hovered = hover != null ? series[hover] : null;
  const hoverX = hover != null ? x(hover) : 0;
  const hoverStack = hover != null ? stacks[hover] : null;

  return (
    <div className="vocab-chart" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (touch) onMove({ clientX: touch.clientX });
        }}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (touch) onMove({ clientX: touch.clientX });
        }}
        role="img"
        aria-label="Kelime edinimi grafiği"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.left - 10} y={y(t) + 4} className="chart-axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {layers.map((layer) => (
          <path key={layer.key} d={layer.path} fill={layer.color} opacity=".86" />
        ))}
        {labelIndexes.map((i) => (
          <text key={i} x={x(i)} y={height - 6} className="chart-axis" textAnchor={i === 0 ? 'start' : i === n ? 'end' : 'middle'}>
            {series[i]?.label}
          </text>
        ))}
        {hovered ? (
          <g>
            <line x1={hoverX} x2={hoverX} y1={pad.top} y2={pad.top + innerH} className="chart-crosshair" />
            <circle cx={hoverX} cy={y(hoverStack.learning)} r="4" fill={COLORS.learning} stroke="#fff" strokeWidth="2" />
            <circle cx={hoverX} cy={y(hoverStack.learning + hoverStack.review)} r="4" fill={COLORS.review} stroke="#fff" strokeWidth="2" />
            <circle cx={hoverX} cy={y(hoverStack.total)} r="4" fill={COLORS.mastered} stroke="#fff" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {hovered ? (
        <div
          className="chart-tooltip"
          style={{ left: `${(hoverX / width) * 100}%`, top: 12 }}
        >
          <span>{hovered.label}</span>
          <strong>{hoverStack.total} kelime</strong>
          <small><i className="dot learning" /> {hoverStack.learning} öğrenme</small>
          <small><i className="dot review" /> {hoverStack.review} tekrar</small>
          <small><i className="dot mastered" /> {hoverStack.mastered} ustalık</small>
        </div>
      ) : null}
    </div>
  );
}

export function ChartLegend({ items = [] }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label}><i style={{ background: item.color }} /> {item.label}</span>
      ))}
    </div>
  );
}

export function ForecastBars({ data = [], height = 150 }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="forecast-bars" style={{ height }}>
      {data.map((d, i) => (
        <div className={`forecast-col ${i === 0 ? 'is-today' : ''}`} key={d.day} title={`${d.label}: ${d.count} tekrar`}>
          <span className="forecast-value">{d.count}</span>
          <div className="forecast-track">
            <span style={{ height: `${Math.max(3, (d.count / max) * 100)}%` }} />
          </div>
          <span className="forecast-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function MinutesBars({ data = [], goal = 15, height = 118 }) {
  const max = Math.max(goal, ...data.map((d) => d.minutes), 1);
  return (
    <div className="minutes-bars" style={{ height }}>
      <span className="goal-line" style={{ bottom: `${(goal / max) * 100}%` }}><i>hedef</i></span>
      {data.map((d, i) => (
        <div className={`minute-col ${i === data.length - 1 ? 'is-today' : ''}`} key={d.day} title={`${d.label}: ${d.minutes} dk`}>
          <span className="minute-track">
            <span style={{ height: `${Math.max(d.minutes ? 6 : 2, (d.minutes / max) * 100)}%` }} />
          </span>
          <span className="minute-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function AccuracyBars({ data = [], limit = 6 }) {
  const rows = data.filter((d) => d.total > 0).slice(0, limit);
  if (!rows.length) return <p className="chart-empty-inline">Egzersiz kırılımı için birkaç cevap gerekiyor.</p>;
  return (
    <div className="accuracy-bars">
      {rows.map((row) => {
        const accuracy = row.accuracy <= 1 ? Math.round(row.accuracy * 100) : Math.round(row.accuracy);
        return (
          <div className="accuracy-row" key={row.type}>
            <div className="accuracy-top">
              <span>{row.label}</span>
              <strong>{accuracy}%</strong>
            </div>
            <div className="accuracy-track">
              <span style={{ width: `${accuracy}%` }} className={accuracy >= 85 ? 'good' : accuracy >= 70 ? 'ok' : 'weak'} />
            </div>
            <small>{row.correct} / {row.total} doğru</small>
          </div>
        );
      })}
    </div>
  );
}

export function RetentionLine({ weeks = [], height = 180 }) {
  const width = 640;
  const pad = { left: 34, right: 16, top: 16, bottom: 26 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const valid = weeks.filter((w) => w.accuracy != null);
  const x = (i) => pad.left + (weeks.length > 1 ? (i / (weeks.length - 1)) * innerW : innerW / 2);
  const y = (v) => pad.top + innerH - ((Math.max(50, Math.min(100, v)) - 50) / 50) * innerH;
  const points = valid.map((w) => ({ x: x(weeks.indexOf(w)), y: y(w.accuracy) }));
  return (
    <div className="retention-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Haftalık hatırlama oranı">
        {[50, 65, 80, 90, 100].map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className={t === 90 ? 'chart-grid is-target' : 'chart-grid'} />
            <text x={pad.left - 8} y={y(t) + 4} className="chart-axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {points.length > 1 ? (
          <path d={curvePath(points)} fill="none" stroke={COLORS.mastered} strokeWidth="3" strokeLinecap="round" />
        ) : null}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4.5" fill={COLORS.mastered} stroke="#fff" strokeWidth="2" />
            <text x={p.x} y={p.y - 11} className="chart-point-label" textAnchor="middle">{valid[i].accuracy}%</text>
          </g>
        ))}
        {weeks.map((w, i) => (
          <text key={w.label} x={x(i)} y={height - 4} className="chart-axis" textAnchor={i === 0 ? 'start' : i === weeks.length - 1 ? 'end' : 'middle'}>
            {w.label}
          </text>
        ))}
      </svg>
      <span className="target-note">hedef %90</span>
    </div>
  );
}

export function Heatmap({ days = [] }) {
  const cells = useMemo(() => {
    if (!days.length) return [];
    const first = new Date(`${days[0].day}T12:00:00`);
    const pad = (first.getDay() + 6) % 7;
    const padded = [...Array.from({ length: pad }, () => null), ...days];
    const weeks = [];
    for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));
    return weeks;
  }, [days]);

  return (
    <div className="heatmap-wrap">
      <div className="heatmap">
        {cells.map((week, wi) => (
          <div className="heatmap-week" key={wi}>
            {Array.from({ length: 7 }, (_, di) => {
              const d = week[di];
              if (!d) return <span className="heat-cell is-empty" key={di} />;
              return (
                <span
                  className={`heat-cell level-${d.level}`}
                  key={d.day}
                  title={`${d.dateLabel}: ${d.minutes} dk`}
                  aria-label={`${d.dateLabel}: ${d.minutes} dakika`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="heat-legend">
        <span>az</span>
        {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`heat-cell level-${l}`} />)}
        <span>çok</span>
      </div>
    </div>
  );
}

export function VocabSplit({ vocab }) {
  const total = Math.max(1, vocab.total || 1);
  return (
    <div className="vocab-split">
      <span className="vocab-strip" aria-hidden>
        <i className="seg mastered" style={{ width: `${((vocab.mastered || 0) / total) * 100}%` }} />
        <i className="seg review" style={{ width: `${((vocab.review || 0) / total) * 100}%` }} />
        <i className="seg learning" style={{ width: `${((vocab.learning || 0) / total) * 100}%` }} />
      </span>
      <div className="vocab-split-legend">
        <span><i className="dot mastered" /> {vocab.mastered} ustalık</span>
        <span><i className="dot review" /> {vocab.review} tekrar</span>
        <span><i className="dot learning" /> {vocab.learning} öğrenme</span>
        <span><i className="dot new" /> {vocab.new} yeni</span>
      </div>
    </div>
  );
}

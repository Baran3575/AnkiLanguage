import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, Award, Brain, CalendarDays, Check, ChevronRight, Clock3,
  Flame, GraduationCap, Layers3, Sparkles, Target, TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { navigate } from '../lib/router.js';
import { formatMinutes, formatNumber, percent } from '../lib/format.js';
import { Button, Chip, ProgressBar, Segmented, Skeleton } from '../components/ui.jsx';
import {
  AccuracyBars, ChartLegend, ForecastBars, Heatmap, RetentionLine, VocabChart,
} from '../components/charts.jsx';

const RANGES = [
  { value: 7, label: '7G' },
  { value: 30, label: '30G' },
  { value: 90, label: '90G' },
];

function KPI({ label, value, sub, icon: Icon, tone = 'blue' }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span className="kpi-icon">{Icon ? <Icon size={17} strokeWidth={1.9} /> : null}</span>
      <div>
        <span className="kpi-label">{label}</span>
        <strong>{value}</strong>
        <small>{sub}</small>
      </div>
    </div>
  );
}

function VocabPanel({ data }) {
  const series = data.series || [];
  const first = series[0];
  const last = series[series.length - 1];
  const gain = Math.max(0, (last?.seen || 0) - (first?.seen || 0));
  return (
    <section className="panel vocab-panel">
      <div className="panel-head">
        <div>
          <span className="card-eyebrow">Kelime edinimi</span>
          <h2><span className="big-number">{data.vocab.seen}</span> kelime</h2>
        </div>
        <div className="panel-head-right">
          {gain > 0 ? <Chip tone="green" icon={TrendingUp}>+{gain} bu dönem</Chip> : null}
          <Chip tone="blue" icon={Layers3}>{data.vocab.mastered} ustalık</Chip>
        </div>
      </div>
      <div className="vocab-panel-summary">
        <p>
          {data.vocab.new} kelime daha keşfedilmeyi bekliyor.
          Görülenlerin <strong>%{data.vocab.masteryPct}</strong>’i kalıcı ustalıkta.
        </p>
        <ChartLegend items={[
          { label: 'Öğrenme', color: '#8a96a5' },
          { label: 'Tekrar', color: '#1a56db' },
          { label: 'Ustalık', color: '#0b1118' },
        ]} />
      </div>
      <VocabChart series={series} height={250} />
      <div className="vocab-panel-foot">
        <span><i className="dot learning" /> {data.vocab.learning} öğrenme</span>
        <span><i className="dot review" /> {data.vocab.review} tekrar</span>
        <span><i className="dot mastered" /> {data.vocab.mastered} ustalık</span>
        <span><i className="dot new" /> {data.vocab.new} yeni</span>
      </div>
    </section>
  );
}

function CefrPanel({ data }) {
  return (
    <section className="panel cefr-panel">
      <div className="panel-head">
        <div>
          <span className="card-eyebrow">Seviye haritası</span>
          <h2>A1 yolculuğu</h2>
        </div>
        <GraduationCap size={19} />
      </div>
      <div className="cefr-levels">
        {data.cefr.map((level) => (
          <div className={`cefr-level ${level.vocabSeen ? 'has-progress' : ''}`} key={level.id}>
            <div className="cefr-level-top">
              <div>
                <strong>{level.id}</strong>
                <span>{level.subtitle}</span>
              </div>
              <span>{Math.round(level.nodeProgress * 100)}%</span>
            </div>
            <ProgressBar value={level.nodeProgress * 100} tone={level.id === 'A1.1' ? 'blue' : 'violet'} height={7} />
            <div className="cefr-meta">
              <span>{level.nodesDone}/{level.nodesTotal} blok</span>
              <span>{level.vocabSeen}/{level.vocabTotal} kelime</span>
            </div>
            {level.vocabSeen > 0 ? (
              <div className="cefr-vocab-track">
                <i className="mastered" style={{ width: `${(level.vocabMastered / Math.max(1, level.vocabTotal)) * 100}%` }} />
                <i className="review" style={{ width: `${((level.vocabSeen - level.vocabMastered) / Math.max(1, level.vocabTotal)) * 100}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="unit-mini-grid" aria-label="Ünite ilerlemeleri">
        {data.units.map((unit) => (
          <span
            key={unit.id}
            className={`unit-mini unit-mini-${unit.color} ${unit.status}`}
            title={`Ünite ${unit.number}: ${unit.title} — ${unit.completedCount}/${unit.totalCount}`}
          >
            {unit.status === 'completed' ? <Check size={10} strokeWidth={3} /> : unit.number}
          </span>
        ))}
      </div>
      <div className="cefr-foot">
        <span><Target size={14} /> sıradaki: {data.cefr.find((l) => l.nodeProgress < 1)?.id || 'tekrar'}</span>
        <button type="button" className="text-link" onClick={() => navigate('/path')}>Yolu aç <ArrowRight size={14} /></button>
      </div>
    </section>
  );
}

function RetentionPanel({ data }) {
  return (
    <section className="panel retention-panel">
      <div className="panel-head">
        <div>
          <span className="card-eyebrow">Hafıza</span>
          <h2>Hatırlama eğrisi</h2>
        </div>
        <Chip tone="green" icon={Brain}>%{data.brain.stats.retention}</Chip>
      </div>
      <p className="panel-lede">
        Son 8 haftanın doğruluğu. Hedef %{Math.round(data.brain.personalization.desiredRetention * 100)};
        çizgi hedefin altına indiğinde tekrarlar sıklaşır.
      </p>
      <RetentionLine weeks={data.weeks} height={190} />
      <div className="retention-foot">
        <span><i className="dot mastered" /> haftalık hatırlama</span>
        <span><i className="target-dash" /> hedef %90</span>
        <span>{data.totals.reviews} cevap</span>
      </div>
    </section>
  );
}

function AccuracyPanel({ data }) {
  return (
    <section className="panel accuracy-panel">
      <div className="panel-head">
        <div>
          <span className="card-eyebrow">Egzersiz kırılımı</span>
          <h2>Nerede güçlüsün?</h2>
        </div>
        <Brain size={18} />
      </div>
      <p className="panel-lede">Beyin modeli en zayıf kanalı daha sık önüne getiriyor.</p>
      <AccuracyBars data={data.byType} />
      <div className="accuracy-note">
        <Sparkles size={15} />
        <span>{data.brain.weakest ? `${data.brain.weakest.label}, gelişim için en yüksek getirili alan.` : 'Daha fazla cevap, daha keskin bir kırılım.'}</span>
      </div>
    </section>
  );
}

function ActivityPanel({ data }) {
  const activeDays = data.heatmap.filter((d) => d.minutes > 0).length;
  return (
    <section className="panel heatmap-panel">
      <div className="panel-head">
        <div>
          <span className="card-eyebrow">Süreklilik</span>
          <h2>Son 12 hafta</h2>
        </div>
        <div className="heatmap-stats">
          <span><Flame size={15} /> {data.totals.streak} gün seri</span>
          <span>{activeDays} aktif gün</span>
        </div>
      </div>
      <Heatmap days={data.heatmap} />
    </section>
  );
}

function ForecastPanel({ data }) {
  return (
    <section className="panel forecast-panel">
      <div className="panel-head">
        <div>
          <span className="card-eyebrow">Plan</span>
          <h2>Tekrar dalgası</h2>
        </div>
        <CalendarDays size={18} />
      </div>
      <ForecastBars data={data.forecast} height={148} />
      <div className="forecast-panel-foot">
        <div>
          <span>Bugün</span>
          <strong>{data.forecast[0]?.count || 0}</strong>
        </div>
        <div>
          <span>7 günlük toplam</span>
          <strong>{data.forecast.reduce((s, d) => s + d.count, 0)}</strong>
        </div>
        <Button size="sm" variant="soft" onClick={() => navigate('/review/session')}>Tekrara git</Button>
      </div>
    </section>
  );
}

export default function Progress() {
  const { user, showToast } = useApp();
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r) => {
    setLoading(true);
    try {
      const d = await api.progress(user.id, r);
      setData(d);
    } catch (err) {
      showToast(err.message || 'Gelişim yüklenemedi.', 'error');
    } finally {
      setLoading(false);
    }
  }, [user.id, showToast]);

  useEffect(() => { load(range); }, [load, range]);

  if (!data) {
    return (
      <div className="page progress-page">
        <Skeleton width="28%" height={18} />
        <Skeleton width="44%" height={52} className="mt-3" />
        <Skeleton height={120} radius={24} className="mt-7" />
        <div className="progress-main-grid"><Skeleton height={430} radius={24} /><Skeleton height={430} radius={24} /></div>
      </div>
    );
  }

  return (
    <div className="page progress-page">
      <header className="page-head progress-head">
        <div>
          <span className="page-kicker">Kanıt · {range} günlük pencere</span>
          <h1>Gelişimin<span className="head-dot">.</span></h1>
          <p>His değil, kayıt. Her kelime, her cevap ve her tekrar burada iz bırakıyor.</p>
        </div>
        <div className="progress-head-actions">
          <Segmented options={RANGES} value={range} onChange={setRange} label="Zaman aralığı" />
          <Chip tone="blue" icon={Brain} className="clickable-chip" onClick={() => navigate('/brain')}>
            {data.brain.profileLabel}
          </Chip>
        </div>
      </header>

      <section className={`kpi-strip ${loading ? 'is-loading' : ''}`}>
        <KPI label="Görülen kelime" value={data.vocab.seen} sub={`${formatNumber(data.vocab.total)} hedeften`} icon={Layers3} tone="blue" />
        <KPI label="Ustalık" value={data.vocab.mastered} sub={`görülenlerin %${data.vocab.masteryPct}’i`} icon={Award} tone="green" />
        <KPI label="Toplam süre" value={formatMinutes(data.totals.minutes)} sub={`${data.totals.activeDays} aktif gün`} icon={Clock3} tone="amber" />
        <KPI label="Doğruluk" value={`%${data.totals.accuracy}`} sub={`${formatNumber(data.totals.reviews)} cevap`} icon={Target} tone="coral" />
        <KPI label="En iyi seri" value={`${data.totals.bestStreak} gün`} sub={`şu an ${data.totals.streak} gün`} icon={Flame} tone="violet" />
      </section>

      <div className="progress-main-grid">
        <VocabPanel data={data} />
        <CefrPanel data={data} />
      </div>

      <div className="progress-secondary-grid">
        <RetentionPanel data={data} />
        <AccuracyPanel data={data} />
      </div>

      <div className="progress-tertiary-grid">
        <ActivityPanel data={data} />
        <ForecastPanel data={data} />
      </div>

      <footer className="progress-footer">
        <span><i className="live-dot" /> {data.totals.wordsPerActiveDay} yeni kelime / aktif gün</span>
        <span>FSRS-7 · brain-v1</span>
        <span>{formatMinutes(data.totals.minutes)} toplam pratik</span>
      </footer>
    </div>
  );
}

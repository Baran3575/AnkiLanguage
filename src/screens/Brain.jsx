import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, ArrowRight, BrainCircuit, Check, Clock3, Ear, Eye, Flame,
  Gauge, Headphones, Layers3, Lightbulb, ShieldCheck, Sparkles, Target, Timer, Zap,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { navigate } from '../lib/router.js';
import { formatMinutes, percent } from '../lib/format.js';
import { Button, Chip, Skeleton } from '../components/ui.jsx';
import { Brainprint, ConfidenceRing, MetricBars } from '../components/BrainVisual.jsx';
import { AccuracyBars } from '../components/charts.jsx';

const METRIC_COPY = [
  { key: 'pace', label: 'Tepki hızı', icon: Gauge, text: 'Doğru cevaba ne kadar hızlı ulaştığın. Ezber değil, akıcılık sinyali.' },
  { key: 'memory', label: 'Bellek', icon: BrainCircuit, text: 'Hatırlama doğruluğu, kelime olgunluğu ve stabilite birleşimi.' },
  { key: 'accuracy', label: 'İsabet', icon: Target, text: 'Son 21 günün recency ağırlıklı doğruluğu.' },
  { key: 'consistency', label: 'Tutarlılık', icon: Flame, text: 'Düzenli pratik ve seri. Modelin en çok güvendiği sinyallerden.' },
  { key: 'listening', label: 'Dinleme', icon: Headphones, text: 'Sesli egzersizlerdeki doğruluk. Kanal farkını burada ölçüyoruz.' },
];

export default function Brain() {
  const { user, brain: contextBrain, showToast } = useApp();
  const [brain, setBrain] = useState(contextBrain);
  const [loading, setLoading] = useState(!contextBrain);

  useEffect(() => {
    let alive = true;
    if (!user) return undefined;
    api.brain(user.id)
      .then((d) => { if (alive) { setBrain(d); setLoading(false); } })
      .catch((err) => { if (alive) { showToast(err.message, 'error'); setLoading(false); } });
    return () => { alive = false; };
  }, [user, showToast]);

  if (loading && !brain) {
    return (
      <div className="page brain-page">
        <Skeleton width="28%" height={18} />
        <Skeleton width="52%" height={54} className="mt-3" />
        <Skeleton height={340} radius={28} className="mt-7" />
        <Skeleton height={260} radius={24} className="mt-5" />
      </div>
    );
  }

  if (!brain) return null;
  const p = brain.personalization;

  return (
    <div className="page brain-page">
      <header className="page-head brain-head">
        <div>
          <span className="page-kicker">brain-v1 · davranışsal model</span>
          <h1>Beynin nasıl öğreniyor<span className="head-dot">?</span></h1>
          <p>Kalibrasyon ve {brain.evidence} cevabın birleşimi. Her metrik bir davranışa dayanıyor.</p>
        </div>
        <div className="brain-head-actions">
          <Chip tone="violet" icon={Layers3}>FSRS-7</Chip>
          <Chip tone="green" icon={ShieldCheck}>%{brain.confidence} güven</Chip>
        </div>
      </header>

      <motion.section
        className="brain-hero"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="brain-hero-main">
          <div className="brain-hero-top">
            <span className="brain-live"><i className="live-dot" /> canlı profil</span>
            <span className="brain-hero-id">WORT / {String(user?.id || '').slice(-6).toUpperCase()}</span>
          </div>
          <span className="brain-hero-eyebrow">Senin öğrenme profilin</span>
          <h2>{brain.profileLabel}</h2>
          <p>{brain.tagline}</p>
          <div className="brain-hero-print">
            <Brainprint values={brain.brainprint} tone="lime" height={96} />
            <span className="brain-print-label">brainprint · {brain.brainprint.length} sinyal</span>
          </div>
          <div className="brain-hero-meta">
            <span><Activity size={15} /> {brain.evidence} cevap</span>
            <span><Clock3 size={15} /> medyan {(brain.stats.medianLatencyMs / 1000).toFixed(1)} sn</span>
            <span><Layers3 size={15} /> {brain.stats.seenWords} kelime</span>
          </div>
        </div>
        <div className="brain-hero-side">
          <div className="brain-confidence-block">
            <ConfidenceRing value={brain.confidence} size={74} />
            <div>
              <span>Kalibrasyon güveni</span>
              <strong>%{brain.confidence}</strong>
              <small>{brain.calibrationNote}</small>
            </div>
          </div>
          <div className="brain-modality">
            <div className="modality-symbol">
              {brain.modality === 'auditory' ? <Ear size={24} /> : brain.modality === 'visual' ? <Eye size={24} /> : <Layers3 size={24} />}
            </div>
            <div>
              <span>Baskın kanal</span>
              <strong>{brain.modalityLabel}</strong>
              <small>{brain.modality === 'auditory' ? 'Dinleyerek daha net öğreniyorsun.' : brain.modality === 'visual' ? 'Görerek daha net öğreniyorsun.' : 'İki kanal da yakın çalışıyor.'}</small>
            </div>
          </div>
          <div className="brain-hero-foot">
            <span><Target size={14} /> hedef %{Math.round(p.desiredRetention * 100)}</span>
            <span><Zap size={14} /> {p.newWordsPerDay} yeni / gün</span>
          </div>
        </div>
      </motion.section>

      <div className="brain-grid">
        <section className="panel brain-metrics-panel">
          <div className="panel-head">
            <div>
              <span className="card-eyebrow">Sinyaller</span>
              <h2>Seni oluşturan beş metrik</h2>
            </div>
            <span className="metric-count">05</span>
          </div>
          <div className="brain-metric-list">
            {METRIC_COPY.map((m) => {
              const Icon = m.icon;
              const value = Math.round(brain.metrics[m.key] || 0);
              const stat = m.key === 'pace'
                ? `${(brain.stats.medianLatencyMs / 1000).toFixed(1)} sn medyan`
                : m.key === 'memory'
                  ? `${brain.stats.avgStability} gün stabilite`
                  : m.key === 'accuracy'
                    ? `%${brain.stats.retention} recency doğruluk`
                    : m.key === 'consistency'
                      ? `${brain.stats.activeDays} aktif gün`
                      : `%${brain.metrics.listening} dinleme`;
              return (
                <div className="brain-metric-row" key={m.key}>
                  <span className="bm-icon"><Icon size={18} strokeWidth={1.8} /></span>
                  <div className="bm-main">
                    <div className="bm-top">
                      <strong>{m.label}</strong>
                      <span>{stat}</span>
                      <b>{value}</b>
                    </div>
                    <div className="bm-track"><i style={{ width: `${value}%` }} /></div>
                    <p>{m.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel brain-plan-panel">
          <div className="panel-head">
            <div>
              <span className="card-eyebrow">Profilden plana</span>
              <h2>Model sana ne yapıyor?</h2>
            </div>
            <Sparkles size={18} />
          </div>
          <p className="panel-lede">Profil sadece bir etiket değil; her günün planına dönüşen bir ayar dosyası.</p>
          <div className="brain-plan-list">
            <div>
              <span className="plan-icon blue"><Layers3 size={17} /></span>
              <div><strong>{p.newWordsPerDay} yeni kelime / gün</strong><small>Hedefin ve belleğine göre</small></div>
            </div>
            <div>
              <span className="plan-icon green"><Target size={17} /></span>
              <div><strong>%{Math.round(p.desiredRetention * 100)} hatırlama hedefi</strong><small>Tekrarlar buna göre zamanlanıyor</small></div>
            </div>
            <div>
              <span className="plan-icon amber"><Timer size={17} /></span>
              <div><strong>{formatMinutes(p.sessionMinutes)} oturum</strong><small>Günlük hedefin</small></div>
            </div>
            <div>
              <span className="plan-icon violet"><Headphones size={17} /></span>
              <div><strong>{p.exerciseMix.listening === 'high' ? 'Daha fazla dinleme' : 'Dengeli kanal'}</strong><small>{p.hintMode === 'generous' ? 'Bol ipucu modu' : p.hintMode === 'minimal' ? 'Minimal ipucu modu' : 'Dengeli ipucu modu'}</small></div>
            </div>
          </div>
          <div className="brain-plan-note">
            <Lightbulb size={15} />
            <span>{brain.weakest ? `En zayıf kanalın ${brain.weakest.label.toLowerCase()}; bu yüzden onu daha sık göreceksin.` : 'Daha fazla veri geldikçe plan daha da keskinleşecek.'}</span>
          </div>
        </section>
      </div>

      <section className="panel brain-insights-panel">
        <div className="panel-head">
          <div>
            <span className="card-eyebrow">Çıkarımlar</span>
            <h2>Modelin senin hakkında gördükleri</h2>
          </div>
          <span className="metric-count">{brain.insights.length}</span>
        </div>
        <div className="insight-grid">
          {brain.insights.map((insight) => (
            <div className={`insight-card insight-${insight.tone}`} key={insight.kind}>
              <span className="insight-label">{insight.label}</span>
              <strong>{insight.value}</strong>
              <p>{insight.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="brain-bottom-grid">
        <section className="panel brain-type-panel">
          <div className="panel-head">
            <div>
              <span className="card-eyebrow">Kanallar</span>
              <h2>Egzersiz doğruluğu</h2>
            </div>
            <Chip tone="soft">{brain.byType.length} tür</Chip>
          </div>
          <AccuracyBars data={brain.byType} />
        </section>

        <section className="panel brain-evidence-panel">
          <div className="panel-head">
            <div>
              <span className="card-eyebrow">Kanıt zinciri</span>
              <h2>Model nasıl keskinleşti?</h2>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div className="evidence-timeline">
            <div className="evidence-step is-done">
              <span className="evidence-dot"><Check size={11} strokeWidth={3} /></span>
              <div><strong>Kalibrasyon</strong><p>4 kelime, 3 hatırlama sorusu, kanal tercihi.</p></div>
              <small>başlangıç</small>
            </div>
            <div className="evidence-step is-done">
              <span className="evidence-dot"><Check size={11} strokeWidth={3} /></span>
              <div><strong>Davranışsal kanıt</strong><p>{brain.evidence} cevap; doğruluk, hız ve mod kanalları.</p></div>
              <small>%{brain.confidence} güven</small>
            </div>
            <div className="evidence-step is-current">
              <span className="evidence-dot"><Activity size={11} /></span>
              <div><strong>Canlı güncelleme</strong><p>Her tekrar recency ağırlığını kaydırır; plan yeniden hesaplanır.</p></div>
              <small>şimdi</small>
            </div>
          </div>
          <div className="model-disclaimer">
            <ShieldCheck size={15} />
            <p>
              Bu model tıbbi bir teşhis değil. FSRS-7, çift kararlılık (stability) ve zorluk
              durumunu güncelleyen açık hafıza modelidir; 7 günlük recency katmanı yalnızca
              hedef hatırlamayı ve kararlılık kazancını dar bir aralıkta kalibre eder.
            </p>
          </div>
        </section>
      </div>

      <footer className="brain-footer">
        <span>Kalibrasyon + davranış = kişisel plan</span>
        <Button variant="soft" size="sm" onClick={() => navigate('/today')} trailing={ArrowRight}>Bugüne dön</Button>
      </footer>
    </div>
  );
}

import { motion } from 'framer-motion';
import {
  ArrowRight, Sparkles, Brain, Flame, Check, Languages, Timer, Ear, Eye,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Button, Chip, Logo } from '../components/ui.jsx';
import { Brainprint, MetricBars } from '../components/BrainVisual.jsx';

const float = (delay = 0) => ({
  animate: { y: [0, -7, 0], rotate: [0, 1.2, 0] },
  transition: { duration: 6 + delay, repeat: Infinity, ease: 'easeInOut', delay },
});

export default function Welcome({ onStart }) {
  const { startDemo, loading } = useApp();

  return (
    <div className="welcome">
      <div className="welcome-bg" aria-hidden>
        <span className="welcome-ring ring-1" />
        <span className="welcome-ring ring-2" />
        <span className="welcome-orbit" />
      </div>

      <header className="welcome-header">
        <Logo tone="light" />
        <div className="welcome-header-right">
          <Chip tone="on-blue" icon={Languages}>Türkçe → Deutsch</Chip>
          <button type="button" className="welcome-demo-link" onClick={startDemo} disabled={loading}>
            Demoyu gör
          </button>
        </div>
      </header>

      <main className="welcome-main">
        <section className="welcome-copy">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="welcome-eyebrow">
              <span className="welcome-badge"><i /> A1.1 – A1.2</span>
              <span>FSRS-7 · Recency</span>
            </div>
            <h1>
              Almanca,<br />
              <span>beynine göre.</span>
            </h1>
            <p className="welcome-lede">
              Türkçeden Almancaya. Her blok, her tekrar ve her egzersiz;
              hızına, hafızana ve öğrenme kanalına göre yeniden ayarlanır.
            </p>
            <div className="welcome-actions">
              <Button variant="white" size="lg" trailing={ArrowRight} onClick={onStart}>
                3 dakikada başla
              </Button>
              <Button variant="ghost-light" size="lg" icon={Sparkles} onClick={startDemo} loading={loading}>
                Demoyu keşfet
              </Button>
            </div>
            <div className="welcome-proof">
              <span><Check size={14} /> 224 kelime · 48 blok</span>
              <span><Check size={14} /> Gerçek hafıza modeli</span>
              <span><Check size={14} /> Reklamsız</span>
            </div>
          </motion.div>

          <div className="welcome-manifesto">
            <span className="manifesto-mark">”</span>
            <p>
              Çoğu uygulama herkese aynı programı verir. wort. önce seni tanır:
              nasıl öğrendiğini ölçer, sonra yolu ona göre kurar.
            </p>
          </div>
        </section>

        <section className="welcome-visual" aria-label="Beyin profili önizlemesi">
          <motion.div
            className="welcome-card"
            initial={{ opacity: 0, y: 30, rotate: 4 }}
            animate={{ opacity: 1, y: 0, rotate: 2.2 }}
            transition={{ delay: 0.15, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="wc-head">
              <div className="wc-avatar">E</div>
              <div>
                <span>Elif’in beyin profili</span>
                <strong>Hızlı Görsel</strong>
              </div>
              <span className="wc-live"><i /> canlı</span>
            </div>
            <div className="wc-signal">
              <Brainprint values={[0.35, 0.62, 0.48, 0.8, 0.7, 0.9, 0.42, 0.66, 0.52, 0.76, 0.88, 0.58, 0.72, 0.46, 0.81, 0.62, 0.7, 0.55, 0.86, 0.6, 0.74, 0.5]} tone="blue" height={64} />
            </div>
            <MetricBars metrics={{ pace: 78, memory: 84, accuracy: 89, consistency: 92, listening: 71 }} compact limit={4} />
            <div className="wc-footer">
              <div><span>Bugünün planı</span><strong>21 tekrar · 7 yeni</strong></div>
              <span className="wc-time"><Timer size={14} /> 14 dk</span>
            </div>
          </motion.div>

          <motion.div className="floating-word word-apfel" {...float(0.2)}>
            <span className="fw-article der">der</span>
            <strong>Apfel</strong>
            <small>elma</small>
            <span className="fw-audio"><Eye size={13} /></span>
          </motion.div>
          <motion.div className="floating-word word-montag" {...float(1.1)}>
            <span className="fw-article der">der</span>
            <strong>Montag</strong>
            <small>Pazartesi</small>
          </motion.div>
          <motion.div className="floating-word word-hallo" {...float(0.7)}>
            <strong>Guten Tag</strong>
            <small>İyi günler</small>
            <span className="fw-audio sound"><Ear size={13} /></span>
          </motion.div>
          <motion.div className="floating-pill streak-pill" {...float(1.5)}>
            <Flame size={16} /><strong>21 gün</strong><span>seri</span>
          </motion.div>
          <motion.div className="floating-pill fsrs-pill" {...float(0.4)}>
            <span>FSRS-7</span><small>recency</small>
          </motion.div>

          <div className="welcome-stamp">
            <Brain size={18} />
            <span>beyin<br />taraması</span>
          </div>
        </section>
      </main>

      <footer className="welcome-footer">
        <span>wort. — Almanca öğrenme laboratuvarı</span>
        <div>
          <span>224 kelime</span>
          <span>12 ünite</span>
          <span>48 blok</span>
        </div>
      </footer>
    </div>
  );
}

import { ArrowRight, Check, Timer } from 'lucide-react';
import { Button } from '../components/ui.jsx';

const PREVIEW_WORDS = [
  { article: 'der', word: 'Morgen', tr: 'sabah' },
  { article: 'die', word: 'Sonne', tr: 'güneş' },
  { article: 'das', word: 'Haus', tr: 'ev' },
];

export default function Welcome({ onStart }) {
  return (
    <div className="welcome welcome-v3">
      <header className="welcome-header">
        <span className="welcome-lang">TR <b>→</b> DE</span>
        <span className="welcome-level">A1.1 — A1.2 · FSRS-7</span>
      </header>

      <main className="welcome-main">
        <section className="welcome-copy">
          <span className="welcome-eyebrow">Almanca öğrenme defteri</span>
          <h1>
            Her gün.<br />
            <span>Biraz daha.</span>
          </h1>
          <p className="welcome-lede">
            Kısa bloklar, gerçek tekrar aralıkları ve tek bir hedef:
            Almancayı her gün biraz daha kullanmak.
          </p>
          <div className="welcome-actions">
            <Button variant="primary" size="lg" trailing={ArrowRight} onClick={onStart}>
              Başla
            </Button>
            <span className="welcome-start-note">3 dakikalık başlangıç · reklamsız</span>
          </div>
          <div className="welcome-proof">
            <span><Check size={14} /> 224 kelime</span>
            <span><Check size={14} /> 48 blok</span>
            <span><Check size={14} /> Çevrimdışı</span>
          </div>
        </section>

        <section className="welcome-board" aria-label="Günlük ders önizlemesi">
          <div className="wb-top">
            <span>BUGÜN · A1.1</span>
            <strong>01</strong>
          </div>

          <div className="wb-lesson">
            <span>SIRADAKİ BLOK</span>
            <h2>Merhaba!</h2>
            <p>İlk kelimelerin ve adını söylemek.</p>
          </div>

          <div className="wb-words">
            {PREVIEW_WORDS.map((item) => (
              <div className="wb-word" key={item.word}>
                <span>{item.article}</span>
                <strong>{item.word}</strong>
                <small>{item.tr}</small>
              </div>
            ))}
          </div>

          <div className="wb-metrics">
            <div><strong>6</strong><span>dakika</span></div>
            <div><strong>7</strong><span>yeni kelime</span></div>
            <div><strong>%0</strong><span>tamamlandı</span></div>
          </div>

          <div className="wb-progress" aria-hidden>
            <i />
          </div>

          <div className="wb-foot">
            <span><Timer size={14} /> Bugünün planı hazır</span>
            <span>FSRS-7</span>
          </div>
        </section>
      </main>

      <footer className="welcome-footer">
        <span>Türkçeden Almancaya</span>
        <span>12 ünite · 224 kelime · 48 blok</span>
      </footer>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, Check, Clock3, Ear, Eye,
  GraduationCap, Home, Plane, Sparkles, Timer, Users, Waves, Brain,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { clamp } from '../lib/format.js';
import { Button, Chip, Logo, ArticleDot, AudioButton } from '../components/ui.jsx';
import { Brainprint, MetricBars } from '../components/BrainVisual.jsx';
import { brainprint } from '../../shared/brain.js';
import { playComplete } from '../lib/sound.js';

const MOTIVES = [
  { value: 'seyahat', label: 'Seyahat', icon: Plane },
  { value: 'is', label: 'İş', icon: BriefcaseBusiness },
  { value: 'aile', label: 'Aile & arkadaşlar', icon: Users },
  { value: 'okul', label: 'Okul', icon: GraduationCap },
  { value: 'yasam', label: 'Almanya’da yaşam', icon: Home },
];

const GOALS = [
  { minutes: 5, title: 'Yavaş ama düzenli', note: 'Günde 3 yeni kelime', tag: 'başlangıç' },
  { minutes: 10, title: 'Küçük bir alışkanlık', note: 'Günde 5 yeni kelime', tag: '' },
  { minutes: 15, title: 'Dengeli tempo', note: 'Günde 7 yeni kelime', tag: 'önerilen' },
  { minutes: 20, title: 'Yoğun yol', note: 'Günde 9 yeni kelime', tag: '' },
];

const MEMORY_WORDS = [
  { id: 'apfel', de: 'der Apfel', tr: 'elma', gender: 'der' },
  { id: 'sonne', de: 'die Sonne', tr: 'güneş', gender: 'die' },
  { id: 'haus', de: 'das Haus', tr: 'ev', gender: 'das' },
  { id: 'trinken', de: 'trinken', tr: 'içmek', gender: null },
];

const QUESTIONS = [
  { tr: 'ev', answer: 'das Haus', options: ['das Haus', 'die Sonne', 'der Apfel', 'trinken'] },
  { tr: 'içmek', answer: 'trinken', options: ['der Apfel', 'trinken', 'das Haus', 'die Sonne'] },
  { tr: 'güneş', answer: 'die Sonne', options: ['die Sonne', 'trinken', 'der Apfel', 'das Haus'] },
];

function profileFor({ correct, avgMs, modality, name }) {
  const pace = avgMs < 4600 ? 'Hızlı' : avgMs < 7600 ? 'Dengeli' : 'Titiz';
  const channel = modality === 'auditory' ? 'İşitsel' : modality === 'visual' ? 'Görsel' : 'Dengeli';
  const label = pace === 'Dengeli' && channel === 'Dengeli' ? 'Dengeli Öğrenci' : `${pace} ${channel}`;
  const taglines = {
    'Hızlı Görsel': 'Görsel desenleri çabuk yakalıyorsun. Kelimeleri kartlarla sağlamlaştıracağız.',
    'Hızlı İşitsel': 'Kulağın hızlı çalışıyor. Dinleyerek ve tekrar ederek hızla oturacak.',
    'Hızlı Dengeli': 'Hız ve doğruluk dengede. Tempoyu yükseltmeye hazırsın.',
    'Dengeli Görsel': 'Görerek öğreniyorsun; sağlam bir temel için doğru hız.',
    'Dengeli İşitsel': 'Dinleyerek öğreniyorsun; her tekrar kulağında yer edecek.',
    'Dengeli Öğrenci': 'Her iki kanalın da açık. Model seni cevaplarınla keskinleştirecek.',
    'Titiz Görsel': 'Dikkatle okuyor, kalıcı bir temel kuruyorsun.',
    'Titiz İşitsel': 'Dinleyerek derinleşiyorsun; acele etmeden kalıcı öğreniyorsun.',
    'Titiz Dengeli': 'Sağlam ilerliyorsun. Küçük tempolarla büyük fark yaratacaksın.',
  };
  const memory = clamp(0.52 + correct * 0.11 + (avgMs < 4500 ? 0.04 : 0), 0.45, 0.94);
  const speed = Math.round(clamp(118 - avgMs / 95, 24, 96));
  const modalityScore = modality === 'balanced' ? 72 : 80;
  return {
    label,
    tagline: taglines[label] || 'Her cevapla profilin biraz daha netleşiyor.',
    calibration: {
      memory: Number(memory.toFixed(2)),
      speedMs: Math.round(avgMs),
      modality,
      confidence: Number(clamp(0.45 + correct * 0.12, 0.4, 0.85).toFixed(2)),
      source: 'calibration',
      correct,
      total: QUESTIONS.length,
      completedAt: new Date().toISOString(),
    },
    print: brainprint([speed, Math.round(memory * 100), modalityScore, 60 + correct * 8, 70]),
    metrics: {
      pace: speed,
      memory: Math.round(memory * 100),
      accuracy: Math.round((correct / QUESTIONS.length) * 100),
      consistency: 50,
      listening: modality === 'auditory' ? 82 : modality === 'visual' ? 48 : 66,
    },
  };
}

function StepHeader({ step, onBack, onSkip }) {
  const labels = ['Tanışma', 'Hedef', 'Beyin taraması', 'Profilin'];
  return (
    <div className="ob-progress">
      <button type="button" className={`ob-back ${step === 0 ? 'is-hidden' : ''}`} onClick={onBack} aria-label="Geri">
        <ArrowLeft size={18} />
      </button>
      <div className="ob-steps" aria-label={`Adım ${step + 1} / 4`}>
        {labels.map((label, i) => (
          <span key={label} className={`ob-step ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`}>
            <i>{i < step ? <Check size={11} strokeWidth={3} /> : i + 1}</i>
            <em>{label}</em>
          </span>
        ))}
      </div>
      {onSkip ? (
        <button type="button" className="ob-skip" onClick={onSkip}>Atla</button>
      ) : <span className="ob-progress-spacer" />}
    </div>
  );
}

function NameStep({ name, setName, motive, setMotive, onNext }) {
  const valid = name.trim().length > 0;
  return (
    <div className="ob-step-content">
      <div className="ob-eyebrow">01 · Tanışma</div>
      <h2>Sana nasıl seslenelim?</h2>
      <p className="ob-lede">Profilin bu cihazda kalır. İsmini dilediğin an değiştirebilirsin.</p>
      <label className="ob-name-field">
        <span>Adın</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Elif"
          maxLength={40}
          autoComplete="given-name"
          onKeyDown={(e) => { if (e.key === 'Enter' && valid) onNext(); }}
        />
      </label>
      <fieldset className="ob-motives">
        <legend>Neden Almanca öğreniyorsun?</legend>
        <div className="motive-grid">
          {MOTIVES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                type="button"
                key={m.value}
                className={`motive-card ${motive === m.value ? 'is-active' : ''}`}
                onClick={() => setMotive(m.value)}
                aria-pressed={motive === m.value}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{m.label}</span>
                {motive === m.value ? <i className="motive-check"><Check size={11} strokeWidth={3} /></i> : null}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="ob-actions">
        <Button size="lg" trailing={ArrowRight} onClick={onNext} disabled={!valid}>Devam</Button>
        <span className="ob-hint">Yaklaşık 2 dakika sürer.</span>
      </div>
    </div>
  );
}

function GoalStep({ goal, setGoal, onNext }) {
  return (
    <div className="ob-step-content">
      <div className="ob-eyebrow">02 · Günlük hedef</div>
      <h2>Her gün ne kadar?</h2>
      <p className="ob-lede">
        Hedefin; yeni kelime sayısını, tekrar yoğunluğunu ve blok uzunluğunu belirler.
        Beyin modeli zamanla bunu senin ritmine göre yeniden ayarlar.
      </p>
      <div className="goal-grid">
        {GOALS.map((g) => (
          <button
            type="button"
            key={g.minutes}
            className={`goal-card ${goal === g.minutes ? 'is-active' : ''}`}
            onClick={() => setGoal(g.minutes)}
            aria-pressed={goal === g.minutes}
          >
            <div className="goal-card-top">
              <span className="goal-number">{g.minutes}<small>dk</small></span>
              {g.tag ? <span className="goal-tag">{g.tag}</span> : null}
            </div>
            <strong>{g.title}</strong>
            <span>{g.note}</span>
          </button>
        ))}
      </div>
      <div className="goal-insight">
        <Timer size={18} />
        <p>
          <strong>15 dakika</strong> seçen çoğu öğrenci, 3 haftada yaklaşık 70 kelimeyi
          aktif kullanıma taşıyor. Hız, senin cevaplarına göre değişir.
        </p>
      </div>
      <div className="ob-actions">
        <Button size="lg" trailing={ArrowRight} onClick={onNext}>Beyin taramasına geç</Button>
        <span className="ob-hint">İstediğin zaman değiştirebilirsin.</span>
      </div>
    </div>
  );
}

function ScanStep({ name, onFinish, onBack }) {
  const [phase, setPhase] = useState('memorize');
  const [countdown, setCountdown] = useState(6);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modality, setModality] = useState(null);
  const startedAt = useRef(Date.now());
  const advanceTimer = useRef(null);

  useEffect(() => {
    if (phase !== 'memorize') return undefined;
    startedAt.current = Date.now();
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          setPhase('quiz');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  function answer(option) {
    if (selected) return;
    const q = QUESTIONS[index];
    const latency = Date.now() - startedAt.current;
    setSelected(option);
    setAnswers((prev) => [...prev, { tr: q.tr, answer: q.answer, picked: option, correct: option === q.answer, latency }]);
    advanceTimer.current = setTimeout(() => {
      setSelected(null);
      if (index + 1 >= QUESTIONS.length) {
        setPhase('modality');
      } else {
        setIndex((i) => i + 1);
        startedAt.current = Date.now();
      }
    }, 460);
  }

  const correct = answers.filter((a) => a.correct).length;
  const avgMs = answers.length
    ? answers.reduce((s, a) => s + a.latency, 0) / answers.length
    : 7000;

  function finish(preference) {
    setModality(preference);
    const profile = profileFor({ correct, avgMs, modality: preference, name });
    playComplete();
    onFinish(profile);
  }

  return (
    <div className="ob-step-content scan-content">
      <div className="ob-eyebrow">03 · Beyin taraması</div>
      <h2>{phase === 'modality' ? 'Sana en yakın kanal hangisi?' : 'Kısa bir hafıza taraması'}</h2>
      <p className="ob-lede">
        {phase === 'memorize' ? '4 kelimeyi 6 saniye gösteriyoruz. Ezberlemek zorunda değilsin; sadece dikkatle bak.' : null}
        {phase === 'quiz' ? 'Şimdi gördüklerini hatırlayalım. Bu bir sınav değil, sadece başlangıç noktası.' : null}
        {phase === 'modality' ? 'Yeni bir kelimeyi daha kolay hangi kanaldan hatırlarsın? İçgüdüne güven.' : null}
      </p>

      <div className="scan-meter">
        <span className={phase === 'memorize' ? 'is-active' : 'is-done'}><i /> Hafıza</span>
        <span className={phase === 'quiz' ? 'is-active' : phase === 'modality' ? 'is-done' : ''}><i /> Tanıma</span>
        <span className={phase === 'modality' ? 'is-active' : ''}><i /> Kanal</span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'memorize' ? (
          <motion.div
            key="memorize"
            className="scan-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24 }}
          >
            <div className="scan-timer">
              <span><Clock3 size={15} /> {countdown} saniye</span>
              <div className="scan-timer-track"><i style={{ width: `${(countdown / 6) * 100}%` }} /></div>
            </div>
            <div className="memory-grid">
              {MEMORY_WORDS.map((w) => (
                <div className="memory-card" key={w.id}>
                  <div className="memory-card-top">
                    <ArticleDot gender={w.gender} label />
                    <AudioButton text={w.de} size="sm" variant="bare" />
                  </div>
                  <strong>{w.de.replace(/^(der|die|das)\s+/, '')}</strong>
                  <span>{w.tr}</span>
                </div>
              ))}
            </div>
            <Button variant="soft" size="md" icon={Sparkles} onClick={() => setPhase('quiz')}>Hazırım, devam et</Button>
          </motion.div>
        ) : null}

        {phase === 'quiz' ? (
          <motion.div
            key={`quiz-${index}`}
            className="scan-panel quiz-panel"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22 }}
          >
            <div className="quiz-count">{index + 1} / {QUESTIONS.length}</div>
            <h3>Hangisi <span>“{QUESTIONS[index].tr}”</span> demek?</h3>
            <div className="quiz-options">
              {QUESTIONS[index].options.map((option, i) => (
                <button
                  type="button"
                  key={option}
                  className={`quiz-option ${selected === option ? (option === QUESTIONS[index].answer ? 'is-correct' : 'is-wrong') : ''}`}
                  onClick={() => answer(option)}
                  disabled={Boolean(selected)}
                >
                  <span className="quiz-letter">{String.fromCharCode(65 + i)}</span>
                  <span>{option}</span>
                </button>
              ))}
            </div>
            <p className="quiz-foot">İçgüdüsel cevap ver. Tepki süren de modelin bir parçası.</p>
          </motion.div>
        ) : null}

        {phase === 'modality' ? (
          <motion.div
            key="modality"
            className="scan-panel modality-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="modality-grid">
              <button type="button" className="modality-card visual" onClick={() => finish('visual')}>
                <span className="modality-icon"><Eye size={26} /></span>
                <strong>Görerek</strong>
                <p>Kelimeyi yazılı görünce daha iyi hatırlarım.</p>
                <span className="modality-bar"><i /></span>
              </button>
              <button type="button" className="modality-card auditory" onClick={() => finish('auditory')}>
                <span className="modality-icon"><Ear size={26} /></span>
                <strong>Dinleyerek</strong>
                <p>Kelimeyi duyunca daha iyi hatırlarım.</p>
                <span className="modality-bar"><i /></span>
              </button>
              <button type="button" className="modality-card balanced" onClick={() => finish('balanced')}>
                <span className="modality-icon"><Waves size={26} /></span>
                <strong>İkisi de</strong>
                <p>Görsel ve işitsel kanalı birlikte kullanırım.</p>
                <span className="modality-bar"><i /></span>
              </button>
            </div>
            <p className="quiz-foot">Henüz emin değilsen “İkisi de” seç. Model zamanla karar verir.</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ResultStep({ profile, name, goal, busy, onStart }) {
  return (
    <div className="ob-step-content result-content">
      <div className="ob-eyebrow">04 · Profilin</div>
      <h2>Beynin hazır, {name || 'öğrenci'}.</h2>
      <p className="ob-lede">
        Bu ilk tahmin. İlk 20 cevabından sonra model kendini yeniden kalibre eder;
        hızın, doğruluğun ve modun her gün profili günceller.
      </p>

      <div className="result-card">
        <div className="result-card-head">
          <div className="result-avatar"><Brain size={22} /></div>
          <div>
            <span>Başlangıç profili</span>
            <strong>{profile.label}</strong>
          </div>
          <Chip tone="lime">kalibre</Chip>
        </div>
        <p className="result-tagline">{profile.tagline}</p>
        <Brainprint values={profile.print} tone="lime" height={70} />
        <MetricBars metrics={profile.metrics} compact />
        <div className="result-foot">
          <span><Check size={14} /> {profile.calibration.correct}/3 hatırlama</span>
          <span>{(profile.calibration.speedMs / 1000).toFixed(1)} sn tepki</span>
          <span>{goal} dk / gün</span>
        </div>
      </div>

      <div className="result-note">
        <Sparkles size={17} />
        <p>
          İlk blokta <strong>7 yeni kelime</strong> seni bekliyor. Her cevap FSRS-7R
          zamanlayıcısına bir sinyal olarak geri döner.
        </p>
      </div>

      <div className="ob-actions">
        <Button size="lg" trailing={ArrowRight} onClick={onStart} loading={busy}>İlk bloğu aç</Button>
        <span className="ob-hint">Hazır olduğunda başla.</span>
      </div>
    </div>
  );
}

export default function Onboarding({ onBackToWelcome }) {
  const { createAccount, showToast } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [motive, setMotive] = useState('seyahat');
  const [goal, setGoal] = useState(15);
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);

  const goBack = () => {
    if (step === 0) onBackToWelcome();
    else setStep((s) => s - 1);
  };

  async function start() {
    if (!profile) return;
    setBusy(true);
    try {
      await createAccount({
        name: name.trim(),
        goalMinutes: goal,
        motivation: motive,
        calibration: profile.calibration,
      });
    } catch (err) {
      showToast(err.message || 'Profil oluşturulamadı.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onboarding">
      <aside className="ob-aside">
        <div className="ob-aside-top">
          <Logo tone="light" />
          <Chip tone="on-blue" icon={Sparkles}>kişisel başlangıç</Chip>
        </div>
        <div className="ob-aside-copy">
          <span className="ob-aside-kicker">wort. yöntemi</span>
          <h1>Önce seni<br />tanıyoruz.</h1>
          <p>
            Herkes aynı yerden başlamaz. 3 dakikalık kısa bir tarama ile
            başlangıç noktanı buluyoruz.
          </p>
          <div className="ob-aside-list">
            <span><i><Brain size={15} /></i> Beyin profili</span>
            <span><i><Clock3 size={15} /></i> Sana göre tempo</span>
            <span><i><Sparkles size={15} /></i> FSRS-7R planı</span>
          </div>
        </div>
        <div className="ob-aside-quote">
          <span>“</span>
          <p>İyi bir plan, doğru zamanda doğru kelimeyi getirir.</p>
        </div>
        <div className="ob-aside-orbit" aria-hidden>
          <i /><i /><i />
        </div>
      </aside>

      <main className="ob-main">
        <div className="ob-main-inner">
          <StepHeader step={step} onBack={goBack} />
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 0 ? (
                <NameStep name={name} setName={setName} motive={motive} setMotive={setMotive} onNext={() => setStep(1)} />
              ) : null}
              {step === 1 ? (
                <GoalStep goal={goal} setGoal={setGoal} onNext={() => setStep(2)} />
              ) : null}
              {step === 2 ? (
                <ScanStep name={name} onBack={() => setStep(1)} onFinish={(p) => { setProfile(p); setStep(3); }} />
              ) : null}
              {step === 3 && profile ? (
                <ResultStep profile={profile} name={name} goal={goal} busy={busy} onStart={start} />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

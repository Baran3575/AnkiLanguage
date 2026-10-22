import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Home, Route, Layers3, ChartSpline, BrainCircuit, Settings2, Flame, ChevronRight, X, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { navigate, useRoute } from '../lib/router.js';
import { ProgressBar } from './ui.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import { SPEECH_ERROR_EVENT } from '../lib/speech.js';

const NAV = [
  { id: 'today', label: 'Bugün', href: '/today', icon: Home },
  { id: 'path', label: 'Yol', href: '/path', icon: Route },
  { id: 'review', label: 'Tekrar', href: '/review', icon: Layers3 },
  { id: 'progress', label: 'Gelişim', href: '/progress', icon: ChartSpline },
  { id: 'brain', label: 'Beyin', href: '/brain', icon: BrainCircuit },
];

function Sidebar({ active, due }) {
  const { user, dashboard, brain, path, setSettingsOpen } = useApp();
  const level = dashboard?.stats?.level || 'A1.1';
  const levelInfo = path?.levels?.find((l) => l.id === level) || path?.levels?.[0];
  const currentUnit = dashboard?.path?.currentUnit;

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <span className="sidebar-lang">TR <span>→</span> DE</span>
        <span className="sidebar-level-tag">{level}</span>
      </div>

      <nav className="sidebar-nav" aria-label="Ana gezinme">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              type="button"
              key={item.id}
              className={`side-nav-item ${isActive ? 'is-active' : ''}`}
              onClick={() => navigate(item.href)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={isActive ? 2.2 : 1.9} aria-hidden />
              <span>{item.label}</span>
              {item.id === 'review' && due > 0 ? <b className="nav-count">{due > 99 ? '99+' : due}</b> : null}
              {isActive ? <ChevronRight className="nav-arrow" size={15} aria-hidden /> : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-mid">
        <button type="button" className="sidebar-level" onClick={() => navigate('/path')}>
          <div className="sidebar-level-top">
            <span>{levelInfo?.title || 'A1.1'} · {levelInfo?.subtitle || 'Temeller'}</span>
            <strong>{Math.round((levelInfo?.progress || 0) * 100)}%</strong>
          </div>
          <ProgressBar value={(levelInfo?.progress || 0) * 100} tone="lime" height={6} label="Seviye ilerlemesi" />
          <small>
            {currentUnit ? `Ünite ${currentUnit.number} · ${currentUnit.title}` : 'Yol tamamlandı'}
          </small>
        </button>

        <button type="button" className="sidebar-brain" onClick={() => navigate('/brain')}>
          <div className="sidebar-brain-head">
            <span><BrainCircuit size={15} /> Beyin profili</span>
            <i className="live-dot" />
          </div>
          <strong>{brain?.profileLabel || 'Kalibre ediliyor'}</strong>
          <div className="sidebar-confidence">
            <span style={{ width: `${brain?.confidence || 0}%` }} />
          </div>
          <small>%{brain?.confidence || 0} güven · {brain?.evidence || 0} cevap</small>
        </button>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-streak">
          <span className="streak-flame"><Flame size={17} /></span>
          <div>
            <strong>{user?.streak || 0} gün</strong>
            <small>serini koru</small>
          </div>
          <span className="sidebar-xp">{user?.xp || 0} XP</span>
        </div>
        <button type="button" className="sidebar-user" onClick={() => setSettingsOpen(true)}>
          <span className="sidebar-avatar">{(user?.name || 'W').slice(0, 1).toLocaleUpperCase('tr-TR')}</span>
          <div>
            <strong>{user?.name || 'Öğrenci'}</strong>
            <small>Profil ve ayarlar</small>
          </div>
          <Settings2 size={17} aria-hidden />
        </button>
      </div>
    </aside>
  );
}

function MobileBar({ active, due }) {
  const { user, setSettingsOpen } = useApp();
  return (
    <>
      <header className="mobile-topbar">
        <span className="mobile-context">TR <b>→</b> DE <i>A1</i></span>
        <div className="mobile-topbar-actions">
          <button type="button" className="mobile-streak" onClick={() => navigate('/progress')} aria-label={`${user?.streak || 0} günlük seri`}>
            <Flame size={15} /> <strong>{user?.streak || 0}</strong>
          </button>
          <button type="button" className="mobile-avatar" onClick={() => setSettingsOpen(true)} aria-label="Profil ve ayarlar">
            {(user?.name || 'W').slice(0, 1).toLocaleUpperCase('tr-TR')}
          </button>
        </div>
      </header>
      <nav className="bottom-nav" aria-label="Mobil gezinme">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              type="button"
              key={item.id}
              className={`bottom-nav-item ${isActive ? 'is-active' : ''}`}
              onClick={() => navigate(item.href)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="bottom-nav-icon">
                <Icon size={20} strokeWidth={isActive ? 2.3 : 1.9} />
                {item.id === 'review' && due > 0 ? <b>{due > 9 ? '9+' : due}</b> : null}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

export function Toast() {
  const { toast, dismissToast } = useApp();
  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          className={`toast toast-${toast.tone || 'default'}`}
          initial={{ opacity: 0, y: 16, scale: 0.97, x: '-50%' }}
          animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
          exit={{ opacity: 0, y: 10, scale: 0.98, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          role="status"
          aria-live="polite"
        >
          {toast.tone === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
          <button type="button" onClick={dismissToast} aria-label="Bildirimi kapat"><X size={15} /></button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function Shell({ children }) {
  const route = useRoute();
  const { dashboard, showToast } = useApp();
  const active = route.name === 'review-session' ? 'review' : route.name;
  const due = dashboard?.plan?.dueReviews || dashboard?.vocab?.due || 0;

  useEffect(() => {
    function onSpeechError(event) {
      const message = event?.detail?.message || 'Almanca ses oynatılamadı.';
      showToast(`${message} Ayarlar → Almanca ses bölümünden ses paketini kontrol edebilirsin.`, 'error');
    }
    window.addEventListener(SPEECH_ERROR_EVENT, onSpeechError);
    return () => window.removeEventListener(SPEECH_ERROR_EVENT, onSpeechError);
  }, [showToast]);

  return (
    <div className="app-shell">
      <Sidebar active={active} due={due} />
      <MobileBar active={active} due={due} />
      <main className="app-main">{children}</main>
      <SettingsSheet />
      <Toast />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { LogOut, RotateCcw, ShieldCheck, Volume2, Sparkles, Brain, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { Button, Sheet, Chip } from './ui.jsx';
import { ConfidenceRing } from './BrainVisual.jsx';

function Toggle({ checked, onChange, label, hint, icon: Icon }) {
  return (
    <button type="button" className="setting-row" onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span className="setting-icon">{Icon ? <Icon size={18} strokeWidth={1.9} /> : null}</span>
      <span className="setting-copy">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className={`switch ${checked ? 'is-on' : ''}`} aria-hidden><i /></span>
    </button>
  );
}

export default function SettingsSheet() {
  const {
    user, brain, settingsOpen, setSettingsOpen, updateSettings, resetProgress, logout, showToast,
  } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [goal, setGoal] = useState(user?.goalMinutes || 15);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (settingsOpen) {
      setName(user?.name || '');
      setGoal(user?.goalMinutes || 15);
      setConfirmReset(false);
    }
  }, [settingsOpen, user?.name, user?.goalMinutes]);

  const settings = user?.settings || {};
  const close = () => setSettingsOpen(false);

  async function toggle(key, value) {
    try {
      await updateSettings({ settings: { [key]: value } });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function saveBasics(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettings({ name: name.trim() || user.name, goalMinutes: goal });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function doReset() {
    setResetting(true);
    try {
      await resetProgress();
      close();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setResetting(false);
    }
  }

  return (
    <Sheet
      open={settingsOpen}
      onClose={close}
      title="Profil & ayarlar"
      eyebrow="Senin alanın"
      footer={
        <Button variant="soft" icon={LogOut} full onClick={() => { close(); logout(); }}>
          Çıkış yap
        </Button>
      }
    >
      <section className="settings-profile">
        <div className="settings-avatar">{user?.name?.slice(0, 1).toLocaleUpperCase('tr-TR')}</div>
        <div>
          <h3>{user?.name}</h3>
          <p>{brain?.profileLabel || 'Beyin profili'} · A1.1 yolu</p>
        </div>
        <ConfidenceRing value={brain?.confidence || 0} />
      </section>

      <div className="settings-meta">
        <Chip tone="blue" icon={Brain}>{brain?.evidence || 0} cevap</Chip>
        <Chip tone="green" icon={ShieldCheck}>{user?.streak || 0} günlük seri</Chip>
        {user?.profile?.demo ? <Chip tone="amber" icon={Sparkles}>demo profil</Chip> : null}
      </div>

      <form className="settings-form" onSubmit={saveBasics}>
        <label className="field">
          <span>Adın</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" />
        </label>
        <fieldset className="field">
          <legend>Günlük hedefin</legend>
          <div className="goal-options">
            {[5, 10, 15, 20].map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`goal-option ${goal === minutes ? 'is-active' : ''}`}
                onClick={() => setGoal(minutes)}
                aria-pressed={goal === minutes}
              >
                <strong>{minutes}</strong>
                <span>dk / gün</span>
              </button>
            ))}
          </div>
          <small className="field-hint">Hedef; yeni kelime sayısını ve tekrar yoğunluğunu ayarlar.</small>
        </fieldset>
        <Button type="submit" variant="primary" full loading={saving}>Değişiklikleri kaydet</Button>
      </form>

      <section className="settings-section">
        <h4><SlidersHorizontal size={16} /> Deneyim</h4>
        <Toggle
          checked={settings.sound !== false}
          onChange={(v) => toggle('sound', v)}
          label="Ses efektleri"
          hint="Doğru cevap ve tamamlama sesleri"
          icon={Volume2}
        />
        <Toggle
          checked={settings.tts !== false}
          onChange={(v) => toggle('tts', v)}
          label="Almanca telaffuz"
          hint="Web Speech ile kelimeleri dinle"
          icon={Volume2}
        />
        <Toggle
          checked={Boolean(settings.reducedMotion)}
          onChange={(v) => toggle('reducedMotion', v)}
          label="Hareketi azalt"
          hint="Geçişleri ve konfetiyi sınırla"
          icon={SlidersHorizontal}
        />
      </section>

      <section className="settings-section settings-about">
        <h4>Motor</h4>
        <div className="engine-row"><span>Zamanlayıcı</span><strong>FSRS-7R · Recency</strong></div>
        <div className="engine-row"><span>Beyin modeli</span><strong>brain-v1</strong></div>
        <div className="engine-row"><span>İçerik</span><strong>A1.1 – A1.2 · 224 kelime</strong></div>
      </section>

      <section className="settings-section settings-danger">
        <h4>Veri</h4>
        {!confirmReset ? (
          <button type="button" className="setting-row" onClick={() => setConfirmReset(true)}>
            <span className="setting-icon"><RotateCcw size={18} /></span>
            <span className="setting-copy"><strong>İlerlemeyi sıfırla</strong><small>Kelime geçmişi, seri ve dersler silinir.</small></span>
          </button>
        ) : (
          <div className="reset-confirm">
            <p>Emin misin? Bu işlem geri alınamaz.</p>
            <div className="reset-actions">
              <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Vazgeç</Button>
              <Button size="sm" variant="danger" loading={resetting} onClick={doReset}>Evet, sıfırla</Button>
            </div>
          </div>
        )}
      </section>
    </Sheet>
  );
}

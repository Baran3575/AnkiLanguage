import { forwardRef, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Volume2, X, LoaderCircle, Check, ArrowRight, Sparkles,
} from 'lucide-react';
import { genderTone, articleParts } from '../lib/format.js';
import { speakGerman } from '../lib/speech.js';

export function Logo({ tone = 'dark', small = false, className = '' }) {
  return (
    <span className={`logo logo-${tone} ${small ? 'logo-sm' : ''} ${className}`} aria-label="wort.">
      wort<span className="logo-dot">.</span>
    </span>
  );
}

export const Button = forwardRef(function Button({
  children, variant = 'primary', size = 'md', className = '', icon: Icon, trailing: Trailing,
  loading = false, full = false, as: As = 'button', ...props
}, ref) {
  return (
    <As
      ref={ref}
      className={`btn btn-${variant} btn-${size} ${full ? 'btn-full' : ''} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <LoaderCircle className="spin" size={18} aria-hidden /> : Icon ? <Icon size={18} strokeWidth={2} aria-hidden /> : null}
      <span>{children}</span>
      {Trailing ? <Trailing size={18} strokeWidth={2} aria-hidden /> : null}
    </As>
  );
});

export function IconButton({ children, label, className = '', variant = 'ghost', ...props }) {
  return (
    <button type="button" className={`icon-btn icon-btn-${variant} ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Chip({ children, tone = 'neutral', icon: Icon, className = '', ...props }) {
  return (
    <span className={`chip chip-${tone} ${className}`} {...props}>
      {Icon ? <Icon size={14} strokeWidth={2.2} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}

export function ArticleDot({ gender, label = false, className = '' }) {
  if (!gender) return null;
  return (
    <span className={`article-indicator ${genderTone(gender)} ${className}`} title={gender}>
      <span className="article-swatch" aria-hidden />
      {label ? <span className="article-label">{gender}</span> : <span className="sr-only">{gender}</span>}
    </span>
  );
}

export function GermanWord({ de, className = '', showArticle = true }) {
  const { article, noun } = articleParts(de);
  if (!article || !showArticle) return <span className={className}>{de}</span>;
  return (
    <span className={`german-word ${className}`}>
      <span className={`article-text ${genderTone(article)}`}>{article}</span>{' '}
      <span>{noun}</span>
    </span>
  );
}

export function AudioButton({ text, size = 'md', label = 'Dinle', variant = 'soft', className = '', slow = false }) {
  const [speaking, setSpeaking] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function play(e) {
    e?.stopPropagation?.();
    setSpeaking(true);
    const ok = speakGerman(text, {
      rate: slow ? 0.7 : 0.88,
      onEnd: () => setSpeaking(false),
    });
    if (!ok) setSpeaking(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSpeaking(false), Math.max(1400, (text?.length || 6) * 110));
  }
  return (
    <button
      type="button"
      className={`audio-btn audio-btn-${size} audio-btn-${variant} ${speaking ? 'is-speaking' : ''} ${className}`}
      onClick={play}
      aria-label={`${label}: ${text}`}
      title={`${label}: ${text}`}
    >
      <span className="audio-lines" aria-hidden>
        <i /><i /><i />
      </span>
      <Volume2 size={size === 'sm' ? 15 : 18} strokeWidth={2} aria-hidden />
    </button>
  );
}

export function ProgressBar({ value, tone = 'blue', className = '', label, height = 8 }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className={`progress ${className}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span className={`progress-fill tone-${tone}`} style={{ width: `${pct}%`, height }} />
    </div>
  );
}

export function Segmented({ options, value, onChange, className = '', label }) {
  return (
    <div className={`segmented ${className}`} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`segmented-item ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = '', width, height, radius = 12 }) {
  return <span className={`skeleton ${className}`} style={{ width, height, borderRadius: radius }} aria-hidden />;
}

export function EmptyState({ icon: Icon = Sparkles, title, body, action, className = '' }) {
  return (
    <div className={`empty-state ${className}`}>
      <span className="empty-icon"><Icon size={24} strokeWidth={1.8} /></span>
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function Avatar({ name, size = 'md', className = '', onClick }) {
  const initial = (name || 'W').trim().slice(0, 1).toLocaleUpperCase('tr-TR');
  const Component = onClick ? 'button' : 'span';
  return (
    <Component className={`avatar avatar-${size} ${className}`} onClick={onClick} aria-label={name}>
      <span>{initial}</span>
      <i aria-hidden />
    </Component>
  );
}

export function Sheet({ open, onClose, title, eyebrow, children, footer, side = 'right', width = 440 }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => closeRef.current?.focus(), 60);
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="sheet-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button className="sheet-backdrop" aria-label="Kapat" onClick={onClose} tabIndex={-1} />
          <motion.aside
            className={`sheet sheet-${side}`}
            style={{ width }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            initial={{ x: side === 'right' ? '110%' : '-110%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '110%' : '-110%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38, mass: 0.8 }}
          >
            <header className="sheet-header">
              <div>
                {eyebrow ? <span className="sheet-eyebrow">{eyebrow}</span> : null}
                <h2 id="sheet-title">{title}</h2>
              </div>
              <button ref={closeRef} type="button" className="icon-btn icon-btn-soft" onClick={onClose} aria-label="Kapat">
                <X size={18} />
              </button>
            </header>
            <div className="sheet-body">{children}</div>
            {footer ? <footer className="sheet-footer">{footer}</footer> : null}
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function StatChip({ icon: Icon, label, value, tone = 'blue' }) {
  return (
    <span className={`stat-chip stat-chip-${tone}`}>
      {Icon ? <Icon size={15} strokeWidth={2} aria-hidden /> : null}
      <span className="stat-chip-label">{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

export function Keycap({ children }) {
  return <kbd className="keycap">{children}</kbd>;
}

export function CheckMark({ size = 18 }) {
  return <Check size={size} strokeWidth={3} aria-hidden />;
}

export function NextArrow({ size = 18 }) {
  return <ArrowRight size={size} strokeWidth={2.3} aria-hidden />;
}

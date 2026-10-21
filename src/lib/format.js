export function formatMinutes(value, { compact = false } = {}) {
  const n = Number(value) || 0;
  if (n >= 60) {
    const h = Math.floor(n / 60);
    const m = Math.round(n % 60);
    if (compact) return m ? `${h}s ${m}dk` : `${h}s`;
    return m ? `${h} saat ${m} dk` : `${h} saat`;
  }
  const rounded = Math.round(n * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  return `${label} dk`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('tr-TR').format(Number(value) || 0);
}

export function formatDate(value, options = {}) {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul', ...options });
}

export function formatShortDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' });
}

export function greeting(name, date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('tr-TR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }).format(date));
  if (hour < 6) return `İyi geceler, ${name}`;
  if (hour < 12) return `Guten Morgen, ${name}`;
  if (hour < 18) return `Guten Tag, ${name}`;
  return `Guten Abend, ${name}`;
}

export function todayLong(date = new Date()) {
  return date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' });
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase('tr-TR')).join('') || 'W';
}

export function genderTone(gender) {
  if (gender === 'der') return 'blue';
  if (gender === 'die') return 'rose';
  if (gender === 'das') return 'green';
  return 'neutral';
}

export function articleParts(de = '') {
  const match = de.match(/^(der|die|das)\s+(.+)$/i);
  return match ? { article: match[1].toLowerCase(), noun: match[2] } : { article: null, noun: de };
}

export function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

export function pluralTr(count, one, many) {
  return Number(count) === 1 ? one : many;
}

export function percent(value, digits = 0) {
  const n = Number(value) || 0;
  return `${n.toLocaleString('tr-TR', { maximumFractionDigits: digits })}%`;
}

export function relativeDay(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'bugün';
  if (days === 1) return 'yarın';
  if (days < 7) return `${days} gün sonra`;
  return formatShortDate(iso);
}

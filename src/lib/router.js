import { useEffect, useState } from 'react';

export function parseRoute(hash = window.location.hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  const [pathPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  if (!parts.length) return { name: 'today', path: '/today' };
  if (parts[0] === 'lesson' && parts[1]) return { name: 'lesson', lessonId: parts[1], path: `/lesson/${parts[1]}` };
  if (parts[0] === 'review' && parts[1] === 'session') return { name: 'review-session', path: '/review/session' };
  if (['today', 'path', 'review', 'progress', 'brain', 'settings'].includes(parts[0])) {
    return { name: parts[0], path: `/${parts[0]}` };
  }
  return { name: 'today', path: '/today' };
}

export function navigate(path) {
  const next = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
  if (window.location.hash === next) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = next;
  }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute());
  useEffect(() => {
    const onChange = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onChange);
    if (!window.location.hash) window.history.replaceState(null, '', '#/today');
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

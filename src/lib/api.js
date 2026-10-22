const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === 'true';

let localApiPromise = null;
async function getLocalApi() {
  if (!localApiPromise) {
    localApiPromise = import('../local/engine.js').then((m) => m.localApi);
  }
  return localApiPromise;
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `İstek başarısız (${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  isLocal: LOCAL_MODE,

  async meta() {
    if (LOCAL_MODE) return (await getLocalApi()).meta();
    return request('/api/meta');
  },

  async createUser(payload) {
    if (LOCAL_MODE) return (await getLocalApi()).createUser(payload);
    return request('/api/users', { method: 'POST', body: JSON.stringify(payload) });
  },

  async bootstrap(userId) {
    if (LOCAL_MODE) return (await getLocalApi()).bootstrap(userId);
    return request(`/api/users/${encodeURIComponent(userId)}/bootstrap`);
  },

  async dashboard(userId) {
    if (LOCAL_MODE) return (await getLocalApi()).dashboard(userId);
    return request(`/api/users/${encodeURIComponent(userId)}/dashboard`);
  },

  async path(userId) {
    if (LOCAL_MODE) return (await getLocalApi()).path(userId);
    return request(`/api/users/${encodeURIComponent(userId)}/path`);
  },

  async lesson(userId, lessonId) {
    if (LOCAL_MODE) return (await getLocalApi()).lesson(userId, lessonId);
    return request(`/api/users/${encodeURIComponent(userId)}/lesson/${encodeURIComponent(lessonId)}`);
  },

  async completeLesson(userId, lessonId, payload) {
    if (LOCAL_MODE) return (await getLocalApi()).completeLesson(userId, lessonId, payload);
    return request(`/api/users/${encodeURIComponent(userId)}/lesson/${encodeURIComponent(lessonId)}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async reviewQueue(userId) {
    if (LOCAL_MODE) return (await getLocalApi()).reviewQueue(userId);
    return request(`/api/users/${encodeURIComponent(userId)}/review`);
  },

  async submitReview(userId, payload) {
    if (LOCAL_MODE) return (await getLocalApi()).submitReview(userId, payload);
    return request(`/api/users/${encodeURIComponent(userId)}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async progress(userId, range = 30) {
    if (LOCAL_MODE) return (await getLocalApi()).progress(userId, range);
    return request(`/api/users/${encodeURIComponent(userId)}/progress?range=${range}`);
  },

  async brain(userId) {
    if (LOCAL_MODE) return (await getLocalApi()).brain(userId);
    return request(`/api/users/${encodeURIComponent(userId)}/brain`);
  },

  async updateSettings(userId, payload) {
    if (LOCAL_MODE) return (await getLocalApi()).updateSettings(userId, payload);
    return request(`/api/users/${encodeURIComponent(userId)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async resetProgress(userId) {
    if (LOCAL_MODE) return (await getLocalApi()).resetProgress(userId);
    return request(`/api/users/${encodeURIComponent(userId)}/reset`, { method: 'POST', body: '{}' });
  },
};

export const USER_KEY = 'wort.user';

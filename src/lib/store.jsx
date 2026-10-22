import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, USER_KEY } from './api.js';
import { navigate } from './router.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, tone = 'default') => {
    setToast({ message, tone, id: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const load = useCallback(async (id, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.bootstrap(id);
      setUser(data.user);
      setBootstrap(data);
      setError(null);
      localStorage.setItem(USER_KEY, id);
      return data;
    } catch (err) {
      if (err.status === 404) {
        localStorage.removeItem(USER_KEY);
        setUser(null);
        setBootstrap(null);
      }
      setError(err);
      throw err;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = localStorage.getItem(USER_KEY);
    if (!id || id === 'demo') {
      if (id === 'demo') localStorage.removeItem(USER_KEY);
      setLoading(false);
      return;
    }
    load(id).catch(() => {
      setLoading(false);
      setUser(null);
    });
  }, [load]);

  const signIn = useCallback(async (id, message) => {
    await load(id);
    navigate('/today');
    if (message) showToast(message);
  }, [load, showToast]);

  const createAccount = useCallback(async (payload) => {
    setLoading(true);
    try {
      const data = await api.createUser(payload);
      await load(data.user.id);
      navigate('/today');
      showToast('Beyin profilin oluşturuldu. İlk bloğun hazır.', 'success');
      return data;
    } finally {
      setLoading(false);
    }
  }, [load, showToast]);

  const refresh = useCallback(async ({ silent = true } = {}) => {
    const id = user?.id || localStorage.getItem(USER_KEY);
    if (!id) return null;
    return load(id, { silent });
  }, [load, user?.id]);

  const logout = useCallback(() => {
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setBootstrap(null);
    navigate('/today');
    window.scrollTo({ top: 0 });
  }, []);

  const updateSettings = useCallback(async (payload) => {
    if (!user) return null;
    const data = await api.updateSettings(user.id, payload);
    setUser(data.user);
    setBootstrap((prev) => prev ? { ...prev, user: data.user, dashboard: data.dashboard, brain: data.dashboard?.brain || prev.brain } : prev);
    showToast('Ayarlar güncellendi.', 'success');
    return data;
  }, [user, showToast]);

  const resetProgress = useCallback(async () => {
    if (!user) return;
    await api.resetProgress(user.id);
    await load(user.id);
    showToast('İlerlemen sıfırlandı. Yeni bir başlangıç.', 'success');
  }, [user, load, showToast]);

  const value = {
    user,
    bootstrap,
    dashboard: bootstrap?.dashboard || null,
    path: bootstrap?.path || null,
    brain: bootstrap?.brain || null,
    loading,
    error,
    toast,
    settingsOpen,
    setSettingsOpen,
    signIn,
    createAccount,
    refresh,
    logout,
    updateSettings,
    resetProgress,
    showToast,
    dismissToast: () => setToast(null),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './lib/store.jsx';
import { useRoute } from './lib/router.js';
import Shell from './components/Shell.jsx';
import Welcome from './screens/Welcome.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Today from './screens/Today.jsx';
import Path from './screens/Path.jsx';
import Lesson from './screens/Lesson.jsx';
import { Review, ReviewSession } from './screens/Review.jsx';
import Progress from './screens/Progress.jsx';
import Brain from './screens/Brain.jsx';
import { Logo } from './components/ui.jsx';

const TITLES = {
  today: 'Bugün',
  path: 'Yol',
  review: 'Tekrar',
  reviewSession: 'Tekrar oturumu',
  progress: 'Gelişim',
  brain: 'Beyin',
  lesson: 'Blok',
};

function BootSplash() {
  return (
    <div className="boot-splash">
      <div className="boot-logo"><Logo tone="dark" /></div>
      <div className="boot-scan">
        {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 45}ms` }} />)}
      </div>
      <p>Beyin profilin hazırlanıyor…</p>
    </div>
  );
}

function RoutedApp() {
  const { user, loading, bootstrap, error } = useApp();
  const route = useRoute();
  const [welcomeMode, setWelcomeMode] = useState('landing');

  useEffect(() => {
    if (!user) setWelcomeMode('landing');
  }, [user]);

  useEffect(() => {
    const key = route.name === 'review-session' ? 'reviewSession' : route.name;
    document.title = `${TITLES[key] || 'wort'} · wort.`;
    if (!['lesson', 'review-session', 'path'].includes(route.name)) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [route.name]);

  if (loading && !bootstrap) return <BootSplash />;

  if (!user) {
    if (welcomeMode === 'onboarding') {
      return <Onboarding onBackToWelcome={() => setWelcomeMode('landing')} />;
    }
    return <Welcome onStart={() => setWelcomeMode('onboarding')} />;
  }

  if (route.name === 'lesson') {
    return <Lesson lessonId={route.lessonId} />;
  }
  if (route.name === 'review-session') {
    return <ReviewSession />;
  }

  let screen = <Today />;
  if (route.name === 'path') screen = <Path />;
  if (route.name === 'review') screen = <Review />;
  if (route.name === 'progress') screen = <Progress />;
  if (route.name === 'brain') screen = <Brain />;

  return <Shell>{screen}</Shell>;
}

export default function App() {
  return (
    <AppProvider>
      <RoutedApp />
    </AppProvider>
  );
}

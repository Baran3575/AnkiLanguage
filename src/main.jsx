import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App.jsx';
import { initNativeShell } from './lib/native.js';
import { warmUpSpeech } from './lib/speech.js';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

initNativeShell();
warmUpSpeech();

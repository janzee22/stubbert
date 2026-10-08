import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/figtree/index.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { initTheme } from './state/theme.js';
import './theme.css';
import './app.css';
import './features/categories/categories.css';
import './features/sync/sync.css';
import './features/notify/notify.css';
import './features/settings/settings.css';
import './features/onboarding/onboarding.css';
import './utilities.css';

initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

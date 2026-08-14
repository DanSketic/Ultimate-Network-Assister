import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Bundled locally rather than pulled from a font CDN: the desktop shell blocks
// remote requests and must render offline.
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

import './styles/theme.css';
import './styles/app.css';

import { deepLink } from './lib/deeplink';
import { loadPrefs } from './lib/prefs';
import { systemTheme } from './lib/palette';
import App from './App';

/*
 * Settle the theme before the first paint.
 *
 * The stored choice is read here rather than waiting for React, because
 * otherwise someone who picked light on a dark desktop watches the window flash
 * the wrong way round on every start. Only `auto` asks the system.
 *
 * It lives here rather than as an inline script in index.html because the
 * desktop build's CSP allows scripts only from files.
 */
const stored = loadPrefs({ themePref: 'auto', langPref: 'auto' });
const wanted = deepLink().theme ?? stored.themePref;
document.documentElement.setAttribute(
  'data-theme',
  wanted === 'auto' ? systemTheme() : wanted,
);

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

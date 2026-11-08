import '@fontsource-variable/nunito';
// Hebrew + Arabic glyphs (Nunito has none); later in the font stack, so the
// browser only downloads these subsets when that script is on screen.
import '@fontsource-variable/rubik';
import './app.css';

import { mount } from 'svelte';

import App from './App.svelte';
import { initAnalytics } from './lib/analytics';
import { applyDir } from './lib/i18n';
import { reloadForNewBuild } from './lib/stalebuild';

applyDir();
initAnalytics();

// A lazy chunk of the previous deploy is gone: reload into the current one.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewBuild()) event.preventDefault();
});

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount point');

const app = mount(App, { target });

export default app;

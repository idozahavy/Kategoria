import '@fontsource-variable/nunito';
import './app.css';

import { mount } from 'svelte';

import App from './App.svelte';
import { initAnalytics } from './lib/analytics';
import { applyDir } from './lib/i18n';

applyDir();
initAnalytics();

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount point');

const app = mount(App, { target });

export default app;

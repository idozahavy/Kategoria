#!/usr/bin/env node
// Generates design/exports/tokens.css and design/style-guide.html from
// design/tokens.json + design/components.json. No dependencies, no network.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readJson,
  findDesignRoot,
  flattenAndResolve,
  buildColorVars,
  buildBaseVars,
  COLOR_VAR_MAP,
} from './lib/tokens.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const designRoot = findDesignRoot(scriptDir);
const tokensPath = path.join(designRoot, 'tokens.json');
const componentsPath = path.join(designRoot, 'components.json');
const exportsDir = path.join(designRoot, 'exports');
const cssOutPath = path.join(exportsDir, 'tokens.css');
const htmlOutPath = path.join(designRoot, 'style-guide.html');

const tokens = readJson(tokensPath);
const components = readJson(componentsPath);

const { flat, errors } = flattenAndResolve(tokens);
if (errors.length) {
  for (const e of errors) {
    console.error(`Token resolution error at "${e.path}": ${e.message}`);
  }
  process.exit(1);
}

const lightColorVars = buildColorVars(flat, 'light');
const darkColorVars = buildColorVars(flat, 'dark');
const baseVars = buildBaseVars(flat);

// ---------------------------------------------------------------------------
// 1. tokens.css
// ---------------------------------------------------------------------------

function formatVarBlock(vars, indent = '  ') {
  return Object.entries(vars)
    .map(([name, value]) => `${indent}${name}: ${value};`)
    .join('\n');
}

const cssParts = [];
cssParts.push('/* GENERATED from design/tokens.json — do not edit by hand */');
cssParts.push('/* Regenerate with: node design/scripts/build-style-guide.mjs */');
cssParts.push('');
cssParts.push(':root {');
cssParts.push('  /* --- semantic colors (light, default) --- */');
cssParts.push(formatVarBlock(lightColorVars));
cssParts.push('');
cssParts.push('  /* --- spacing --- */');
cssParts.push(formatVarBlock(Object.fromEntries(Object.entries(baseVars).filter(([k]) => k.startsWith('--space-')))));
cssParts.push('');
cssParts.push('  /* --- radius --- */');
cssParts.push(formatVarBlock(Object.fromEntries(Object.entries(baseVars).filter(([k]) => k.startsWith('--radius-')))));
cssParts.push('');
cssParts.push('  /* --- border --- */');
cssParts.push(formatVarBlock({
  '--border-width': baseVars['--border-width'],
  '--border-edge-width': baseVars['--border-edge-width'],
}));
cssParts.push('');
cssParts.push('  /* --- size (touch targets) --- */');
cssParts.push(formatVarBlock(Object.fromEntries(Object.entries(baseVars).filter(([k]) => k.startsWith('--size-')))));
cssParts.push('');
cssParts.push('  /* --- shadow --- */');
cssParts.push(formatVarBlock({ '--shadow-card': baseVars['--shadow-card'] }));
cssParts.push('');
cssParts.push('  /* --- z-index --- */');
cssParts.push(formatVarBlock(Object.fromEntries(Object.entries(baseVars).filter(([k]) => k.startsWith('--z-')))));
cssParts.push('');
cssParts.push('  /* --- typography --- */');
cssParts.push(formatVarBlock(Object.fromEntries(Object.entries(baseVars).filter(([k]) =>
  k.startsWith('--font-') || k.startsWith('--line-height-')
))));
cssParts.push('');
cssParts.push('  /* --- motion --- */');
cssParts.push(formatVarBlock(Object.fromEntries(Object.entries(baseVars).filter(([k]) =>
  k.startsWith('--duration-') || k.startsWith('--easing-')
))));
cssParts.push('}');
cssParts.push('');
cssParts.push('[data-theme="dark"] {');
cssParts.push('  /* --- semantic colors (dark override) --- */');
cssParts.push(formatVarBlock(darkColorVars));
cssParts.push('}');
cssParts.push('');
cssParts.push('/* Reduced motion: consumers should replace movement/scaling with a 150ms');
cssParts.push('   linear fade (--duration-fast) and make the timer warning color-only.');
cssParts.push('   See design/tokens.json → motion.rules for the authored rule. */');
cssParts.push('@media (prefers-reduced-motion: reduce) {');
cssParts.push('  /* intentionally no selectors here — this file only defines tokens;');
cssParts.push('     component CSS is responsible for honoring prefers-reduced-motion. */');
cssParts.push('}');
cssParts.push('');

mkdirSync(exportsDir, { recursive: true });
writeFileSync(cssOutPath, cssParts.join('\n'), 'utf8');

// ---------------------------------------------------------------------------
// 2. style-guide.html
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const allCssVarsText = [...Object.entries(lightColorVars), ...Object.entries(baseVars)]
  .map(([n, v]) => `  ${n}: ${v};`)
  .join('\n');
const darkCssVarsText = Object.entries(darkColorVars)
  .map(([n, v]) => `    ${n}: ${v};`)
  .join('\n');

const playerVars = Object.keys(COLOR_VAR_MAP).filter((k) => k.startsWith('player-'));

function colorSwatchesHtml(theme) {
  const semanticKeys = Object.keys(COLOR_VAR_MAP).filter((k) => !k.startsWith('player-'));
  const rows = semanticKeys.map((key) => {
    const varName = `--${COLOR_VAR_MAP[key]}`;
    const hex = flat[`color.${theme}.${key}`];
    return `
        <div class="swatch">
          <div class="swatch-color" style="background:var(${varName})"></div>
          <div class="swatch-label">${esc(key)}</div>
          <div class="swatch-value">${esc(varName)}<br>${esc(hex)}</div>
        </div>`;
  }).join('');
  const playerRows = playerVars.map((key) => {
    const varName = `--${COLOR_VAR_MAP[key]}`;
    const hex = flat[`color.${theme}.${key}`];
    return `
        <div class="swatch">
          <div class="swatch-color" style="background:var(${varName})"></div>
          <div class="swatch-label">${esc(key)}</div>
          <div class="swatch-value">${esc(varName)}<br>${esc(hex)}</div>
        </div>`;
  }).join('');
  return `<div class="swatch-grid">${rows}</div>
      <h3>Player colors</h3>
      <div class="swatch-grid">${playerRows}</div>`;
}

const typeScaleRows = ['display', 'h1', 'h2', 'body', 'small'].map((key) => `
      <div class="type-row">
        <div class="type-sample" style="font-size:var(--font-size-${key});font-weight:var(--font-weight-${key === 'display' ? 'display' : key === 'h1' ? 'heading' : key === 'h2' ? 'heading' : key === 'small' ? 'body' : 'body'});line-height:var(--line-height-${key})">Aa Bb Categories</div>
        <div class="type-meta">--font-size-${key} (${esc(flat[`typography.size.${key}`])}) · line-height ${esc(String(flat[`typography.lineHeight.${key}`]))}</div>
      </div>`).join('');

const spaceRows = ['1', '2', '3', '4', '5', '6', '7'].map((key) => `
      <div class="scale-row">
        <div class="scale-box" style="inline-size:var(--space-${key});block-size:var(--space-${key})"></div>
        <div class="scale-label">--space-${key} = ${esc(flat[`space.${key}`])}</div>
      </div>`).join('');

const radiusRows = ['sm', 'md', 'lg', 'pill'].map((key) => `
      <div class="scale-row">
        <div class="scale-box radius-demo" style="border-radius:var(--radius-${key})"></div>
        <div class="scale-label">--radius-${key} = ${esc(flat[`radius.${key}`])}</div>
      </div>`).join('');

const shadowRow = `
      <div class="scale-row">
        <div class="scale-box shadow-demo" style="box-shadow:var(--shadow-card)"></div>
        <div class="scale-label">--shadow-card</div>
      </div>`;

// --- Component specimens -----------------------------------------------

const buttonVariants = components.components.button.variants;
const buttonStates = components.components.button.states;
const buttonSpecimens = buttonVariants.map((variant) => {
  const boxes = buttonStates.map((state) => {
    const cls = `btn btn--${variant} is-${state}`;
    const label = `${variant} / ${state}`;
    return `<button type="button" class="${cls}" ${state === 'disabled' ? 'disabled' : ''}>${esc(label)}</button>`;
  }).join('\n          ');
  return `
        <div class="component-row">
          <div class="component-row-label">${esc(variant)}</div>
          <div class="component-row-items">
          ${boxes}
          </div>
        </div>`;
}).join('');

const inputSpecimens = components.components.input.states.map((state) => `
        <div class="input-demo-wrap">
          <label class="input-demo-label">${esc(state)}</label>
          <input class="input input--${state}" ${state === 'disabled' ? 'disabled' : ''}
            value="${state === 'error' ? 'bad answer' : 'answer'}" ${state === 'focus' ? 'autofocus' : ''} />
          ${state === 'error' ? '<div class="input-error-msg">Please try again</div>' : ''}
        </div>`).join('');

const cardSpecimen = `
      <div class="card">
        <strong>Round 3</strong>
        <p class="muted-text">Category: Animals</p>
      </div>`;

const chipSpecimen = `
      <div class="chip-row">
        <span class="chip chip--on">Animals</span>
        <span class="chip chip--off">Countries</span>
      </div>`;

const topbarSpecimen = `
      <div class="topbar">
        <button type="button" class="icon-btn" aria-label="Back">&larr;</button>
        <div class="topbar-title">Round 2</div>
        <button type="button" class="icon-btn" aria-label="Settings">&#9881;</button>
      </div>`;

const modalSpecimen = `
      <div class="modal-demo">
        <div class="modal-overlay-demo"></div>
        <div class="modal-panel">
          <div class="modal-emoji">🎉</div>
          <strong>Round complete!</strong>
          <p class="muted-text">Everyone submitted their answers.</p>
          <div class="modal-actions">
            <button type="button" class="btn btn--secondary">Review</button>
            <button type="button" class="btn btn--primary">Continue</button>
          </div>
        </div>
      </div>`;

const scoreRowSpecimen = ['1', '2', '3'].map((n) => `
        <div class="score-row">
          <div class="avatar" style="background:var(--color-player-${n})">${n}</div>
          <div class="score-name">Player ${n}</div>
          <div class="score-value">${(n * 7) % 20 + 10}</div>
        </div>`).join('');

const letterTileSpecimen = `<div class="letter-tile">C</div>`;

const timerSpecimens = `
      <div class="component-row-items">
        <div class="timer">00:42</div>
        <div class="timer timer--warn">00:09</div>
      </div>`;

const skeletonSpecimen = `
      <div class="skeleton-list">
        <div class="skeleton-block" style="inline-size:70%"></div>
        <div class="skeleton-block" style="inline-size:90%"></div>
        <div class="skeleton-block" style="inline-size:50%"></div>
      </div>`;

const spinnerSpecimen = `<div class="spinner" aria-label="Loading"></div>`;

const emptyStateSpecimen = `
      <div class="empty-state">
        <div class="empty-emoji">📭</div>
        <strong>No saved games yet</strong>
        <p class="muted-text">Start a new game and it will appear here!</p>
        <button type="button" class="btn btn--primary">New game</button>
      </div>`;

const errorCardSpecimen = `
      <div class="error-card">
        <strong>Couldn't load your game</strong>
        <p class="muted-text">Check your connection and try again.</p>
        <button type="button" class="btn btn--secondary">Retry</button>
      </div>`;

const focusRingSpecimen = `
      <button type="button" class="btn btn--primary demo-focus-ring">Focused button</button>`;

// --- Wrong vs right pairs ------------------------------------------------

const wrongRightPairs = [
  {
    title: 'Button',
    wrong: `<button type="button" style="background:#00AEEF;color:#fff;border-radius:2px;font-family:Arial,sans-serif;padding:10px 14px;border:none;">Off-scheme button</button>`,
    right: `<button type="button" class="btn btn--primary">Token-based button</button>`,
  },
  {
    title: 'Card',
    wrong: `<div style="background:#eeeeee;border-radius:3px;box-shadow:0 1px 2px #000;padding:6px;font-family:Arial,sans-serif;">Off-scheme card</div>`,
    right: cardSpecimen,
  },
  {
    title: 'Chip',
    wrong: `<span style="background:#00AEEF;color:#fff;border-radius:4px;padding:4px 8px;font-family:Arial,sans-serif;">Off-scheme chip</span>`,
    right: `<span class="chip chip--on">Token-based chip</span>`,
  },
  {
    title: 'Input',
    wrong: `<input style="border:1px solid #999;border-radius:2px;padding:6px;font-family:Arial,sans-serif;" value="off-scheme input" />`,
    right: `<input class="input input--default" value="token-based input" />`,
  },
];

const wrongRightHtml = wrongRightPairs.map((pair) => `
      <div class="wr-pair">
        <div class="wr-col">
          <div class="wr-label wr-label--wrong">Wrong — off-scheme</div>
          <div class="wr-demo">${pair.wrong}</div>
        </div>
        <div class="wr-col">
          <div class="wr-label wr-label--right">Right — token-based</div>
          <div class="wr-demo">${pair.right}</div>
        </div>
      </div>
      <div class="wr-title">${esc(pair.title)}</div>`).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kategoria — Style Guide</title>
<style>
/* GENERATED by design/scripts/build-style-guide.mjs — do not edit by hand */
:root {
${allCssVarsText}
}
[data-theme="dark"] {
${darkCssVarsText}
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font-family-base);
  font-size: var(--font-size-body);
  font-weight: var(--font-weight-body);
  line-height: var(--line-height-body);
  background: var(--color-bg);
  color: var(--color-text);
  padding-block: var(--space-6);
  padding-inline: var(--space-5);
}

h1, h2, h3 { font-weight: var(--font-weight-heading); margin-block: 0 var(--space-3); }
h1 { font-size: var(--font-size-h1); }
h2 { font-size: var(--font-size-h2); margin-block-start: var(--space-7); border-block-start: var(--border-width) solid var(--color-border); padding-block-start: var(--space-6); }
h3 { font-size: var(--font-size-body); margin-block-start: var(--space-5); }
p { margin-block: 0 var(--space-3); }
.muted-text { color: var(--color-muted); font-size: var(--font-size-small); }
.section { margin-block-end: var(--space-7); }
.generated-note { color: var(--color-muted); font-size: var(--font-size-small); margin-block-end: var(--space-6); }

.theme-block {
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  border: var(--border-width) solid var(--color-border);
  margin-block-end: var(--space-5);
}
.theme-block--dark { background: #241B1D; color: #F5EDE7; }

.swatch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-4);
}
.swatch-color {
  block-size: 56px;
  border-radius: var(--radius-sm);
  border: var(--border-width) solid rgba(0,0,0,0.1);
}
.swatch-label { font-weight: var(--font-weight-subheading); margin-block-start: var(--space-1); font-size: var(--font-size-small); }
.swatch-value { font-size: 11px; opacity: 0.7; font-variant-numeric: tabular-nums; }

.type-row { margin-block-end: var(--space-4); }
.type-sample { margin-block-end: var(--space-1); }
.type-meta { font-size: var(--font-size-small); color: var(--color-muted); }

.scale-row { display: flex; align-items: center; gap: var(--space-4); margin-block-end: var(--space-3); }
.scale-box { background: var(--color-primary); }
.radius-demo { inline-size: 56px; block-size: 56px; background: var(--color-accent); }
.shadow-demo { inline-size: 96px; block-size: 56px; background: var(--color-surface); }
.scale-label { font-size: var(--font-size-small); color: var(--color-muted); }

.component-row { margin-block-end: var(--space-5); }
.component-row-label { font-weight: var(--font-weight-subheading); margin-block-end: var(--space-2); text-transform: capitalize; }
.component-row-items { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }

.btn {
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-display);
  font-size: var(--font-size-body);
  border-radius: var(--radius-md);
  min-block-size: 48px;
  padding-inline: var(--space-5);
  border: none;
  border-block-end: var(--border-edge-width) solid transparent;
  cursor: pointer;
  transition: transform var(--duration-press) var(--easing-spring);
}
.btn--primary { background: var(--color-primary); color: var(--color-on-primary); border-block-end-color: var(--color-primary-edge); }
.btn--accent { background: var(--color-accent); color: var(--color-on-accent); border-block-end-color: var(--color-accent-edge); }
.btn--secondary { background: var(--color-surface); color: var(--color-primary); border: var(--border-width) solid var(--color-primary); border-block-end: var(--border-edge-width) solid var(--color-primary); }
.btn--danger { background: var(--color-danger); color: var(--color-on-danger); border-block-end-color: var(--color-danger-edge); }
.btn--ghost { background: transparent; color: var(--color-primary); }
.btn.is-hover { filter: brightness(1.06); }
.btn.is-pressed { border-block-end-width: 0; transform: translateY(5px); }
.btn.is-disabled, .btn:disabled { background: #E4DCD2; color: #9A8F92; border-block-end-color: #CFC5B9; cursor: not-allowed; }
.btn.is-focus, .btn:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }

.input {
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-body);
  font-size: var(--font-size-body);
  min-block-size: 48px;
  border-radius: var(--radius-md);
  border: var(--border-width) solid var(--color-border-strong);
  padding-inline: var(--space-3);
  background: var(--color-surface);
  color: var(--color-text);
}
.input-demo-wrap { margin-block-end: var(--space-3); }
.input-demo-label { display: block; font-size: var(--font-size-small); color: var(--color-muted); margin-block-end: var(--space-1); text-transform: capitalize; }
.input--focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(14,124,114,0.25); }
.input--error { border-color: var(--color-danger); background: #FFF5F5; }
.input--disabled { opacity: 0.6; }
.input-error-msg { color: var(--color-danger); font-size: var(--font-size-small); font-weight: var(--font-weight-subheading); margin-block-start: var(--space-1); }

.card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: var(--border-width) solid var(--color-border);
  box-shadow: var(--shadow-card);
  padding: var(--space-4);
  max-inline-size: 280px;
}

.chip-row { display: flex; gap: var(--space-3); }
.chip {
  border-radius: var(--radius-pill);
  min-block-size: 44px;
  display: inline-flex;
  align-items: center;
  padding-inline: var(--space-4);
  font-weight: 800;
  font-size: 15px;
}
.chip--on { background: var(--color-primary); color: var(--color-on-primary); }
.chip--off { background: var(--color-surface); color: var(--color-muted); border: var(--border-width) solid var(--color-border-strong); }

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  background: var(--color-surface);
  border-radius: 20px;
  border: var(--border-width) solid var(--color-border);
  padding: var(--space-3) var(--space-4);
  max-inline-size: 360px;
}
.topbar-title { font-weight: var(--font-weight-heading); }
.icon-btn {
  min-inline-size: 48px;
  min-block-size: 48px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  border: none;
  font-size: 18px;
  cursor: pointer;
}

.modal-demo { position: relative; max-inline-size: 360px; block-size: 220px; border-radius: var(--radius-lg); overflow: hidden; border: var(--border-width) dashed var(--color-border); }
.modal-overlay-demo { position: absolute; inset: 0; background: rgba(61,52,54,0.5); z-index: 100; }
.modal-panel {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  z-index: 110;
  inline-size: 85%;
  text-align: center;
}
.modal-emoji { font-size: 32px; margin-block-end: var(--space-2); }
.modal-actions { display: flex; gap: var(--space-2); justify-content: center; margin-block-start: var(--space-3); }

.score-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  margin-block-end: var(--space-2);
  max-inline-size: 280px;
}
.avatar { inline-size: 40px; block-size: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; }
.score-name { flex: 1; font-weight: var(--font-weight-subheading); }
.score-value { font-variant-numeric: tabular-nums; font-weight: 800; font-size: 20px; }

.letter-tile {
  inline-size: 96px;
  block-size: 96px;
  border-radius: var(--radius-lg);
  background: var(--color-accent);
  color: var(--color-on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56px;
  font-weight: 800;
  box-shadow: var(--shadow-card);
}

.timer {
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 800;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  padding-inline: var(--space-4);
  padding-block: var(--space-2);
  display: inline-block;
}
.timer--warn { background: var(--color-danger); color: var(--color-on-danger); }

.skeleton-list { display: flex; flex-direction: column; gap: var(--space-2); max-inline-size: 280px; }
.skeleton-block { block-size: 16px; border-radius: var(--radius-sm); background: var(--color-border); animation: shimmer 1.2s linear infinite alternate; }
@keyframes shimmer { from { opacity: 0.5; } to { opacity: 1; } }

.spinner {
  inline-size: 40px;
  block-size: 40px;
  border-radius: 50%;
  border: 5px solid var(--color-border);
  border-block-start-color: var(--color-primary);
  animation: spin 800ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state, .error-card {
  max-inline-size: 300px;
  text-align: center;
  padding: var(--space-5);
  border-radius: var(--radius-md);
}
.empty-emoji { font-size: 40px; margin-block-end: var(--space-2); }
.error-card {
  background: #FFF5F5;
  border: 2px solid var(--color-danger);
  text-align: start;
}

.demo-focus-ring { outline: 3px solid var(--color-focus); outline-offset: 2px; }

.wr-pair { display: flex; gap: var(--space-4); align-items: flex-start; margin-block-end: var(--space-2); flex-wrap: wrap; }
.wr-col { flex: 1; min-inline-size: 220px; }
.wr-label { font-size: var(--font-size-small); font-weight: var(--font-weight-subheading); margin-block-end: var(--space-2); }
.wr-label--wrong { color: var(--color-danger); }
.wr-label--right { color: var(--color-success); }
.wr-demo { padding: var(--space-3); border-radius: var(--radius-sm); border: var(--border-width) dashed var(--color-border); }
.wr-title { font-size: var(--font-size-small); color: var(--color-muted); margin-block-end: var(--space-6); }

@media (prefers-reduced-motion: reduce) {
  .skeleton-block, .spinner, .btn { animation: none !important; transition: none !important; }
}
</style>
</head>
<body>
<h1>Kategoria — Style Guide</h1>
<p class="generated-note">GENERATED by design/scripts/build-style-guide.mjs from design/tokens.json + design/components.json — do not edit by hand.</p>

<section class="section">
  <h2>Colors — light</h2>
  ${colorSwatchesHtml('light')}
</section>

<section class="section">
  <h2>Colors — dark</h2>
  <div class="theme-block theme-block--dark" data-theme="dark">
    ${colorSwatchesHtml('dark')}
  </div>
</section>

<section class="section">
  <h2>Type scale</h2>
  ${typeScaleRows}
</section>

<section class="section">
  <h2>Spacing scale</h2>
  ${spaceRows}
</section>

<section class="section">
  <h2>Radius scale</h2>
  ${radiusRows}
</section>

<section class="section">
  <h2>Shadow</h2>
  ${shadowRow}
</section>

<section class="section">
  <h2>Button (M1)</h2>
  ${buttonSpecimens}
</section>

<section class="section">
  <h2>Input (M2)</h2>
  ${inputSpecimens}
</section>

<section class="section">
  <h2>Card (M3)</h2>
  ${cardSpecimen}
</section>

<section class="section">
  <h2>Chip (M4)</h2>
  ${chipSpecimen}
</section>

<section class="section">
  <h2>Topbar (M5)</h2>
  ${topbarSpecimen}
</section>

<section class="section">
  <h2>Modal (M6)</h2>
  ${modalSpecimen}
</section>

<section class="section">
  <h2>Score row (M7)</h2>
  ${scoreRowSpecimen}
</section>

<section class="section">
  <h2>Letter tile (M8a)</h2>
  ${letterTileSpecimen}
</section>

<section class="section">
  <h2>Timer (M8b)</h2>
  ${timerSpecimens}
</section>

<section class="section">
  <h2>Skeleton (S1)</h2>
  ${skeletonSpecimen}
</section>

<section class="section">
  <h2>Spinner (S2)</h2>
  ${spinnerSpecimen}
</section>

<section class="section">
  <h2>Empty state (S3)</h2>
  ${emptyStateSpecimen}
</section>

<section class="section">
  <h2>Error card (S4)</h2>
  ${errorCardSpecimen}
</section>

<section class="section">
  <h2>Focus ring (M10)</h2>
  ${focusRingSpecimen}
</section>

<section class="section">
  <h2>Wrong vs. right</h2>
  ${wrongRightHtml}
</section>

</body>
</html>
`;

writeFileSync(htmlOutPath, html, 'utf8');

console.log(`Wrote ${path.relative(process.cwd(), cssOutPath)}`);
console.log(`Wrote ${path.relative(process.cwd(), htmlOutPath)}`);

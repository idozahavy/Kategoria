// One-command screenshots of named app states, for visual review.
//
//   node tools/capture.mjs --screen <name|all> [--widths 390,820,1440]
//                          [--theme light|dark|both] [--frames N --interval MS] [--list]
//
// Each screen in tools/screens.json runs in a fresh browser profile (own
// localStorage/IndexedDB), opens its tabs, replays its scripted steps (the
// helpers in HELPERS below are available as `__cap`), then captures the named
// tabs at every width and theme to qa/captures/<screen>-<shot>-<width>-<theme>.png.
// Prints the written paths, then any console errors, one per line. Exit 1 on a
// failed step.
//
// Zero dependencies: drives a local Chrome/Edge over the DevTools protocol
// (Node >= 22 for the global WebSocket). Set CAPTURE_BROWSER to pick a binary.
// Attaches to the dev server on :5180 or starts `npm run dev:lan`.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCREENS = JSON.parse(readFileSync(join(ROOT, 'tools', 'screens.json'), 'utf8'));
const DEV_URL = 'http://localhost:5180/';
const HEIGHTS = { 390: 844, 820: 1180, 1440: 900 };

const { values: args } = parseArgs({
  options: {
    screen: { type: 'string', default: 'all' },
    widths: { type: 'string', default: '390,820,1440' },
    theme: { type: 'string', default: 'both' },
    frames: { type: 'string', default: '1' },
    interval: { type: 'string', default: '120' },
    out: { type: 'string', default: 'qa/captures' },
    list: { type: 'boolean', default: false },
  },
});

if (args.list) {
  for (const [name, s] of Object.entries(SCREENS)) console.log(`${name} - ${s.description}`);
  process.exit(0);
}

const widths = args.widths.split(',').map(Number);
const themes = args.theme === 'both' ? ['light', 'dark'] : [args.theme];
const frames = Math.max(1, Number(args.frames));
const interval = Number(args.interval);
const outDir = join(ROOT, args.out);
const names = args.screen === 'all' ? Object.keys(SCREENS) : args.screen.split(',');
for (const n of names) {
  if (!SCREENS[n]) {
    console.error(`unknown screen "${n}" (see --list)`);
    process.exit(2);
  }
}

/** Page-side helpers, installed before any app script runs. */
const HELPERS = `
window.__cap = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  async waitFor(fn, ms = 15000) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error('waitFor timed out: ' + fn);
      await __cap.sleep(100);
    }
  },
  btn: (text) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(text)),
  /** Click the first button whose text contains \`text\` (waits for it). */
  async click(text) {
    (await __cap.waitFor(() => __cap.btn(text))).click();
    await __cap.sleep(350);
  },
  /** Click the first element matching a CSS selector (waits for it). */
  async clickSel(selector) {
    (await __cap.waitFor(() => document.querySelector(selector))).click();
    await __cap.sleep(350);
  },
  type(el, value) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  letter: () => document.querySelector('.letter-row')?.innerText.trim().charAt(0) ?? '',
};
`;

function findBrowser() {
  const candidates = [
    process.env.CAPTURE_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found; set CAPTURE_BROWSER');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const startedAt = Date.now();
const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

async function isUp(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

/** The dev server, attached if running, else started (and stopped at the end). */
async function ensureServer() {
  if (await isUp(DEV_URL)) return null;
  const child = spawn('npm', ['run', 'dev:lan'], { cwd: ROOT, shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    if (await isUp(DEV_URL)) return child;
    await sleep(500);
  }
  child.kill();
  throw new Error(`dev server did not come up on ${DEV_URL}`);
}

/** Minimal DevTools protocol client over one browser-level WebSocket (flattened sessions). */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p?.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p?.resolve(msg.result);
      } else {
        for (const l of this.listeners) l(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }
  on(fn) {
    this.listeners.push(fn);
  }
  /** Resolves on the next `method` event from `sessionId` (or after `ms`). */
  once(method, sessionId, ms = 15000) {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.listeners.push((msg) => {
        if (msg.method === method && msg.sessionId === sessionId) done();
      });
    });
  }
}

async function launchBrowser() {
  const profile = mkdtempSync(join(tmpdir(), 'kategoria-capture-'));
  const proc = spawn(
    findBrowser(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      // Every tab is "visible": timers and animations keep running in all of them.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const [port, path] = readFileSync(portFile, 'utf8').split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return { cdp: new Cdp(ws), proc, profile, ws };
}

const errors = [];
const written = [];

async function openTab(cdp, contextId, name, spec) {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
    browserContextId: contextId,
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const tab = { name, targetId, sessionId };
  const send = (m, p) => cdp.send(m, p, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS + (spec.init ?? '') });
  await setWidth(cdp, tab, spec.width ?? 390);
  await navigate(cdp, tab, spec.url);
  if (spec.storage) {
    await evaluate(
      cdp,
      tab,
      `for (const [k, v] of Object.entries(${JSON.stringify(spec.storage)})) localStorage.setItem(k, v);`,
    );
    await navigate(cdp, tab, spec.url);
  }
  return tab;
}

async function setWidth(cdp, tab, width) {
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height: HEIGHTS[width] ?? 900, deviceScaleFactor: 1, mobile: width < 768 },
    tab.sessionId,
  );
}

async function navigate(cdp, tab, url) {
  const loaded = cdp.once('Page.loadEventFired', tab.sessionId);
  await cdp.send('Page.navigate', { url }, tab.sessionId);
  await loaded;
  await evaluate(cdp, tab, `await __cap.waitFor(() => document.querySelector('main'));`);
  await sleep(300);
}

/** Longest a single scripted step may run before the capture gives up on it. */
const STEP_TIMEOUT_MS = 60_000;

function withTimeout(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${String(ms)} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function evaluate(cdp, tab, js) {
  // A navigation can race the first evaluate; retry until the new document answers.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await withTimeout(
        cdp.send(
          'Runtime.evaluate',
          {
            expression: `(async () => { ${js} })()`,
            awaitPromise: true,
            returnByValue: true,
          },
          tab.sessionId,
        ),
        STEP_TIMEOUT_MS,
        'script',
      );
      if (res.exceptionDetails) {
        const d = res.exceptionDetails;
        throw new Error(d.exception?.description ?? d.text);
      }
      return res.result.value;
    } catch (e) {
      const transient = /context|destroyed|__cap is not defined|Cannot find/.test(String(e));
      if (!transient || attempt >= 20) throw e;
      await sleep(250);
    }
  }
}

async function capture(cdp, tab, file) {
  // A background tab may never paint a frame to capture.
  await cdp.send('Page.bringToFront', {}, tab.sessionId);
  const { data } = await withTimeout(
    cdp.send('Page.captureScreenshot', { format: 'png' }, tab.sessionId),
    STEP_TIMEOUT_MS,
    'screenshot',
  );
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(data, 'base64'));
  written.push(file);
}

/** One named shot of a tab at every width and theme (and every frame of a burst). */
async function shoot(cdp, tab, screenName, shot) {
  for (const width of shot.widths ?? widths) {
    await setWidth(cdp, tab, width);
    for (const theme of themes) {
      await evaluate(
        cdp,
        tab,
        `document.documentElement.dataset.theme = '${theme}';
         ${shot.scrollTo ? `document.querySelector(${JSON.stringify(shot.scrollTo)})?.scrollIntoView({ block: 'center', behavior: 'instant' });` : ''}`,
      );
      await sleep(shot.settle ?? 700);
      for (let f = 1; f <= frames; f++) {
        const suffix = frames > 1 ? `-f${String(f).padStart(2, '0')}` : '';
        const file = `${screenName}-${shot.name}-${String(width)}-${theme}${suffix}.png`;
        await capture(cdp, tab, join(outDir, file));
        if (f < frames) await sleep(interval);
      }
    }
  }
}

/** A screen may reuse another's tabs/steps/capture (`template`) with its own `vars`. */
function resolveScreen(name) {
  const own = SCREENS[name];
  if (!own.template) return own;
  const base = resolveScreen(own.template);
  return { ...base, ...own, vars: { ...base.vars, ...own.vars } };
}

async function runScreen(cdp, name) {
  const screen = resolveScreen(name);
  const { browserContextId } = await cdp.send('Target.createBrowserContext', {});
  const tabs = {};
  const bySession = new Map();
  cdp.on((msg) => {
    const tab = bySession.get(msg.sessionId);
    if (!tab) return;
    if (msg.method === 'Page.javascriptDialogOpening') {
      // A native dialog would freeze the page (and the step) until answered.
      errors.push(`${name}/${tab}: dialog "${msg.params.message}" (auto-accepted)`);
      void cdp.send('Page.handleJavaScriptDialog', { accept: true }, msg.sessionId);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(`${name}/${tab}: ${msg.params.exceptionDetails.exception?.description ?? ''}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(
        `${name}/${tab}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`,
      );
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(`${name}/${tab}: ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
    }
  });
  try {
    for (const [tabName, spec] of Object.entries(screen.tabs)) {
      tabs[tabName] = await openTab(cdp, browserContextId, tabName, spec);
      bySession.set(tabs[tabName].sessionId, tabName);
    }
    // Values a step returned (`saveAs`), spliced into later steps as {{name}}.
    const vars = { ...screen.vars };
    const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
    const shots = (screen.capture ?? []).map((shot) => ({ shot }));
    for (const [i, step] of [...(screen.steps ?? []), ...shots].entries()) {
      const tab = tabs[step.tab ?? step.shot?.tab];
      const what = step.close ? 'close' : step.reload ? 'reload' : step.shot ? 'shot' : 'js';
      console.error(`[${elapsed()}] ${name} step ${String(i + 1)} ${tab?.name ?? '?'} ${what}`);
      try {
        if (step.close) {
          await cdp.send('Target.closeTarget', { targetId: tab.targetId });
          continue;
        }
        if (step.reload) await navigate(cdp, tab, fill(step.reload));
        if (step.js) {
          // Multi-line scripts are written as an array of lines in screens.json.
          const js = Array.isArray(step.js) ? step.js.join('\n') : step.js;
          const value = await evaluate(cdp, tab, fill(js));
          if (step.saveAs) vars[step.saveAs] = value;
        }
        if (step.shot) await shoot(cdp, tab, name, step.shot);
      } catch (e) {
        throw new Error(`${name} step ${String(i + 1)} (${tab?.name ?? '?'}): ${e.message}`);
      }
    }
  } finally {
    await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}

let server = null;
let browser = null;
let failed = false;
try {
  server = await ensureServer();
  browser = await launchBrowser();
  for (const name of names) {
    try {
      await runScreen(browser.cdp, name);
    } catch (e) {
      failed = true;
      console.error(`FAIL ${e.message}`);
    }
  }
} catch (e) {
  failed = true;
  console.error(`FAIL ${e.message}`);
} finally {
  browser?.ws.close();
  browser?.proc.kill();
  server?.kill();
  if (browser) {
    await sleep(300);
    rmSync(browser.profile, { recursive: true, force: true, maxRetries: 5 });
  }
}
for (const f of written) console.log(f);
for (const e of errors) console.log(`console-error ${e}`);
process.exit(failed ? 1 : 0);

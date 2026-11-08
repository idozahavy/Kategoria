#!/usr/bin/env node
// Phones-join fault scenarios in real headless Chrome/Edge (no npm dependency).
// Each scenario opens its own browser (one isolated context per device),
// breaks something the way real phones do, and asserts what players see.
//
//   node tools/room-faults.mjs                 all quick scenarios against the dev server (:5180)
//   node tools/room-faults.mjs --only a,b      just these (see --list)
//   node tools/room-faults.mjs --slow          also the ~2 min "host goes silent" scenario
//   node tools/room-faults.mjs --base https://kategoria.pages.dev/   (the live site; enables the TURN relay check)
//
// Uses the public PeerJS broker (rooms are throwaway), blocks analytics, and
// writes screenshots to qa/room-faults/. Exit code 1 when any scenario fails.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join as pathJoin } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = pathJoin(dirname(fileURLToPath(import.meta.url)), '..');
const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:5180/' },
    only: { type: 'string', default: '' },
    slow: { type: 'boolean', default: false },
    jobs: { type: 'string', default: '3' },
    list: { type: 'boolean', default: false },
  },
});
const BASE = args.base.endsWith('/') ? args.base : `${args.base}/`;
const IS_LOCAL_DEV = /localhost:5180|127\.0\.0\.1:5180/.test(BASE);
const SHOTS = pathJoin(ROOT, 'qa', 'room-faults');
const BROKER = 'wss://0.peerjs.com:443/peerjs?key=peerjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Browser plumbing (DevTools protocol over one WebSocket, flattened sessions)
// ---------------------------------------------------------------------------

function findBrowser() {
  const found = [
    process.env.CAPTURE_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => p && existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found; set CAPTURE_BROWSER');
  return found;
}

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
      } else for (const l of this.listeners) l(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }
}

/** Installed in every page before the app runs: broker-socket and RTC handles plus helpers. */
const pageInit = (o = {}) => `
window.__ws = [];
window.__pcs = [];
(() => {
  const NativeWs = window.WebSocket;
  // __blockBroker = true makes new broker sockets fail, like a network with no way out.
  window.WebSocket = class extends NativeWs {
    constructor(url, ...a) {
      const isBroker = String(url).includes('peerjs');
      super(isBroker && window.__blockBroker ? 'wss://127.0.0.1:9/blocked' : url, ...a);
      if (isBroker) window.__ws.push(this);
    }
  };
  const NativePc = window.RTCPeerConnection;
  const filter = ${o.urlFilter ? o.urlFilter.toString() : 'null'};
  function Pc(cfg, ...rest) {
    cfg = { ...(cfg || {}) };
    ${o.relay ? "cfg.iceTransportPolicy = 'relay';" : ''}
    if (filter) cfg.iceServers = (cfg.iceServers || []).map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => filter.test(u)) })).filter((s) => s.urls.length);
    const pc = new NativePc(cfg, ...rest);
    window.__pcs.push(pc);
    return pc;
  }
  Pc.prototype = NativePc.prototype;
  Object.setPrototypeOf(Pc, NativePc);
  window.RTCPeerConnection = Pc;
})();
window.__t = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  async waitFor(fn, ms = 15000) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error('waitFor timed out: ' + fn);
      await __t.sleep(100);
    }
  },
  btn: (text) => [...document.querySelectorAll('button')].find((b) => !b.disabled && b.textContent.trim().includes(text)),
  async click(text) { (await __t.waitFor(() => __t.btn(text))).click(); await __t.sleep(350); },
  async clickSel(s) { (await __t.waitFor(() => document.querySelector(s))).click(); await __t.sleep(350); },
  type(el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); },
  letter: () => document.querySelector('.letter-row')?.innerText.trim().charAt(0) ?? '',
  text: () => (document.body?.innerText ?? '').replace(/\\s+/g, ' ').trim(),
  async pairs() {
    const out = [];
    for (const pc of __pcs) {
      if (pc.connectionState === 'closed') continue;
      const st = await pc.getStats();
      let sel;
      st.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) sel = st.get(r.selectedCandidatePairId); });
      const l = sel && st.get(sel.localCandidateId);
      out.push({ state: pc.connectionState, local: l?.candidateType, relayProtocol: l?.relayProtocol });
    }
    return out;
  },
};`;

class Browser {
  tabs = [];

  async start() {
    this.profile = mkdtempSync(pathJoin(tmpdir(), 'kategoria-faults-'));
    this.proc = spawn(
      findBrowser(),
      [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${this.profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        // Every tab counts as visible: timers keep running in all of them.
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    const portFile = pathJoin(this.profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
    const [port, path] = readFileSync(portFile, 'utf8').split('\n');
    this.ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.cdp = new Cdp(this.ws);
  }
  async stop() {
    try {
      this.ws.close();
    } catch {
      // already gone
    }
    this.proc.kill();
    await sleep(800);
    try {
      rmSync(this.profile, { recursive: true, force: true });
    } catch {
      // Chrome may still hold a file for a moment; the OS temp cleaner gets it
    }
  }
  async context() {
    return (await this.cdp.send('Target.createBrowserContext')).browserContextId;
  }
  /** A device: its own storage (unless `context` is shared), a phone width unless told otherwise. */
  async tab(name, { context, width = 390, url = BASE, ...opts } = {}) {
    const browserContextId = context ?? (await this.context());
    const { targetId } = await this.cdp.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId,
    });
    const { sessionId } = await this.cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const tab = new Tab(this.cdp, name, sessionId, targetId);
    this.tabs.push(tab);
    await tab.send('Page.enable');
    await tab.send('Runtime.enable');
    await tab.send('Network.enable');
    await tab.send('Network.setBlockedURLs', { urls: ['*umami*', ...(opts.block ?? [])] });
    await tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: pageInit(opts) });
    await tab.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    this.cdp.listeners.push((m) => {
      if (m.sessionId !== sessionId || m.method !== 'Runtime.exceptionThrown') return;
      tab.errors.push(
        m.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? 'exception',
      );
    });
    await tab.go(url);
    await tab.ev(`localStorage.setItem('categories-ui-language', 'en');`);
    await tab.go(url);
    return tab;
  }
}

class Tab {
  constructor(cdp, name, sessionId, targetId) {
    Object.assign(this, { cdp, name, sessionId, targetId, errors: [] });
  }
  send(method, params) {
    return this.cdp.send(method, params, this.sessionId);
  }
  async go(url) {
    await this.send('Page.navigate', { url });
    await sleep(600);
    await this.ev(`await __t.waitFor(() => document.querySelector('main'), 20000);`);
    await sleep(400);
  }
  async reload() {
    await this.send('Page.reload');
    await sleep(800);
    await this.ev(`await __t.waitFor(() => document.querySelector('main'), 20000);`);
  }
  async ev(js, ms = 60000) {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await Promise.race([
          this.send('Runtime.evaluate', {
            expression: `(async () => { ${js} })()`,
            awaitPromise: true,
            returnByValue: true,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${this.name}: script timed out`)), ms),
          ),
        ]);
        if (res.exceptionDetails)
          throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
        return res.result.value;
      } catch (e) {
        if (!/context|destroyed|__t is not defined|Cannot find/.test(String(e)) || attempt >= 20)
          throw e;
        await sleep(250);
      }
    }
  }
  text() {
    return this.ev(`return __t.text();`, 8000).catch((e) => `<${e.message}>`);
  }
  async shot(file) {
    mkdirSync(SHOTS, { recursive: true });
    await this.send('Page.bringToFront');
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(pathJoin(SHOTS, `${file}.png`), Buffer.from(data, 'base64'));
  }
  /** Close this page's broker socket(s), the way a network blip or the broker would. */
  dropBroker() {
    return this.ev(
      `const open = __ws.filter((w) => w.readyState === 1); open.forEach((w) => w.close()); return open.length;`,
    );
  }
  brokerOpen() {
    return this.ev(`return __ws.filter((w) => w.readyState === 1).length;`, 8000).catch(() => -1);
  }
  close() {
    return this.cdp.send('Target.closeTarget', { targetId: this.targetId });
  }
}

// ---------------------------------------------------------------------------
// Game steps
// ---------------------------------------------------------------------------

const FAILED_JOIN = /Couldn't|Lost the|has ended|already started|letters/;

async function openRoom(host) {
  await host.ev(`await __t.click('New Game'); await __t.clickSel('.mode-card:nth-child(2)');`);
  return host.ev(
    `return (await __t.waitFor(() => document.querySelector('.room-code'), 25000)).textContent.trim();`,
  );
}

/** Fill the join form (code from the QR link unless `typed` is given) and press Join. */
async function join(tab, code, name, { typed } = {}) {
  await tab.go(typed === undefined ? `${BASE}?join=${code}` : BASE);
  if (typed !== undefined) await tab.ev(`await __t.click('Join Game');`);
  await tab.ev(`
    const inputs = await __t.waitFor(() => document.querySelectorAll('.join input').length > 1 && document.querySelectorAll('.join input'));
    ${typed === undefined ? '' : `__t.type(inputs[0], ${JSON.stringify(typed)});`}
    __t.type(inputs[1], ${JSON.stringify(name)});
    await __t.clickSel('.join .btn.accent');
    await __t.waitFor(() => document.querySelector('.roster') || ${FAILED_JOIN}.test(__t.text()) || document.querySelector('.err'), 40000);`);
  const text = await tab.text();
  return { ok: !FAILED_JOIN.test(text), text };
}

async function startUntimed(host, guests) {
  await host.ev(`
    await __t.waitFor(() => document.querySelectorAll('.roster-chip').length === ${guests}, 25000);
    await __t.click('Next'); await __t.click('Classic'); await __t.click('Next');
    await __t.click('No timer'); await __t.clickSel('.btn.accent');`);
}

const inRound = (tab) =>
  tab.ev(`await __t.waitFor(() => document.querySelector('.cards input'), 30000);`);
const typeFirst = (tab, suffix) =>
  tab.ev(
    `__t.type(document.querySelector('.cards input'), __t.letter() + ${JSON.stringify(suffix)});`,
  );
const pressDone = (tab) => tab.ev(`await __t.click('Done');`);
const onReview = (host, ms = 20000) =>
  host.ev(`await __t.waitFor(() => /check the words|fit the category/i.test(__t.text()), ${ms});`);

/** A raw broker socket holding the room's id, as the broker keeps a dead page's socket. */
function holdRoomId(code, token) {
  const ws = new WebSocket(`${BROKER}&id=kidcategories-v1-${code}&token=${token}&version=1.5.5`);
  return new Promise((resolve) => {
    ws.addEventListener('message', (e) => resolve({ ws, answer: JSON.parse(e.data).type }), {
      once: true,
    });
  });
}

function expect(cond, what) {
  if (!cond) throw new Error(what);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const SCENARIOS = {
  baseline: {
    about: 'Two phones play a round end to end: join, answer, vote, results on every screen',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const ida = await b.tab('ida');
      const bo = await b.tab('bo');
      expect((await join(ida, code, 'Ida')).ok, 'Ida could not join');
      expect((await join(bo, code, 'Bo')).ok, 'Bo could not join');
      await startUntimed(host, 2);
      await inRound(ida);
      await inRound(bo);
      await typeFirst(ida, 'zzorb');
      await pressDone(ida);
      await pressDone(bo);
      await bo.ev(`await __t.waitFor(() => __t.btn('Yes'), 20000); await __t.click('Yes');`);
      await ida.ev(`await __t.waitFor(() => /Standings/.test(__t.text()), 30000);`);
      log('results reached both phones');
    },
  },

  'host-broker-drop-lobby': {
    about:
      'The host loses the broker while showing the code: it re-registers and a new phone still gets in',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      expect((await host.dropBroker()) > 0, 'host had no broker socket to drop');
      await sleep(3000);
      expect((await host.brokerOpen()) > 0, 'host did not re-register with the broker');
      const ida = await b.tab('ida');
      const r = await join(ida, code, 'Ida');
      expect(r.ok, `new phone blocked after the drop: ${r.text}`);
      log('re-registered; new phone joined');
    },
  },

  'broker-drop-mid-round': {
    about:
      'The broker drops host and phone at once mid-round: nobody is kicked out, typed words stay',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const ida = await b.tab('ida');
      expect((await join(ida, code, 'Ida')).ok, 'Ida could not join');
      await startUntimed(host, 1);
      await inRound(ida);
      await typeFirst(ida, 'typed');
      await Promise.all([host.dropBroker(), ida.dropBroker()]);
      await sleep(8000);
      const text = await ida.text();
      expect(!/reconnecting|Lost the/.test(text), `phone left the round: ${text.slice(0, 120)}`);
      const value = await ida.ev(`return document.querySelector('.cards input')?.value ?? '';`);
      expect(value.endsWith('typed'), `typed word lost: "${value}"`);
      expect((await host.brokerOpen()) > 0, 'host did not re-register');
      await pressDone(ida);
      await onReview(host);
      log('round finished normally after the drop');
    },
  },

  'host-silent': {
    about:
      'The host stops heartbeating (asleep, network gone) until the broker drops it (~100 s); it comes back and phones can join',
    slow: true,
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      await host.ev(
        `const send = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { if (String(d).includes('HEARTBEAT')) return; return send.call(this, d); };`,
      );
      const t0 = Date.now();
      await host.ev(
        `await __t.waitFor(() => __ws.length > 0 && __ws[0].readyState !== 1, 200000);`,
        210000,
      );
      log(`broker dropped the silent host after ${Math.round((Date.now() - t0) / 1000)} s`);
      await sleep(3000);
      const ida = await b.tab('ida');
      const r = await join(ida, code, 'Ida');
      expect(r.ok, `phone blocked after the broker dropped the host: ${r.text}`);
      log('host back on the broker; phone joined');
    },
  },

  'host-id-held': {
    about:
      'The broker still holds the room for a dead socket: the host shows the offline banner, then takes the room back',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      await host.ev(`window.__blockBroker = true;`);
      await host.dropBroker();
      const held = await holdRoomId(code, 'someone-else');
      expect(held.answer === 'OPEN', `could not take the id for the test (${held.answer})`);
      await host.ev(`window.__blockBroker = false;`);
      await host.ev(`await __t.waitFor(() => document.querySelector('.room-banner'), 10000);`);
      await sleep(6000); // the host's attempts now reach the broker and are refused
      expect(
        (await host.ev(`return !!document.querySelector('.room-banner');`)) === true,
        'banner gone while the room is still held',
      );
      await host.shot('host-id-held-banner-1440');
      log('banner shown while the room is held');
      held.ws.close();
      await host.ev(
        `await __t.waitFor(() => !document.querySelector('.room-banner'), 20000);`,
        25000,
      );
      const ida = await b.tab('ida');
      const r = await join(ida, code, 'Ida');
      expect(r.ok, `phone blocked after the room came back: ${r.text}`);
      log('room back, banner gone, phone joined');
    },
  },

  'host-reload-held-id': {
    about:
      'The host page reloads while the broker still holds its old socket: the saved token takes the room straight back',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const ida = await b.tab('ida');
      expect((await join(ida, code, 'Ida')).ok, 'Ida could not join');
      await startUntimed(host, 1);
      await inRound(ida);
      await typeFirst(ida, 'kept');
      const saved = await host.ev(`return localStorage.getItem('categories-host-room');`);
      expect(saved?.startsWith(`${code}:`), `no saved token for ${code}: ${saved}`);
      // The old page's socket, still registered (its network died, so it never closed).
      const held = await holdRoomId(code, saved.slice(code.length + 1));
      expect(held.answer === 'OPEN', `could not take the id for the test (${held.answer})`);
      const t0 = Date.now();
      await host.reload();
      await host.ev(
        `await __t.waitFor(() => /Waiting for/.test(__t.text()) && !document.querySelector('.room-banner') && __ws.some((w) => w.readyState === 1), 20000);`,
        25000,
      );
      log(`host back on its room ${Date.now() - t0} ms after the reload`);
      held.ws.close();
      await ida.reload(); // the phone rejoins its seat with the typed word
      await inRound(ida);
      const value = await ida.ev(`return document.querySelector('.cards input')?.value ?? '';`);
      expect(value.endsWith('kept'), `typed word lost after rejoin: "${value}"`);
      await pressDone(ida);
      await onReview(host);
      log('phone rejoined and finished the round');
    },
  },

  'host-back': {
    about:
      'Back on the host asks first; Cancel keeps the game, Leave ends it and Home offers Resume',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const ida = await b.tab('ida');
      expect((await join(ida, code, 'Ida')).ok, 'Ida could not join');
      await startUntimed(host, 1);
      await inRound(ida);
      await host.ev(
        `history.back(); await __t.waitFor(() => /Every phone will be disconnected/.test(__t.text()), 5000);`,
      );
      await host.shot('host-back-confirm-1440');
      await host.ev(`await __t.click('Cancel');`);
      expect(/Waiting for/.test(await host.text()), 'Cancel did not keep the round');
      expect(!/has ended/.test(await ida.text()), 'phone was told the game ended');
      await host.ev(
        `history.back(); await __t.waitFor(() => /Every phone/.test(__t.text()), 5000); await __t.clickSel('.modal .btn.danger'); await __t.waitFor(() => __t.btn('Resume Game'), 10000);`,
      );
      await ida.ev(`await __t.waitFor(() => /has ended/.test(__t.text()), 10000);`);
      log('confirm shown; Cancel kept the game; Leave ended it; Resume offered');
    },
  },

  'phone-broker-drop': {
    about: 'Only the phone loses the broker mid-round: it plays on without a reconnect',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const ida = await b.tab('ida');
      expect((await join(ida, code, 'Ida')).ok, 'Ida could not join');
      await startUntimed(host, 1);
      await inRound(ida);
      await typeFirst(ida, 'typed');
      await ida.dropBroker();
      for (let i = 0; i < 6; i++) {
        await sleep(1000);
        expect(!/reconnecting/.test(await ida.text()), 'phone dropped into reconnecting');
      }
      await pressDone(ida);
      await onReview(host);
      log('phone stayed in the round');
    },
  },

  'absent-phone': {
    about:
      "A phone goes silent mid-round (no timer): it's marked away and no longer holds the round up",
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const ida = await b.tab('ida');
      const bo = await b.tab('bo');
      expect((await join(ida, code, 'Ida')).ok, 'Ida could not join');
      expect((await join(bo, code, 'Bo')).ok, 'Bo could not join');
      await startUntimed(host, 2);
      await inRound(ida);
      await inRound(bo);
      // Bo's phone goes quiet without closing anything (locked, dead network).
      await bo.ev(`RTCDataChannel.prototype.send = function () {};`);
      await host.ev(
        `await __t.waitFor(() => document.querySelector('.wait-chip.away'), 20000);`,
        25000,
      );
      await host.shot('absent-phone-chips-1440');
      log('silent phone marked away');
      const t0 = Date.now();
      await pressDone(ida);
      await onReview(host, 5000);
      log(`round moved on ${Date.now() - t0} ms after the last connected phone finished`);
    },
  },

  'finish-collects-words': {
    about: '"Finish round now" collects words typed but not sent',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const ida = await b.tab('ida');
      expect((await join(ida, code, 'Ida')).ok, 'Ida could not join');
      await startUntimed(host, 1);
      await inRound(ida);
      await typeFirst(ida, 'notsent');
      await sleep(500);
      await host.ev(`await __t.click('Finish round now');`);
      await onReview(host);
      expect(/notsent/i.test(await host.text()), 'the unsent word did not reach the host');
      log('unsent word arrived on the shared screen');
    },
  },

  'join-messages': {
    about:
      'A late joiner hears the game started; a Hebrew-keyboard or short code is caught before connecting',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const ida = await b.tab('ida');
      expect((await join(ida, code, 'Ida')).ok, 'Ida could not join');
      await startUntimed(host, 1);
      await inRound(ida);
      const late = await b.tab('late');
      const r = await join(late, code, 'Late');
      expect(/already started/.test(r.text), `late joiner saw: ${r.text}`);
      const he = await b.tab('hebrew');
      const h = await join(he, code, 'Dana', { typed: 'אבגד' });
      expect(/letters A to Z/.test(h.text), `Hebrew code saw: ${h.text}`);
      await he.shot('join-messages-letters-390');
      const short = await b.tab('short');
      const s = await join(short, code, 'Sam', { typed: 'ABC' });
      expect(/4 letters/.test(s.text), `short code saw: ${s.text}`);
      log('started / letters / length messages shown');
    },
  },

  'two-tabs-one-browser': {
    about: 'Two tabs of one browser join as two players and stay put',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const ctx = await b.context();
      const ana = await b.tab('ana', { context: ctx });
      const ben = await b.tab('ben', { context: ctx });
      expect((await join(ana, code, 'Ana')).ok, 'Ana could not join');
      expect((await join(ben, code, 'Ben')).ok, 'Ben could not join');
      for (let i = 0; i < 8; i++) {
        await sleep(1500);
        for (const t of [ana, ben])
          expect(!/reconnecting/.test(await t.text()), `${t.name} is bouncing`);
      }
      const roster = await host.ev(
        `return [...document.querySelectorAll('.roster-chip')].map((e) => e.textContent.trim()).join(',');`,
      );
      expect(/Ana/.test(roster) && /Ben/.test(roster), `host roster: ${roster}`);
      log(`both seated: ${roster}`);
    },
  },

  'photo-avatar': {
    about: 'A phone with a large photo avatar joins',
    async run(b, log) {
      const host = await b.tab('host', { width: 1440 });
      const code = await openRoom(host);
      const pic = await b.tab('pic');
      await pic.go(`${BASE}?join=${code}`);
      const size = await pic.ev(`
        await __t.clickSel('.avatar-btn');
        const c = document.createElement('canvas'); c.width = 3000; c.height = 3000; const x = c.getContext('2d');
        const d = x.createImageData(3000, 3000); for (let i = 0; i < d.data.length; i++) d.data[i] = i % 4 === 3 ? 255 : Math.random() * 255; x.putImageData(d, 0, 0);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer(); dt.items.add(new File([blob], 'p.png', { type: 'image/png' }));
        const input = document.querySelector('input[type=file]'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
        return (await __t.waitFor(() => document.querySelector('.avatar-btn img'), 20000)).src.length;`);
      await pic.ev(
        `__t.type(document.querySelectorAll('.join input')[1], 'Pic'); await __t.clickSel('.join .btn.accent'); await __t.waitFor(() => document.querySelector('.roster') || ${FAILED_JOIN}.test(__t.text()), 40000);`,
      );
      expect(!FAILED_JOIN.test(await pic.text()), 'photo phone could not join');
      log(`joined with a ${Math.round(size / 1024)} KB avatar`);
    },
  },

  'relay-only': {
    about:
      'Only the TURN relay over TLS :443 works (office firewall, some cellular): phones still join (needs a deploy with TURN)',
    needsTurn: true,
    async run(b, log) {
      const net = { relay: true, urlFilter: /^turns:.*:443/ };
      const host = await b.tab('host', { width: 1440, ...net });
      const code = await openRoom(host);
      const ida = await b.tab('ida', net);
      expect((await join(ida, code, 'Ida')).ok, 'relay-only phone could not join');
      const pairs = await ida.ev(`return await __t.pairs();`);
      expect(
        pairs.some((p) => p.local === 'relay'),
        `not relayed: ${JSON.stringify(pairs)}`,
      );
      log(`connected via ${JSON.stringify(pairs)}`);
    },
  },

  'stale-build': {
    about:
      "A tab of the previous deploy can't load PeerJS any more: it reloads once into the current build (needs a production build)",
    needsBuild: true,
    async run(b, log) {
      const host = await b.tab('host', { width: 1440, block: ['*bundler-*'] });
      const t0 = await host.ev(`return performance.timeOrigin;`);
      await host.ev(`await __t.click('New Game');`);
      // The click below makes the page reload under the script, so don't wait inside it.
      await host.ev(
        `setTimeout(() => document.querySelector('.mode-card:nth-child(2)')?.click(), 0);`,
      );
      await sleep(4000);
      const t1 = await host.ev(`return performance.timeOrigin;`);
      expect(t1 !== t0, 'the page did not reload after the chunk failed');
      log('reloaded once into the current build');
    },
  },
};

// ---------------------------------------------------------------------------

if (args.list) {
  for (const [name, s] of Object.entries(SCENARIOS))
    console.log(`${name}${s.slow ? ' (slow)' : ''} - ${s.about}`);
  process.exit(0);
}

async function isUp(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

/** The dev server, attached if running, else started (and stopped at the end). */
async function ensureServer() {
  if (await isUp(BASE)) return null;
  if (!IS_LOCAL_DEV) throw new Error(`${BASE} is not reachable`);
  const child = spawn('npm run dev:lan', { cwd: ROOT, shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    if (await isUp(BASE)) return child;
    await sleep(500);
  }
  child.kill();
  throw new Error(`dev server did not come up on ${BASE}`);
}

const server = await ensureServer();
const isBuild = /\/assets\/index-[\w-]+\.js/.test(await (await fetch(BASE)).text());
// The function only mints for the game's own pages; Node's fetch sends no
// Sec-Fetch-Site, so say it like the page's request does or the probe gets 403.
const hasTurn =
  (
    await fetch(new URL('turn-credentials', BASE), {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => null)
  )?.ok === true;

const requested = args.only === '' ? Object.keys(SCENARIOS) : args.only.split(',');
const queue = [];
for (const name of requested) {
  const s = SCENARIOS[name];
  if (!s) {
    console.error(`unknown scenario "${name}" (see --list)`);
    process.exit(2);
  }
  const named = args.only !== '';
  if (s.slow && !args.slow && !named) continue;
  if (s.needsTurn && !hasTurn) {
    console.log(`SKIP ${name} - no TURN at ${BASE}`);
    continue;
  }
  if (s.needsBuild && !isBuild) {
    console.log(`SKIP ${name} - ${BASE} serves the dev build (try vite preview)`);
    continue;
  }
  queue.push(name);
}

const results = [];
async function runOne(name) {
  const lines = [];
  const started = Date.now();
  const log = (msg) => lines.push(`     ${msg}`);
  const b = new Browser();
  await b.start();
  let error = null;
  try {
    await Promise.race([
      SCENARIOS[name].run(b, log),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('scenario timed out')), 300_000),
      ),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message.split('\n')[0] : String(e);
    // What every device showed when it failed.
    for (const t of b.tabs) {
      log(`[${t.name}] ${(await t.text()).slice(0, 200)}`);
      for (const err of t.errors) log(`[${t.name}] page error: ${err}`);
    }
  }
  await b.stop();
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`${error ? 'FAIL' : 'PASS'} ${name} (${secs} s)${error ? ` - ${error}` : ''}`);
  for (const l of lines) console.log(l);
  results.push({ name, ok: !error });
}

const jobs = Math.max(1, Number(args.jobs));
const workers = Array.from({ length: jobs }, async () => {
  while (queue.length > 0) await runOne(queue.shift());
});
await Promise.all(workers);
server?.kill();
const failed = results.filter((r) => !r.ok).length;
console.log(
  `\n${results.length - failed}/${results.length} passed${failed ? '' : ''}; screenshots in qa/room-faults/`,
);
process.exit(failed > 0 ? 1 : 0);

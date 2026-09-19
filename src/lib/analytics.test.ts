import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnalyticsEvent, UmamiData } from './analytics';

/**
 * Minimal DOM: `document.head.append(script)` hands the script to the test,
 * which decides when (and whether) it "loads" by firing onload/onerror.
 */
interface FakeScript {
  src?: string;
  defer?: boolean;
  dataset: Record<string, string>;
  onload?: () => void;
  onerror?: () => void;
}

function stubDom(): { scripts: FakeScript[] } {
  const scripts: FakeScript[] = [];
  vi.stubGlobal('document', {
    createElement: (): FakeScript => ({ dataset: {} }),
    head: {
      append: (script: FakeScript) => {
        scripts.push(script);
      },
    },
  });
  return { scripts };
}

type TrackCall = { url: string } | { name: string; data?: UmamiData };

/** A fake tracker that records every call in order, resolving page-view mutators like Umami does. */
function installUmami(): TrackCall[] {
  const calls: TrackCall[] = [];
  vi.stubGlobal('window', {
    umami: {
      track: (
        nameOrMutate: string | ((props: { url: string }) => { url: string }),
        data?: UmamiData,
      ) => {
        if (typeof nameOrMutate === 'function') calls.push({ url: nameOrMutate({ url: '/' }).url });
        else calls.push({ name: nameOrMutate, data });
      },
    },
  });
  return calls;
}

/** Status and queue are module state: every case starts from a fresh copy. */
async function loadAnalytics(): Promise<typeof import('./analytics')> {
  vi.resetModules();
  return import('./analytics');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('initAnalytics', () => {
  it('stays off without a website id', async () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', '');
    vi.stubEnv('DEV', false);
    const { scripts } = stubDom();
    const { initAnalytics } = await loadAnalytics();
    expect(initAnalytics()).toBe(false);
    expect(scripts).toHaveLength(0);
  });

  it('stays off in dev builds so local play never counts', async () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
    vi.stubEnv('DEV', true);
    const { scripts } = stubDom();
    const { initAnalytics } = await loadAnalytics();
    expect(initAnalytics()).toBe(false);
    expect(scripts).toHaveLength(0);
  });

  it('injects the deferred tracker once with manual page views', async () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
    vi.stubEnv('DEV', false);
    const { scripts } = stubDom();
    const { initAnalytics } = await loadAnalytics();
    expect(initAnalytics()).toBe(true);
    expect(initAnalytics()).toBe(true);
    expect(scripts).toHaveLength(1);
    const [script] = scripts;
    expect(script?.src).toBe('https://cloud.umami.is/script.js');
    expect(script?.defer).toBe(true);
    expect(script?.dataset).toEqual({ websiteId: 'site-1', autoTrack: 'false' });
  });
});

describe('trackScreen / trackEvent', () => {
  it('queues calls until the tracker loads, then flushes them in order', async () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
    vi.stubEnv('DEV', false);
    const { scripts } = stubDom();
    const { initAnalytics, trackEvent, trackScreen } = await loadAnalytics();
    initAnalytics();
    trackScreen('home');
    trackEvent('game_start', { players: 2 });
    trackScreen('round');
    const calls = installUmami();
    expect(calls).toHaveLength(0);
    scripts[0]?.onload?.();
    expect(calls).toEqual([
      { url: '/' },
      { name: 'game_start', data: { players: 2 } },
      { url: '/round' },
    ]);
  });

  it('sends directly once the tracker is ready', async () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
    vi.stubEnv('DEV', false);
    const { scripts } = stubDom();
    const { initAnalytics, trackEvent } = await loadAnalytics();
    initAnalytics();
    const calls = installUmami();
    scripts[0]?.onload?.();
    trackEvent('room_join');
    expect(calls).toEqual([{ name: 'room_join', data: undefined }]);
  });

  it('drops everything when the tracker fails to load (ad blocker, offline)', async () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
    vi.stubEnv('DEV', false);
    const { scripts } = stubDom();
    const { initAnalytics, trackEvent } = await loadAnalytics();
    initAnalytics();
    trackEvent('game_start');
    scripts[0]?.onerror?.();
    const calls = installUmami();
    trackEvent('game_finish');
    expect(calls).toHaveLength(0);
    expect(initAnalytics()).toBe(false);
  });

  it('gives up on a tracker that never loads and drops the queue', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
      vi.stubEnv('DEV', false);
      const { scripts } = stubDom();
      const { initAnalytics, trackEvent } = await loadAnalytics();
      initAnalytics();
      trackEvent('game_start');
      vi.advanceTimersByTime(15_000);
      const calls = installUmami();
      scripts[0]?.onload?.(); // a late arrival must not resurrect the queue
      trackEvent('game_finish');
      expect(calls).toHaveLength(0);
      expect(initAnalytics()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps the queue so a tracker that never arrives cannot grow memory', async () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
    vi.stubEnv('DEV', false);
    const { scripts } = stubDom();
    const { initAnalytics, trackEvent } = await loadAnalytics();
    initAnalytics();
    const names: AnalyticsEvent[] = ['round_end', 'game_resume', 'room_create'];
    for (let i = 0; i < 30; i += 1) trackEvent(names[i % names.length] ?? 'round_end');
    const calls = installUmami();
    scripts[0]?.onload?.();
    expect(calls).toHaveLength(20);
  });

  it('is a silent no-op before init and without a window', async () => {
    const { trackEvent, trackScreen } = await loadAnalytics();
    expect(() => {
      trackScreen('home');
      trackEvent('game_start');
    }).not.toThrow();
  });

  it('survives a tracker that throws', async () => {
    vi.stubEnv('VITE_UMAMI_WEBSITE_ID', 'site-1');
    vi.stubEnv('DEV', false);
    const { scripts } = stubDom();
    const { initAnalytics, trackEvent } = await loadAnalytics();
    initAnalytics();
    vi.stubGlobal('window', {
      umami: {
        track: () => {
          throw new Error('boom');
        },
      },
    });
    scripts[0]?.onload?.();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => {
      trackEvent('game_start');
    }).not.toThrow();
    expect(error).toHaveBeenCalledOnce();
  });
});

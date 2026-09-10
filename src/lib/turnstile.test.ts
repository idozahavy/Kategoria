import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTurnstileToken } from './turnstile';

/**
 * Minimal DOM: `document.head.append(script)` hands the script to the test
 * (which installs a fake `window.turnstile` and fires onload), while
 * `document.body.append` and `Element.remove` are no-ops.
 */
interface FakeScript {
  src?: string;
  async?: boolean;
  onload?: () => void;
  onerror?: () => void;
}

function stubDom(onScript: (script: FakeScript) => void): { appended: number } {
  const stats = { appended: 0 };
  vi.stubGlobal('document', {
    createElement: (tag: string) => (tag === 'script' ? {} : { remove: () => undefined }),
    head: {
      append: (script: FakeScript) => {
        stats.appended += 1;
        queueMicrotask(() => {
          onScript(script);
        });
      },
    },
    body: { append: () => undefined },
  });
  return stats;
}

interface RenderOptions {
  sitekey: string;
  appearance: string;
  callback: (token: string) => void;
  'error-callback': () => void;
}

function installTurnstile(behaviour: 'token' | 'error' | 'silent'): {
  removed: string[];
  rendered: RenderOptions[];
} {
  const removed: string[] = [];
  const rendered: RenderOptions[] = [];
  vi.stubGlobal('window', {
    turnstile: {
      render: (_container: unknown, options: RenderOptions) => {
        rendered.push(options);
        if (behaviour !== 'silent') {
          queueMicrotask(() => {
            if (behaviour === 'token') options.callback('the-token');
            else options['error-callback']();
          });
        }
        return 'widget-1';
      },
      remove: (id: string) => {
        removed.push(id);
      },
    },
  });
  return { removed, rendered };
}

/** The script promise is module state: cases about loading start from a fresh copy. */
async function loadTurnstile(): Promise<typeof getTurnstileToken> {
  vi.resetModules();
  return (await import('./turnstile')).getTurnstileToken;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getTurnstileToken', () => {
  it('yields no token without a site key and touches no DOM', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    const stats = stubDom(() => undefined);
    await expect(getTurnstileToken()).resolves.toBeNull();
    expect(stats.appended).toBe(0);
  });

  it('loads the api script once, renders an interaction-only widget and returns its token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    vi.stubGlobal('window', {});
    let seen: FakeScript | undefined;
    let turnstile: ReturnType<typeof installTurnstile> | undefined;
    const stats = stubDom((script) => {
      seen = script;
      turnstile = installTurnstile('token');
      script.onload?.();
    });

    await expect(getTurnstileToken()).resolves.toBe('the-token');
    await expect(getTurnstileToken()).resolves.toBe('the-token');

    expect(seen?.src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    expect(stats.appended).toBe(1);
    expect(turnstile?.rendered[0]).toMatchObject({
      sitekey: 'site-key',
      appearance: 'interaction-only',
    });
    expect(turnstile?.removed).toEqual(['widget-1', 'widget-1']);
  });

  it('returns null when the widget reports an error', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installTurnstile('error');
    stubDom(() => undefined);
    await expect(getTurnstileToken()).resolves.toBeNull();
  });

  it('forgets a failed script load so the next room tries again', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('window', {});
    const getToken = await loadTurnstile();

    const failing = stubDom((script) => script.onerror?.());
    await expect(getToken()).resolves.toBeNull();
    const working = stubDom((script) => {
      installTurnstile('token');
      script.onload?.();
    });
    await expect(getToken()).resolves.toBe('the-token');
    expect(failing.appended).toBe(1);
    expect(working.appended).toBe(1);
  });

  it('gives up after 10 s when the widget never answers, and removes it', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    const turnstile = installTurnstile('silent'); // api already on the page: no script load
    const stats = stubDom(() => undefined);
    const getToken = await loadTurnstile();

    let settled: string | null | undefined;
    void getToken().then((v) => (settled = v));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();
    expect(stats.appended).toBe(0);
    expect(turnstile.removed).toEqual(['widget-1']);
  });

  it('yields null when the script loads but exposes no api', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('window', {});
    stubDom((script) => script.onload?.());
    const getToken = await loadTurnstile();
    await expect(getToken()).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      'turnstile unavailable',
      new Error('turnstile api missing after load'),
    );
  });
});

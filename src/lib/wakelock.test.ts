import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A fake Screen Wake Lock API plus a document whose visibility the test flips. */
function stubWakeLock(): {
  requests: () => number;
  released: () => number;
  setVisible: (isVisible: boolean) => void;
} {
  let requests = 0;
  let released = 0;
  let lastLock: EventTarget | null = null;
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', {
    wakeLock: {
      request: () => {
        requests += 1;
        const lock = new EventTarget();
        lastLock = lock;
        return Promise.resolve(
          Object.assign(lock, {
            release: () => {
              released += 1;
              lock.dispatchEvent(new Event('release'));
              return Promise.resolve();
            },
          }),
        );
      },
    },
  });
  return {
    requests: () => requests,
    released: () => released,
    setVisible: (isVisible) => {
      doc.visibilityState = isVisible ? 'visible' : 'hidden';
      // What the browser does to a hidden page's lock.
      if (!isVisible) lastLock?.dispatchEvent(new Event('release'));
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

/** Let the awaited request settle. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('keepScreenOn', () => {
  beforeEach(() => {
    vi.resetModules(); // the lock state is module-level
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('holds one lock while anyone wants it, and lets go when the last one leaves', async () => {
    const api = stubWakeLock();
    const { keepScreenOn } = await import('./wakelock');
    keepScreenOn('host', true);
    keepScreenOn('guest', true);
    await settle();
    expect(api.requests()).toBe(1);
    keepScreenOn('host', false);
    expect(api.released()).toBe(0);
    keepScreenOn('guest', false);
    expect(api.released()).toBe(1);
  });

  it('asks again when the page comes back (the browser drops it while hidden)', async () => {
    const api = stubWakeLock();
    const { keepScreenOn } = await import('./wakelock');
    keepScreenOn('host', true);
    await settle();
    api.setVisible(false);
    await settle();
    expect(api.requests()).toBe(1); // hidden: nothing to ask for yet
    api.setVisible(true);
    await settle();
    expect(api.requests()).toBe(2);
    keepScreenOn('host', false);
    api.setVisible(false);
    api.setVisible(true);
    await settle();
    expect(api.requests()).toBe(2); // nobody wants it any more
  });

  it('does nothing in a browser without the API', async () => {
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    vi.stubGlobal('navigator', {});
    const { keepScreenOn } = await import('./wakelock');
    expect(() => {
      keepScreenOn('host', true);
      keepScreenOn('host', false);
    }).not.toThrow();
  });
});

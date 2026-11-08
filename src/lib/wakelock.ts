/**
 * Keeps the screen on while a phones-join room is live. A host screen that
 * sleeps drops off the broker (nobody can join or come back until it wakes),
 * and a phone that sleeps misses the round — on most phones that takes under
 * a minute. The browser drops the lock whenever the page is hidden, so it is
 * asked for again each time the page comes back. Browsers without the API, or
 * that refuse it (battery saver), just let the screen sleep as before.
 */

/** Who wants the screen on (the hosted room, a joined phone); off once nobody does. */
const holders = new Set<string>();
let sentinel: WakeLockSentinel | null = null;
let isRequesting = false;
let isListening = false;

export function keepScreenOn(holder: string, isOn: boolean): void {
  if (isOn) holders.add(holder);
  else holders.delete(holder);
  if (holders.size > 0) {
    listen();
    void acquire();
    return;
  }
  const held = sentinel;
  sentinel = null;
  if (held) void held.release();
}

async function acquire(): Promise<void> {
  if (sentinel !== null || isRequesting || holders.size === 0) return;
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  isRequesting = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    // Nobody wants it any more by the time it arrived.
    if (holders.size === 0) {
      await lock.release();
      return;
    }
    sentinel = lock;
    lock.addEventListener('release', () => {
      if (sentinel === lock) sentinel = null;
    });
  } catch {
    // Refused (battery saver, no user activation yet): the screen may sleep.
  } finally {
    isRequesting = false;
  }
}

function listen(): void {
  if (isListening) return;
  isListening = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire();
  });
}

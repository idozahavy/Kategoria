import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reloadForNewBuild } from './stalebuild';

describe('reloadForNewBuild', () => {
  let reload: ReturnType<typeof vi.fn>;
  let store: Map<string, string>;

  beforeEach(() => {
    reload = vi.fn();
    store = new Map();
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reloads once for a missing chunk, then not again within a minute', () => {
    expect(reloadForNewBuild(1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // Still missing right after the reload (offline, say): no loop.
    expect(reloadForNewBuild(1_030_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForNewBuild(1_061_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('never reloads without session storage to remember it by', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(reloadForNewBuild()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

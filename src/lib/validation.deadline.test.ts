import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHECK_DEADLINE_MS, checkWordWithin, type WordCheckOptions } from './validation';

// IndexedDB is a boundary: nothing learned, nothing stored.
vi.mock('./db', () => ({
  getLearnedWords: vi.fn(() => Promise.resolve([])),
  addLearnedWord: vi.fn(() => Promise.resolve()),
  removeLearnedWord: vi.fn(() => Promise.resolve()),
}));

function opts(overrides: Partial<WordCheckOptions> = {}): WordCheckOptions {
  return {
    categoryId: 'animal',
    letter: 'a',
    language: 'en',
    mode: 'dictionary',
    wikidata: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Dictionary verdicts are cached per word for the module lifetime — every
// case uses its own word.

describe('checkWordWithin (the review screen never waits past the deadline)', () => {
  it('gives up on a lookup that is still running at the deadline and sends the word to the group', async () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined)); // never answers
    const pending = checkWordWithin('aardvarkling', opts());
    let settled: string | null = null;
    void pending.then((v) => (settled = v));
    await vi.advanceTimersByTimeAsync(CHECK_DEADLINE_MS - 1);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe('vote');
  });

  it('defaults the deadline to two seconds', () => {
    expect(CHECK_DEADLINE_MS).toBe(2000);
  });

  it('passes a verdict through untouched when the check finishes in time', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(Response.json({ query: { pages: { '7': { pageid: 7, title: 'x' } } } })),
    );
    const verdict = checkWordWithin('anteaterling', opts());
    await vi.advanceTimersByTimeAsync(0);
    await expect(verdict).resolves.toBe('valid');
    await expect(checkWordWithin('zebra', opts())).resolves.toBe('invalid'); // wrong letter
    await expect(checkWordWithin('apple', opts({ mode: 'none' }))).resolves.toBe('valid');
  });

  it('honours a custom deadline', async () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => undefined));
    let settled: string | null = null;
    void checkWordWithin('armadilloish', opts(), 500).then((v) => (settled = v));
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe('vote');
  });
});

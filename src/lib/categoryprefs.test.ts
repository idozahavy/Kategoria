import { afterEach, describe, expect, it, vi } from 'vitest';

import { readCategoryPrefs, writeCategoryPrefs } from './categoryprefs';

const BUILTIN = ['animal', 'food', 'city'];
const KEY = 'categories-setup-categories';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStorage(seed: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  return store;
}

describe('category prefs', () => {
  it('has nothing to restore on a fresh install', () => {
    stubStorage();
    expect(readCategoryPrefs(BUILTIN)).toBeNull();
  });

  it('round-trips the picked set together with the custom categories', () => {
    stubStorage();
    writeCategoryPrefs({
      selectedIds: ['food', 'c-1'],
      custom: [{ id: 'c-1', customName: 'Pokémon', emoji: '⚡' }],
    });
    expect(readCategoryPrefs(BUILTIN)).toEqual({
      selectedIds: ['food', 'c-1'],
      custom: [{ id: 'c-1', customName: 'Pokémon', emoji: '⚡' }],
    });
  });

  it('drops retired builtin ids, malformed custom entries and duplicates', () => {
    stubStorage({
      [KEY]: JSON.stringify({
        selectedIds: ['animal', 'gone', 'animal', 'c-1', 'c-bad', 42],
        custom: [
          { id: 'c-1', customName: '  Superheroes ' },
          { id: 'c-1', customName: 'Duplicate id' },
          { id: 'c-bad', customName: '' },
          { id: 'c-long', customName: 'x'.repeat(25) },
          { customName: 'no id' },
          'junk',
          null,
        ],
      }),
    });
    expect(readCategoryPrefs(BUILTIN)).toEqual({
      selectedIds: ['animal', 'c-1'],
      custom: [{ id: 'c-1', customName: 'Superheroes' }],
    });
  });

  it('keeps the custom list even when nothing valid is selected (caller falls back to defaults)', () => {
    stubStorage({
      [KEY]: JSON.stringify({
        selectedIds: ['gone'],
        custom: [{ id: 'c-1', customName: 'Dinosaurs' }],
      }),
    });
    expect(readCategoryPrefs(BUILTIN)).toEqual({
      selectedIds: [],
      custom: [{ id: 'c-1', customName: 'Dinosaurs' }],
    });
  });

  it('treats garbage, a non-object, and blocked storage as nothing saved', () => {
    stubStorage({ [KEY]: '{not json' });
    expect(readCategoryPrefs(BUILTIN)).toBeNull();
    stubStorage({ [KEY]: '"a string"' });
    expect(readCategoryPrefs(BUILTIN)).toBeNull();
    stubStorage({ [KEY]: JSON.stringify({ selectedIds: 'animal', custom: {} }) });
    expect(readCategoryPrefs(BUILTIN)).toBeNull();

    const boom = (): never => {
      throw new Error('denied');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(readCategoryPrefs(BUILTIN)).toBeNull();
    expect(() => {
      writeCategoryPrefs({ selectedIds: ['animal'], custom: [] });
    }).not.toThrow();
  });
});

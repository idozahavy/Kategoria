import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';

import type { LanguagePack } from '../types';
import { availablePacks, categoryName, getPack, registerPack, t, tn, uiLanguage } from './index';

describe('language packs', () => {
  it('ships six packs, each with a direction and a letter wheel', () => {
    const packs = availablePacks();
    expect(packs.map((p) => p.code).sort()).toEqual(['ar', 'en', 'es', 'fr', 'he', 'ru']);
    for (const p of packs) {
      expect(['ltr', 'rtl']).toContain(p.dir);
      expect(p.letters.length).toBeGreaterThan(0);
    }
  });

  it('marks Hebrew and Arabic as RTL', () => {
    expect(getPack('he').dir).toBe('rtl');
    expect(getPack('ar').dir).toBe('rtl');
    expect(getPack('en').dir).toBe('ltr');
  });

  it('falls back to English for an unknown code', () => {
    expect(getPack('xx').code).toBe('en');
  });
});

describe('t (UI translation)', () => {
  it('translates in the current UI language', () => {
    uiLanguage.set('he');
    expect(get(t)('common.cancel')).toBe(getPack('he').ui['common.cancel']);
    uiLanguage.set('en');
  });

  it('falls back to English, then to the key itself', () => {
    uiLanguage.set('he');
    const translate = get(t);
    expect(translate('no.such.key')).toBe('no.such.key');
    uiLanguage.set('en');
  });
});

describe('tn (plural translation)', () => {
  it('picks the English singular and plural forms', () => {
    uiLanguage.set('en');
    const plural = get(tn);
    expect(plural('board.games', 1)).toBe('1 game');
    expect(plural('board.games', 4)).toBe('4 games');
    expect(plural('board.wins', 1)).toBe('1 win');
    expect(plural('board.wins', 0)).toBe('0 wins');
    uiLanguage.set('en');
  });

  it('picks the Russian few and many forms', () => {
    uiLanguage.set('ru');
    const plural = get(tn);
    expect(plural('board.games', 1)).toBe('1 игра');
    expect(plural('board.games', 3)).toBe('3 игры');
    expect(plural('board.games', 7)).toBe('7 игр');
    expect(plural('board.wins', 2)).toBe('2 победы');
    uiLanguage.set('en');
  });

  it('falls back to the other form, then to the key itself', () => {
    // A pack that only defines `.other`: German's `one` form must fall back.
    const sparse: LanguagePack = {
      code: 'de',
      name: 'Deutsch',
      dir: 'ltr',
      letters: ['A'],
      ui: { 'board.games.other': '{n} Spiele' },
      categoryNames: {},
    };
    registerPack(sparse);
    uiLanguage.set('de');
    const plural = get(tn);
    expect(plural('board.games', 1)).toBe('1 Spiele');
    expect(plural('no.such.key', 2)).toBe('no.such.key');
    uiLanguage.set('en');
  });
});

describe('categoryName', () => {
  it('prefers a custom name, then the localized built-in name, then the key', () => {
    uiLanguage.set('en');
    const name = get(categoryName);
    expect(name({ customName: 'Dinosaurs', nameKey: 'animal' })).toBe('Dinosaurs');
    expect(name({ nameKey: 'animal' })).toBe(getPack('en').categoryNames['animal']);
    expect(name({ nameKey: 'not-a-category' })).toBe('not-a-category');
    expect(name({})).toBe('');
  });
});

import { derived, get, writable } from 'svelte/store';

import { readStorage, writeStorage } from '../storage';
import type { LanguagePack } from '../types';
import { ar } from './ar';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { he } from './he';
import { ru } from './ru';

const packs = new Map<string, LanguagePack>([
  [en.code, en],
  [he.code, he],
  [es.code, es],
  [ar.code, ar],
  [fr.code, fr],
  [ru.code, ru],
]);

export function registerPack(pack: LanguagePack): void {
  packs.set(pack.code, pack);
}

export function availablePacks(): LanguagePack[] {
  return [...packs.values()];
}

export function getPack(code: string): LanguagePack {
  return packs.get(code) ?? en;
}

const LANGUAGE_STORAGE_KEY = 'categories-ui-language';

/** Saved choice first, then the browser's preferred language, then English. */
function detectInitialLanguage(): string {
  const saved = readStorage(LANGUAGE_STORAGE_KEY);
  if (saved !== null && packs.has(saved)) return saved;
  for (const tag of navigator.languages) {
    const short = tag.toLocaleLowerCase().split('-')[0] ?? '';
    if (packs.has(short)) return short;
  }
  return 'en';
}

/** Remember the choice for the next visit. Called reactively from App.svelte. */
export function persistLanguage(code: string): void {
  writeStorage(LANGUAGE_STORAGE_KEY, code);
}

/** Language of the UI (game content language can differ per game). */
export const uiLanguage = writable<string>(detectInitialLanguage());

export const pack = derived(uiLanguage, (code) => getPack(code));

/** Translate a UI key; falls back to English, then to the key itself. */
export const t = derived(pack, (p) => (key: string): string => {
  return p.ui[key] ?? en.ui[key] ?? key;
});

/**
 * Plural-aware translation: looks up `<key>.<CLDR plural form>` for `n` in the
 * current language (Hebrew has `two`, Russian `few`/`many`, …), falls back to
 * `<key>.other`, then to English, then to the key itself; `{n}` gets the count.
 */
export const tn = derived(pack, (p) => (key: string, n: number): string => {
  const form = new Intl.PluralRules(p.code).select(n);
  const template =
    p.ui[`${key}.${form}`] ??
    p.ui[`${key}.other`] ??
    en.ui[`${key}.${form}`] ??
    en.ui[`${key}.other`] ??
    key;
  return template.replace('{n}', String(n));
});

/** Category display name for the current UI language. */
export const categoryName = derived(
  pack,
  (p) =>
    (cat: { nameKey?: string; customName?: string }): string =>
      cat.customName ??
      (cat.nameKey
        ? (p.categoryNames[cat.nameKey] ?? en.categoryNames[cat.nameKey] ?? cat.nameKey)
        : ''),
);

/** Apply the current pack's direction/lang to <html>. Called reactively from App.svelte. */
export function applyDir(): void {
  const p = get(pack);
  document.documentElement.dir = p.dir;
  document.documentElement.lang = p.code;
}

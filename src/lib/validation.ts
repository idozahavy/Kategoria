import { addLearnedWord, getLearnedWords, removeLearnedWord } from './db';
import { matchesLetter, normalizeWord } from './game';
import { getPack } from './i18n';
import type { ValidationMode } from './types';
import { ensureWords, getWords } from './words';

/** Per-request timeout for the quick dictionary/entity lookups. */
const LOOKUP_TIMEOUT_MS = 4000;
/** SPARQL is slower than the entity APIs — give it more room before giving up. */
const SPARQL_TIMEOUT_MS = 8000;

/** Wikidata entity search for a word, matching and answering in the given language. */
function wbSearchUrl(search: string, language: string): string {
  return (
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&type=item&limit=5&format=json&origin=*' +
    `&search=${encodeURIComponent(search)}&language=${language}&uselang=${language}`
  );
}

export type WordVerdict =
  | 'valid' // accepted automatically
  | 'invalid' // rejected automatically (wrong letter / empty)
  | 'vote'; // could not decide — ask the group (or auto-accept solo)

export interface WordCheckOptions {
  categoryId: string;
  letter: string;
  language: string;
  mode: ValidationMode;
  /** Playing alone — only the letter rules apply, no lookups or network calls. */
  solo?: boolean;
  /** Allow the Wikidata category-fit check (games can turn it off). */
  wikidata?: boolean;
}

/**
 * Decide a word according to the game's validation mode.
 * Never throws; network failure degrades to 'vote'.
 *
 * `solo`: playing alone there is no one to fool and no one to vote — only the
 * letter (and lone-letter) rules apply, and no lookups or network calls run.
 */
export async function checkWord(word: string, options: WordCheckOptions): Promise<WordVerdict> {
  const { categoryId, letter, language, mode, solo = false, wikidata = true } = options;
  const trimmed = word.trim();
  if (trimmed.length < 2) return 'invalid'; // a lone letter is never a word
  if (!matchesLetter(trimmed, letter)) return 'invalid';
  if (solo || mode === 'none') return 'valid';
  if (mode === 'vote') return 'vote';

  const useBundled = mode === 'hybrid' || mode === 'bundled';
  const useDictionary = mode === 'hybrid' || mode === 'dictionary';

  if (useBundled) {
    await ensureWords(language);
    if (inBundledList(trimmed, categoryId, language)) return 'valid';
    if (await inLearnedList(trimmed, categoryId, language)) return 'valid';
  }

  if (useDictionary) {
    if (wikidata && categoryId in WIKIDATA_CLASS) {
      const fit = await inWikidataCategory(trimmed, categoryId, language);
      if (fit === 'fit') {
        void learnWord(language, categoryId, trimmed);
        return 'valid';
      }
      // Wikidata knows types, the existence check below doesn't — a definitive
      // "doesn't fit" goes to the group instead of auto-passing as "exists".
      if (fit === 'nofit') return 'vote';
      // 'error' (offline/slow/unmapped) — fall through to the existence check.
    }
    const known = await inPublicDictionary(trimmed, language);
    if (known === 'known') {
      // Remember it so future games validate instantly and offline.
      void learnWord(language, categoryId, trimmed);
      return 'valid';
    }
    if (known === 'unknown' && mode === 'dictionary') return 'vote';
  }

  return 'vote';
}

/** The review screen waits at most this long per word — the rest go to the group. */
export const CHECK_DEADLINE_MS = 2000;

/**
 * checkWord with a hard deadline: a check still running when it passes
 * resolves to 'vote'. The lookups keep going in the background and warm the
 * caches for the next round. Never throws.
 */
export function checkWordWithin(
  word: string,
  options: WordCheckOptions,
  deadlineMs = CHECK_DEADLINE_MS,
): Promise<WordVerdict> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve('vote');
    }, deadlineMs);
    checkWord(word, options).then(
      (verdict) => {
        clearTimeout(timer);
        resolve(verdict);
      },
      () => {
        clearTimeout(timer);
        resolve('vote');
      },
    );
  });
}

/**
 * Fire-and-forget check for a just-submitted word: warms the word-list,
 * learned-word, and dictionary caches so the review screen resolves instantly.
 */
export function prefetchWordCheck(word: string, options: WordCheckOptions): void {
  // checkWord never throws by contract; the catch is a belt for future edits.
  void checkWord(word, options).catch(() => undefined);
}

/**
 * In-memory cache over the persistent learned-words store, one set per
 * lang:category. Holds promises so concurrent callers (review checks all words
 * at once) share one load instead of racing to overwrite each other's set.
 */
const learnedCache = new Map<string, Promise<Set<string>>>();

function learnedSet(language: string, categoryId: string): Promise<Set<string>> {
  const key = `${language}:${categoryId}`;
  let cached = learnedCache.get(key);
  if (!cached) {
    cached = getLearnedWords(language, categoryId).then(
      (words) => new Set(words),
      // storage unavailable — behave as if nothing was learned
      () => new Set<string>(),
    );
    learnedCache.set(key, cached);
  }
  return cached;
}

export async function inLearnedList(
  word: string,
  categoryId: string,
  language: string,
): Promise<boolean> {
  return (await learnedSet(language, categoryId)).has(normalizeWord(word));
}

/** Persist a confirmed word (dictionary hit or accepted group vote) for future games. */
export async function learnWord(language: string, categoryId: string, word: string): Promise<void> {
  // Custom categories get a fresh UUID every game — words learned under one
  // could never be looked up again. Only builtin category ids accumulate.
  if (!(categoryId in getPack(language).categoryNames)) return;
  const normalized = normalizeWord(word);
  if (normalized.length < 2) return;
  const set = await learnedSet(language, categoryId);
  if (set.has(normalized)) return;
  set.add(normalized);
  try {
    await addLearnedWord(language, categoryId, normalized);
  } catch {
    // storage unavailable — the in-memory cache still helps this session
  }
}

/** Un-learn a word (bad group vote etc.): drops it from cache and storage. */
export async function forgetWord(
  language: string,
  categoryId: string,
  word: string,
): Promise<void> {
  const normalized = normalizeWord(word);
  const cached = learnedCache.get(`${language}:${categoryId}`);
  if (cached) (await cached).delete(normalized);
  try {
    await removeLearnedWord(language, categoryId, normalized);
  } catch {
    // storage unavailable — the cache removal still applies this session
  }
}

const factCache = new Map<string, string | null>();

/**
 * A one-line "did you know" description of the word from Wikidata, in the
 * given language. Never throws; null when nothing kid-worthy is found.
 */
export async function wordFact(word: string, language: string): Promise<string | null> {
  const w = normalizeWord(word);
  const key = `${language}:${w}`;
  const cached = factCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(wbSearchUrl(w, language), {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      search?: { description?: string; match?: { text?: string } }[];
    };
    const hit = (data.search ?? []).find(
      (s) =>
        s.match?.text?.toLocaleLowerCase() === w &&
        typeof s.description === 'string' &&
        s.description !== '',
    );
    const fact = hit?.description ?? null;
    factCache.set(key, fact);
    return fact;
  } catch {
    return null;
  }
}

/** Lists must be loaded first via ensureWords(); unloaded languages match nothing. */
export function inBundledList(word: string, categoryId: string, language: string): boolean {
  const list = getWords(language)[categoryId];
  if (!list) return false;
  return list.includes(normalizeWord(word));
}

/**
 * Wikidata class per builtin category, for the category-fit check.
 * `object` is deliberately unmapped — "physical object" is too broad to help.
 */
const WIKIDATA_CLASS: Record<string, string> = {
  animal: 'Q729',
  food: 'Q2095',
  city: 'Q486972', // human settlement — covers cities, towns, villages
  country: 'Q6256',
  name: 'Q202444', // given name
  plant: 'Q756',
  profession: 'Q28640',
  sport: 'Q349',
  color: 'Q1075',
};

const wikidataCache = new Map<string, 'fit' | 'nofit'>();

/** WDQS throttles bursty anonymous clients — run at most one check at a time. */
let wikidataQueue: Promise<unknown> = Promise.resolve();

/**
 * After a failure (timeout/429), skip Wikidata for a minute instead of letting
 * every queued check burn its full timeout — words fall through to the
 * existence check immediately.
 */
let wikidataDownUntil = 0;
const WIKIDATA_COOLDOWN_MS = 60_000;

/**
 * Resolve a word to Wikidata item ids in the given language. The search API is
 * case-insensitive and knows aliases, but matches prefixes too — keep only
 * results whose matched label/alias is exactly the word.
 */
async function searchWikidataIds(word: string, language: string): Promise<string[]> {
  const res = await fetch(wbSearchUrl(word, language), {
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`wbsearchentities ${String(res.status)}`);
  const data = (await res.json()) as {
    search?: { id: string; match?: { text?: string } }[];
  };
  return (data.search ?? [])
    .filter((s) => s.match?.text?.toLocaleLowerCase() === word)
    .map((s) => s.id)
    .filter((id) => /^Q\d+$/.test(id));
}

/**
 * Ask Wikidata whether the word names something of the category's class, in
 * the given language. Two steps: entity search (fast), then one ASK query from
 * the fixed candidate ids walking instance-of/subclass-of plus parent-taxon
 * (animals and plants live in the biology taxonomy, not the ontology).
 * Never throws; timeouts and unmapped categories come back as 'error'.
 */
export async function inWikidataCategory(
  word: string,
  categoryId: string,
  language: string,
): Promise<'fit' | 'nofit' | 'error'> {
  const target = WIKIDATA_CLASS[categoryId];
  if (target === undefined) return 'error';
  const w = word.trim().toLocaleLowerCase();
  const key = `${language}:${categoryId}:${w}`;
  const cached = wikidataCache.get(key);
  if (cached) return cached;
  if (Date.now() < wikidataDownUntil) return 'error';
  const run = wikidataQueue.then(async (): Promise<'fit' | 'nofit' | 'error'> => {
    // An identical check queued ahead of us may have already resolved.
    const settled = wikidataCache.get(key);
    if (settled) return settled;
    if (Date.now() < wikidataDownUntil) return 'error';
    try {
      const ids = await searchWikidataIds(w, language);
      if (ids.length === 0) {
        wikidataCache.set(key, 'nofit'); // Wikidata doesn't know the word at all
        return 'nofit';
      }
      const query = `ASK { VALUES ?item { ${ids.map((id) => `wd:${id}`).join(' ')} } ?item (wdt:P31|wdt:P279|wdt:P171)* wd:${target} . }`;
      const res = await fetch(
        `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
        {
          signal: AbortSignal.timeout(SPARQL_TIMEOUT_MS),
          headers: { Accept: 'application/sparql-results+json' },
        },
      );
      if (!res.ok) {
        wikidataDownUntil = Date.now() + WIKIDATA_COOLDOWN_MS;
        return 'error';
      }
      const data = (await res.json()) as { boolean?: boolean };
      const verdict = data.boolean === true ? 'fit' : 'nofit';
      wikidataCache.set(key, verdict);
      return verdict;
    } catch {
      wikidataDownUntil = Date.now() + WIKIDATA_COOLDOWN_MS;
      return 'error';
    }
  });
  // Keep the queue alive after a failed run — the next lookup must still chain.
  wikidataQueue = run.catch(() => undefined);
  return run;
}

/**
 * Holds promises so concurrent checks of one word share a single request;
 * an 'error' verdict is evicted on settle so a later check retries.
 */
const dictCache = new Map<string, Promise<'known' | 'unknown' | 'error'>>();

/**
 * Check word existence in Wiktionary (public dictionary, no key needed).
 * Category fit is NOT verified — only that the word exists in the language.
 */
export function inPublicDictionary(
  word: string,
  language: string,
): Promise<'known' | 'unknown' | 'error'> {
  const key = `${language}:${word.toLocaleLowerCase()}`;
  let cached = dictCache.get(key);
  if (!cached) {
    cached = lookupWiktionary(word, language).then((verdict) => {
      if (verdict === 'error') dictCache.delete(key);
      return verdict;
    });
    dictCache.set(key, cached);
  }
  return cached;
}

async function lookupWiktionary(
  word: string,
  language: string,
): Promise<'known' | 'unknown' | 'error'> {
  try {
    const url = `https://${language}.wiktionary.org/w/api.php?action=query&titles=${encodeURIComponent(
      word.toLocaleLowerCase(),
    )}&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (!res.ok) return 'error';
    const data = (await res.json()) as { query?: { pages?: Record<string, { missing?: string }> } };
    const pages = data.query?.pages ?? {};
    const found = Object.entries(pages).some(([id, page]) => id !== '-1' && !('missing' in page));
    return found ? 'known' : 'unknown';
  } catch {
    return 'error';
  }
}

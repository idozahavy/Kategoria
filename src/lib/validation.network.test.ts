import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addLearnedWord } from './db';
import {
  checkWord,
  inPublicDictionary,
  prefetchWordCheck,
  type WordCheckOptions,
  wordFact,
} from './validation';

// IndexedDB is a boundary: learned words come from (and go to) the mock.
vi.mock('./db', () => ({
  getLearnedWords: vi.fn(() => Promise.resolve(['aardwolfish'])),
  addLearnedWord: vi.fn(() => Promise.resolve()),
  removeLearnedWord: vi.fn(() => Promise.resolve()),
}));

type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

/** Route fetches by URL substring; anything unrouted fails like a dead network. */
function stubFetch(routes: Record<string, () => Response | Promise<Response>>): FetchMock {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
    const hit = Object.entries(routes).find(([needle]) => url.includes(needle));
    return hit ? Promise.resolve(hit[1]()) : Promise.reject(new TypeError('Failed to fetch'));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const wiktionaryKnown = (): Response =>
  Response.json({ query: { pages: { '4242': { pageid: 4242, title: 'x' } } } });
const wiktionaryUnknown = (): Response =>
  Response.json({ query: { pages: { '-1': { title: 'x', missing: '' } } } });

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
  vi.mocked(addLearnedWord).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Verdicts are cached per word for the whole module lifetime, so every case
// below uses its own word.

describe('inPublicDictionary (Wiktionary)', () => {
  it('asks the language edition for the lowercased word and reads a hit as known', async () => {
    const fetchMock = stubFetch({ 'wiktionary.org': wiktionaryKnown });
    await expect(inPublicDictionary('Anteater', 'fr')).resolves.toBe('known');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('https://fr.wiktionary.org/');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('titles=anteater');
  });

  it('reads a missing page as unknown', async () => {
    stubFetch({ 'wiktionary.org': wiktionaryUnknown });
    await expect(inPublicDictionary('blorptle', 'en')).resolves.toBe('unknown');
  });

  it('reports error when the wiki answers badly or not at all', async () => {
    stubFetch({ 'wiktionary.org': () => new Response('busy', { status: 429 }) });
    await expect(inPublicDictionary('crumbleworth', 'en')).resolves.toBe('error');
    stubFetch({});
    await expect(inPublicDictionary('dinglehop', 'en')).resolves.toBe('error');
  });

  it('shares one request between concurrent checks of the same word (regression 82cd032)', async () => {
    const fetchMock = stubFetch({ 'wiktionary.org': wiktionaryKnown });
    const verdicts = await Promise.all([
      inPublicDictionary('echidna', 'en'),
      inPublicDictionary('Echidna', 'en'),
    ]);
    expect(verdicts).toEqual(['known', 'known']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('remembers a verdict but forgets an error so the next check retries (regression 82cd032)', async () => {
    const failing = stubFetch({ 'wiktionary.org': () => new Response('', { status: 500 }) });
    await expect(inPublicDictionary('fennec', 'en')).resolves.toBe('error');
    const working = stubFetch({ 'wiktionary.org': wiktionaryKnown });
    await expect(inPublicDictionary('fennec', 'en')).resolves.toBe('known');
    await expect(inPublicDictionary('fennec', 'en')).resolves.toBe('known');
    expect(failing).toHaveBeenCalledTimes(1);
    expect(working).toHaveBeenCalledTimes(1);
  });

  it('reads an answer without any pages as unknown', async () => {
    stubFetch({ 'wiktionary.org': () => Response.json({}) });
    await expect(inPublicDictionary('grombler', 'en')).resolves.toBe('unknown');
    stubFetch({ 'wiktionary.org': () => Response.json({ query: {} }) });
    await expect(inPublicDictionary('hobnocker', 'en')).resolves.toBe('unknown');
  });
});

describe('checkWord with lookups', () => {
  it('accepts a bundled word in hybrid mode without going online', async () => {
    const fetchMock = stubFetch({});
    await expect(checkWord('ant', opts({ mode: 'hybrid' }))).resolves.toBe('valid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a word learned in an earlier game without going online', async () => {
    const fetchMock = stubFetch({});
    await expect(checkWord('Aardwolfish', opts({ mode: 'hybrid' }))).resolves.toBe('valid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a dictionary hit but does not learn it — existence is not category fit', async () => {
    stubFetch({ 'wiktionary.org': wiktionaryKnown });
    await expect(checkWord(' Axolotl ', opts())).resolves.toBe('valid');
    expect(addLearnedWord).not.toHaveBeenCalled();
  });

  it('never learns an existence-only hit when Wikidata cannot judge the category', async () => {
    // 'object' has no Wikidata class, so only the existence check runs.
    stubFetch({ 'wiktionary.org': wiktionaryKnown });
    await expect(
      checkWord('avocado', opts({ wikidata: true, categoryId: 'object' })),
    ).resolves.toBe('valid');
    expect(addLearnedWord).not.toHaveBeenCalled();
  });

  it('sends an unknown word to the group in both dictionary and hybrid modes', async () => {
    stubFetch({ 'wiktionary.org': wiktionaryUnknown });
    await expect(checkWord('aqualor', opts())).resolves.toBe('vote');
    await expect(checkWord('aqualorix', opts({ mode: 'hybrid' }))).resolves.toBe('vote');
    expect(addLearnedWord).not.toHaveBeenCalled();
  });

  it('sends a word to the group when the dictionary is unreachable', async () => {
    stubFetch({});
    await expect(checkWord('ambleflop', opts())).resolves.toBe('vote');
  });

  it('with the Wikidata check on, a category fit is accepted without asking Wiktionary', async () => {
    const fetchMock = stubFetch({
      wbsearchentities: () => Response.json({ search: [{ id: 'Q1', match: { text: 'alpaca' } }] }),
      'query.wikidata.org/sparql': () => Response.json({ boolean: true }),
    });
    await expect(checkWord('alpaca', opts({ wikidata: true }))).resolves.toBe('valid');
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContainEqual(
      expect.stringContaining('wiktionary'),
    );
    expect(addLearnedWord).toHaveBeenCalledWith('en', 'animal', 'alpaca');
  });

  it('with the Wikidata check on, a definite non-fit goes to the group, not to Wiktionary', async () => {
    const fetchMock = stubFetch({
      wbsearchentities: () => Response.json({ search: [{ id: 'Q2', match: { text: 'anvil' } }] }),
      'query.wikidata.org/sparql': () => Response.json({ boolean: false }),
      'wiktionary.org': wiktionaryKnown,
    });
    await expect(checkWord('anvil', opts({ wikidata: true }))).resolves.toBe('vote');
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContainEqual(
      expect.stringContaining('wiktionary'),
    );
  });

  it('skips Wikidata for a category it cannot map and relies on Wiktionary', async () => {
    const fetchMock = stubFetch({ 'wiktionary.org': wiktionaryKnown });
    await expect(checkWord('abacus', opts({ wikidata: true, categoryId: 'object' }))).resolves.toBe(
      'valid',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('wiktionary');
  });

  it('prefetch warms the dictionary cache so the review check needs no request', async () => {
    const fetchMock = stubFetch({ 'wiktionary.org': wiktionaryKnown });
    prefetchWordCheck('armadillo', opts());
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    await expect(checkWord('armadillo', opts())).resolves.toBe('valid');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('wordFact', () => {
  const search = (entries: { text: string; description?: string }[]) => (): Response =>
    Response.json({
      search: entries.map((e, i) => ({
        id: `Q${String(i)}`,
        match: { text: e.text },
        description: e.description,
      })),
    });

  it('returns the description of the entry whose label is exactly the word', async () => {
    stubFetch({
      wbsearchentities: search([
        { text: 'okapi tree', description: 'a plant' },
        { text: 'okapi', description: 'forest giraffid of Congo' },
      ]),
    });
    await expect(wordFact(' Okapi ', 'en')).resolves.toBe('Forest giraffid of Congo.');
  });

  it('has nothing to say for prefix-only matches or empty descriptions', async () => {
    stubFetch({ wbsearchentities: search([{ text: 'pangolin scales', description: 'x' }]) });
    await expect(wordFact('pangolin', 'en')).resolves.toBeNull();
    stubFetch({ wbsearchentities: search([{ text: 'quokka', description: '' }]) });
    await expect(wordFact('quokka', 'en')).resolves.toBeNull();
  });

  it('skips descriptions that fell back to another language', async () => {
    stubFetch({
      wbsearchentities: () =>
        Response.json({
          search: [
            {
              id: 'Q186392',
              match: { text: 'גור' },
              description: 'province of Afghanistan',
              display: { description: { value: 'province of Afghanistan', language: 'en' } },
            },
            {
              id: 'Q3477974',
              match: { text: 'גור' },
              description: 'יישוב בווירג׳יניה',
              display: { description: { value: 'יישוב בווירג׳יניה', language: 'he' } },
            },
          ],
        }),
    });
    await expect(wordFact('גור', 'he')).resolves.toBe('יישוב בווירג׳יניה.');
  });

  it('remembers a fact but not a failed lookup', async () => {
    const failing = stubFetch({ wbsearchentities: () => new Response('', { status: 503 }) });
    await expect(wordFact('rhea', 'en')).resolves.toBeNull();
    const working = stubFetch({
      wbsearchentities: search([{ text: 'rhea', description: 'bird' }]),
    });
    await expect(wordFact('rhea', 'en')).resolves.toBe('Bird.');
    await expect(wordFact('RHEA', 'en')).resolves.toBe('Bird.');
    expect(failing).toHaveBeenCalledTimes(1);
    expect(working).toHaveBeenCalledTimes(1);
  });

  it('has nothing to say while offline, and does not remember that either', async () => {
    const offline = stubFetch({});
    await expect(wordFact('saola', 'en')).resolves.toBeNull();
    stubFetch({ wbsearchentities: search([{ text: 'saola', description: 'rare forest bovine' }]) });
    await expect(wordFact('saola', 'en')).resolves.toBe('Rare forest bovine.');
    expect(offline).toHaveBeenCalledTimes(1);
  });
});

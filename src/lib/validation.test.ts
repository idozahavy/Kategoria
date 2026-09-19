import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkWord, inBundledList, type WordCheckOptions, wordFact } from './validation';
import { ensureWords } from './words';

function opts(overrides: Partial<WordCheckOptions> = {}): WordCheckOptions {
  return {
    categoryId: 'animal',
    letter: 'a',
    language: 'en',
    mode: 'bundled',
    ...overrides,
  };
}

describe('checkWord letter rules (no network)', () => {
  it('rejects lone letters and words on the wrong letter', async () => {
    await expect(checkWord('a', opts())).resolves.toBe('invalid');
    await expect(checkWord('  b ', opts())).resolves.toBe('invalid');
    await expect(checkWord('dog', opts())).resolves.toBe('invalid');
  });

  it('solo play accepts any word that fits the letter, without lookups', async () => {
    await expect(checkWord('axolotl', opts({ solo: true, mode: 'hybrid' }))).resolves.toBe('valid');
  });

  it("mode 'none' accepts and mode 'vote' defers to the group", async () => {
    await expect(checkWord('ant', opts({ mode: 'none' }))).resolves.toBe('valid');
    await expect(checkWord('ant', opts({ mode: 'vote' }))).resolves.toBe('vote');
  });
});

describe("checkWord mode 'bundled' (offline word lists)", () => {
  it('accepts a word from the bundled list', async () => {
    await expect(checkWord('Ant', opts())).resolves.toBe('valid');
    await expect(checkWord(' alligator ', opts())).resolves.toBe('valid');
  });

  it('sends an unknown word to the group vote', async () => {
    await expect(checkWord('aqzzt', opts())).resolves.toBe('vote');
  });
});

describe('inBundledList', () => {
  it('matches nothing before the language is loaded, case-insensitively after', async () => {
    expect(inBundledList('hormiga', 'animal', 'es-not-loaded')).toBe(false);
    await ensureWords('en');
    expect(inBundledList(' ANT ', 'animal', 'en')).toBe(true);
    expect(inBundledList('ant', 'no-such-category', 'en')).toBe(false);
  });
});

describe('wordFact sense picking', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** One wbsearchentities response; every entry matches the word exactly. */
  function stubSearch(word: string, descriptions: string[]) {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          search: descriptions.map((description, i) => ({
            id: `Q${String(i)}`,
            match: { text: word },
            description,
          })),
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('describes the animal, not the album Wikidata ranks first', async () => {
    stubSearch('elephant', [
      '2003 album by The White Stripes',
      'village in Lombardy',
      'large terrestrial mammal with a trunk',
    ]);
    await expect(wordFact('Elephant', 'en', 'animal')).resolves.toBe(
      'large terrestrial mammal with a trunk',
    );
  });

  it('has nothing to say when every sense is media or a disambiguation page', async () => {
    stubSearch('tusk', [
      '1979 album by Fleetwood Mac',
      '1980 film',
      'Wikimedia disambiguation page',
    ]);
    await expect(wordFact('tusk', 'en', 'animal')).resolves.toBeNull();
  });

  it('without a category still skips the album and takes the first clean sense', async () => {
    stubSearch('mammoth', ['1996 song by a band', 'extinct genus of elephantid']);
    await expect(wordFact('mammoth', 'en')).resolves.toBe('extinct genus of elephantid');
  });

  it('caches per category, so the same word is looked up again for another one', async () => {
    const fetchMock = stubSearch('orange', [
      'citrus fruit, a food',
      'colour between red and yellow',
    ]);
    await expect(wordFact('orange', 'en', 'food')).resolves.toBe('citrus fruit, a food');
    await expect(wordFact('orange', 'en', 'color')).resolves.toBe('colour between red and yellow');
    await expect(wordFact('orange', 'en', 'food')).resolves.toBe('citrus fruit, a food');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps person-name senses for the 'name' category", async () => {
    stubSearch('jordan', ['male given name', 'country in the Middle East']);
    await expect(wordFact('Jordan', 'en', 'name')).resolves.toBe('male given name');
    stubSearch('taylor', ['2001 album', 'surname']);
    await expect(wordFact('Taylor', 'en', 'name')).resolves.toBe('surname');
    await expect(wordFact('Taylor', 'en', 'animal')).resolves.toBeNull();
  });
});

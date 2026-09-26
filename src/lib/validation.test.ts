import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkWord,
  hasWordFacts,
  inBundledList,
  tidyFact,
  type WordCheckOptions,
  wordFact,
} from './validation';
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

  it('finds accented list words typed without accents', async () => {
    await ensureWords('fr');
    expect(inBundledList('elephant', 'animal', 'fr')).toBe(true);
    expect(inBundledList('Éléphant', 'animal', 'fr')).toBe(true);
  });

  it('accepts an accented first letter against the plain round letter', async () => {
    await expect(
      checkWord('éléphant', { categoryId: 'animal', letter: 'E', language: 'fr', mode: 'bundled' }),
    ).resolves.toBe('valid');
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
      'Large terrestrial mammal with a trunk.',
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
    await expect(wordFact('mammoth', 'en')).resolves.toBe('Extinct genus of elephantid.');
  });

  it('caches per category, so the same word is looked up again for another one', async () => {
    const fetchMock = stubSearch('orange', [
      'citrus fruit, a food',
      'colour between red and yellow',
    ]);
    await expect(wordFact('orange', 'en', 'food')).resolves.toBe('Citrus fruit, a food.');
    await expect(wordFact('orange', 'en', 'color')).resolves.toBe('Colour between red and yellow.');
    await expect(wordFact('orange', 'en', 'food')).resolves.toBe('Citrus fruit, a food.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips a TV series even when adjectives split "television" from "series"', async () => {
    stubSearch('dates', ['British television romantic drama series created by Bryan Elsley']);
    await expect(wordFact('Dates', 'en', 'food')).resolves.toBeNull();
  });

  it('skips a description that names another item outside a note', async () => {
    stubSearch('tortoise', ['see Q223044 for the taxon', 'land-dwelling reptile']);
    await expect(wordFact('tortoise', 'en', 'animal')).resolves.toBe('Land-dwelling reptile.');
  });

  it("has no facts for the 'name' category", async () => {
    stubSearch('jordan', ['male given name', 'country in the Middle East']);
    await expect(wordFact('Jordan', 'en', 'name')).resolves.toBeNull();
    stubSearch('taylor', ['2001 album', 'surname']);
    await expect(wordFact('Taylor', 'en', 'animal')).resolves.toBeNull();
    expect(hasWordFacts('name')).toBe(false);
    expect(hasWordFacts('animal')).toBe(true);
    expect(hasWordFacts(undefined)).toBe(true);
  });
});

describe('tidyFact', () => {
  it('keeps the first clause and makes it a sentence', () => {
    expect(
      tidyFact(
        'large metal pot for cooking or boiling over an open fire; hanging or standing',
        'en',
      ),
    ).toBe('Large metal pot for cooking or boiling over an open fire.');
  });

  it('leaves finished sentences and scripts without case alone', () => {
    expect(tidyFact('A bird!', 'en')).toBe('A bird!');
    expect(tidyFact('עוף דורס', 'he')).toBe('עוף דורס.');
  });

  it("drops Wikidata editors' notes that point at another item", () => {
    expect(
      tidyFact(
        'reptile with a shell, including tortoises, terrapins, and sea turtles (for the taxon use Q223044)',
        'en',
      ),
    ).toBe('Reptile with a shell, including tortoises, terrapins, and sea turtles.');
    // An ordinary parenthesis stays.
    expect(tidyFact('small bird (songbird)', 'en')).toBe('Small bird (songbird).');
  });

  it('drops a dangling comma and handles the Arabic semicolon', () => {
    expect(tidyFact('طائر كبير، ؛ يعيش في أفريقيا', 'ar')).toBe('طائر كبير.');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { botAnswers } from './bot';
import { ensureWords, getWords } from './words';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Deterministic Math.random() sequence: one call per fill-check, one more per fill. */
function stubRandomSequence(...values: number[]): void {
  const random = vi.spyOn(Math, 'random');
  values.forEach((v, i) => {
    random.mockImplementationOnce(() => v);
    if (i === values.length - 1) random.mockImplementation(() => v);
  });
}

describe('botAnswers', () => {
  it('fills a category with a word matching the round letter, skipping a rolled-out category', async () => {
    // animal: fill-check passes (0 <= fill rate), index pick 0 -> first match.
    // food: fill-check fails (0.99 > fill rate) -> category skipped entirely.
    stubRandomSequence(0, 0, 0.99);
    // The lists grow over time - read the expected pick from the list itself.
    await ensureWords('en');
    const firstAnimalWithA = getWords('en')['animal']?.find((w) => w.startsWith('a'));
    expect(firstAnimalWithA).toBeDefined();
    const answers = await botAnswers('en', 'a', ['animal', 'food']);
    expect(answers).toEqual({ animal: firstAnimalWithA });
    expect(answers.food).toBeUndefined();
  });

  it('never returns a word that does not start with the round letter', async () => {
    stubRandomSequence(0, 0);
    const answers = await botAnswers('en', 'a', ['animal']);
    for (const word of Object.values(answers)) {
      expect(word.toLowerCase().startsWith('a')).toBe(true);
    }
  });

  it('leaves a category unanswered when no bundled word matches the letter', async () => {
    // fill-check passes, but no English animal starts with "zzz".
    stubRandomSequence(0, 0);
    const answers = await botAnswers('en', 'zzz', ['animal']);
    expect(answers).toEqual({});
  });

  it('leaves a category unanswered when the category has no bundled list at all', async () => {
    stubRandomSequence(0, 0);
    const answers = await botAnswers('en', 'a', ['not-a-real-category']);
    expect(answers).toEqual({});
  });

  it('returns no answers when every category is rolled out', async () => {
    stubRandomSequence(0.99, 0.99);
    const answers = await botAnswers('en', 'a', ['animal', 'food']);
    expect(answers).toEqual({});
  });
});

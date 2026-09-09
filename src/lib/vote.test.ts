import { describe, expect, it } from 'vitest';

import { countVotes, tallyVote, type VoteChoice } from './vote';

function ballots(...choices: VoteChoice[]): Record<string, VoteChoice> {
  return Object.fromEntries(choices.map((c, i) => [`p${String(i + 1)}`, c]));
}

describe('countVotes', () => {
  it('splits the ballots into yes and no', () => {
    expect(countVotes({})).toEqual({ yes: 0, no: 0 });
    expect(countVotes(ballots('yes', 'no', 'yes'))).toEqual({ yes: 2, no: 1 });
  });
});

describe('tallyVote (half or more of the voters say yes)', () => {
  it('accepts as soon as the yeses reach half of the voters', () => {
    expect(tallyVote(ballots('yes'), 2)).toBe('accepted');
    expect(tallyVote(ballots('yes', 'yes'), 4)).toBe('accepted');
    expect(tallyVote(ballots('yes', 'yes'), 3)).toBe('accepted');
    expect(tallyVote(ballots('no', 'yes', 'yes'), 4)).toBe('accepted');
  });

  it('rejects as soon as the noes pass half — the yeses can no longer catch up', () => {
    expect(tallyVote(ballots('no', 'no'), 2)).toBe('rejected');
    expect(tallyVote(ballots('no', 'no'), 3)).toBe('rejected');
    expect(tallyVote(ballots('no', 'no', 'no'), 4)).toBe('rejected');
    expect(tallyVote(ballots('yes', 'no', 'no', 'no'), 5)).toBe('rejected');
  });

  it('stays open while the ballots still out could flip the answer', () => {
    expect(tallyVote({}, 2)).toBe('open');
    expect(tallyVote(ballots('no'), 2)).toBe('open');
    expect(tallyVote(ballots('yes'), 3)).toBe('open');
    expect(tallyVote(ballots('yes'), 4)).toBe('open'); // one of four is not half
    expect(tallyVote(ballots('no', 'no'), 4)).toBe('open');
    expect(tallyVote(ballots('yes', 'no'), 4)).toBe('open');
  });

  it('always decides once every voter has spoken (ties accept)', () => {
    expect(tallyVote(ballots('yes', 'no'), 2)).toBe('accepted');
    expect(tallyVote(ballots('yes', 'no', 'no'), 3)).toBe('rejected');
    expect(tallyVote(ballots('yes', 'yes', 'no', 'no'), 4)).toBe('accepted');
    expect(tallyVote(ballots('yes', 'no', 'no', 'no'), 4)).toBe('rejected');
  });

  it('shrinks the quorum with the voters: a dropped phone stops holding the vote up', () => {
    // Four players, one phone gone: two noes out of three decide it.
    expect(tallyVote(ballots('yes', 'no', 'no'), 4)).toBe('open');
    expect(tallyVote(ballots('yes', 'no', 'no'), 3)).toBe('rejected');
  });

  it('leaves a vote with nobody to ask open for the host', () => {
    expect(tallyVote({}, 0)).toBe('open');
  });
});

/**
 * Group vote on a word nothing could check automatically. Pure tally rules —
 * the review screen owns the ballots and the P2P layer carries them.
 */

export type VoteChoice = 'yes' | 'no';
export type VoteOutcome = 'accepted' | 'rejected' | 'open';

export function countVotes(votes: Record<string, VoteChoice>): { yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (const choice of Object.values(votes)) {
    if (choice === 'yes') yes += 1;
    else no += 1;
  }
  return { yes, no };
}

/**
 * A word counts when at least half of the voters say yes. Decides as soon as
 * the ballots still out can no longer change the answer: 'accepted' once the
 * yeses reach half, 'rejected' once the noes pass half. Once every voter has
 * spoken one of the two always holds, so a full ballot box is never 'open'.
 * With nobody to ask (voterCount 0) the vote stays open for the host.
 */
export function tallyVote(votes: Record<string, VoteChoice>, voterCount: number): VoteOutcome {
  if (voterCount <= 0) return 'open';
  const { yes, no } = countVotes(votes);
  if (yes * 2 >= voterCount) return 'accepted';
  if (no * 2 > voterCount) return 'rejected';
  return 'open';
}

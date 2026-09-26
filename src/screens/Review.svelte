<script lang="ts">
  import { onMount, untrack } from 'svelte';

  import { trackEvent } from '../lib/analytics';
  import { categoryEmoji } from '../lib/categories';
  import {
    invalidReason,
    isFinished,
    isSameWord,
    newId,
    roundPoints,
    scoreRound,
    startNextRound,
    totalScores,
  } from '../lib/game';
  import { categoryName, t } from '../lib/i18n';
  import {
    getActiveRoom,
    type GuestMessage,
    type ResultCategory,
    type StandingRow,
    wireAvatar,
  } from '../lib/p2p';
  import { playDing } from '../lib/sound';
  import { game, screen, updateGame } from '../lib/stores';
  import type { AnswerStatus, GameState, RoundState } from '../lib/types';
  import AnswerRow from '../lib/ui/AnswerRow.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import Modal from '../lib/ui/Modal.svelte';
  import ScoreRow from '../lib/ui/ScoreRow.svelte';
  import Spinner from '../lib/ui/Spinner.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';
  import { checkWordWithin, learnWord, wordFact } from '../lib/validation';
  import { eligibleVoters, tallyVote, type VoteChoice } from '../lib/vote';

  $effect(() => {
    if (!$game) screen.set('home');
  });

  /** How many of the best totals the standings card shows after a round. */
  const STANDINGS_LIMIT = 5;

  const round = $derived($game ? $game.rounds[$game.currentRound] : null);
  const players = $derived($game?.players ?? []);
  const isRemote = $derived($game?.settings.isRemote === true);
  /** Remote games can hand each vote to the players' phones instead of the shared screen. */
  const votesOnDevices = $derived(isRemote && $game?.settings.voteMode === 'devices');

  /**
   * One decision per normalized (word, category): scoring compares normalized
   * words across the whole category and `learnWord` is stored the same way, so
   * asking once and applying to every player who wrote it keeps them in step.
   */
  type VoteItem = { word: string; categoryId: string; owners: string[] };

  let checking = $state(true);
  let voteQueue = $state<VoteItem[]>([]);
  let currentVote = $state<VoteItem | null>(null);
  /** How many words the group was asked about this round (for the progress line). */
  let voteTotal = $state(0);
  const voteIndex = $derived(voteTotal - voteQueue.length + 1);
  let scored = $state(false);
  let advancing = $state(false);
  let fact = $state<{ word: string; text: string } | null>(null);

  // Device vote in progress: a fresh id per word, so a late ballot for an
  // earlier word can't land on this one. Empty id = ballot box closed.
  let voteId = $state('');
  let ballots = $state<Record<string, VoteChoice>>({});
  const ballotCount = $derived(Object.keys(ballots).length);
  /** Players whose phone is connected right now — refreshed while a vote is open. */
  let connectedVoters = $state<string[]>([]);
  /**
   * Who the vote is asking: everyone connected, plus anyone who already voted —
   * except the word's own authors, who would always vote their word in.
   */
  const voterCount = $derived(
    eligibleVoters(connectedVoters, ballots, currentVote?.owners ?? []).length,
  );
  /** Players who get a ballot on the current word (everyone but its authors). */
  const ballotPlayers = $derived(
    players.filter((p) => !(currentVote?.owners.includes(p.id) ?? false)),
  );
  /** How often the open vote re-checks who is still connected. */
  const VOTE_POLL_MS = 1000;

  /** A robot never votes and doesn't make a game multiplayer for checks. */
  const humanCount = $derived(players.filter((p) => p.isBot !== true).length);

  /** "Unique!" only means something when words are compared between players. */
  const isUniqueScoring = $derived($game?.settings.scoring === 'unique' && players.length > 1);

  /** Best totals so far, top first, with what each player gained this round. */
  const standings = $derived.by(() => {
    if (!$game || !round) return [];
    const totals = totalScores($game);
    const gained = roundPoints($game, round);
    return $game.players
      .map((p) => ({ player: p, score: totals.get(p.id) ?? 0, delta: gained.get(p.id) ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, STANDINGS_LIMIT);
  });

  function statusLabel(status: AnswerStatus, word: string): string {
    if (status === 'valid') return $t(isUniqueScoring ? 'review.unique' : 'review.good');
    if (status === 'shared') return $t('review.shared');
    return $t(`review.invalid.${invalidReason(word, round?.letter ?? '')}`);
  }

  function categoryFor(catId: string) {
    return $game?.settings.categories.find((c) => c.id === catId) ?? null;
  }

  function markInvalid(playerId: string, categoryId: string) {
    updateGame((g) => {
      const r = g.rounds[g.currentRound];
      const entry = r?.answers.find((a) => a.playerId === playerId && a.categoryId === categoryId);
      if (entry) entry.status = 'invalid';
    });
  }

  /** One rejection settles the word for everyone who wrote it — a single save. */
  function markInvalidAll(playerIds: string[], categoryId: string) {
    updateGame((g) => {
      const r = g.rounds[g.currentRound];
      if (!r) return;
      for (const entry of r.answers) {
        if (entry.categoryId === categoryId && playerIds.includes(entry.playerId)) {
          entry.status = 'invalid';
        }
      }
    });
  }

  onMount(async () => {
    const g = $game;
    if (!g) return;
    const r = g.rounds[g.currentRound];
    if (!r) return;
    const pending = r.answers.filter((a) => a.status === 'pending' && a.word !== '');
    // Grouped by the same rule scoring uses (isSameWord: folded, with or
    // without a leading article), so words scored as one are voted on once.
    const votes: VoteItem[] = [];
    // All words at once, each under the same short deadline — checks are
    // independent and usually cache-warm (prefetched as words were submitted).
    // A word still undecided when the deadline passes goes to the group.
    const verdicts = await Promise.all(
      pending.map((a) =>
        checkWordWithin(a.word, {
          categoryId: a.categoryId,
          letter: r.letter,
          language: g.settings.language,
          mode: g.settings.validation,
          solo: humanCount === 1,
          wikidata: g.settings.hasWikidataCheck !== false,
        }),
      ),
    );
    pending.forEach((a, i) => {
      const verdict = verdicts[i];
      if (verdict === 'invalid') {
        markInvalid(a.playerId, a.categoryId);
      } else if (verdict === 'vote') {
        if (humanCount > 1) {
          const item = votes.find(
            (v) => v.categoryId === a.categoryId && isSameWord(v.word, a.word),
          );
          if (item) item.owners.push(a.playerId);
          else votes.push({ word: a.word, categoryId: a.categoryId, owners: [a.playerId] });
        }
        // solo: auto-accept, stays pending until scored
      }
    });
    checking = false;
    voteQueue = votes;
    voteTotal = voteQueue.length;
    advanceVote();
  });

  // Host of a remote game: the players' ballots arrive over the room.
  onMount(() => {
    const room = isRemote ? getActiveRoom() : null;
    if (!room) return;
    return room.onGuestMessage((playerId, msg) => {
      handleGuestVote(playerId, msg);
    });
  });

  function handleGuestVote(playerId: string, msg: GuestMessage): void {
    if (msg.type !== 'vote' || voteId === '' || msg.voteId !== voteId) return;
    if (!players.some((p) => p.id === playerId)) return;
    // A word's author doesn't get a say on it (their phone shows it read-only).
    if (currentVote?.owners.includes(playerId) === true) return;
    ballots = { ...ballots, [playerId]: msg.choice };
    settleDeviceVote();
  }

  function refreshConnected(): void {
    connectedVoters = getActiveRoom()?.connectedIds() ?? [];
  }

  /**
   * Decide as soon as the ballots allow. The quorum is the players who are
   * here to vote (connected, or already voted), so a phone that drops out
   * stops holding the word up; with nobody left to ask, the host decides.
   */
  function settleDeviceVote(): void {
    refreshConnected();
    const outcome = tallyVote(ballots, voterCount);
    if (outcome !== 'open') castVote(outcome === 'accepted');
  }

  // Send each device vote to the phones exactly once, then keep an eye on who
  // is still connected. Tracks the vote alone — reading the game here would
  // re-send on every clone.
  $effect(() => {
    const a = currentVote;
    if (!votesOnDevices || !a) return;
    const id = newId();
    untrack(() => {
      voteId = id;
      ballots = {};
      refreshConnected();
      const cat = categoryFor(a.categoryId);
      getActiveRoom()?.broadcast({
        type: 'vote',
        voteId: id,
        word: a.word,
        category: {
          id: a.categoryId,
          label: cat ? $categoryName(cat) : a.categoryId,
          emoji: categoryEmoji(cat ?? a.categoryId),
        },
        ownerIds: [...a.owners],
      });
    });
    const poll = setInterval(() => {
      if (voteId === id) settleDeviceVote();
    }, VOTE_POLL_MS);
    return () => clearInterval(poll);
  });

  function advanceVote() {
    const head = voteQueue[0];
    if (!head) {
      currentVote = null;
      finalize();
      return;
    }
    currentVote = head;
  }

  function castVote(accept: boolean) {
    const a = currentVote;
    if (!a) return;
    // Close the ballot box before moving on — a late ballot must not count
    // toward the next word.
    voteId = '';
    ballots = {};
    if (accept) {
      // The group confirmed it's a real word for this category — remember it.
      const lang = $game?.settings.language;
      if (lang) void learnWord(lang, a.categoryId, a.word);
    } else {
      markInvalidAll(a.owners, a.categoryId);
    }
    voteQueue = voteQueue.slice(1);
    advanceVote();
  }

  function finalize() {
    if (scored || !$game) return;
    scored = true;
    updateGame((g) => {
      const r = g.rounds[g.currentRound];
      if (r) scoreRound(g, r);
    });
    playDing();
    void loadFact();
    if (isRemote) broadcastResults();
  }

  /** Remote games: every phone gets the scored round and the standings, not just the shared screen. */
  function broadcastResults(): void {
    const g = $game;
    const r = g ? g.rounds[g.currentRound] : null;
    if (!g || !r) return;
    getActiveRoom()?.broadcast({
      type: 'results',
      roundIndex: r.index,
      // 0 = endless; guests render it as ∞.
      roundCount: g.settings.isEndless ? 0 : g.settings.roundCount,
      letter: r.letter,
      categories: r.categoryIds.map((catId) => resultCategory(g, r, catId)),
      standings: standings.map((s): StandingRow => ({
        name: s.player.name,
        score: s.score,
        colorIndex: s.player.colorIndex,
        ...wireAvatar(s.player.avatar),
        delta: s.delta,
        isWinner: false,
      })),
      isUniqueScoring,
    });
  }

  function resultCategory(g: GameState, r: RoundState, catId: string): ResultCategory {
    const cat = categoryFor(catId);
    return {
      id: catId,
      label: cat ? $categoryName(cat) : catId,
      emoji: categoryEmoji(cat ?? catId),
      answers: g.players.map((p) => {
        const entry = r.answers.find((a) => a.playerId === p.id && a.categoryId === catId);
        return {
          playerId: p.id,
          name: p.name,
          word: entry?.word ?? '',
          status: entry?.status ?? 'invalid',
          points: entry?.points ?? 0,
        };
      }),
    };
  }

  /** Optional "did you know" for the round's best unique word. */
  async function loadFact(): Promise<void> {
    const g = $game;
    const r = g ? g.rounds[g.currentRound] : null;
    if (!g || !r || g.settings.hasFunFacts === false) return;
    const best = r.answers
      .filter((a) => a.status === 'valid' && a.word !== '')
      .sort((a, b) => b.word.length - a.word.length)[0];
    if (!best) return;
    const text = await wordFact(best.word, g.settings.language, best.categoryId);
    if (text !== null) fact = { word: best.word, text };
  }

  function next() {
    if (advancing) return;
    advancing = true;
    trackEvent('round_end', { round: ($game?.currentRound ?? 0) + 1 });
    updateGame((g) => {
      startNextRound(g);
    });
    screen.set('round');
  }

  function finish() {
    if (advancing) return;
    advancing = true;
    const roundsPlayed = ($game?.currentRound ?? 0) + 1;
    // The last round ends here, not in `next()` — report it before the game.
    trackEvent('round_end', { round: roundsPlayed });
    trackEvent('game_finish', {
      roundsPlayed,
      players: players.length,
      remote: isRemote,
    });
    screen.set('scoreboard');
  }

  const voteQuestion = $derived.by(() => {
    if (!currentVote) return '';
    const cat = categoryFor(currentVote.categoryId);
    const catName = cat ? $categoryName(cat).toLocaleLowerCase() : currentVote.categoryId;
    return $t('review.vote.question')
      .replace('{word}', currentVote.word)
      .replace('{category}', catName);
  });

  const voteCountText = $derived(
    $t('review.vote.count')
      .replace('{n}', String(ballotCount))
      .replace('{total}', String(voterCount)),
  );

  const voteProgressText = $derived(
    $t('review.vote.progress')
      .replace('{n}', String(voteIndex))
      .replace('{total}', String(voteTotal)),
  );
</script>

{#if round && $game}
  <TopBar title={$t('review.title')} backLabel={$t('setup.back')} />

  {#if checking}
    <Spinner emoji="🔎" label={$t('review.checking')} />
  {:else if round.phase === 'done'}
    <div class="results">
      {#each round.categoryIds as catId (catId)}
        {@const cat = categoryFor(catId)}
        <Card>
          <div class="cat-header">
            <span class="cat-emoji">{categoryEmoji(cat ?? catId)}</span>
            <span class="cat-name">{cat ? $categoryName(cat) : catId}</span>
          </div>
          <ul class="answer-list">
            {#each $game.players as p (p.id)}
              {@const entry = round.answers.find(
                (a) => a.playerId === p.id && a.categoryId === catId,
              )}
              <AnswerRow
                name={p.name}
                word={entry?.word ?? ''}
                status={entry?.status ?? 'invalid'}
                points={entry?.points ?? 0}
                label={statusLabel(entry?.status ?? 'invalid', entry?.word ?? '')}
              />
            {/each}
          </ul>
        </Card>
      {/each}
      {#if fact !== null}
        <Card>
          <div class="fact">
            <span class="fact-emoji">✨</span>
            <div class="fact-body">
              <b class="fact-title">{$t('review.funFact')}</b>
              <span class="fact-word">{fact.word}</span>
              <span class="fact-text">{fact.text}</span>
            </div>
          </div>
        </Card>
      {/if}
      <Card>
        <p class="standings-title">🏆 {$t('review.standings')}</p>
        <div class="standings">
          {#each standings as s (s.player.id)}
            <ScoreRow
              name={s.player.name}
              score={s.score}
              from={s.score - s.delta}
              delta={s.delta}
              colorIndex={s.player.colorIndex}
              avatar={s.player.avatar}
            />
          {/each}
        </div>
      </Card>
    </div>

    <div class="bottom-actions">
      {#if isFinished($game)}
        <Button variant="accent" block onclick={finish}>{$t('review.finish')}</Button>
      {:else}
        <Button variant="primary" block disabled={advancing} onclick={next}
          >{$t('review.next')}</Button
        >
        <Button variant="ghost" block onclick={finish}>{$t('review.finish')}</Button>
      {/if}
    </div>
  {/if}

  <Modal open={currentVote !== null} focusFirst={false}>
    <div class="vote-emoji">🤔</div>
    <p class="vote-question">{voteQuestion}</p>
    {#if voteTotal > 1}
      <p class="vote-progress">{voteProgressText}</p>
    {/if}
    {#if votesOnDevices}
      <p class="vote-phones">📱 {$t('review.vote.phones')}</p>
      <div class="ballots">
        {#each ballotPlayers as p (p.id)}
          {@const choice = ballots[p.id]}
          {@const away = choice === undefined && !connectedVoters.includes(p.id)}
          <span class="ballot" class:yes={choice === 'yes'} class:no={choice === 'no'} class:away>
            {choice === 'yes' ? '👍' : choice === 'no' ? '👎' : away ? '📴' : '⏳'}
            {p.name}
          </span>
        {/each}
      </div>
      <p class="vote-count">{voteCountText}</p>
      <p class="vote-or">{$t('review.vote.decideHere')}</p>
      <div class="modal-actions">
        <Button variant="secondary" block onclick={() => castVote(true)}
          >{$t('review.vote.yes')}</Button
        >
        <Button variant="ghost" block onclick={() => castVote(false)}>{$t('review.vote.no')}</Button
        >
      </div>
    {:else}
      <div class="modal-actions">
        <Button variant="primary" block onclick={() => castVote(true)}
          >{$t('review.vote.yes')}</Button
        >
        <Button variant="danger" block onclick={() => castVote(false)}
          >{$t('review.vote.no')}</Button
        >
      </div>
    {/if}
  </Modal>
{/if}

<style>
  .results {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    flex: 1;
  }
  .cat-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-block-end: var(--space-3);
  }
  .cat-emoji {
    font-size: var(--font-size-h2);
  }
  .cat-name {
    font-weight: var(--font-weight-subheading);
    font-size: var(--font-size-body);
  }
  .answer-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
  }
  .standings-title {
    font-weight: var(--font-weight-subheading);
    margin-block-end: var(--space-2);
  }
  .standings {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .bottom-actions {
    display: flex;
    gap: var(--space-3);
  }
  .fact {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }
  .fact-emoji {
    font-size: var(--font-size-h2);
  }
  .fact-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .fact-title {
    font-weight: var(--font-weight-subheading);
  }
  .fact-word {
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-heading);
    line-height: var(--line-height-h2);
    color: var(--color-primary);
  }
  .fact-text {
    color: var(--color-muted);
  }
  .vote-emoji {
    font-size: var(--size-illustration-sm);
  }
  .vote-question {
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-heading);
    margin-block: var(--space-3) var(--space-4);
  }
  .vote-phones {
    font-weight: var(--font-weight-subheading);
    color: var(--color-primary);
    margin-block-end: var(--space-3);
  }
  .ballots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    margin-block-end: var(--space-3);
  }
  .ballot {
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-pill);
    padding-block: var(--space-1);
    padding-inline: var(--space-3);
    font-weight: var(--font-weight-subheading);
    font-size: var(--font-size-small);
  }
  .ballot.yes {
    background: var(--color-success);
    color: var(--color-on-success);
    border-color: var(--color-success);
  }
  .ballot.no {
    background: var(--color-danger);
    color: var(--color-on-danger);
    border-color: var(--color-danger);
  }
  .ballot.away {
    color: var(--color-muted);
    border-style: dashed;
  }
  .vote-progress {
    color: var(--color-muted);
    font-size: var(--font-size-small);
    font-variant-numeric: tabular-nums;
    margin-block-end: var(--space-3);
  }
  .vote-count {
    color: var(--color-muted);
    font-size: var(--font-size-small);
    font-variant-numeric: tabular-nums;
    margin-block-end: var(--space-3);
  }
  .vote-or {
    color: var(--color-muted);
    font-size: var(--font-size-small);
    margin-block-end: var(--space-2);
  }
  .modal-actions {
    display: flex;
    gap: var(--space-3);
  }
</style>

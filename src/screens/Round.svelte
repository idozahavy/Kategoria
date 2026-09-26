<script lang="ts">
  import { onMount, untrack } from 'svelte';

  import { BOT_THINK_MS, botAnswers } from '../lib/bot';
  import { categoryEmoji } from '../lib/categories';
  import { matchesLetter, setAnswer, TIMER_OPTIONS } from '../lib/game';
  import { categoryName, getPack, t } from '../lib/i18n';
  import { getActiveRoom, type GuestMessage, setActiveRoom } from '../lib/p2p';
  import { playDing, playTick, vibrate } from '../lib/sound';
  import { game, screen, updateGame } from '../lib/stores';
  import { TIME_UP_BUZZ, timerBuzz } from '../lib/timer';
  import type {
    GameState,
    PlayerDef,
    RoundState,
    ScoringSystem,
    ValidationMode,
  } from '../lib/types';
  import Avatar from '../lib/ui/Avatar.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import Chip from '../lib/ui/Chip.svelte';
  import LetterReveal from '../lib/ui/LetterReveal.svelte';
  import LetterTile from '../lib/ui/LetterTile.svelte';
  import Modal from '../lib/ui/Modal.svelte';
  import Select from '../lib/ui/Select.svelte';
  import Stepper from '../lib/ui/Stepper.svelte';
  import TextInput from '../lib/ui/TextInput.svelte';
  import TimerPill from '../lib/ui/TimerPill.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';
  import { prefetchWordCheck } from '../lib/validation';

  // Guard: this screen assumes a running game.
  $effect(() => {
    if (!$game) screen.set('home');
  });

  const isRemote = $derived($game?.settings.isRemote === true);

  // Pass-the-device panel at round entry when several players share the screen
  // (remote guests each have their own device — no handoff needed).
  onMount(() => {
    const first = activePlayer;
    if (!isRemote && players.length > 1 && first !== null && needsHandoff(first)) openHandoff();
    const room = isRemote ? getActiveRoom() : null;
    if (!room) return;
    return room.onGuestMessage((playerId, msg) => {
      handleGuestAnswers(playerId, msg);
    });
  });

  const round = $derived($game ? $game.rounds[$game.currentRound] : null);
  const players = $derived($game?.players ?? []);
  const activePlayer = $derived(players.find((p) => p.id === round?.activePlayerId) ?? null);
  /** "Player 2 of 3" on the pass-the-device panel. */
  const handoffStepText = $derived(
    $t('round.turnOf')
      .replace('{n}', String(players.findIndex((p) => p.id === activePlayer?.id) + 1))
      .replace('{total}', String(players.length)),
  );
  const submittedSet = $derived(new Set(round?.submittedIds ?? []));
  // Primitive-valued deriveds so the timer effect below only restarts when the
  // turn/round actually changes — not on every game clone (e.g. remote answers).
  const timerSeconds = $derived($game?.settings.timerSeconds ?? null);
  const activePid = $derived(round?.activePlayerId ?? null);
  const roundPhase = $derived(round?.phase ?? null);
  const roundIndex = $derived(round?.index ?? -1);
  const turnStartedAt = $derived(round?.turnStartedAt ?? null);

  let answers = $state<Record<string, string>>({});
  /**
   * Whose words `answers` holds. The prefill below swaps them in only after
   * the turn changes, so a second Done that lands first (a double tap) must
   * not submit the previous player's words as the next player's.
   */
  let answersPid: string | null = null;
  let handoffOpen = $state(false);
  /** When the pass-the-device panel opened: a tap meant for Done can't dismiss it. */
  let handoffOpenedAt = 0;
  const HANDOFF_ARM_MS = 700;
  let showLeaveConfirm = $state(false);
  let showSettings = $state(false);
  let showTimeUp = $state(false);
  let timeLeft = $state<number | null>(null);
  /** The letter reveal + 3-2-1 is covering the screen; the clock starts when it ends. */
  let revealing = $state(false);
  const revealLetters = $derived($game ? getPack($game.settings.language).letters : []);
  /** Answer inputs in category order, so Enter can hop to the next one. */
  let answerInputs = $state<(HTMLInputElement | undefined)[]>([]);

  // Settings stay editable while nothing has been played yet — a wrong timer
  // or round count is cheap to fix on round one, pointless to fix later.
  const canEditSettings = $derived(!isRemote && roundIndex === 0 && roundPhase === 'entry');

  // Prefill inputs for the active player each time the turn changes (fresh & empty
  // at turn start, or resumed from existing answers if reloading mid-turn).
  // Keyed on the turn primitives only: every updateGame clones the game, and
  // tracking the round object would wipe words being typed (e.g. mid-round
  // settings edits).
  $effect(() => {
    void roundIndex;
    const pid = activePid;
    if (!pid) return;
    answersPid = pid;
    answers = untrack(() => {
      const r = round;
      const prefill: Record<string, string> = {};
      for (const catId of r?.categoryIds ?? []) {
        const existing = r?.answers.find((a) => a.playerId === pid && a.categoryId === catId);
        prefill[catId] = existing?.word ?? '';
      }
      return prefill;
    });
  });

  // A fresh turn (handoff dismissed, or a remote round on the shared screen)
  // opens with the letter reveal; the robot's turn skips straight to the clock.
  $effect(() => {
    void roundIndex;
    if (!activePid || roundPhase !== 'entry' || handoffOpen || turnStartedAt !== null) return;
    if (revealing) return;
    if (untrack(() => activePlayer?.isBot === true)) stampTurnStart();
    else revealing = true;
  });

  // Stamp when the turn's entry actually begins (after the reveal). Persisted
  // in the save, so a reload resumes the countdown from the wall clock instead
  // of restarting it (and skips the reveal) — and it feeds speed scoring.
  function stampTurnStart(): void {
    updateGame((g) => {
      const r = g.rounds[g.currentRound];
      if (r && r.phase === 'entry' && r.turnStartedAt === undefined) r.turnStartedAt = Date.now();
    });
  }

  function onRevealDone(): void {
    revealing = false;
    stampTurnStart();
  }

  function onRevealBeat(beat: 'land' | 'count' | 'go'): void {
    if (beat === 'count') playTick();
    else playDing();
  }

  // Typed words reach the save shortly after each keystroke, so a reload or
  // "Leave" mid-turn keeps them (the prefill above restores them).
  const DRAFT_SAVE_MS = 400;
  $effect(() => {
    const pid = activePid;
    const words = { ...answers };
    if (!pid || pid !== answersPid || isRemote || roundPhase !== 'entry') return;
    const id = setTimeout(() => {
      saveDraft(pid, words);
    }, DRAFT_SAVE_MS);
    return () => clearTimeout(id);
  });

  function saveDraft(pid: string, words: Record<string, string>): void {
    const r = untrack(() => round);
    if (!r) return;
    const stored = (catId: string): string =>
      r.answers.find((a) => a.playerId === pid && a.categoryId === catId)?.word ?? '';
    if (r.categoryIds.every((catId) => (words[catId] ?? '').trim() === stored(catId))) return;
    updateGame((g) => {
      const cur = g.rounds[g.currentRound];
      // The turn may have moved on while the save was pending.
      if (!cur || cur.phase !== 'entry' || cur.activePlayerId !== pid) return;
      for (const catId of cur.categoryIds) setAnswer(cur, pid, catId, words[catId] ?? '');
    });
  }

  // Per-turn countdown; paused while the handoff panel is covering the screen.
  // Wall-clock based (not a decrement) so throttled tabs and reloads stay honest.
  $effect(() => {
    void roundIndex; // restart per round
    const startedAt = turnStartedAt;
    if (!timerSeconds || !activePid || roundPhase !== 'entry' || handoffOpen || !startedAt) {
      timeLeft = null;
      return;
    }
    let lastBuzzAt: number | null = null;
    const tick = (): void => {
      const left = timerSeconds - Math.floor((Date.now() - startedAt) / 1000);
      timeLeft = Math.max(left, 0);
      if (left > 0 && left <= 10) playTick();
      // Buzz once per shown second (a throttled tab can repeat or skip one).
      const buzz = timerBuzz(left, timerSeconds);
      if (buzz > 0 && lastBuzzAt !== left) vibrate(buzz);
      lastBuzzAt = left;
      if (left <= 0) {
        clearInterval(id);
        handleTimeUp();
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  });

  // Host: send each new round to the guests' devices exactly once.
  let lastBroadcastIndex = -1;
  $effect(() => {
    const g = $game;
    const r = round;
    if (!isRemote || !g || !r || r.phase !== 'entry' || r.index === lastBroadcastIndex) return;
    // Held until the reveal on the shared screen ends, so every phone's clock
    // starts with the host's.
    if (r.turnStartedAt === undefined) return;
    lastBroadcastIndex = r.index;
    getActiveRoom()?.broadcast({
      type: 'round',
      roundIndex: r.index,
      // 0 = endless; guests render it as ∞.
      roundCount: g.settings.isEndless ? 0 : g.settings.roundCount,
      letter: r.letter,
      // A host reload rebroadcasts mid-round — send what's left, not the full timer.
      seconds: remainingSeconds(g, r),
      totalSeconds: g.settings.timerSeconds,
      categories: r.categoryIds.map((catId) => {
        const cat = categoryFor(catId);
        return {
          id: catId,
          label: cat ? $categoryName(cat) : catId,
          emoji: categoryEmoji(cat ?? catId),
        };
      }),
    });
  });

  function remainingSeconds(g: GameState, r: RoundState): number | null {
    const total = g.settings.timerSeconds;
    if (total === null) return null;
    if (r.turnStartedAt === undefined) return total;
    return Math.max(total - Math.floor((Date.now() - r.turnStartedAt) / 1000), 0);
  }

  function handleGuestAnswers(playerId: string, msg: GuestMessage): void {
    if (msg.type !== 'answers') return;
    let allIn = false;
    updateGame((g) => {
      const r = g.rounds[g.currentRound];
      if (!r || r.phase !== 'entry' || r.index !== msg.roundIndex) return;
      for (const catId of r.categoryIds) {
        const word = msg.answers[catId];
        if (word !== undefined && word.trim() !== '') setAnswer(r, playerId, catId, word);
      }
      // First submission fixes the finish time; a reconnect resend can't improve it.
      if (r.turnStartedAt !== undefined && r.finishTimes?.[playerId] === undefined) {
        r.finishTimes = { ...r.finishTimes, [playerId]: Date.now() - r.turnStartedAt };
      }
      const submitted = new Set(r.submittedIds ?? []);
      submitted.add(playerId);
      r.submittedIds = [...submitted];
      if (g.players.every((p) => submitted.has(p.id))) {
        r.phase = 'review';
        allIn = true;
      }
    });
    prefetchSubmitted(msg.answers);
    getActiveRoom()?.sendTo(playerId, { type: 'received' });
    if (allIn) screen.set('review');
  }

  /** Start checking submitted words in the background so the review screen is instant. */
  function prefetchSubmitted(words: Record<string, string | undefined>): void {
    const g = $game;
    const r = round;
    if (!g || !r) return;
    const solo = g.players.length === 1;
    for (const [catId, word] of Object.entries(words)) {
      if (word !== undefined && word.trim() !== '') {
        prefetchWordCheck(word, {
          categoryId: catId,
          letter: r.letter,
          language: g.settings.language,
          mode: g.settings.validation,
          solo,
          wikidata: g.settings.hasWikidataCheck !== false,
        });
      }
    }
  }

  function forceReview(): void {
    updateGame((g) => {
      const r = g.rounds[g.currentRound];
      if (r && r.phase === 'entry') r.phase = 'review';
    });
    screen.set('review');
  }

  function categoryFor(catId: string) {
    return $game?.settings.categories.find((c) => c.id === catId) ?? null;
  }

  /** Commit one player's words, then hand the device on or move to review. */
  function commitTurn(pid: string, words: Record<string, string | undefined>): void {
    let movedToReview = false;
    updateGame((g) => {
      const r = g.rounds[g.currentRound];
      if (!r || r.activePlayerId !== pid) return;
      // Every category, blanks too: a word the player saved as a draft and
      // then erased must be cleared, not kept.
      for (const catId of r.categoryIds) setAnswer(r, pid, catId, words[catId] ?? '');
      // Bots get no finish time — speed points shouldn't reward robot reflexes.
      const player = g.players.find((p) => p.id === pid);
      if (r.turnStartedAt !== undefined && player?.isBot !== true) {
        r.finishTimes = { ...r.finishTimes, [pid]: Date.now() - r.turnStartedAt };
      }
      const idx = g.players.findIndex((p) => p.id === pid);
      const next = g.players[idx + 1];
      if (next) {
        r.activePlayerId = next.id;
        delete r.turnStartedAt; // next player's clock starts after their handoff
      } else {
        r.phase = 'review';
        movedToReview = true;
      }
    });
    prefetchSubmitted(words);
    if (movedToReview) {
      screen.set('review');
    } else {
      const next = players[players.findIndex((p) => p.id === pid) + 1];
      if (next && needsHandoff(next)) openHandoff();
      else handoffOpen = false;
    }
  }

  /**
   * The robot's turn shows its "thinking" panel; a person gets "pass the
   * device" only when someone else is playing on this screen too.
   */
  function needsHandoff(p: PlayerDef): boolean {
    return p.isBot === true || players.filter((x) => x.isBot !== true).length > 1;
  }

  function openHandoff(): void {
    handoffOpenedAt = Date.now();
    handoffOpen = true;
  }

  function dismissHandoff(): void {
    if (Date.now() - handoffOpenedAt < HANDOFF_ARM_MS) return;
    handoffOpen = false;
  }

  function submitTurn() {
    if (!$game || !round || !activePlayer || answersPid !== activePlayer.id) return;
    commitTurn(activePlayer.id, answers);
  }

  /** Enter hops to the next category's input; on the last one it locks the words in. */
  function onAnswerKeydown(e: KeyboardEvent, index: number): void {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (index >= (round?.categoryIds.length ?? 0) - 1) {
      submitTurn();
      return;
    }
    answerInputs[index + 1]?.focus();
  }

  // The robot plays its own turn: think briefly, then answer from the lists.
  let botTurnKey = '';
  $effect(() => {
    const g = $game;
    const r = round;
    const p = activePlayer;
    if (!g || !r || !p || isRemote || roundPhase !== 'entry' || p.isBot !== true) return;
    const key = `${String(roundIndex)}:${p.id}`;
    if (botTurnKey === key) return;
    botTurnKey = key;
    let cancelled = false;
    void (async () => {
      const [words] = await Promise.all([
        botAnswers(g.settings.language, r.letter, r.categoryIds),
        new Promise((resolve) => setTimeout(resolve, BOT_THINK_MS)),
      ]);
      // The effect may have been torn down (or moved to a different turn/round)
      // while the bot was "thinking" — don't commit a turn that's no longer current.
      if (cancelled) return;
      commitTurn(p.id, words);
    })();
    return () => {
      cancelled = true;
    };
  });

  function handleTimeUp() {
    const idx = roundIndex;
    showTimeUp = true;
    vibrate(TIME_UP_BUZZ);
    // Remote: 3s grace so every guest's buzzer-beater auto-send can land
    // (each phone's countdown starts slightly after the host's). The window
    // ends early when the last guest submits — handleGuestAnswers moves the
    // round to review itself, and the guard below turns this into a no-op.
    setTimeout(
      () => {
        showTimeUp = false;
        if (roundIndex !== idx || roundPhase !== 'entry') return;
        if (isRemote) forceReview();
        else submitTurn();
      },
      isRemote ? 3000 : 1200,
    );
  }

  function setTimer(value: number | null): void {
    updateGame((g) => {
      g.settings.timerSeconds = value;
    });
  }

  function adjustRounds(delta: number): void {
    updateGame((g) => {
      g.settings.isEndless = false;
      g.settings.roundCount = Math.min(10, Math.max(1, g.settings.roundCount + delta));
    });
  }

  function toggleEndless(): void {
    updateGame((g) => {
      g.settings.isEndless = g.settings.isEndless !== true;
    });
  }

  function setScoring(value: ScoringSystem): void {
    updateGame((g) => {
      g.settings.scoring = value;
    });
  }

  function setValidation(value: ValidationMode): void {
    updateGame((g) => {
      g.settings.validation = value;
    });
  }

  function toggleWikidata(): void {
    updateGame((g) => {
      g.settings.hasWikidataCheck = g.settings.hasWikidataCheck === false;
    });
  }

  function toggleFunFacts(): void {
    updateGame((g) => {
      g.settings.hasFunFacts = g.settings.hasFunFacts === false;
    });
  }

  function onBack() {
    showLeaveConfirm = true;
  }

  function confirmLeave() {
    showLeaveConfirm = false;
    if (isRemote) setActiveRoom(null); // ends the room; guests are told
    screen.set('home');
  }
</script>

{#if round && $game}
  {#if handoffOpen}
    <div class="handoff">
      <span class="handoff-step">{handoffStepText}</span>
      {#if activePlayer !== null}
        <div
          class="handoff-avatar"
          style:border-color="var(--color-player-{activePlayer.colorIndex})"
        >
          <Avatar
            name={activePlayer.name}
            avatar={activePlayer.avatar}
            colorIndex={activePlayer.colorIndex}
            size={112}
          />
          {#if activePlayer.isBot !== true}
            <span class="handoff-peek" aria-hidden="true">🙈</span>
          {/if}
        </div>
      {/if}
      {#if activePlayer?.isBot === true}
        <p class="handoff-text">
          {$t('round.botThinking').replace('{name}', activePlayer.name)}
        </p>
      {:else}
        <p class="handoff-text">
          {$t('round.yourTurn').replace('{name}', activePlayer?.name ?? '')}
        </p>
        <p class="handoff-hint">{$t('round.passHint')}</p>
        <Button variant="primary" block onclick={dismissHandoff}>{$t('round.ready')}</Button>
      {/if}
    </div>
  {:else}
    <TopBar
      title={$t('round.title')
        .replace('{n}', String(round.index + 1))
        .replace('{total}', $game.settings.isEndless ? '∞' : String($game.settings.roundCount))}
      onback={onBack}
      backLabel={$t('setup.back')}
    >
      {#snippet action()}
        {#if canEditSettings}
          <button
            type="button"
            class="settings-btn"
            aria-label={$t('round.settings')}
            onclick={() => (showSettings = true)}
          >
            ⚙️
          </button>
        {/if}
      {/snippet}
    </TopBar>

    <div class="letter-row">
      <LetterTile letter={round.letter} />
      {#if isRemote}
        <!-- Guests fill in on their phones, so the shared screen names the
             categories everyone is working on next to the letter. -->
        <div class="host-cats">
          {#each round.categoryIds as catId (catId)}
            {@const cat = categoryFor(catId)}
            <span class="host-cat">
              <span class="cat-emoji">{categoryEmoji(cat ?? catId)}</span>
              <span class="cat-name">{cat ? $categoryName(cat) : catId}</span>
            </span>
          {/each}
        </div>
      {/if}
      {#if $game.settings.timerSeconds}
        <TimerPill
          seconds={timeLeft ?? $game.settings.timerSeconds}
          total={$game.settings.timerSeconds}
          large={isRemote}
        />
      {/if}
    </div>

    {#if isRemote}
      <div class="waiting-box">
        <p class="waiting-title">{$t('round.waitingFor')}</p>
        <div class="waiting-chips">
          {#each players as p (p.id)}
            <span class="wait-chip" class:done={submittedSet.has(p.id)}>
              {submittedSet.has(p.id) ? '✔ ' : ''}{p.name}
            </span>
          {/each}
        </div>
      </div>
      <Button variant="secondary" block onclick={forceReview}>{$t('round.finishNow')}</Button>
    {:else}
      <div class="cards">
        {#each round.categoryIds as catId, i (catId)}
          {@const cat = categoryFor(catId)}
          {@const val = answers[catId] ?? ''}
          <Card>
            <div class="cat-header">
              <span class="cat-emoji">{categoryEmoji(cat ?? catId)}</span>
              <span class="cat-name">{cat ? $categoryName(cat) : catId}</span>
            </div>
            <TextInput
              bind:value={() => answers[catId] ?? '', (v) => (answers[catId] = v)}
              bind:ref={answerInputs[i]}
              ariaLabel={cat ? $categoryName(cat) : catId}
              enterkeyhint={i === round.categoryIds.length - 1 ? 'done' : 'next'}
              onkeydown={(e) => onAnswerKeydown(e, i)}
              error={val !== '' && !matchesLetter(val, round.letter)
                ? $t('round.letterHint').replace('{letter}', round.letter)
                : ''}
            />
          </Card>
        {/each}
      </div>

      <Button variant="primary" block onclick={submitTurn}>{$t('round.done')}</Button>
    {/if}
  {/if}

  <Modal open={showLeaveConfirm} onclose={() => (showLeaveConfirm = false)}>
    <p class="modal-text">{$t('round.leaveConfirm')}</p>
    <div class="modal-actions">
      <Button variant="secondary" block onclick={() => (showLeaveConfirm = false)}
        >{$t('common.cancel')}</Button
      >
      <Button variant="danger" block onclick={confirmLeave}>{$t('common.ok')}</Button>
    </div>
  </Modal>

  {#if revealing}
    <LetterReveal
      letters={revealLetters}
      letter={round.letter}
      goLabel={$t('round.go')}
      onbeat={onRevealBeat}
      ondone={onRevealDone}
    />
  {/if}

  <Modal open={showTimeUp}>
    <div class="time-up-emoji" aria-hidden="true">⏰</div>
    <p class="modal-text">{$t('round.timeUp')}</p>
  </Modal>

  <Modal open={showSettings} onclose={() => (showSettings = false)}>
    <div class="settings-body">
      <p class="settings-title">{$t('round.settings')}</p>

      <div class="settings-group">
        <span class="field-label">{$t('setup.timer')}</span>
        <div class="chip-row">
          {#each TIMER_OPTIONS as opt (String(opt.value))}
            <Chip on={$game.settings.timerSeconds === opt.value} onclick={() => setTimer(opt.value)}
              >{$t(opt.key)}</Chip
            >
          {/each}
        </div>
      </div>

      <div class="settings-group">
        <span class="field-label">{$t('setup.rounds')}</span>
        <Stepper
          value={$game.settings.isEndless ? '∞' : $game.settings.roundCount}
          ondecrement={() => adjustRounds(-1)}
          onincrement={() => adjustRounds(1)}
          decrementLabel={$t('setup.rounds.fewer')}
          incrementLabel={$t('setup.rounds.more')}
        >
          <Chip on={$game.settings.isEndless === true} onclick={toggleEndless}
            >{$t('setup.rounds.endless')}</Chip
          >
        </Stepper>
      </div>

      {#if players.length > 1}
        <div class="settings-group">
          <span class="field-label">{$t('setup.scoring')}</span>
          <div class="chip-row">
            <Chip on={$game.settings.scoring === 'unique'} onclick={() => setScoring('unique')}
              >{$t('setup.scoring.unique')}</Chip
            >
            <Chip on={$game.settings.scoring === 'simple'} onclick={() => setScoring('simple')}
              >{$t('setup.scoring.simple')}</Chip
            >
          </div>
        </div>
      {/if}

      <label class="settings-group">
        <span class="field-label">{$t('setup.validation')}</span>
        <Select
          value={$game.settings.validation}
          onchange={(v) => setValidation(v as ValidationMode)}
        >
          <option value="bundled">{$t('setup.validation.bundled')}</option>
          <option value="hybrid">{$t('setup.validation.hybrid')}</option>
          <option value="dictionary">{$t('setup.validation.dictionary')}</option>
          <option value="vote">{$t('setup.validation.vote')}</option>
          <option value="none">{$t('setup.validation.none')}</option>
        </Select>
      </label>

      <div class="settings-group">
        <span class="field-label">{$t('setup.online')}</span>
        <div class="chip-row">
          {#if $game.settings.validation === 'hybrid' || $game.settings.validation === 'dictionary'}
            <Chip on={$game.settings.hasWikidataCheck !== false} onclick={toggleWikidata}
              >{$game.settings.hasWikidataCheck !== false ? '✓ ' : ''}{$t('setup.wikidata')}</Chip
            >
          {/if}
          <Chip on={$game.settings.hasFunFacts !== false} onclick={toggleFunFacts}
            >{$game.settings.hasFunFacts !== false ? '✓ ' : ''}{$t('setup.funFact')}</Chip
          >
        </div>
      </div>

      <Button variant="primary" block onclick={() => (showSettings = false)}
        >{$t('common.close')}</Button
      >
    </div>
  </Modal>
{/if}

<style>
  .handoff {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: var(--color-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-5);
    padding: var(--space-5);
    text-align: center;
  }
  .handoff-step {
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-pill);
    padding-block: var(--space-1);
    padding-inline: var(--space-4);
    color: var(--color-muted);
    font-size: var(--font-size-small);
    font-weight: var(--font-weight-subheading);
    font-variant-numeric: tabular-nums;
  }
  /* The player's own color rings their avatar, so the right kid grabs the device. */
  .handoff-avatar {
    position: relative;
    display: flex;
    border: var(--border-edge-width) solid;
    border-radius: var(--radius-pill);
    padding: var(--space-1);
    animation: handoff-pop var(--duration-enter) var(--easing-spring);
  }
  .handoff-peek {
    position: absolute;
    inset-block-end: calc(-1 * var(--space-2));
    inset-inline-end: calc(-1 * var(--space-2));
    font-size: var(--font-size-display);
    line-height: var(--line-height-display);
  }
  @keyframes handoff-pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .handoff-avatar {
      animation: none;
    }
  }
  .handoff-text {
    font-size: var(--font-size-h1);
    font-weight: var(--font-weight-heading);
    line-height: var(--line-height-h1);
    max-inline-size: 320px;
  }
  .handoff-hint {
    color: var(--color-muted);
    font-weight: var(--font-weight-subheading);
    margin-block-start: calc(-1 * var(--space-3));
  }
  .handoff :global(.btn) {
    max-inline-size: 320px;
  }
  .letter-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    justify-content: center;
    /* Pinned while the (often long) category list scrolls, so the letter and
       the ticking timer stay in view. Bleeds into the shell padding so cards
       vanish cleanly behind it. */
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-sticky);
    background: var(--color-bg);
    margin-inline: calc(-1 * var(--space-4));
    padding-inline: var(--space-4);
    padding-block: var(--space-2);
    flex-wrap: wrap;
  }
  .host-cats {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    /* Grows between the letter and the timer; long lists wrap here rather
       than pushing the timer onto a new line. Never narrower than its widest
       chip, so on a phone-sized host the row wraps instead of overlapping. */
    flex: 1 1 0;
    min-inline-size: min-content;
  }
  .host-cat {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-pill);
    padding-block: var(--space-2);
    padding-inline: var(--space-4);
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    flex: 1;
  }
  .waiting-box {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
  }
  .waiting-title {
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-heading);
  }
  .waiting-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
  }
  .wait-chip {
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-pill);
    padding-block: var(--space-2);
    padding-inline: var(--space-4);
    font-weight: var(--font-weight-subheading);
  }
  .wait-chip.done {
    background: var(--color-success);
    color: var(--color-on-success);
    border-color: var(--color-success);
  }
  .cat-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-block-end: var(--space-2);
  }
  .cat-emoji {
    font-size: var(--font-size-h2);
  }
  .cat-name {
    font-weight: var(--font-weight-subheading);
    font-size: var(--font-size-body);
  }
  .settings-btn {
    inline-size: var(--size-touch);
    block-size: var(--size-touch);
    border: none;
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: var(--font-size-h2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .settings-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    text-align: start;
  }
  .settings-title {
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-heading);
    line-height: var(--line-height-h2);
  }
  .settings-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .field-label {
    font-weight: var(--font-weight-subheading);
    font-size: var(--font-size-small);
    color: var(--color-muted);
  }
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .modal-text {
    font-weight: var(--font-weight-subheading);
    margin-block-end: var(--space-4);
  }
  .time-up-emoji {
    font-size: var(--size-illustration);
    animation: shake var(--duration-pulse) var(--easing-standard);
  }
  @keyframes shake {
    0%,
    100% {
      transform: rotate(0deg);
    }
    20%,
    60% {
      transform: rotate(-12deg);
    }
    40%,
    80% {
      transform: rotate(12deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .time-up-emoji {
      animation: none;
    }
  }
  .modal-actions {
    display: flex;
    gap: var(--space-3);
  }
  /* Short screens (a 390x844 phone and anything smaller): tighten the round so
     all five category cards plus the letter, timer and Done button fit without
     scrolling. Custom properties reach the LetterTile and Card components by
     inheritance, so no :global() specificity fight. */
  @media (max-height: 900px) {
    .letter-row {
      --tile-size: 72px;
      padding-block: var(--space-1);
    }
    .cards {
      --card-padding-block: var(--space-3);
      gap: var(--space-2);
    }
    .cat-header {
      margin-block-end: var(--space-1);
    }
    .cat-emoji {
      font-size: var(--font-size-body);
    }
  }
  /* Hosting the room from a phone: the wrapping chip list would eat the whole
     viewport. Every guest already has the category list on their own device. */
  @media (max-width: 600px) {
    .host-cats {
      display: none;
    }
  }
</style>

<script lang="ts">
  import { onDestroy } from 'svelte';

  import { AVATAR_EMOJI, fileToAvatar } from '../lib/avatar';
  import { matchesLetter } from '../lib/game';
  import { t } from '../lib/i18n';
  import {
    type GuestSession,
    type HostMessage,
    joinRoom,
    MAX_ANSWER_LENGTH,
    normalizeRoomCode,
    PING_INTERVAL_MS,
  } from '../lib/p2p';
  import { hasCamera, roomCodeFromScan, startQrScan } from '../lib/qrscan';
  import { screen } from '../lib/stores';
  import Avatar from '../lib/ui/Avatar.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import LetterTile from '../lib/ui/LetterTile.svelte';
  import Modal from '../lib/ui/Modal.svelte';
  import TextInput from '../lib/ui/TextInput.svelte';
  import TimerPill from '../lib/ui/TimerPill.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';
  import type { VoteChoice } from '../lib/vote';

  type GuestPhase =
    | 'form'
    | 'connecting'
    | 'lobby'
    | 'entry'
    | 'waiting'
    | 'vote'
    | 'voted'
    | 'results'
    | 'scores'
    | 'error';
  type RoundMsg = Extract<HostMessage, { type: 'round' }>;
  type VoteMsg = Extract<HostMessage, { type: 'vote' }>;
  type ResultsMsg = Extract<HostMessage, { type: 'results' }>;
  type ScoresMsg = Extract<HostMessage, { type: 'scores' }>;

  let phase = $state<GuestPhase>('form');
  let code = $state('');
  let name = $state('');
  let avatar = $state<string | undefined>(undefined);
  let codeError = $state('');
  let nameError = $state('');
  let errorKey = $state('join.error.network');
  let avatarPickerOpen = $state(false);
  let avatarFileInput: HTMLInputElement | undefined = $state();
  const canScan = hasCamera();
  let scannerOpen = $state(false);
  let scanFailed = $state(false);
  let scanVideo: HTMLVideoElement | undefined = $state();

  let session: GuestSession | null = null;
  let roster = $state<string[]>([]);
  /** Our seat in the room — highlights our own rows in the round results. */
  let playerId = $state('');

  // Remember who/where this tab joined so a reload (or dropped connection)
  // can jump straight back into the running game — the host keeps the seat.
  const GUEST_SESSION_KEY = 'categories-guest';
  try {
    const saved = sessionStorage.getItem(GUEST_SESSION_KEY);
    if (saved !== null) {
      const s = JSON.parse(saved) as { code?: string; name?: string; avatar?: string };
      code = s.code ?? '';
      name = s.name ?? '';
      avatar = s.avatar;
    }
  } catch {
    // storage unavailable — start with an empty form
  }
  // Arrived by scanning the host's QR code — the room code rides in the URL.
  const scannedCode = new URLSearchParams(location.search).get('join');
  if (scannedCode !== null && scannedCode !== '') code = scannedCode;
  // Consume the param: a later reload should land wherever the player left off,
  // not be dragged back to the join screen (the code stays prefilled above).
  if (scannedCode !== null) history.replaceState(history.state, '', location.pathname);

  function rememberSession(): void {
    try {
      sessionStorage.setItem(
        GUEST_SESSION_KEY,
        JSON.stringify({ code: normalizeRoomCode(code), name: name.trim(), avatar }),
      );
    } catch {
      // storage unavailable — rejoin just won't be prefilled
    }
  }

  function forgetSession(): void {
    try {
      sessionStorage.removeItem(GUEST_SESSION_KEY);
    } catch {
      // storage unavailable — nothing to forget
    }
  }
  let round = $state<RoundMsg | null>(null);
  let vote = $state<VoteMsg | null>(null);
  let results = $state<ResultsMsg | null>(null);
  let scores = $state<ScoresMsg | null>(null);
  // Votes already cast this session: a replayed vote (reconnect) stays "sent".
  const votedIds = new Set<string>();
  let answers = $state<Record<string, string>>({});
  let submitted = $state(false);
  let showSubmitConfirm = $state(false);
  let timeLeft = $state<number | null>(null);
  // Wall-clock anchor for the countdown, so a throttled background tab
  // doesn't slow the timer down (the host's clock keeps running regardless).
  let roundReceivedAt = 0;

  // Heartbeat, so the host can tell a phone that is still here from one whose
  // tab or network died — the connection itself rarely closes promptly.
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  function startPing(): void {
    stopPing();
    pingTimer = setInterval(() => {
      session?.send({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  function stopPing(): void {
    if (pingTimer !== null) clearInterval(pingTimer);
    pingTimer = null;
  }

  onDestroy(() => {
    stopPing();
    session?.close();
    session = null;
  });

  function handleMessage(msg: HostMessage): void {
    if (msg.type === 'roster') {
      roster = msg.names;
    } else if (msg.type === 'round') {
      round = msg;
      roundReceivedAt = Date.now();
      answers = {};
      submitted = false;
      showSubmitConfirm = false;
      phase = 'entry';
    } else if (msg.type === 'vote') {
      vote = msg;
      phase = votedIds.has(msg.voteId) ? 'voted' : 'vote';
    } else if (msg.type === 'results') {
      results = msg;
      phase = 'results';
    } else if (msg.type === 'scores') {
      scores = msg;
      phase = 'scores';
    } else if (msg.type === 'ended') {
      forgetSession();
      // Final scores stay up even when the host closes the room afterwards.
      if (phase !== 'scores') {
        errorKey = 'join.error.hostLeft';
        phase = 'error';
      }
    }
  }

  async function join(): Promise<void> {
    codeError = normalizeRoomCode(code) === '' ? $t('join.error.emptyCode') : '';
    nameError = name.trim() === '' ? $t('join.error.emptyName') : '';
    if (codeError !== '' || nameError !== '') return;
    phase = 'connecting';
    try {
      session = await joinRoom(code, name.trim(), avatar);
      playerId = session.playerId;
      rememberSession();
      session.onMessage(handleMessage);
      session.onClose(() => {
        stopPing();
        if (phase !== 'scores' && phase !== 'error') {
          errorKey = 'join.error.disconnected';
          phase = 'error';
        }
      });
      startPing();
      phase = 'lobby';
    } catch (e) {
      errorKey =
        e instanceof Error && e.message === 'not-found'
          ? 'join.error.notFound'
          : 'join.error.network';
      phase = 'error';
    }
  }

  function submitAnswers(): void {
    const r = round;
    showSubmitConfirm = false;
    if (!session || !r || submitted) return;
    submitted = true;
    session.send({
      type: 'answers',
      roundIndex: r.roundIndex,
      answers: Object.fromEntries(
        Object.entries(answers).map(([id, w]) => [id, w.slice(0, MAX_ANSWER_LENGTH)]),
      ),
    });
    phase = 'waiting';
  }

  function castVote(choice: VoteChoice): void {
    const v = vote;
    if (!session || !v || phase !== 'vote') return;
    votedIds.add(v.voteId);
    session.send({ type: 'vote', voteId: v.voteId, choice });
    phase = 'voted';
  }

  /** Lock the words in — but confirm first when some categories are still blank. */
  function requestSubmit(): void {
    const hasEmpty = (round?.categories ?? []).some((c) => (answers[c.id] ?? '').trim() === '');
    if (hasEmpty) showSubmitConfirm = true;
    else submitAnswers();
  }

  /** Enter hops to the next category's input; on the last one it asks to finish. */
  function onAnswerKeydown(e: KeyboardEvent, index: number): void {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (index >= (round?.categories.length ?? 0) - 1) {
      requestSubmit();
      return;
    }
    const inputs = document.querySelectorAll<HTMLInputElement>('.cards .inp');
    inputs[index + 1]?.focus();
  }

  // Local countdown mirroring the host's; auto-sends when it runs out.
  // Wall-clock based, anchored to when the round message arrived.
  $effect(() => {
    const seconds = phase === 'entry' ? (round?.seconds ?? null) : null;
    if (!seconds) {
      timeLeft = null;
      return;
    }
    const startedAt = roundReceivedAt;
    const tick = (): void => {
      const left = seconds - Math.floor((Date.now() - startedAt) / 1000);
      timeLeft = Math.max(left, 0);
      if (left <= 0) {
        clearInterval(id);
        submitAnswers();
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => {
      clearInterval(id);
    };
  });

  function leave(): void {
    stopPing();
    forgetSession();
    session?.onClose(null);
    session?.close();
    session = null;
    screen.set('home');
  }

  function retry(): void {
    stopPing();
    session?.onClose(null);
    session?.close();
    session = null;
    phase = 'form';
  }

  function pickAvatar(a: string | undefined): void {
    avatar = a;
    avatarPickerOpen = false;
  }

  async function onAvatarFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const picked = await fileToAvatar(file);
    if (picked !== null) pickAvatar(picked);
  }

  function openScanner(): void {
    scanFailed = false;
    scannerOpen = true;
  }

  function onScanned(text: string): void {
    const scanned = roomCodeFromScan(text);
    if (scanned === '') return;
    code = scanned;
    codeError = '';
    scannerOpen = false;
    // Name already filled in? Then the scan is the last tap needed.
    if (name.trim() !== '') void join();
  }

  // Run the camera only while the scanner modal is showing its <video>;
  // closing the modal (or leaving the screen) releases the camera.
  $effect(() => {
    const video = scanVideo;
    if (!scannerOpen || !video) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    startQrScan(video, onScanned)
      .then((s) => {
        if (cancelled) s();
        else stop = s;
      })
      .catch((e: unknown) => {
        console.error('Camera unavailable', e);
        scanFailed = true;
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  });

  function roundTitleFor(index: number, count: number): string {
    return $t('round.title')
      .replace('{n}', String(index + 1))
      .replace('{total}', count === 0 ? '∞' : String(count));
  }

  const roundTitle = $derived(round ? roundTitleFor(round.roundIndex, round.roundCount) : '');
  const resultsTitle = $derived(
    results ? roundTitleFor(results.roundIndex, results.roundCount) : '',
  );
  const voteQuestion = $derived(
    vote
      ? $t('review.vote.question')
          .replace('{word}', vote.word)
          .replace('{category}', vote.category.label.toLocaleLowerCase())
      : '',
  );

  function statusLabel(status: string): string {
    if (status === 'valid') return $t('review.unique');
    if (status === 'shared') return $t('review.shared');
    return $t('review.invalid');
  }
</script>

<div class="join">
  <TopBar title={$t('join.title')} onback={leave} backLabel={$t('setup.back')} />

  {#if phase === 'form'}
    <div class="content">
      <div class="emoji">📱</div>
      <TextInput
        label={$t('join.codeLabel')}
        bind:value={code}
        placeholder="ABCD"
        error={codeError}
        oninput={() => (codeError = '')}
      />
      {#if canScan}
        <Button variant="secondary" block onclick={openScanner}>📷 {$t('join.scan')}</Button>
      {/if}
      <div class="name-row">
        <button
          type="button"
          class="avatar-btn"
          aria-label={$t('setup.avatar')}
          onclick={() => (avatarPickerOpen = true)}
        >
          <Avatar {name} {avatar} size={44} />
        </button>
        <TextInput
          label={$t('join.nameLabel')}
          bind:value={name}
          error={nameError}
          oninput={() => (nameError = '')}
        />
      </div>
      <Button variant="accent" block onclick={() => void join()}>{$t('join.go')}</Button>
    </div>
  {:else if phase === 'connecting'}
    <div class="center">
      <div class="spinner" role="status" aria-label={$t('join.connecting')}></div>
      <p class="muted">{$t('join.connecting')}</p>
    </div>
  {:else if phase === 'lobby'}
    <div class="center">
      <div class="emoji">🎉</div>
      <p class="big">{$t('join.lobby')}</p>
      <div class="roster">
        {#each roster as n (n)}
          <span class="roster-chip">{n}</span>
        {/each}
      </div>
    </div>
  {:else if phase === 'entry' && round}
    <div class="letter-row">
      <LetterTile letter={round.letter} />
      {#if round.seconds}
        <TimerPill seconds={timeLeft ?? round.seconds} />
      {/if}
    </div>
    <p class="round-title">{roundTitle}</p>
    <div class="cards">
      {#each round.categories as cat, i (cat.id)}
        {@const val = answers[cat.id] ?? ''}
        <Card>
          <div class="cat-header">
            <span class="cat-emoji">{cat.emoji}</span>
            <span class="cat-name">{cat.label}</span>
          </div>
          <TextInput
            bind:value={() => answers[cat.id] ?? '', (v) => (answers[cat.id] = v)}
            enterkeyhint={i === round.categories.length - 1 ? 'done' : 'next'}
            maxlength={MAX_ANSWER_LENGTH}
            onkeydown={(e) => onAnswerKeydown(e, i)}
            error={val !== '' && !matchesLetter(val, round.letter)
              ? $t('round.letterHint').replace('{letter}', round.letter)
              : ''}
          />
        </Card>
      {/each}
    </div>
    <Button variant="primary" block disabled={submitted} onclick={requestSubmit}
      >{$t('round.done')}</Button
    >
  {:else if phase === 'waiting'}
    <div class="center">
      <div class="emoji">👀</div>
      <p class="big">{$t('join.waiting')}</p>
    </div>
  {:else if phase === 'vote' && vote}
    <div class="center">
      <div class="emoji">🤔</div>
      <p class="big">{voteQuestion}</p>
      <div class="vote-actions">
        <Button variant="primary" block onclick={() => castVote('yes')}
          >{$t('review.vote.yes')}</Button
        >
        <Button variant="danger" block onclick={() => castVote('no')}>{$t('review.vote.no')}</Button
        >
      </div>
    </div>
  {:else if phase === 'voted'}
    <div class="center">
      <div class="emoji">🗳️</div>
      <p class="big">{$t('join.vote.sent')}</p>
    </div>
  {:else if phase === 'results' && results}
    <div class="letter-row">
      <LetterTile letter={results.letter} />
    </div>
    <p class="round-title">{resultsTitle}</p>
    <div class="cards">
      {#each results.categories as cat (cat.id)}
        <Card>
          <div class="cat-header">
            <span class="cat-emoji">{cat.emoji}</span>
            <span class="cat-name">{cat.label}</span>
          </div>
          <ul class="answer-list">
            {#each cat.answers as a (a.playerId)}
              <li class="answer-row" class:me={a.playerId === playerId}>
                <span class="player-name">{a.name}</span>
                {#if a.word === ''}
                  <span class="word-empty">—</span>
                {:else}
                  <span class="word" class:invalid={a.status === 'invalid'}>{a.word}</span>
                  <span
                    class="badge"
                    class:success={a.status === 'valid'}
                    class:warning={a.status === 'shared'}
                    class:muted={a.status === 'invalid'}
                  >
                    {statusLabel(a.status)} · {a.points}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        </Card>
      {/each}
      <Card>
        <p class="standings-title">🏆 {$t('review.standings')}</p>
        <div class="score-rows">
          {#each results.standings as row (row.name)}
            <div class="score-row">
              <span class="score-name">{row.name}</span>
              <b class="score-value">{row.score}</b>
            </div>
          {/each}
        </div>
      </Card>
      <p class="round-title">{$t('join.results.next')}</p>
    </div>
  {:else if phase === 'scores' && scores}
    <div class="content">
      <h1 class="scores-title">{$t('score.title')}</h1>
      <div class="score-rows">
        {#each scores.rows as row (row.name)}
          <Card>
            <div class="score-row">
              <span class="score-name">{row.name}</span>
              <b class="score-value">{row.score}</b>
            </div>
          </Card>
        {/each}
      </div>
      <p class="big">{$t('score.winner').replace('{name}', scores.winner)}</p>
      <Button variant="primary" block onclick={leave}>{$t('score.home')}</Button>
    </div>
  {:else if phase === 'error'}
    <div class="center">
      <div class="emoji">🙈</div>
      <p class="big">{$t(errorKey)}</p>
      <div class="error-actions">
        <Button variant="primary" onclick={retry}>{$t('join.tryAgain')}</Button>
        <Button variant="ghost" onclick={leave}>{$t('score.home')}</Button>
      </div>
    </div>
  {/if}
</div>

<Modal open={showSubmitConfirm} onclose={() => (showSubmitConfirm = false)}>
  <p class="modal-text">{$t('round.submitConfirm')}</p>
  <div class="modal-actions">
    <Button variant="secondary" block onclick={() => (showSubmitConfirm = false)}
      >{$t('common.cancel')}</Button
    >
    <Button variant="primary" block onclick={submitAnswers}>{$t('round.done')}</Button>
  </div>
</Modal>

<Modal open={scannerOpen} onclose={() => (scannerOpen = false)}>
  <p class="avatar-title">{$t('join.scan')}</p>
  {#if scanFailed}
    <div class="emoji">🙈</div>
    <p class="muted">{$t('join.scan.error')}</p>
  {:else}
    <video class="viewfinder" bind:this={scanVideo} autoplay muted playsinline></video>
    <p class="muted scan-hint">{$t('join.scan.hint')}</p>
  {/if}
  <div class="avatar-actions">
    <Button variant="ghost" block onclick={() => (scannerOpen = false)}>{$t('common.close')}</Button
    >
  </div>
</Modal>

<Modal open={avatarPickerOpen} onclose={() => (avatarPickerOpen = false)}>
  <p class="avatar-title">{$t('setup.avatar')}</p>
  <div class="emoji-grid">
    {#each AVATAR_EMOJI as emoji (emoji)}
      <button type="button" class="emoji-option" onclick={() => pickAvatar(emoji)}>{emoji}</button>
    {/each}
  </div>
  <div class="avatar-actions">
    <Button variant="secondary" block onclick={() => avatarFileInput?.click()}
      >{$t('setup.avatar.upload')}</Button
    >
    <Button variant="ghost" block onclick={() => pickAvatar(undefined)}
      >{$t('common.remove')}</Button
    >
    <Button variant="ghost" block onclick={() => (avatarPickerOpen = false)}
      >{$t('common.close')}</Button
    >
  </div>
  <input
    type="file"
    accept="image/*"
    hidden
    bind:this={avatarFileInput}
    onchange={(e) => void onAvatarFile(e)}
  />
</Modal>

<style>
  .join {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-3);
  }
  .center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    text-align: center;
  }
  .emoji {
    font-size: calc(var(--font-size-display) * 1.6);
    text-align: center;
  }
  .big {
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-heading);
    line-height: var(--line-height-h2);
    max-inline-size: 320px;
    text-align: center;
    margin-inline: auto;
  }
  .muted {
    color: var(--color-muted);
  }
  .roster {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
  }
  .roster-chip {
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-pill);
    padding-block: var(--space-1);
    padding-inline: var(--space-3);
    font-weight: var(--font-weight-subheading);
  }
  .viewfinder {
    display: block;
    inline-size: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: var(--radius-md);
    background: var(--color-text);
    margin-block-end: var(--space-3);
  }
  .scan-hint {
    margin-block-end: var(--space-3);
  }
  .name-row {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
  }
  .name-row :global(.field) {
    flex: 1;
  }
  .avatar-btn {
    background: none;
    border: none;
    padding: var(--space-1);
    min-inline-size: 48px;
    min-block-size: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: var(--radius-pill);
  }
  .modal-text {
    font-weight: var(--font-weight-subheading);
    margin-block-end: var(--space-4);
  }
  .modal-actions {
    display: flex;
    gap: var(--space-3);
  }
  .avatar-title {
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-heading);
    margin-block-end: var(--space-3);
  }
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
    margin-block-end: var(--space-4);
  }
  .emoji-option {
    min-block-size: 48px;
    font-size: var(--font-size-h1);
    background: var(--color-bg);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .avatar-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
  }
  .round-title {
    text-align: center;
    color: var(--color-muted);
    font-weight: var(--font-weight-subheading);
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    flex: 1;
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
  .vote-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: 100%;
    max-inline-size: 320px;
  }
  .answer-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
  }
  .answer-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .answer-row.me {
    border-inline-start: var(--border-edge-width) solid var(--color-primary);
    padding-inline-start: var(--space-2);
  }
  .player-name {
    font-weight: var(--font-weight-subheading);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .word-empty {
    color: var(--color-muted);
  }
  .word.invalid {
    color: var(--color-muted);
    text-decoration: line-through;
  }
  .badge {
    border-radius: var(--radius-pill);
    padding-block: var(--space-1);
    padding-inline: var(--space-3);
    font-weight: var(--font-weight-subheading);
    font-size: var(--font-size-small);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .badge.success {
    background: var(--color-success);
    color: var(--color-on-success);
  }
  .badge.warning {
    background: var(--color-warning);
    color: var(--color-on-warning);
  }
  .badge.muted {
    background: var(--color-border);
    color: var(--color-muted);
  }
  .standings-title {
    font-weight: var(--font-weight-subheading);
    margin-block-end: var(--space-2);
  }
  .scores-title {
    font-size: var(--font-size-h1);
    font-weight: var(--font-weight-display);
    text-align: center;
  }
  .score-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .score-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .score-name {
    font-weight: var(--font-weight-subheading);
  }
  .score-value {
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-h2);
  }
  .error-actions {
    display: flex;
    gap: var(--space-2);
  }
  .spinner {
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--radius-pill);
    border: 5px solid var(--color-border);
    border-block-start-color: var(--color-primary);
    animation: spin 800ms linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>

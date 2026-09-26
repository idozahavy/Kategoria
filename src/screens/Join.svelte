<script lang="ts">
  import { onDestroy } from 'svelte';

  import { AVATAR_EMOJI, fileToAvatar } from '../lib/avatar';
  import { invalidReason, matchesLetter } from '../lib/game';
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
  import { resultsText, shareText } from '../lib/share';
  import { playFanfare, vibrate } from '../lib/sound';
  import { screen } from '../lib/stores';
  import { TIME_UP_BUZZ, timerBuzz } from '../lib/timer';
  import type { AnswerStatus } from '../lib/types';
  import AnswerRow from '../lib/ui/AnswerRow.svelte';
  import Avatar from '../lib/ui/Avatar.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import Confetti from '../lib/ui/Confetti.svelte';
  import LetterTile from '../lib/ui/LetterTile.svelte';
  import Modal from '../lib/ui/Modal.svelte';
  import ScoreRow from '../lib/ui/ScoreRow.svelte';
  import Spinner from '../lib/ui/Spinner.svelte';
  import TextInput from '../lib/ui/TextInput.svelte';
  import TimerPill from '../lib/ui/TimerPill.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';
  import WinnerHero from '../lib/ui/WinnerHero.svelte';
  import type { VoteChoice } from '../lib/vote';

  type GuestPhase =
    | 'form'
    | 'connecting'
    | 'lobby'
    | 'entry'
    | 'waiting'
    | 'vote'
    /** A vote on the guest's own word: shown, but not theirs to decide. */
    | 'vote-own'
    | 'voted'
    | 'results'
    | 'scores'
    /** The connection dropped mid-game; retrying on its own. */
    | 'reconnecting'
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
  // Standings rows carry names only; the host may have renamed a clash ("Maya 2"),
  // so the name this phone plays under comes from its own answers when known.
  let myName = $state('');

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

  /** Waits between automatic reconnect attempts after the connection drops. */
  const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function stopReconnect(): void {
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  onDestroy(() => {
    stopPing();
    stopReconnect();
    session?.onClose(null);
    session?.close();
    session = null;
  });

  /** The answers payload last sent, so a reconnect can resend it. */
  let sentAnswers: Record<string, string> | null = null;

  function handleMessage(msg: HostMessage): void {
    if (msg.type === 'roster') {
      roster = msg.names;
    } else if (msg.type === 'round') {
      // The same round again is a replay (we reconnected, or the host
      // reloaded): keep what was typed, and don't reopen a sent sheet.
      const isReplay =
        round?.roundIndex === msg.roundIndex && (phase === 'entry' || phase === 'waiting');
      round = msg;
      roundReceivedAt = Date.now();
      if (isReplay && submitted) {
        // The host may have missed the first send — sending again is harmless.
        if (sentAnswers)
          session?.send({ type: 'answers', roundIndex: msg.roundIndex, answers: sentAnswers });
        phase = 'waiting';
        return;
      }
      if (!isReplay) {
        answers = {};
        submitted = false;
        sentAnswers = null;
      }
      phase = 'entry';
    } else if (msg.type === 'vote') {
      vote = msg;
      if (msg.ownerIds.includes(playerId)) phase = 'vote-own';
      else phase = votedIds.has(msg.voteId) ? 'voted' : 'vote';
    } else if (msg.type === 'results') {
      results = msg;
      const mine = msg.categories.flatMap((c) => c.answers).find((a) => a.playerId === playerId);
      if (mine) myName = mine.name;
      phase = 'results';
    } else if (msg.type === 'scores') {
      // A replay after a reconnect doesn't celebrate twice.
      if (phase !== 'scores' && msg.rows.some((r) => r.isWinner)) {
        playFanfare();
        vibrate(200);
      }
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

  /** Final standings as a chat message (share sheet on phones, clipboard elsewhere). */
  let shareNote = $state('');
  async function shareResults(): Promise<void> {
    if (!scores) return;
    const text = resultsText(
      $t('share.heading'),
      scores.rows.map((r) => ({ name: r.name, score: r.score, isWinner: r.isWinner })),
      `${location.origin}${location.pathname}`,
    );
    const outcome = await shareText(text);
    if (outcome === 'copied') shareNote = $t('share.copied');
    else if (outcome === 'failed') shareNote = $t('share.failed');
    else shareNote = '';
  }

  /** Take over a fresh connection: messages, heartbeat, and drop handling. */
  function wireSession(s: GuestSession): void {
    session = s;
    playerId = s.playerId;
    if (myName === '') myName = name.trim();
    rememberSession();
    s.onMessage(handleMessage);
    s.onClose(() => {
      stopPing();
      session = null;
      if (phase === 'scores' || phase === 'error' || phase === 'form') return;
      void reconnect();
    });
    startPing();
  }

  /**
   * A dropped connection (flaky Wi-Fi, the host reloading) retries on its own
   * with growing pauses. The same device reclaims its seat, and the host
   * replays the current screen; only when every attempt fails does the player
   * see the error.
   */
  async function reconnect(): Promise<void> {
    const resumeAt = phase === 'reconnecting' || phase === 'connecting' ? 'lobby' : phase;
    phase = 'reconnecting';
    for (const delay of RECONNECT_DELAYS_MS) {
      await new Promise<void>((resolve) => {
        reconnectTimer = setTimeout(resolve, delay);
      });
      reconnectTimer = null;
      if (phase !== 'reconnecting') return; // the player left meanwhile
      try {
        const s = await joinRoom(code, name.trim(), avatar);
        if (phase !== 'reconnecting') {
          s.close();
          return;
        }
        wireSession(s);
        // Back where we were until the host's replay says otherwise.
        phase = resumeAt;
        return;
      } catch {
        // host not reachable yet (maybe reloading) — wait and try again
      }
    }
    errorKey = 'join.error.disconnected';
    phase = 'error';
  }

  async function join(): Promise<void> {
    codeError = normalizeRoomCode(code) === '' ? $t('join.error.emptyCode') : '';
    nameError = name.trim() === '' ? $t('join.error.emptyName') : '';
    if (codeError !== '' || nameError !== '') return;
    phase = 'connecting';
    try {
      wireSession(await joinRoom(code, name.trim(), avatar));
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
    if (!session || !r || submitted) return;
    submitted = true;
    sentAnswers = Object.fromEntries(
      Object.entries(answers).map(([id, w]) => [id, w.slice(0, MAX_ANSWER_LENGTH)]),
    );
    session.send({ type: 'answers', roundIndex: r.roundIndex, answers: sentAnswers });
    phase = 'waiting';
  }

  function castVote(choice: VoteChoice): void {
    const v = vote;
    if (!session || !v || phase !== 'vote') return;
    votedIds.add(v.voteId);
    session.send({ type: 'vote', voteId: v.voteId, choice });
    phase = 'voted';
  }

  /** Enter hops to the next category's input; on the last one it sends the words. */
  function onAnswerKeydown(e: KeyboardEvent, index: number): void {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (index >= (round?.categories.length ?? 0) - 1) {
      submitAnswers();
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
    const total = round?.totalSeconds ?? seconds;
    let lastBuzzAt: number | null = null;
    const tick = (): void => {
      const left = seconds - Math.floor((Date.now() - startedAt) / 1000);
      timeLeft = Math.max(left, 0);
      const buzz = timerBuzz(left, total);
      if (buzz > 0 && lastBuzzAt !== left) vibrate(buzz);
      lastBuzzAt = left;
      if (left <= 0) {
        clearInterval(id);
        vibrate(TIME_UP_BUZZ);
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
    stopReconnect();
    forgetSession();
    session?.onClose(null);
    session?.close();
    session = null;
    screen.set('home');
  }

  function retry(): void {
    stopPing();
    stopReconnect();
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

  function statusLabel(status: AnswerStatus, word: string): string {
    if (status === 'valid')
      return $t(results?.isUniqueScoring === false ? 'review.good' : 'review.unique');
    if (status === 'shared') return $t('review.shared');
    return $t(`review.invalid.${invalidReason(word, results?.letter ?? '')}`);
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
          class:is-empty={avatar === undefined}
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
    <Spinner label={$t('join.connecting')} />
  {:else if phase === 'reconnecting'}
    <Spinner emoji="📶" label={$t('join.reconnecting')} />
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
        <TimerPill
          seconds={timeLeft ?? round.seconds}
          total={round.totalSeconds ?? round.seconds}
        />
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
    <Button variant="primary" block disabled={submitted} onclick={submitAnswers}
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
  {:else if phase === 'vote-own' && vote}
    <div class="center">
      <div class="emoji">✍️</div>
      <p class="big">{vote.category.emoji} {vote.word}</p>
      <p class="muted">{$t('join.vote.yours')}</p>
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
              <AnswerRow
                name={a.name}
                word={a.word}
                status={a.status}
                points={a.points}
                label={statusLabel(a.status, a.word)}
                meLabel={a.playerId === playerId ? $t('join.you') : undefined}
              />
            {/each}
          </ul>
        </Card>
      {/each}
      <Card>
        <p class="standings-title">🏆 {$t('review.standings')}</p>
        <div class="score-rows">
          {#each results.standings as row (row.name)}
            <ScoreRow
              name={row.name}
              score={row.score}
              from={row.score - row.delta}
              delta={row.delta}
              colorIndex={row.colorIndex}
              avatar={row.avatar}
              meLabel={row.name === myName ? $t('join.you') : undefined}
            />
          {/each}
        </div>
      </Card>
      <p class="round-title">
        {results.roundCount !== 0 && results.roundIndex + 1 >= results.roundCount
          ? $t('join.results.final')
          : $t('join.results.next')}
      </p>
    </div>
  {:else if phase === 'scores' && scores}
    {@const winners = scores.rows.filter((r) => r.isWinner)}
    {#if winners.length > 0}
      <Confetti />
    {/if}
    <div class="content">
      <WinnerHero
        {winners}
        text={winners.length === 0
          ? $t('score.noWinner')
          : $t(winners.length > 1 ? 'score.winners' : 'score.winner').replace(
              '{name}',
              scores.winner,
            )}
      />
      <div class="score-rows">
        {#each scores.rows as row (row.name)}
          <ScoreRow
            name={row.name}
            score={row.score}
            from={0}
            colorIndex={row.colorIndex}
            avatar={row.avatar}
            meLabel={row.name === myName ? $t('join.you') : undefined}
          />
        {/each}
      </div>
      <Button variant="secondary" block onclick={() => void shareResults()}
        >📤 {$t('share.action')}</Button
      >
      <p class="share-note" aria-live="polite">{shareNote}</p>
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
  .share-note {
    color: var(--color-muted);
    font-size: var(--font-size-small);
    text-align: center;
  }
  .share-note:empty {
    display: none;
  }
  .emoji {
    font-size: var(--size-illustration);
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
    min-inline-size: var(--size-touch);
    min-block-size: var(--size-touch);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: var(--radius-pill);
    position: relative;
  }
  .avatar-btn.is-empty::after {
    content: '✏️';
    position: absolute;
    inset-block-end: 0;
    inset-inline-end: 0;
    font-size: var(--font-size-small);
    line-height: 1;
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-pill);
    padding: var(--space-1);
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
    min-block-size: var(--size-touch);
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
  .standings-title {
    font-weight: var(--font-weight-subheading);
    margin-block-end: var(--space-2);
  }
  .score-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .error-actions {
    display: flex;
    gap: var(--space-2);
  }
</style>

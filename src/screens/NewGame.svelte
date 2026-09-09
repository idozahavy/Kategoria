<script lang="ts">
  import { onMount } from 'svelte';

  import { AVATAR_EMOJI, fileToAvatar } from '../lib/avatar';
  import { BOT_AVATAR } from '../lib/bot';
  import { CATEGORY_EMOJI } from '../lib/categories';
  import {
    MAX_CATEGORY_NAME_LENGTH,
    readCategoryPrefs,
    writeCategoryPrefs,
  } from '../lib/categoryprefs';
  import { listProfiles, saveGame, touchProfile } from '../lib/db';
  import {
    createGame,
    DEFAULT_CATEGORY_IDS,
    newId,
    startNextRound,
    TIMER_OPTIONS,
  } from '../lib/game';
  import { availablePacks, categoryName, t, uiLanguage } from '../lib/i18n';
  import { createRoom, type GuestInfo, type HostRoom, setActiveRoom } from '../lib/p2p';
  import { game, screen } from '../lib/stores';
  import type { PlayerProfile } from '../lib/types';
  import type {
    CategoryDef,
    GameMode,
    GameSettings,
    PlayerDef,
    ScoringSystem,
    ValidationMode,
    VoteMode,
  } from '../lib/types';
  import Avatar from '../lib/ui/Avatar.svelte';
  import Button from '../lib/ui/Button.svelte';
  import Chip from '../lib/ui/Chip.svelte';
  import Modal from '../lib/ui/Modal.svelte';
  import TextInput from '../lib/ui/TextInput.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';

  type PlayerDraft = { id: string; name: string; avatar?: string; isBot?: boolean };

  const BUILTIN_CATEGORY_KEYS = [
    'animal',
    'food',
    'city',
    'country',
    'name',
    'plant',
    'profession',
    'object',
    'sport',
    'color',
    'fruit',
    'ocean',
    'vehicle',
    'kitchen',
    'clothing',
    'body',
  ];

  /** One-tap themed category sets. */
  const CATEGORY_PACKS: { key: string; emoji: string; ids: string[] }[] = [
    { key: 'setup.pack.classic', emoji: '⭐', ids: [...DEFAULT_CATEGORY_IDS] },
    { key: 'setup.pack.nature', emoji: '🌿', ids: ['animal', 'plant', 'fruit', 'ocean', 'color'] },
    {
      key: 'setup.pack.town',
      emoji: '🏙️',
      ids: ['city', 'country', 'profession', 'vehicle', 'sport'],
    },
    { key: 'setup.pack.home', emoji: '🏠', ids: ['kitchen', 'clothing', 'object', 'food', 'body'] },
  ];
  const builtinCategories: CategoryDef[] = BUILTIN_CATEGORY_KEYS.map((k) => ({
    id: k,
    nameKey: k,
    emoji: CATEGORY_EMOJI[k],
  }));

  let step = $state(1);
  let stepError = $state('');
  let starting = $state(false);

  // Step 1
  let players = $state<PlayerDraft[]>([{ id: newId(), name: '' }]);
  let playStyle = $state<'local' | 'remote'>('local');
  // The room object stays non-reactive (it holds live connections); only the
  // bits the template shows are $state.
  let room: HostRoom | null = null;
  let roomCode = $state('');
  let roomError = $state('');
  let openingRoom = $state(false);
  let guestList = $state<GuestInfo[]>([]);
  let profiles = $state<PlayerProfile[]>([]);
  let qrDataUrl = $state('');
  let avatarPickerFor = $state<string | null>(null);
  let avatarFileInput: HTMLInputElement | undefined = $state();

  function pickAvatar(avatar: string | undefined): void {
    const p = players.find((p) => p.id === avatarPickerFor);
    if (p) p.avatar = avatar;
    avatarPickerFor = null;
  }

  async function onAvatarFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const avatar = await fileToAvatar(file);
    if (avatar !== null) pickAvatar(avatar);
  }

  onMount(async () => {
    try {
      profiles = await listProfiles();
    } catch {
      profiles = []; // storage unavailable — no quick-pick row
    }
  });

  /** Saved players not already in the list — one tap fills a seat. */
  const profileSuggestions = $derived(
    profiles.filter((prof) => !players.some((p) => p.name.trim().toLocaleLowerCase() === prof.key)),
  );

  function pickProfile(prof: PlayerProfile): void {
    const empty = players.find((p) => p.name.trim() === '');
    if (empty) {
      empty.name = prof.name;
      empty.avatar = prof.avatar;
    } else if (players.length < 8) {
      players.push({ id: newId(), name: prof.name, avatar: prof.avatar });
    }
    stepError = '';
  }

  function addBot(): void {
    if (players.length >= 8) return;
    const base = $t('setup.botName');
    const taken = new Set(players.map((p) => p.name.trim().toLocaleLowerCase()));
    let name = base;
    for (let n = 2; taken.has(name.toLocaleLowerCase()); n++) name = `${base} ${String(n)}`;
    players.push({ id: newId(), name, avatar: BOT_AVATAR, isBot: true });
    stepError = '';
  }

  /**
   * QR code for the lobby — scanning opens the app on the join screen. The
   * encoder is fetched on demand: only hosts of a phones-join game need it.
   */
  $effect(() => {
    if (roomCode === '') {
      qrDataUrl = '';
      return;
    }
    const url = `${location.origin}${location.pathname}?join=${roomCode}`;
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 220, margin: 1 }))
      .then((u) => (qrDataUrl = u))
      .catch(() => (qrDataUrl = ''));
  });

  // Step 2 — categories start from the set the last game used (the picked
  // ones and the family's own), falling back to the classic five.
  const savedPrefs = readCategoryPrefs(BUILTIN_CATEGORY_KEYS);
  let mode = $state<GameMode>('classic');
  let customCategories = $state<CategoryDef[]>(savedPrefs?.custom ?? []);
  let selectedCategoryIds = $state<string[]>(
    savedPrefs !== null && savedPrefs.selectedIds.length > 0
      ? savedPrefs.selectedIds
      : [...DEFAULT_CATEGORY_IDS],
  );
  let newCategoryName = $state('');
  let categoryError = $state('');

  // Step 3
  let scoring = $state<ScoringSystem>('unique');
  let timerSeconds = $state<number | null>(120);
  let roundCount = $state(3);
  let isEndless = $state(false);
  let hasWikidataCheck = $state(true);
  let hasFunFacts = $state(true);
  // Speed bonus: on by default when phones answer at the same time, off for
  // pass-and-play where turns are taken one after another. null = untouched.
  let speedScoringChoice = $state<boolean | null>(null);
  const hasSpeedScoring = $derived(speedScoringChoice ?? playStyle === 'remote');
  let validation = $state<ValidationMode>('hybrid');
  let voteMode = $state<VoteMode>('devices');
  let gameLanguage = $state($uiLanguage);

  const allCategories: CategoryDef[] = $derived([...builtinCategories, ...customCategories]);
  const playerCount = $derived(playStyle === 'remote' ? guestList.length : players.length);
  const canProceedCategories = $derived(selectedCategoryIds.length > 0);
  const stepTitle = $derived.by(() => {
    if (step === 1) return $t('setup.players');
    if (step === 2) return $t('setup.mode');
    return $t('setup.step3');
  });

  function selectLocal(): void {
    playStyle = 'local';
    stepError = '';
    if (room) {
      setActiveRoom(null); // closes the room; joined guests are told it ended
      room = null;
      roomCode = '';
      guestList = [];
    }
  }

  async function selectRemote(): Promise<void> {
    playStyle = 'remote';
    stepError = '';
    if (room || openingRoom) return;
    openingRoom = true;
    roomError = '';
    try {
      const r = await createRoom();
      room = r;
      setActiveRoom(r);
      roomCode = r.code;
      r.onGuestsChange((guests) => {
        guestList = guests;
      });
      guestList = r.guests();
    } catch {
      roomError = $t('error.roomCreate');
    } finally {
      openingRoom = false;
    }
  }

  function addPlayer(): void {
    if (players.length >= 8) return;
    players = [...players, { id: newId(), name: '' }];
  }

  function removePlayer(id: string): void {
    if (players.length <= 1) return;
    players = players.filter((p) => p.id !== id);
  }

  function toggleCategory(id: string): void {
    stepError = '';
    selectedCategoryIds = selectedCategoryIds.includes(id)
      ? selectedCategoryIds.filter((x) => x !== id)
      : [...selectedCategoryIds, id];
  }

  /**
   * Add the typed category and select it (a name already in the list is
   * re-selected instead of duplicated). False when the name was rejected.
   */
  function addCustomCategory(): boolean {
    const name = newCategoryName.trim();
    if (!name) {
      categoryError = $t('setup.error.categoryEmpty');
      return false;
    }
    if (name.length > MAX_CATEGORY_NAME_LENGTH) {
      categoryError = $t('setup.error.categoryTooLong');
      return false;
    }
    categoryError = '';
    const existing = customCategories.find(
      (c) => c.customName?.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (existing) {
      if (!selectedCategoryIds.includes(existing.id)) {
        selectedCategoryIds = [...selectedCategoryIds, existing.id];
      }
    } else {
      const cat: CategoryDef = { id: newId(), customName: name };
      customCategories = [...customCategories, cat];
      selectedCategoryIds = [...selectedCategoryIds, cat.id];
    }
    newCategoryName = '';
    return true;
  }

  /** Empty string when everything up to the current step is valid; the error message otherwise. */
  function validateStep(): string {
    if (playStyle === 'remote') {
      if (guestList.length === 0) return $t('setup.error.noGuests');
    } else if (players.length > 1) {
      const names = players.map((p) => p.name.trim());
      if (names.some((n) => n === '')) return $t('setup.error.emptyName');
      if (new Set(names.map((n) => n.toLocaleLowerCase())).size !== names.length) {
        return $t('setup.error.duplicateName');
      }
    }
    if (step >= 2 && selectedCategoryIds.length === 0) return $t('setup.error.noCategories');
    return '';
  }

  function nextStep(): void {
    // A category typed but never "added" is still wanted — take it along.
    if (step === 2 && newCategoryName.trim() !== '' && !addCustomCategory()) return;
    stepError = validateStep();
    if (stepError !== '') return;
    step = Math.min(3, step + 1);
  }

  function removeCustomCategory(id: string): void {
    customCategories = customCategories.filter((c) => c.id !== id);
    selectedCategoryIds = selectedCategoryIds.filter((x) => x !== id);
  }

  function goBack(): void {
    stepError = '';
    if (step > 1) step -= 1;
    else screen.set('home');
  }

  function startGame(): void {
    if (starting) return;
    // The per-step checks normally ran already; re-validate in case any
    // navigation path skipped them.
    stepError = validateStep();
    if (stepError !== '') return;
    starting = true;
    const isRemote = playStyle === 'remote';
    const finalPlayers: PlayerDef[] = isRemote
      ? guestList.map((g, i) => ({
          id: g.playerId,
          name: g.name,
          colorIndex: (i % 8) + 1,
          avatar: g.avatar,
          deviceId: g.deviceId,
        }))
      : players.map((p, i) => ({
          id: p.id,
          // A lone player may skip typing a name — call them "Me" in their language.
          name: p.name.trim() === '' ? $t('setup.soloName') : p.name.trim(),
          colorIndex: i + 1,
          avatar: p.avatar,
          isBot: p.isBot,
        }));
    // Remember the humans for quick-pick and the family leaderboard (the
    // anonymous solo default stays out of both).
    for (const p of finalPlayers) {
      if (p.isBot !== true && p.name !== $t('setup.soloName')) void touchProfile(p.name, p.avatar);
    }
    if (isRemote) room?.lock();
    // Copy to plain objects: $state proxies can't pass structuredClone/IndexedDB.
    const categories = allCategories
      .filter((c) => selectedCategoryIds.includes(c.id))
      .map((c) => ({ ...c }));
    // The next game starts from this set.
    writeCategoryPrefs({
      selectedIds: [...selectedCategoryIds],
      custom: customCategories.map((c) => ({ ...c })),
    });
    const settings: GameSettings = {
      language: gameLanguage,
      mode,
      scoring: finalPlayers.length === 1 ? 'simple' : scoring,
      validation,
      categories,
      roundCount,
      isEndless,
      hasWikidataCheck,
      hasFunFacts,
      hasSpeedScoring,
      timerSeconds,
      isRemote,
      roomCode: isRemote ? roomCode : undefined,
      voteMode: isRemote ? voteMode : undefined,
    };
    const state = createGame(settings, finalPlayers);
    startNextRound(state);
    void saveGame(state);
    game.set(state);
    screen.set('round');
  }
</script>

<div class="wizard">
  <TopBar title={stepTitle} onback={goBack} backLabel={$t('setup.back')} />

  <div class="step-content">
    {#if step === 1}
      <div class="mode-grid">
        <button
          type="button"
          class="mode-card"
          class:selected={playStyle === 'local'}
          onclick={selectLocal}
        >
          <span class="mode-title">{$t('setup.style.local')}</span>
          <span class="mode-hint">{$t('setup.style.local.hint')}</span>
        </button>
        <button
          type="button"
          class="mode-card"
          class:selected={playStyle === 'remote'}
          onclick={() => void selectRemote()}
        >
          <span class="mode-title">{$t('setup.style.remote')}</span>
          <span class="mode-hint">{$t('setup.style.remote.hint')}</span>
        </button>
      </div>

      {#if playStyle === 'local'}
        {#if profileSuggestions.length > 0}
          <div class="chip-row">
            {#each profileSuggestions as prof (prof.key)}
              <Chip on={false} onclick={() => pickProfile(prof)}>
                <span class="profile-chip">
                  <Avatar name={prof.name} avatar={prof.avatar} size={22} />
                  {prof.name}
                </span>
              </Chip>
            {/each}
          </div>
        {/if}
        <div class="players-list">
          {#each players as player, i (player.id)}
            <div class="player-row">
              <button
                type="button"
                class="avatar-btn"
                aria-label={$t('setup.avatar')}
                onclick={() => (avatarPickerFor = player.id)}
              >
                <Avatar name={player.name} avatar={player.avatar} colorIndex={i + 1} size={44} />
              </button>
              <TextInput
                bind:value={player.name}
                placeholder={players.length === 1
                  ? $t('setup.soloName')
                  : `${$t('setup.playerName')} ${i + 1}`}
                oninput={() => (stepError = '')}
              />
              {#if i > 0}
                <button
                  type="button"
                  class="player-remove"
                  aria-label={$t('common.remove')}
                  onclick={() => removePlayer(player.id)}
                >
                  ✕
                </button>
              {/if}
            </div>
          {/each}
        </div>
        <div class="add-row">
          <Button variant="secondary" onclick={addPlayer} disabled={players.length >= 8}>
            {$t('setup.addPlayer')}
          </Button>
          <Button variant="ghost" onclick={addBot} disabled={players.length >= 8}>
            🤖 {$t('setup.addBot')}
          </Button>
        </div>
      {:else if openingRoom}
        <p class="section-hint">{$t('lobby.opening')}</p>
      {:else if roomError}
        <p class="step-error">{roomError}</p>
        <Button variant="secondary" onclick={() => void selectRemote()}
          >{$t('join.tryAgain')}</Button
        >
      {:else if roomCode}
        <div class="code-card">
          <span class="code-label">{$t('lobby.code')}</span>
          <div class="room-code">{roomCode}</div>
          {#if qrDataUrl !== ''}
            <img class="qr" src={qrDataUrl} alt={roomCode} />
            <span class="code-label">{$t('lobby.scan')}</span>
          {/if}
        </div>
        <p class="section-hint">{$t('lobby.hint')}</p>
        {#if guestList.length === 0}
          <p class="section-hint">{$t('lobby.waiting')}</p>
        {:else}
          <p class="joined-count">{$t('lobby.joined').replace('{n}', String(guestList.length))}</p>
          <div class="roster">
            {#each guestList as g (g.playerId)}
              <span class="roster-chip">
                <Avatar name={g.name} avatar={g.avatar} size={22} />
                {g.name}
              </span>
            {/each}
          </div>
        {/if}
      {/if}
    {:else if step === 2}
      <div class="mode-grid">
        <button
          type="button"
          class="mode-card"
          class:selected={mode === 'classic'}
          onclick={() => (mode = 'classic')}
        >
          <span class="mode-title">{$t('setup.mode.classic')}</span>
          <span class="mode-hint">{$t('setup.mode.classic.hint')}</span>
        </button>
        <button
          type="button"
          class="mode-card"
          class:selected={mode === 'single'}
          onclick={() => (mode = 'single')}
        >
          <span class="mode-title">{$t('setup.mode.single')}</span>
          <span class="mode-hint">{$t('setup.mode.single.hint')}</span>
        </button>
      </div>

      <h2 class="section-title">{$t('setup.packs')}</h2>
      <div class="chip-row">
        {#each CATEGORY_PACKS as pack (pack.key)}
          <Chip
            on={[...selectedCategoryIds].sort().join() === [...pack.ids].sort().join()}
            onclick={() => (selectedCategoryIds = [...pack.ids])}
          >
            {pack.emoji}
            {$t(pack.key)}
          </Chip>
        {/each}
      </div>

      <h2 class="section-title">{$t('setup.categories')}</h2>
      {#if savedPrefs === null}
        <p class="section-hint">{$t('setup.categories.hint')}</p>
      {/if}
      <div class="chip-grid">
        {#each builtinCategories as cat (cat.id)}
          <Chip on={selectedCategoryIds.includes(cat.id)} onclick={() => toggleCategory(cat.id)}>
            {cat.emoji}
            {$categoryName(cat)}
          </Chip>
        {/each}
        {#each customCategories as cat (cat.id)}
          <div class="custom-chip">
            <Chip on={selectedCategoryIds.includes(cat.id)} onclick={() => toggleCategory(cat.id)}>
              {cat.customName}
            </Chip>
            <button
              type="button"
              class="chip-remove"
              aria-label={$t('common.remove')}
              onclick={() => removeCustomCategory(cat.id)}
            >
              ✕
            </button>
          </div>
        {/each}
      </div>
      <div class="add-category">
        <TextInput
          bind:value={newCategoryName}
          placeholder={$t('setup.addCategory')}
          error={categoryError}
          oninput={() => (categoryError = '')}
          onkeydown={(e) => {
            if (e.key === 'Enter') addCustomCategory();
          }}
        />
        <Button variant="secondary" onclick={addCustomCategory}>{$t('setup.addCategory')}</Button>
      </div>
    {:else}
      {#if playStyle === 'remote'}
        <h2 class="section-title">{$t('setup.voting')}</h2>
        <div class="mode-grid">
          <button
            type="button"
            class="mode-card"
            class:selected={voteMode === 'devices'}
            onclick={() => (voteMode = 'devices')}
          >
            <span class="mode-title">📱 {$t('setup.voting.devices')}</span>
            <span class="mode-hint">{$t('setup.voting.devices.hint')}</span>
          </button>
          <button
            type="button"
            class="mode-card"
            class:selected={voteMode === 'host'}
            onclick={() => (voteMode = 'host')}
          >
            <span class="mode-title">📺 {$t('setup.voting.host')}</span>
            <span class="mode-hint">{$t('setup.voting.host.hint')}</span>
          </button>
        </div>
      {/if}

      {#if playerCount > 1}
        <h2 class="section-title">{$t('setup.scoring')}</h2>
        <div class="mode-grid">
          <button
            type="button"
            class="mode-card"
            class:selected={scoring === 'unique'}
            onclick={() => (scoring = 'unique')}
          >
            <span class="mode-title">{$t('setup.scoring.unique')}</span>
            <span class="mode-hint">{$t('setup.scoring.unique.hint')}</span>
          </button>
          <button
            type="button"
            class="mode-card"
            class:selected={scoring === 'simple'}
            onclick={() => (scoring = 'simple')}
          >
            <span class="mode-title">{$t('setup.scoring.simple')}</span>
            <span class="mode-hint">{$t('setup.scoring.simple.hint')}</span>
          </button>
        </div>
      {/if}

      <h2 class="section-title">{$t('setup.timer')}</h2>
      <div class="chip-row">
        {#each TIMER_OPTIONS as opt (String(opt.value))}
          <Chip on={timerSeconds === opt.value} onclick={() => (timerSeconds = opt.value)}
            >{$t(opt.key)}</Chip
          >
        {/each}
      </div>

      <h2 class="section-title">{$t('setup.rounds')}</h2>
      <div class="stepper">
        <Button
          variant="secondary"
          onclick={() => {
            isEndless = false;
            roundCount = Math.max(1, roundCount - 1);
          }}>−</Button
        >
        <span class="stepper-value">{isEndless ? '∞' : roundCount}</span>
        <Button
          variant="secondary"
          onclick={() => {
            isEndless = false;
            roundCount = Math.min(10, roundCount + 1);
          }}>+</Button
        >
        <Chip on={isEndless} onclick={() => (isEndless = !isEndless)}
          >{$t('setup.rounds.endless')}</Chip
        >
      </div>

      <details class="advanced">
        <summary>{$t('setup.advanced')}</summary>
        <label class="select-field">
          <span class="select-label">{$t('setup.validation')}</span>
          <select class="native-select" bind:value={validation}>
            <option value="hybrid">{$t('setup.validation.hybrid')}</option>
            <option value="bundled">{$t('setup.validation.bundled')}</option>
            <option value="dictionary">{$t('setup.validation.dictionary')}</option>
            <option value="vote">{$t('setup.validation.vote')}</option>
            <option value="none">{$t('setup.validation.none')}</option>
          </select>
        </label>
        <label class="select-field">
          <span class="select-label">{$t('setup.language')}</span>
          <select
            class="native-select"
            bind:value={gameLanguage}
            onchange={() => uiLanguage.set(gameLanguage)}
          >
            {#each availablePacks() as p (p.code)}
              <option value={p.code}>{p.name}</option>
            {/each}
          </select>
        </label>
        <div class="toggle-field">
          <span class="select-label">{$t('setup.online')}</span>
          <div class="chip-row">
            <Chip on={hasWikidataCheck} onclick={() => (hasWikidataCheck = !hasWikidataCheck)}
              >{hasWikidataCheck ? '✓ ' : ''}{$t('setup.wikidata')}</Chip
            >
            <Chip on={hasFunFacts} onclick={() => (hasFunFacts = !hasFunFacts)}
              >{hasFunFacts ? '✓ ' : ''}{$t('setup.funFact')}</Chip
            >
          </div>
        </div>
        <div class="toggle-field">
          <span class="select-label">{$t('setup.speedScoring.hint')}</span>
          <div class="chip-row">
            <Chip on={hasSpeedScoring} onclick={() => (speedScoringChoice = !hasSpeedScoring)}
              >{hasSpeedScoring ? '✓ ' : ''}{$t('setup.speedScoring')}</Chip
            >
          </div>
        </div>
      </details>
    {/if}
  </div>

  <div class="footer">
    {#if stepError}
      <p class="step-error">{stepError}</p>
    {/if}
    {#if step < 3}
      <Button
        variant="accent"
        block
        disabled={step === 2 && !canProceedCategories && newCategoryName.trim() === ''}
        onclick={nextStep}
      >
        {$t('setup.next')}
      </Button>
    {:else}
      <Button variant="accent" block disabled={starting} onclick={startGame}
        >{$t('setup.start')}</Button
      >
    {/if}
  </div>
</div>

<Modal open={avatarPickerFor !== null} onclose={() => (avatarPickerFor = null)}>
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
    <Button variant="ghost" block onclick={() => (avatarPickerFor = null)}
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
  .wizard {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-block-size: 0;
  }
  .step-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    overflow-y: auto;
  }
  .players-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .player-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .player-row :global(.field) {
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
  .player-remove {
    min-inline-size: 48px;
    min-block-size: 48px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-primary);
    font-weight: var(--font-weight-display);
    font-size: var(--font-size-body);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
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
  .add-row {
    display: flex;
    gap: var(--space-2);
  }
  .profile-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .roster-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .qr {
    inline-size: 140px;
    block-size: 140px;
    border-radius: var(--radius-md);
    margin-block-start: var(--space-2);
  }
  .section-title {
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-heading);
    line-height: var(--line-height-h2);
    margin-block-start: var(--space-2);
  }
  .mode-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .mode-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    text-align: start;
    /* Buttons don't inherit text color — without this titles render ButtonText-black in dark mode. */
    color: var(--color-text);
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: var(--space-4);
    min-block-size: 48px;
    cursor: pointer;
    transition: border-color var(--duration-fast) var(--easing-standard);
  }
  .mode-card.selected {
    border-color: var(--color-primary);
    border-width: var(--border-edge-width);
  }
  .mode-title {
    font-weight: var(--font-weight-display);
    font-size: var(--font-size-body);
  }
  .mode-hint {
    color: var(--color-muted);
    font-size: var(--font-size-small);
  }
  .chip-grid,
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .custom-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .chip-remove {
    min-inline-size: 44px;
    min-block-size: 44px;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .add-category {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .add-category :global(.field) {
    flex: 1;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .stepper-value {
    font-size: var(--font-size-h1);
    font-weight: var(--font-weight-display);
    font-variant-numeric: tabular-nums;
    min-inline-size: 2ch;
    text-align: center;
  }
  .advanced {
    margin-block-start: var(--space-2);
  }
  .advanced summary {
    font-weight: var(--font-weight-subheading);
    color: var(--color-primary);
    cursor: pointer;
    padding-block: var(--space-2);
  }
  .select-field {
    display: block;
    margin-block-start: var(--space-3);
  }
  .toggle-field {
    margin-block-start: var(--space-3);
  }
  .select-label {
    display: block;
    font-weight: var(--font-weight-subheading);
    font-size: var(--font-size-small);
    color: var(--color-muted);
    margin-block-end: var(--space-1);
  }
  .native-select {
    inline-size: 100%;
    min-block-size: 48px;
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: var(--font-weight-body);
    font-family: inherit;
    padding-inline: var(--space-4);
  }
  .section-hint {
    color: var(--color-muted);
    font-size: var(--font-size-small);
  }
  .code-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    background: var(--color-surface);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: var(--space-4);
  }
  .code-label {
    color: var(--color-muted);
    font-size: var(--font-size-small);
    font-weight: var(--font-weight-subheading);
  }
  .room-code {
    font-size: var(--font-size-display);
    font-weight: var(--font-weight-display);
    line-height: var(--line-height-display);
    letter-spacing: 0.25em;
    padding-inline-start: 0.25em; /* visually recenters the letter-spaced code */
    color: var(--color-primary);
  }
  .joined-count {
    font-weight: var(--font-weight-subheading);
    color: var(--color-primary);
  }
  .roster {
    display: flex;
    flex-wrap: wrap;
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
  .footer {
    flex-shrink: 0;
  }
  .step-error {
    color: var(--color-danger);
    font-weight: var(--font-weight-subheading);
    font-size: var(--font-size-small);
    text-align: center;
    margin-block-end: var(--space-2);
  }
</style>

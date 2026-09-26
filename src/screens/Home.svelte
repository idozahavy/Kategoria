<script lang="ts">
  import { onMount } from 'svelte';

  import { listSaves } from '../lib/db';
  import { availablePacks, t, uiLanguage } from '../lib/i18n';
  import { setActiveRoom } from '../lib/p2p';
  import { soundOn } from '../lib/sound';
  import { screen } from '../lib/stores';
  import { theme } from '../lib/theme';
  import Button from '../lib/ui/Button.svelte';
  import Chip from '../lib/ui/Chip.svelte';

  let hasSaves = $state(false);

  onMount(async () => {
    // Arriving home always ends any hosted room (e.g. via the browser back trap).
    setActiveRoom(null);
    try {
      hasSaves = (await listSaves()).some((s) => s.status !== 'finished' && !s.isRemote);
    } catch {
      hasSaves = false;
    }
  });
</script>

<div class="home">
  <div class="logo">🎪</div>
  <!-- dir="auto": the Latin wordmark keeps its "!" at the end inside RTL pages. -->
  <h1 class="title" dir="auto">{$t('app.title')}</h1>
  <p class="tagline">{$t('home.tagline')}</p>

  <div class="actions">
    <Button variant="accent" block onclick={() => screen.set('new-game')}>
      {$t('home.new')}
    </Button>
    <Button variant="primary" block onclick={() => screen.set('join')}>
      {$t('home.join')}
    </Button>
    {#if hasSaves}
      <Button variant="secondary" block onclick={() => screen.set('resume')}>
        {$t('home.resume')}
      </Button>
    {/if}
  </div>

  <div class="languages" role="group" aria-label={$t('home.languageLabel')}>
    <span class="globe" aria-hidden="true">🌐</span>
    {#each availablePacks() as p (p.code)}
      <Chip on={$uiLanguage === p.code} onclick={() => uiLanguage.set(p.code)}>{p.name}</Chip>
    {/each}
  </div>

  <div class="languages" role="group" aria-label={$t('home.themeLabel')}>
    <Chip on={$theme === 'light'} onclick={() => theme.set('light')}
      >☀️ {$t('home.theme.light')}</Chip
    >
    <Chip on={$theme === 'dark'} onclick={() => theme.set('dark')}>🌙 {$t('home.theme.dark')}</Chip>
    <Chip on={$soundOn} onclick={() => soundOn.set(!$soundOn)}>
      {$soundOn ? '🔊' : '🔇'}
      {$t('home.sound')}
    </Chip>
  </div>

  <div class="languages">
    <Chip on={false} onclick={() => screen.set('leaderboard')}>🏆 {$t('board.title')}</Chip>
    <Chip on={false} onclick={() => screen.set('learned')}>📚 {$t('learned.title')}</Chip>
  </div>
</div>

<style>
  .home {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    text-align: center;
  }
  .logo {
    font-size: calc(var(--font-size-display) * 1.6);
  }
  .title {
    font-size: var(--font-size-display);
    font-weight: var(--font-weight-display);
    line-height: var(--line-height-display);
  }
  .tagline {
    color: var(--color-muted);
    margin-block-end: var(--space-5);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: 100%;
    max-inline-size: 320px;
  }
  .languages {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    margin-block-start: var(--space-5);
  }
  .globe {
    font-size: var(--font-size-h2);
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';

  import { trackEvent } from '../lib/analytics';
  import { deleteGame, listSaves, loadGame } from '../lib/db';
  import { screenForGame } from '../lib/game';
  import { t } from '../lib/i18n';
  import { reopenRoom, setActiveRoom } from '../lib/p2p';
  import { game, screen } from '../lib/stores';
  import type { SaveSummary } from '../lib/types';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import Modal from '../lib/ui/Modal.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';

  let saves = $state<SaveSummary[]>([]);
  let loading = $state(true);
  let confirmDeleteId = $state<string | null>(null);

  onMount(() => {
    void refresh();
  });

  async function refresh(): Promise<void> {
    loading = true;
    try {
      // Finished games have nothing to resume.
      saves = (await listSaves()).filter((s) => s.status !== 'finished');
    } finally {
      loading = false;
    }
  }

  async function continueGame(id: string): Promise<void> {
    const loaded = await loadGame(id);
    if (!loaded) return;
    trackEvent('game_resume', { remote: loaded.settings.isRemote === true });
    if (loaded.settings.isRemote === true && loaded.settings.roomCode !== undefined) {
      // Reopen the room under its old code so guests can rejoin their seats.
      try {
        const room = await reopenRoom(
          loaded.settings.roomCode,
          loaded.players.map((p) => ({
            playerId: p.id,
            name: p.name,
            avatar: p.avatar,
            deviceId: p.deviceId,
          })),
        );
        setActiveRoom(room);
      } catch {
        // Room couldn't be reopened — the host can still end the round alone.
      }
    }
    game.set(loaded);
    screen.set(screenForGame(loaded));
  }

  function askDelete(id: string): void {
    confirmDeleteId = id;
  }

  function cancelDelete(): void {
    confirmDeleteId = null;
  }

  async function confirmDelete(): Promise<void> {
    if (!confirmDeleteId) return;
    await deleteGame(confirmDeleteId);
    confirmDeleteId = null;
    await refresh();
  }
</script>

<div class="resume">
  <TopBar
    title={$t('resume.title')}
    onback={() => screen.set('home')}
    backLabel={$t('setup.back')}
  />

  {#if !loading && saves.length === 0}
    <div class="empty">
      <div class="emoji">📭</div>
      <p class="empty-title">{$t('resume.empty.title')}</p>
      <p class="empty-hint">{$t('resume.empty.hint')}</p>
      <Button variant="accent" onclick={() => screen.set('new-game')}>{$t('home.new')}</Button>
    </div>
  {:else}
    <div class="save-list">
      {#each saves as save (save.id)}
        <Card>
          <div class="save-card">
            <div class="save-info">
              <b class="players">{save.playerNames.join(', ')}</b>
              <span class="progress">
                {$t('resume.progress')
                  .replace(
                    '{n}',
                    String(
                      save.isEndless
                        ? save.roundsPlayed + 1
                        : Math.min(save.roundsPlayed + 1, save.roundCount),
                    ),
                  )
                  .replace('{total}', save.isEndless ? '∞' : String(save.roundCount))}
              </span>
              <span class="date">
                {new Date(save.updatedAt).toLocaleDateString()}
                {new Date(save.updatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div class="save-actions">
              <Button variant="primary" onclick={() => continueGame(save.id)}
                >{$t('resume.continue')}</Button
              >
              <Button variant="ghost" onclick={() => askDelete(save.id)}
                >{$t('resume.delete')}</Button
              >
            </div>
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<Modal open={confirmDeleteId !== null} onclose={cancelDelete}>
  <p class="confirm-text">{$t('resume.deleteConfirm')}</p>
  <div class="modal-actions">
    <Button variant="ghost" onclick={cancelDelete}>{$t('common.cancel')}</Button>
    <Button variant="danger" onclick={confirmDelete}>{$t('resume.delete')}</Button>
  </div>
</Modal>

<style>
  .resume {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    text-align: center;
  }
  .empty .emoji {
    font-size: calc(var(--font-size-display) * 1.6);
  }
  .empty-title {
    font-weight: var(--font-weight-display);
    font-size: var(--font-size-body);
  }
  .empty-hint {
    color: var(--color-muted);
    margin-block-end: var(--space-3);
  }
  .save-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    overflow-y: auto;
  }
  .save-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .save-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .players {
    font-size: var(--font-size-body);
  }
  .progress {
    font-weight: var(--font-weight-subheading);
    color: var(--color-primary);
  }
  .date {
    color: var(--color-muted);
    font-size: var(--font-size-small);
  }
  .save-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .confirm-text {
    font-weight: var(--font-weight-subheading);
    margin-block-end: var(--space-4);
  }
  .modal-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
  }
</style>

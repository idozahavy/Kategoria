<script lang="ts">
  import { onMount } from 'svelte';

  import { listLearnedWords } from '../lib/db';
  import { getPack, t } from '../lib/i18n';
  import { screen } from '../lib/stores';
  import Card from '../lib/ui/Card.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';
  import { forgetWord } from '../lib/validation';

  interface Group {
    language: string;
    categoryId: string;
    label: string;
    words: string[];
  }

  let groups = $state<Group[]>([]);
  let loaded = $state(false);

  onMount(async () => {
    try {
      const entries = await listLearnedWords();
      groups = entries
        .filter((e) => e.words.length > 0)
        .map((e) => {
          const pack = getPack(e.language);
          const label = `${pack.name} · ${pack.categoryNames[e.categoryId] ?? e.categoryId}`;
          return { language: e.language, categoryId: e.categoryId, label, words: [...e.words] };
        });
    } catch {
      groups = []; // storage unavailable — show the empty state
    }
    loaded = true;
  });

  function remove(group: Group, word: string): void {
    void forgetWord(group.language, group.categoryId, word);
    group.words = group.words.filter((w) => w !== word);
    groups = groups.filter((g) => g.words.length > 0);
  }
</script>

<div class="learned">
  <TopBar
    title={$t('learned.title')}
    onback={() => screen.set('home')}
    backLabel={$t('setup.back')}
  />

  {#if loaded && groups.length === 0}
    <div class="empty">
      <div class="empty-emoji">📚</div>
      <p class="empty-text">{$t('learned.empty')}</p>
    </div>
  {:else}
    <div class="groups">
      {#each groups as group (group.language + group.categoryId)}
        <Card>
          <h2 class="group-title">{group.label}</h2>
          <div class="words">
            {#each group.words as word (word)}
              <span class="word-chip">
                {word}
                <button
                  type="button"
                  class="word-remove"
                  aria-label={$t('common.remove')}
                  onclick={() => remove(group, word)}>✕</button
                >
              </span>
            {/each}
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<style>
  .learned {
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
    gap: var(--space-3);
    text-align: center;
  }
  .empty-emoji {
    font-size: var(--size-illustration);
  }
  .empty-text {
    color: var(--color-muted);
    max-inline-size: 280px;
  }
  .groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    overflow-y: auto;
  }
  .group-title {
    font-size: var(--font-size-body);
    font-weight: var(--font-weight-subheading);
    margin-block-end: var(--space-3);
  }
  .words {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .word-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    background: var(--color-bg);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-pill);
    padding-block: var(--space-1);
    padding-inline: var(--space-3);
  }
  .word-remove {
    background: none;
    border: none;
    color: var(--color-muted);
    cursor: pointer;
    min-inline-size: 32px;
    min-block-size: 32px;
  }
</style>

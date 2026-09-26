<script lang="ts">
  import { pack, t } from '../lib/i18n';
  import { screen } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import LetterTile from '../lib/ui/LetterTile.svelte';
  import TopBar from '../lib/ui/TopBar.svelte';

  /** The rules, one short card per step — a first-time family reads them in a minute. */
  const STEPS: { emoji: string; key: string }[] = [
    { emoji: '🔤', key: 'howto.letter' },
    { emoji: '✏️', key: 'howto.words' },
    { emoji: '⏱️', key: 'howto.clock' },
    { emoji: '⭐', key: 'howto.points' },
    { emoji: '🗳️', key: 'howto.vote' },
  ];

  /** A real letter of the current language for the example tile. */
  const exampleLetter = $derived($pack.letters[1] ?? $pack.letters[0] ?? '');
</script>

<div class="howto">
  <TopBar
    title={$t('howto.title')}
    onback={() => screen.set('home')}
    backLabel={$t('setup.back')}
  />

  <ol class="steps">
    {#each STEPS as step, i (step.key)}
      <li>
        <Card>
          <div class="step">
            <span class="number" aria-hidden="true">{i + 1}</span>
            <div class="text">
              <h2 class="step-title">
                <span aria-hidden="true">{step.emoji}</span>
                {$t(`${step.key}.title`)}
              </h2>
              <p class="body">{$t(`${step.key}.body`)}</p>
              {#if step.key === 'howto.letter' && exampleLetter !== ''}
                <div class="example">
                  <LetterTile letter={exampleLetter} size={56} />
                </div>
              {:else if step.key === 'howto.points'}
                <div class="badges">
                  <span class="badge success">{$t('review.unique')} · 10</span>
                  <span class="badge warning">{$t('review.shared')} · 5</span>
                  <span class="badge muted">{$t('howto.points.none')} · 0</span>
                </div>
              {/if}
            </div>
          </div>
        </Card>
      </li>
    {/each}
  </ol>

  <Button variant="accent" block onclick={() => screen.set('new-game')}>{$t('howto.play')}</Button>
</div>

<style>
  .howto {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .steps {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .step {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }
  .number {
    flex-shrink: 0;
    inline-size: var(--space-6);
    block-size: var(--space-6);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    background: var(--color-primary);
    color: var(--color-on-primary);
    font-weight: var(--font-weight-display);
    font-variant-numeric: tabular-nums;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .step-title {
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-heading);
    line-height: var(--line-height-h2);
  }
  .body {
    color: var(--color-muted);
  }
  .example {
    margin-block-start: var(--space-2);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
  }
  /* Same badges the results screens use, so the rules match what players will see. */
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
</style>

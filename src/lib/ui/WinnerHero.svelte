<script lang="ts">
  import Avatar from './Avatar.svelte';

  /** Top of the final scores: the winner(s), big and crowned, with the headline. */
  let {
    winners,
    text,
  }: {
    /** Empty = nobody won (nobody scored) — a shrug instead of avatars. */
    winners: { name: string; avatar?: string; colorIndex: number }[];
    text: string;
  } = $props();

  /** Up to two winners fit side by side at full size; bigger ties shrink. */
  const avatarSize = $derived(winners.length > 2 ? 72 : 112);
</script>

<section class="hero" aria-live="polite">
  {#if winners.length > 0}
    <div class="avatars">
      {#each winners as w, i (i)}
        <div class="winner-avatar">
          <span class="crown" aria-hidden="true">👑</span>
          <Avatar name={w.name} avatar={w.avatar} colorIndex={w.colorIndex} size={avatarSize} />
        </div>
      {/each}
    </div>
  {:else}
    <div class="shrug" aria-hidden="true">🤷</div>
  {/if}
  <h1 class="headline">{text}</h1>
</section>

<style>
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    text-align: center;
    padding-block: var(--space-4);
  }
  .avatars {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-4);
  }
  .winner-avatar {
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: hero-pop var(--duration-press) var(--easing-spring) both;
  }
  .winner-avatar :global(.avatar) {
    box-shadow: 0 0 0 var(--border-edge-width) var(--color-accent);
  }
  .crown {
    font-size: var(--font-size-display);
    line-height: 1;
    margin-block-end: calc(-1 * var(--space-3));
    position: relative;
    z-index: var(--z-sticky);
  }
  .shrug {
    font-size: var(--size-illustration);
  }
  .headline {
    font-size: var(--font-size-display);
    font-weight: var(--font-weight-display);
    line-height: var(--line-height-display);
    color: var(--color-accent);
  }
  @keyframes hero-pop {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .winner-avatar {
      animation: fade var(--duration-fast) linear both;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>

<script lang="ts">
  /** Loading state (scheme S1): a spinning ring with its words visible underneath. */
  let { label, emoji = '' }: { label: string; emoji?: string } = $props();
</script>

<div class="spinner-wrap" role="status">
  <div class="ring" aria-hidden="true"></div>
  <p class="label">
    {#if emoji !== ''}<span aria-hidden="true">{emoji}</span>{/if}
    {label}
  </p>
</div>

<style>
  .spinner-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding-block: var(--space-6);
    text-align: center;
  }
  .ring {
    inline-size: var(--space-7);
    block-size: var(--space-7);
    border-radius: var(--radius-pill);
    border: var(--border-edge-width) solid var(--color-border);
    border-block-start-color: var(--color-primary);
    animation: spin calc(var(--duration-pulse) + var(--duration-enter)) linear infinite;
  }
  .label {
    font-weight: var(--font-weight-subheading);
    color: var(--color-muted);
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  /* Reduced motion: the ring breathes (opacity) instead of turning. */
  @media (prefers-reduced-motion: reduce) {
    .ring {
      animation: breathe calc(var(--duration-pulse) * 2) linear infinite alternate !important;
      animation-iteration-count: infinite !important;
    }
  }
  @keyframes breathe {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.4;
    }
  }
</style>

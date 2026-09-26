<script lang="ts">
  import { timerStage } from '../timer';

  let {
    seconds,
    total = seconds,
    large = false,
  }: {
    seconds: number;
    /** The turn's full length — drives the draining bar and the warning stages. */
    total?: number;
    /** Shared-screen size, readable from across the room. */
    large?: boolean;
  } = $props();

  const stage = $derived(timerStage(seconds, total));
  const label = $derived(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
  const remaining = $derived(total > 0 ? Math.min(1, Math.max(0, seconds / total)) : 1);
</script>

<span class="timer {stage}" class:large>
  <span class="label">{label}</span>
  <span class="bar" aria-hidden="true" style:inline-size="{remaining * 100}%"></span>
</span>

<style>
  .timer {
    position: relative;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-radius: var(--radius-pill);
    font-weight: var(--font-weight-display);
    font-size: var(--font-size-h2);
    font-variant-numeric: tabular-nums;
    padding-block: var(--space-2);
    padding-inline: var(--space-5);
    transition:
      background-color var(--duration-enter) var(--easing-standard),
      color var(--duration-enter) var(--easing-standard);
  }
  .large {
    font-size: var(--font-size-display);
    padding-block: var(--space-3);
    padding-inline: var(--space-6);
  }
  /* The time left drains out of a strip along the pill's bottom edge. */
  .bar {
    position: absolute;
    inset-block-end: 0;
    inset-inline-start: 0;
    block-size: var(--space-1);
    background: currentColor;
    opacity: 0.5;
    transition: inline-size 1s linear;
  }
  .hurry {
    background: var(--color-warning);
    color: var(--color-on-warning);
  }
  .final {
    background: var(--color-danger);
    color: var(--color-on-danger);
    animation: pulse var(--duration-pulse) ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.12);
    }
  }
  /* Reduced motion: the stages stay color-only. */
  @media (prefers-reduced-motion: reduce) {
    .final {
      animation: none;
    }
    .bar {
      transition: none;
    }
  }
</style>

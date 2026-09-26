<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'primary',
    disabled = false,
    block = false,
    type = 'button',
    ariaLabel = undefined,
    onclick,
    children,
  }: {
    variant?: 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost';
    disabled?: boolean;
    block?: boolean;
    type?: 'button' | 'submit';
    /** Spoken name when the visible content is only a symbol (−, +). */
    ariaLabel?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button class="btn {variant}" class:block {type} {disabled} aria-label={ariaLabel} {onclick}>
  {@render children()}
</button>

<style>
  .btn {
    border: none;
    border-radius: var(--radius-md);
    font-weight: var(--font-weight-display);
    font-size: var(--font-size-body);
    min-block-size: var(--size-touch);
    padding-block: 13px 10px; /* design-ignore: optical centering against the 5px pressable bottom edge */
    padding-inline: var(--space-5);
    cursor: pointer;
    border-block-end: var(--border-edge-width) solid transparent;
    transition:
      transform var(--duration-fast) var(--easing-spring),
      border-block-end-color var(--duration-fast) var(--easing-spring),
      background-color var(--duration-fast) var(--easing-standard);
  }
  /* Pressed state must not change border-width: the edge border is layout, and
     collapsing it shifts every element below the button. Hide it instead. */
  .btn:active:not(:disabled) {
    transform: translateY(var(--border-edge-width));
    border-block-end-color: transparent;
  }
  .block {
    display: block;
    inline-size: 100%;
  }
  .primary {
    background: var(--color-primary);
    color: var(--color-on-primary);
    border-block-end-color: var(--color-primary-edge);
  }
  .accent {
    background: var(--color-accent);
    color: var(--color-on-accent);
    border-block-end-color: var(--color-accent-edge);
  }
  .secondary {
    background: var(--color-surface);
    color: var(--color-primary);
    border: var(--border-width) solid var(--color-primary);
    border-block-end: var(--border-edge-width) solid var(--color-primary);
  }
  .danger {
    background: var(--color-danger);
    color: var(--color-on-danger);
    border-block-end-color: var(--color-danger-edge);
  }
  .ghost {
    background: transparent;
    color: var(--color-primary);
    border-block-end-color: transparent;
  }
  .btn:disabled {
    background: var(--color-border);
    color: var(--color-muted);
    border-block-end-color: var(--color-border-strong);
    cursor: not-allowed;
  }
</style>

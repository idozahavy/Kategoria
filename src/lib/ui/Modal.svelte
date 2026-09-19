<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = false,
    onclose,
    children,
  }: { open?: boolean; onclose?: () => void; children: Snippet } = $props();

  let modalEl: HTMLDivElement | undefined = $state();
  let previouslyFocused: HTMLElement | null = null;

  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusablesIn(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }

  // Move focus in on open, trap it inside while open, restore it on close.
  $effect(() => {
    if (!open) return;
    previouslyFocused = document.activeElement as HTMLElement | null;
    const el = modalEl;
    if (el) {
      const first = focusablesIn(el)[0];
      (first ?? el).focus();
    }
    return () => {
      previouslyFocused?.focus();
      previouslyFocused = null;
    };
  });

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onclose?.();
      return;
    }
    if (e.key !== 'Tab' || !modalEl) return;
    const focusables = focusablesIn(modalEl);
    const first = focusables[0];
    const last = focusables.at(-1);
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

{#if open}
  <div class="overlay">
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      bind:this={modalEl}
      tabindex="-1"
      onkeydown={onKeydown}
    >
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--color-scrim) 60%, transparent);
    z-index: var(--z-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }
  .modal {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    max-inline-size: 360px;
    inline-size: 100%;
    text-align: center;
    z-index: var(--z-modal);
    animation: pop var(--duration-enter) var(--easing-spring) both;
  }
  .modal:focus {
    outline: none;
  }
  @keyframes pop {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    70% {
      transform: scale(1.08);
      opacity: 1;
    }
    100% {
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .modal {
      animation: none;
    }
  }
</style>

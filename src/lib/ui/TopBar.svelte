<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    title,
    onback,
    backLabel,
    action,
  }: { title: string; onback?: () => void; backLabel: string; action?: Snippet } = $props();
</script>

<header class="topbar">
  {#if onback}
    <button type="button" class="iconbtn" aria-label={backLabel} onclick={onback}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="back-icon"><path d="M15 18l-6-6 6-6" /></svg
      >
    </button>
  {/if}
  <h1 class="title">{title}</h1>
  {#if action}
    {@render action()}
  {/if}
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    inline-size: 100%;
    padding: var(--space-2);
  }
  .title {
    flex: 1;
    font-size: var(--font-size-h2);
    font-weight: var(--font-weight-heading);
    line-height: var(--line-height-h2);
  }
  .iconbtn {
    inline-size: var(--size-touch);
    block-size: var(--size-touch);
    border: none;
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  :global([dir='rtl']) .back-icon {
    transform: scaleX(-1);
  }
</style>

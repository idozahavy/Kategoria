<script lang="ts">
  let {
    name,
    avatar = undefined,
    colorIndex = 1,
    size = 40,
  }: { name: string; avatar?: string; colorIndex?: number; size?: number } = $props();

  const isImage = $derived(avatar !== undefined && avatar.startsWith('data:'));
</script>

<span
  class="avatar"
  style="inline-size: {size}px; block-size: {size}px; font-size: {Math.round(size * 0.5)}px;"
  style:background={isImage ? 'transparent' : `var(--color-player-${colorIndex})`}
>
  {#if isImage}
    <img src={avatar} alt={name} />
  {:else if avatar !== undefined && avatar !== ''}
    <span aria-hidden="true">{avatar}</span>
  {:else if name.trim() === ''}
    <span aria-hidden="true">🙂</span>
  {:else}
    {name.trim().slice(0, 1).toLocaleUpperCase()}
  {/if}
</span>

<style>
  .avatar {
    border-radius: var(--radius-pill);
    color: var(--color-surface);
    font-weight: var(--font-weight-display);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }
  img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }
</style>

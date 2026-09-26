<script lang="ts">
  let {
    value = $bindable(''),
    ref = $bindable<HTMLInputElement | undefined>(),
    placeholder = '',
    error = '',
    disabled = false,
    label = '',
    enterkeyhint,
    maxlength,
    oninput,
    onkeydown,
  }: {
    value?: string;
    /** The underlying <input>, for parents that need to move focus. */
    ref?: HTMLInputElement;
    placeholder?: string;
    error?: string;
    disabled?: boolean;
    label?: string;
    /** Mobile keyboards label the Enter key with this action. */
    enterkeyhint?: 'next' | 'done' | 'go' | 'enter' | 'send' | 'search';
    maxlength?: number;
    oninput?: (e: Event) => void;
    onkeydown?: (e: KeyboardEvent) => void;
  } = $props();
</script>

<label class="field">
  {#if label}<span class="label">{label}</span>{/if}
  <input
    class="inp"
    class:err={error !== ''}
    bind:this={ref}
    bind:value
    {placeholder}
    {disabled}
    {enterkeyhint}
    {maxlength}
    {oninput}
    {onkeydown}
  />
  {#if error}<span class="errmsg">{error}</span>{/if}
</label>

<style>
  .field {
    display: block;
  }
  .label {
    display: block;
    font-weight: var(--font-weight-subheading);
    font-size: var(--font-size-small);
    color: var(--color-muted);
    margin-block-end: var(--space-1);
  }
  .inp {
    inline-size: 100%;
    min-block-size: var(--size-touch);
    border: var(--border-width) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: var(--font-weight-body);
    padding-block: var(--space-3);
    padding-inline: var(--space-4);
  }
  .inp:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 25%, transparent);
  }
  .inp.err {
    border-color: var(--color-danger);
  }
  .errmsg {
    display: block;
    color: var(--color-danger);
    font-size: var(--font-size-small);
    font-weight: var(--font-weight-subheading);
    margin-block-start: var(--space-1);
  }
</style>

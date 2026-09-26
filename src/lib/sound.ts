import { writable } from 'svelte/store';

import { readStorage, writeStorage } from './storage';

/** Tiny WebAudio chimes — no audio assets, everything synthesized on demand. */

const SOUND_STORAGE_KEY = 'categories-sound';

export const soundOn = writable<boolean>(readStorage(SOUND_STORAGE_KEY) !== 'off');

let enabled = true;
let isFirstSubscription = true;
soundOn.subscribe((on) => {
  enabled = on;
  // Skip the initial notification fired by subscribe() itself — only persist
  // when the user actually toggles sound, not on every module load.
  if (isFirstSubscription) {
    isFirstSubscription = false;
    return;
  }
  writeStorage(SOUND_STORAGE_KEY, on ? 'on' : 'off');
});

let ctx: AudioContext | null = null;

/** Lazily created so the context is born inside a user gesture (autoplay rules). */
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // no audio support — stay silent
  }
}

function tone(
  freq: number,
  startInMs: number,
  durationMs: number,
  type: OscillatorType = 'sine',
  volume = 0.05,
): void {
  const c = audio();
  if (!c) return;
  const at = c.currentTime + startInMs / 1000;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationMs / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + durationMs / 1000);
}

/** Soft click for the last timer seconds. */
export function playTick(): void {
  if (!enabled) return;
  tone(880, 0, 60, 'square', 0.02);
}

/** Happy two-note ding (word accepted, vote passed). */
export function playDing(): void {
  if (!enabled) return;
  tone(660, 0, 120);
  tone(990, 100, 180);
}

/** Short winner fanfare for the scoreboard. */
export function playFanfare(): void {
  if (!enabled) return;
  tone(523, 0, 150, 'triangle', 0.06);
  tone(659, 130, 150, 'triangle', 0.06);
  tone(784, 260, 150, 'triangle', 0.06);
  tone(1047, 390, 350, 'triangle', 0.07);
}

/** Haptic tap (ms) or pattern (on/off ms) where supported (phones). */
export function vibrate(ms: number | number[]): void {
  if (!enabled) return;
  try {
    if ('vibrate' in navigator) navigator.vibrate(ms);
  } catch {
    // not supported — fine
  }
}

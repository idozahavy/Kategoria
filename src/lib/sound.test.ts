import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface Tone {
  freq: number;
  type: string;
  startedAt: number;
}

/** A WebAudio stand-in that records every oscillator instead of making noise. */
function stubAudio(initialState: 'running' | 'suspended' = 'running'): {
  tones: Tone[];
  contexts: () => number;
  resumes: () => number;
} {
  const tones: Tone[] = [];
  let created = 0;
  let resumed = 0;
  class FakeAudioContext {
    state = initialState;
    currentTime = 0;
    destination = {};
    constructor() {
      created += 1;
    }
    resume(): Promise<void> {
      resumed += 1;
      return Promise.resolve().then(() => {
        this.state = 'running'; // the real context flips only once the promise settles
      });
    }
    createGain() {
      const node = {
        gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
        connect: () => node,
      };
      return node;
    }
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect: () => ({ connect: () => undefined }),
        start: (at: number) =>
          tones.push({ freq: osc.frequency.value, type: osc.type, startedAt: at }),
        stop: () => undefined,
      };
      return osc;
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { tones, contexts: () => created, resumes: () => resumed };
}

function stubStorage(saved: string | null): Map<string, string> {
  const store = new Map<string, string>();
  if (saved !== null) store.set('categories-sound', saved);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  return store;
}

/** The module reads its saved setting at import time, so each case gets a fresh import. */
async function loadSound(saved: string | null = null): Promise<{
  sound: typeof import('./sound');
  store: Map<string, string>;
}> {
  const store = stubStorage(saved);
  vi.resetModules();
  const sound = await import('./sound');
  return { sound, store };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sound setting', () => {
  it('is on by default and stays on for any saved value other than "off"', async () => {
    expect(get((await loadSound(null)).sound.soundOn)).toBe(true);
    expect(get((await loadSound('on')).sound.soundOn)).toBe(true);
    expect(get((await loadSound('garbage')).sound.soundOn)).toBe(true);
    expect(get((await loadSound('off')).sound.soundOn)).toBe(false);
  });

  it('persists only when the player toggles it, never on load', async () => {
    const { sound, store } = await loadSound(null);
    expect(store.has('categories-sound')).toBe(false);
    sound.soundOn.set(false);
    expect(store.get('categories-sound')).toBe('off');
    sound.soundOn.set(true);
    expect(store.get('categories-sound')).toBe('on');
  });
});

describe('chimes', () => {
  it('stay silent and never open an audio context while sound is off', async () => {
    const audio = stubAudio();
    const { sound } = await loadSound('off');
    sound.playTick();
    sound.playDing();
    sound.playFanfare();
    expect(audio.tones).toEqual([]);
    expect(audio.contexts()).toBe(0);
  });

  it('play the ding as two rising notes and the fanfare as four, sharing one context', async () => {
    const audio = stubAudio();
    const { sound } = await loadSound(null);
    sound.playDing();
    expect(audio.tones.map((t) => t.freq)).toEqual([660, 990]);
    expect(audio.tones[1]?.startedAt).toBeCloseTo(0.1);
    sound.playFanfare();
    expect(audio.tones.slice(2).map((t) => t.freq)).toEqual([523, 659, 784, 1047]);
    expect(audio.tones.slice(2).every((t) => t.type === 'triangle')).toBe(true);
    expect(audio.contexts()).toBe(1);
  });

  it('wakes a context the browser left suspended before playing', async () => {
    const audio = stubAudio('suspended');
    const { sound } = await loadSound(null);
    sound.playTick();
    expect(audio.resumes()).toBe(1);
    expect(audio.tones).toHaveLength(1);
  });

  it('tick is a short square click', async () => {
    const audio = stubAudio();
    const { sound } = await loadSound(null);
    sound.playTick();
    expect(audio.tones).toEqual([{ freq: 880, type: 'square', startedAt: 0 }]);
  });

  it('go quiet instead of throwing where WebAudio is missing', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { sound } = await loadSound(null);
    expect(() => {
      sound.playDing();
    }).not.toThrow();
  });
});

describe('vibrate', () => {
  it('taps the device only while sound is on', async () => {
    const vibrateMock = vi.fn();
    vi.stubGlobal('navigator', { vibrate: vibrateMock });
    const { sound } = await loadSound(null);
    sound.vibrate(30);
    expect(vibrateMock).toHaveBeenCalledWith(30);
    sound.soundOn.set(false);
    sound.vibrate(30);
    expect(vibrateMock).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on devices without vibration', async () => {
    vi.stubGlobal('navigator', {});
    const { sound } = await loadSound(null);
    expect(() => {
      sound.vibrate(30);
    }).not.toThrow();
  });
});

import { writable } from 'svelte/store';

import { saveGame } from './db';
import type { GameSettings, GameState, PlayerDef, Screen } from './types';

export const screen = writable<Screen>('home');

export const game = writable<GameState | null>(null);

/**
 * A finished game's setup, handed to NewGame by "Change setup" so the wizard
 * opens prefilled. NewGame reads it once on creation and clears it.
 */
export const setupTemplate = writable<{ settings: GameSettings; players: PlayerDef[] } | null>(
  null,
);

/**
 * Update the running game and persist it to IndexedDB (fire-and-forget).
 * Returns a deep clone so every `$derived` chain re-evaluates — in-place
 * mutation would be memoized away by same-reference equality.
 */
export function updateGame(mutate: (g: GameState) => void): void {
  game.update((g) => {
    if (!g) return g;
    mutate(g);
    // Invariant: saveGame's synchronous prefix (setting `updatedAt`) runs before
    // the structuredClone below — nothing else. saveGame's IndexedDB write itself
    // is async and intentionally not awaited here.
    void saveGame(g);
    return structuredClone(g);
  });
}

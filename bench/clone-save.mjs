/**
 * Cost of the updateGame() path: one structuredClone of a realistic GameState
 * (src/lib/stores.ts) plus a JSON round-trip standing in for the IndexedDB
 * structured-clone write. Prints median microseconds per call for three
 * shapes: no avatars, emoji avatars, and photo avatars (60 KB data URLs, the
 * typical 512px WebP size; MAX_AVATAR_LENGTH in p2p.ts is 400 KB).
 *
 * Usage: node bench/clone-save.mjs
 */
import { performance } from 'node:perf_hooks';

const PLAYERS = 6;
const ROUNDS = 10;
const CATEGORIES = 8;
const ITER = 200;

function fakeAvatar(bytes) {
  return 'data:image/webp;base64,' + 'A'.repeat(bytes);
}

function makeGame(avatarBytes) {
  const players = Array.from({ length: PLAYERS }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: avatarBytes === 0 ? '🦁' : fakeAvatar(avatarBytes),
  }));
  const categories = Array.from({ length: CATEGORIES }, (_, i) => ({
    id: `cat${i}`,
    nameKey: `cat${i}`,
  }));
  const rounds = Array.from({ length: ROUNDS }, (_, r) => ({
    index: r,
    letter: 'B',
    categoryIds: categories.map((c) => c.id),
    answers: players.flatMap((p) =>
      categories.map((c) => ({
        playerId: p.id,
        categoryId: c.id,
        word: 'banana',
        status: 'valid',
        points: 10,
      })),
    ),
    phase: 'done',
    activePlayerId: null,
    finishTimes: Object.fromEntries(players.map((p) => [p.id, 12345])),
    submittedIds: players.map((p) => p.id),
  }));
  return {
    id: 'g1',
    createdAt: 0,
    updatedAt: 0,
    settings: {
      language: 'en',
      categories,
      roundCount: ROUNDS,
      timerSeconds: 120,
      validation: 'hybrid',
      scoring: 'unique',
    },
    players,
    rounds,
    currentRound: ROUNDS - 1,
    usedLetters: ['A', 'B', 'C'],
    status: 'playing',
  };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function bench(label, game) {
  const clone = [];
  const roundTrip = [];
  for (let i = 0; i < ITER; i++) {
    let t = performance.now();
    const c = structuredClone(game);
    clone.push(performance.now() - t);
    t = performance.now();
    JSON.parse(JSON.stringify(c));
    roundTrip.push(performance.now() - t);
  }
  const bytes = JSON.stringify(game).length;
  // Table goes to stderr so stdout stays a single bare number for CHECK MODE.
  console.error(
    `${label.padEnd(22)} state ${(bytes / 1024).toFixed(0).padStart(5)} KB  structuredClone ${(median(clone) * 1000).toFixed(0).padStart(6)} us  serialize-roundtrip ${(median(roundTrip) * 1000).toFixed(0).padStart(6)} us`,
  );
  return median(clone) * 1000;
}

bench('emoji avatars', makeGame(0));
bench('photo avatars 60KB', makeGame(60_000));
const worst = bench('photo avatars 400KB', makeGame(400_000));
// Single bare number last so bench.ps1 / CHECK MODE can read it: worst-case clone in microseconds.
console.log(worst.toFixed(0));

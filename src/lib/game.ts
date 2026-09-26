import { getPack } from './i18n';
import type {
  CategoryDef,
  GameSettings,
  GameState,
  PlayerDef,
  RecordedResult,
  RoundState,
  Screen,
  StatsChange,
} from './types';

export const DEFAULT_CATEGORY_IDS = ['animal', 'food', 'city', 'name', 'object'] as const;

/** Timer presets offered in setup and in the round-one settings editor. */
export const TIMER_OPTIONS: { value: number | null; key: string }[] = [
  { value: null, key: 'setup.timer.none' },
  { value: 180, key: 'setup.timer.relaxed' },
  { value: 120, key: 'setup.timer.normal' },
  { value: 60, key: 'setup.timer.fast' },
];

export function newId(): string {
  // crypto.randomUUID only exists in secure contexts (https/localhost) — plain-HTTP
  // LAN play needs the manual UUIDv4 path via getRandomValues.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createGame(settings: GameSettings, players: PlayerDef[]): GameState {
  const now = Date.now();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    settings,
    players,
    rounds: [],
    currentRound: 0,
    usedLetters: [],
    status: 'playing',
  };
}

/**
 * Weighted random pick: every previous use of an item proportionally shrinks
 * its chance (weight 1/(1+uses)), so repeats stay possible but get rarer the
 * more often an item has already come up.
 */
export function drawWeighted<T>(pool: readonly T[], uses: (item: T) => number): T | undefined {
  const weights = pool.map((item) => 1 / (1 + uses(item)));
  let roll = Math.random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i] ?? 0;
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Classic games (every category each round) never repeat a letter until the
 * whole alphabet has come up — a repeat there means re-typing last round's
 * sheet. Past that point, and in single mode (a fresh category each round
 * makes a repeat a new puzzle), repeats are only made rarer.
 */
export function drawLetter(state: GameState): string {
  const letters = getPack(state.settings.language).letters;
  const counts = new Map<string, number>();
  for (const l of state.usedLetters) counts.set(l, (counts.get(l) ?? 0) + 1);
  const unused = letters.filter((l) => !counts.has(l));
  if (state.settings.mode === 'classic' && unused.length > 0) {
    return unused[Math.floor(Math.random() * unused.length)] ?? 'A';
  }
  return drawWeighted(letters, (l) => counts.get(l) ?? 0) ?? 'A';
}

/** Single mode: draw the round's category, past picks proportionally less likely. */
export function drawCategory(state: GameState): CategoryDef | undefined {
  const counts = new Map<string, number>();
  for (const r of state.rounds) {
    for (const id of r.categoryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return drawWeighted(state.settings.categories, (c) => counts.get(c.id) ?? 0);
}

export function startNextRound(state: GameState): RoundState | null {
  // No-op past the configured round count, and while a round is still in
  // progress — so a double-tap on "Next round" cannot skip or add rounds.
  const current = state.rounds[state.rounds.length - 1];
  if (!state.settings.isEndless && state.rounds.length >= state.settings.roundCount) return null;
  if (current && current.phase !== 'done') return null;
  const letter = drawLetter(state);
  state.usedLetters.push(letter);
  const { mode, categories } = state.settings;
  const singleCategory = mode === 'single' ? drawCategory(state) : undefined;
  const categoryIds = singleCategory ? [singleCategory.id] : categories.map((c) => c.id);
  const round: RoundState = {
    index: state.rounds.length,
    letter,
    categoryIds,
    answers: [],
    phase: 'entry',
    activePlayerId: state.players[0]?.id ?? null,
  };
  state.rounds.push(round);
  state.currentRound = round.index;
  return round;
}

export function setAnswer(
  round: RoundState,
  playerId: string,
  categoryId: string,
  word: string,
): void {
  const existing = round.answers.find(
    (a) => a.playerId === playerId && a.categoryId === categoryId,
  );
  const trimmed = word.trim();
  if (existing) {
    existing.word = trimmed;
    existing.status = 'pending';
    existing.points = 0;
  } else if (trimmed !== '') {
    round.answers.push({ playerId, categoryId, word: trimmed, status: 'pending', points: 0 });
  }
}

/** Canonical form for comparing player words: trimmed, locale-lowercased. */
export function normalizeWord(word: string): string {
  return word.trim().toLocaleLowerCase();
}

/**
 * Normalized word with accents and other combining marks removed (é→e, ё→е,
 * Hebrew niqqud), and every Arabic alef form (أ إ آ ٱ) read as plain ا — kids
 * and keyboards write these interchangeably, and the round letters carry none.
 */
export function foldWord(word: string): string {
  return normalizeWord(word)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ٱ/gu, 'ا')
    .normalize('NFC');
}

/** Does the word start with the round letter (case- and accent-insensitive)? */
export function matchesLetter(word: string, letter: string): boolean {
  return foldWord(word).startsWith(foldWord(letter));
}

/** Why a word fails the round's basic rules before any lookup, or null when it passes them. */
export type LetterRuleFailure = 'short' | 'letter';

/** The rules every check applies first: a lone letter is never a word, and it must start with the letter. */
export function letterRuleFailure(word: string, letter: string): LetterRuleFailure | null {
  const trimmed = word.trim();
  if (trimmed.length < 2) return 'short';
  if (!matchesLetter(trimmed, letter)) return 'letter';
  return null;
}

/**
 * Why an answer scored nothing, for the results badge. Only the letter rules
 * reject a word automatically; any other rejection came from the group vote.
 */
export function invalidReason(word: string, letter: string): LetterRuleFailure | 'vote' {
  return letterRuleFailure(word, letter) ?? 'vote';
}

/** Leading definite articles that don't make a different word: Hebrew ה, Arabic ال. */
const ARTICLES = [
  { prefix: 'ال', minRest: 2 },
  { prefix: 'ה', minRest: 2 },
];

/**
 * Comparison keys for "did two players write the same word": folded, with
 * spaces and punctuation dropped (ice cream = ice-cream), plus the form
 * without a leading article (הכלב = כלב, الأسد = أسد).
 */
export function wordKeys(word: string): string[] {
  const base = foldWord(word).replace(/[\s\p{P}\p{S}]/gu, '');
  const keys = [base];
  for (const { prefix, minRest } of ARTICLES) {
    if (base.startsWith(prefix) && base.length - prefix.length >= minRest) {
      keys.push(base.slice(prefix.length));
    }
  }
  return keys;
}

/** Same word for scoring: any comparison key in common. */
export function isSameWord(a: string, b: string): boolean {
  const keysA = wordKeys(a);
  return wordKeys(b).some((k) => k !== '' && keysA.includes(k));
}

/**
 * Finish rank per player for speed scoring: 0 = fastest. Only a player with at
 * least one word still standing earns a rank — racing to submit an empty or
 * all-wrong sheet must not shave points off everyone else. Players without a
 * rank (no time, no valid word, bots) all share the last rank.
 */
function speedRanks(state: GameState, round: RoundState): Map<string, number> {
  const times = round.finishTimes ?? {};
  const hasValidWord = (playerId: string): boolean =>
    round.answers.some((a) => a.playerId === playerId && a.word !== '' && a.status !== 'invalid');
  const ranked = state.players
    .filter((p) => times[p.id] !== undefined && hasValidWord(p.id))
    .sort((a, b) => (times[a.id] ?? 0) - (times[b.id] ?? 0));
  const ranks = new Map<string, number>();
  ranked.forEach((p, i) => ranks.set(p.id, i));
  for (const p of state.players) if (!ranks.has(p.id)) ranks.set(p.id, ranked.length);
  return ranks;
}

/** Points for a valid word (any valid word in 'simple' scoring, unique ones in 'unique'). */
const VALID_POINTS = 10;
/** Points when another player wrote the same word ('unique' scoring only). */
const SHARED_POINTS = 5;
/** speedScoring never drops a valid word below this. */
const MIN_SPEED_POINTS = 1;

/**
 * Assign points after validity was decided (answers with status 'invalid' stay 0).
 * unique: unique valid word 10, shared valid word 5. simple: any valid word 10.
 * speedScoring: each finish rank after the fastest loses 1 point, never below 1.
 */
export function scoreRound(state: GameState, round: RoundState): void {
  const { scoring, hasSpeedScoring } = state.settings;
  const ranks = hasSpeedScoring === true ? speedRanks(state, round) : null;
  for (const categoryId of round.categoryIds) {
    const inCategory = round.answers.filter((a) => a.categoryId === categoryId);
    for (const answer of inCategory) {
      if (answer.status === 'invalid' || answer.word === '') {
        answer.points = 0;
        continue;
      }
      const sameWord = inCategory.filter(
        (o) => o !== answer && o.status !== 'invalid' && isSameWord(o.word, answer.word),
      );
      if (scoring === 'unique' && sameWord.length > 0) {
        answer.status = 'shared';
        answer.points = SHARED_POINTS;
      } else {
        answer.status = 'valid';
        answer.points = VALID_POINTS;
      }
      if (ranks) {
        answer.points = Math.max(
          answer.points - (ranks.get(answer.playerId) ?? 0),
          MIN_SPEED_POINTS,
        );
      }
    }
  }
  round.phase = 'done';
}

export function totalScores(state: GameState): Map<string, number> {
  const totals = new Map<string, number>();
  for (const p of state.players) totals.set(p.id, 0);
  for (const round of state.rounds) {
    for (const a of round.answers) {
      totals.set(a.playerId, (totals.get(a.playerId) ?? 0) + a.points);
    }
  }
  return totals;
}

/** Points each player earned in one round — the "+N" next to their total. */
export function roundPoints(state: GameState, round: RoundState): Map<string, number> {
  const points = new Map<string, number>();
  for (const p of state.players) points.set(p.id, 0);
  for (const a of round.answers) points.set(a.playerId, (points.get(a.playerId) ?? 0) + a.points);
  return points;
}

/**
 * Players holding the best total. Nobody wins while nobody has scored (a 0–0
 * table has no winner, and no crowns).
 */
export function winnerIds(state: GameState): string[] {
  const totals = totalScores(state);
  const top = Math.max(0, ...totals.values());
  if (top <= 0) return [];
  return state.players.filter((p) => totals.get(p.id) === top).map((p) => p.id);
}

/** A win on the family leaderboard needs someone to beat — solo games never count one. */
export function countsAsWin(state: GameState, playerId: string): boolean {
  return state.players.length > 1 && winnerIds(state).includes(playerId);
}

/** Each human player's result as it stands now — what the leaderboard should hold for this game. */
export function currentResults(state: GameState): RecordedResult[] {
  const totals = totalScores(state);
  return state.players
    .filter((p) => p.isBot !== true)
    .map((p) => ({ playerId: p.id, points: totals.get(p.id) ?? 0, won: countsAsWin(state, p.id) }));
}

/**
 * What ending this game adds to lifetime stats. The first end adds a whole
 * game; a revived game ("one more round") ending again only moves points and
 * wins by the difference from what it recorded last time.
 */
export function statsChanges(state: GameState): StatsChange[] {
  // Saved before results were tracked: already counted, and no baseline to diff.
  if (state.hasRecordedStats === true && state.recordedResults === undefined) return [];
  const previous = new Map((state.recordedResults ?? []).map((r) => [r.playerId, r]));
  return currentResults(state)
    .map((now) => {
      const before = previous.get(now.playerId);
      return {
        playerId: now.playerId,
        games: before ? 0 : 1,
        wins: Number(now.won) - Number(before?.won ?? false),
        points: now.points - (before?.points ?? 0),
      };
    })
    .filter((c) => c.games !== 0 || c.wins !== 0 || c.points !== 0);
}

/**
 * Which screen a loaded (resumed/restored) game should open on. Scoreboard is
 * strictly the end-of-game screen (mounting it finalizes the game), so an
 * unfinished game with a scored round reopens on Review — it has the
 * "next round" / "see scores" actions.
 */
export function screenForGame(state: GameState): Screen {
  if (state.status === 'finished' || isFinished(state)) return 'scoreboard';
  const current = state.rounds[state.currentRound];
  if (!current || current.phase === 'entry') return 'round';
  return 'review';
}

export function isFinished(state: GameState): boolean {
  if (state.settings.isEndless) return false; // ends only when someone taps "See scores"
  return state.rounds.filter((r) => r.phase === 'done').length >= state.settings.roundCount;
}

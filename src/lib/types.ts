/** Core game domain types — the shared contract for all screens and services. */

export type LanguageCode = string; // BCP-47-ish short code: 'en', 'he', ...

/**
 * classic: one letter per round, players fill ALL categories (usual gameplay).
 * single: one letter + ONE category per round.
 */
export type GameMode = 'classic' | 'single';

/**
 * unique: valid unique answer = 10, valid but shared with another player = 5, invalid = 0.
 * simple: any valid answer = 10.
 */
export type ScoringSystem = 'unique' | 'simple';

/** Word checking strategy (advanced settings can change it; 'none' = don't check). */
export type ValidationMode = 'hybrid' | 'bundled' | 'dictionary' | 'vote' | 'none';

/**
 * Remote games: where a word nothing could check gets voted on.
 * host: the group decides together on the shared screen.
 * devices: every player taps yes/no on their own phone; half or more yes counts.
 */
export type VoteMode = 'host' | 'devices';

export interface CategoryDef {
  id: string;
  /** i18n key for built-in categories (resolved via language pack). */
  nameKey?: string;
  /** User-created category name (advanced settings). */
  customName?: string;
  emoji?: string;
}

export interface PlayerDef {
  id: string;
  name: string;
  /** 1..8 — maps to --color-player-N token. */
  colorIndex: number;
  /** Emoji, or a ≤512px data-URL image; absent = show the name's first letter. */
  avatar?: string;
  /** true = the app plays this player's turns automatically. */
  isBot?: boolean;
  /** Remote guests: stable per-browser key so the same device reclaims its seat on reconnect. */
  deviceId?: string;
}

/** A remembered family member: quick-pick in setup, rows on the leaderboard. */
export interface PlayerProfile {
  /** Normalized (trimmed, lowercased) name — the natural family-wide key. */
  key: string;
  /** Display name as last typed. */
  name: string;
  avatar?: string;
  gamesPlayed: number;
  wins: number;
  totalPoints: number;
  updatedAt: number;
}

export interface GameSettings {
  language: LanguageCode;
  mode: GameMode;
  scoring: ScoringSystem;
  validation: ValidationMode;
  categories: CategoryDef[];
  roundCount: number;
  /** true = ignore roundCount and keep playing until someone taps "See scores". */
  isEndless?: boolean;
  /** false = skip the online Wikidata category-fit check (it can be slow). */
  hasWikidataCheck?: boolean;
  /** false = no "did you know" word fact on the review screen. */
  hasFunFacts?: boolean;
  /** true = finish rank shaves points: fastest keeps full value, each later rank −1, floor 1. */
  hasSpeedScoring?: boolean;
  /** null = no timer. */
  timerSeconds: number | null;
  /** true = players answer on their own devices via a P2P room (host screen orchestrates). */
  isRemote?: boolean;
  /** Remote games: the room's join code, so a reloaded host can reopen the room. */
  roomCode?: string;
  /** Remote games: where unknown words are voted on (absent = shared screen). */
  voteMode?: VoteMode;
}

export type AnswerStatus = 'pending' | 'valid' | 'shared' | 'invalid';

export interface AnswerEntry {
  playerId: string;
  categoryId: string;
  word: string;
  status: AnswerStatus;
  points: number;
}

export type RoundPhase = 'entry' | 'review' | 'done';

export interface RoundState {
  index: number;
  letter: string;
  /** Categories in play this round (one entry in 'single' mode). */
  categoryIds: string[];
  answers: AnswerEntry[];
  phase: RoundPhase;
  /** Which player is currently entering words (pass-&-play), null = simultaneous/host. */
  activePlayerId: string | null;
  /** Remote mode: players who already sent their answers this round. */
  submittedIds?: string[];
  /**
   * Epoch ms when the current entry turn began (whole round in remote mode).
   * Persisted so a reload resumes the countdown from the wall clock instead of
   * restarting it; cleared on pass-and-play handoff.
   */
  turnStartedAt?: number;
  /** ms each player took to finish entering answers — feeds speed scoring. */
  finishTimes?: Record<string, number>;
}

export type GameStatus = 'setup' | 'playing' | 'finished';

export interface GameState {
  id: string;
  createdAt: number;
  updatedAt: number;
  settings: GameSettings;
  players: PlayerDef[];
  rounds: RoundState[];
  currentRound: number;
  usedLetters: string[];
  status: GameStatus;
  /** Lifetime stats already landed — a game revived with "one more round" isn't counted twice. */
  hasRecordedStats?: boolean;
}

/** Summary row shown in the Resume list (cheap to read, no full state). */
export interface SaveSummary {
  id: string;
  updatedAt: number;
  playerNames: string[];
  roundsPlayed: number;
  roundCount: number;
  isEndless: boolean;
  language: LanguageCode;
  status: GameStatus;
  /** Remote (P2P) games can't be resumed — guests would need to rejoin. */
  isRemote: boolean;
}

export type Screen =
  | 'home'
  | 'new-game'
  | 'join'
  | 'resume'
  | 'round'
  | 'review'
  | 'scoreboard'
  | 'learned'
  | 'leaderboard';

/** A language pack bundles UI strings + game content for one language. */
export interface LanguagePack {
  code: LanguageCode;
  /** Native display name, e.g. "English", "עברית". */
  name: string;
  dir: 'ltr' | 'rtl';
  /** Letters the round wheel may draw. */
  letters: string[];
  /** UI strings. */
  ui: Record<string, string>;
  /** Built-in category names by nameKey. */
  categoryNames: Record<string, string>;
}

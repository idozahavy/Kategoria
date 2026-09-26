/**
 * A phone's seat in a phones-join room, remembered per browser tab
 * (sessionStorage) so a reload — or the mobile browser discarding the tab —
 * rejoins the room instead of landing on Home. The words typed in the current
 * round ride along, so the rejoin doesn't wipe them.
 *
 * sessionStorage, not localStorage: the seat belongs to this tab only. A
 * second tab on the same device is a different player (or the host).
 */

const SESSION_KEY = 'categories-guest';
const DRAFT_KEY = 'categories-guest-draft';

export interface GuestSeat {
  code: string;
  name: string;
  avatar?: string;
}

export interface GuestDraft {
  code: string;
  roundIndex: number;
  answers: Record<string, string>;
  /** What was sent to the host, once the player tapped Done (resent on rejoin). */
  sent: Record<string, string> | null;
}

function read(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null; // storage unavailable or a corrupt entry: nothing remembered
  }
}

function write(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable — a reload just won't rejoin on its own
  }
}

function remove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // storage unavailable — nothing was stored
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isWordMap(v: unknown): v is Record<string, string> {
  return isRecord(v) && Object.values(v).every((w) => typeof w === 'string');
}

export function readGuestSeat(): GuestSeat | null {
  const s = read(SESSION_KEY);
  if (!isRecord(s) || typeof s['code'] !== 'string' || typeof s['name'] !== 'string') return null;
  if (s['code'] === '' || s['name'] === '') return null;
  return {
    code: s['code'],
    name: s['name'],
    avatar: typeof s['avatar'] === 'string' ? s['avatar'] : undefined,
  };
}

export function rememberGuestSeat(seat: GuestSeat): void {
  write(SESSION_KEY, seat);
}

/** Left the room, or the game ended: the next reload starts fresh. */
export function forgetGuestSeat(): void {
  remove(SESSION_KEY);
  remove(DRAFT_KEY);
}

/** The words saved for this room's round, if any. */
export function readGuestDraft(code: string, roundIndex: number): GuestDraft | null {
  const d = read(DRAFT_KEY);
  if (!isRecord(d) || d['code'] !== code || d['roundIndex'] !== roundIndex) return null;
  const answers = d['answers'];
  const sent = d['sent'];
  if (!isWordMap(answers) || (sent !== null && !isWordMap(sent))) return null;
  return { code, roundIndex, answers, sent };
}

export function saveGuestDraft(draft: GuestDraft): void {
  write(DRAFT_KEY, draft);
}

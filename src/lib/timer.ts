/** Round countdown pacing: when the timer turns orange, then red, and when phones buzz. */

export type TimerStage = 'calm' | 'hurry' | 'final';

/** The last seconds: red, pulsing, ticking and buzzing. */
export const FINAL_SECONDS = 10;
/** Of those, the ones that also buzz on every second. */
const BUZZ_EVERY_SECOND_FROM = 5;

/** Buzz lengths (ms): a nudge when the timer turns orange, a firmer one on red, a tap per last second. */
const HURRY_BUZZ_MS = 60;
const FINAL_BUZZ_MS = 120;
const SECOND_BUZZ_MS = 40;
/** Time's up: two firm pulses. */
export const TIME_UP_BUZZ: number[] = [200, 100, 200];

/**
 * calm until the last third of the turn (never shorter than twice the final
 * stretch, so a 60 s timer still gets a warning phase), hurry after that, and
 * final for the last FINAL_SECONDS.
 */
export function timerStage(left: number, total: number): TimerStage {
  if (left <= FINAL_SECONDS) return 'final';
  if (left <= Math.max(total / 3, FINAL_SECONDS * 2)) return 'hurry';
  return 'calm';
}

/** Vibration for the tick that just showed `left` seconds; 0 = stay still. */
export function timerBuzz(left: number, total: number): number {
  if (left <= 0 || left >= total) return 0;
  const stage = timerStage(left, total);
  const previous = timerStage(left + 1, total);
  if (stage === 'hurry' && previous === 'calm') return HURRY_BUZZ_MS;
  if (stage === 'final' && previous !== 'final') return FINAL_BUZZ_MS;
  if (left <= BUZZ_EVERY_SECOND_FROM) return SECOND_BUZZ_MS;
  return 0;
}

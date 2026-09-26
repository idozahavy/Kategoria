import { describe, expect, it } from 'vitest';

import { timerBuzz, timerStage } from './timer';

describe('timerStage', () => {
  it('turns to hurry for the last third, and final for the last 10 seconds', () => {
    expect(timerStage(120, 180)).toBe('calm');
    expect(timerStage(60, 180)).toBe('hurry');
    expect(timerStage(10, 180)).toBe('final');
  });

  it('gives a short timer a warning phase of at least 20 seconds', () => {
    expect(timerStage(21, 60)).toBe('calm');
    expect(timerStage(20, 60)).toBe('hurry');
  });
});

describe('timerBuzz', () => {
  it('buzzes once entering hurry, once entering final, then every last-5 second', () => {
    const buzzes = Array.from({ length: 60 }, (_, i) => 60 - i).filter(
      (left) => timerBuzz(left, 60) > 0,
    );
    expect(buzzes).toEqual([20, 10, 5, 4, 3, 2, 1]);
  });

  it('stays still at the start and at zero (time-up has its own buzz)', () => {
    expect(timerBuzz(60, 60)).toBe(0);
    expect(timerBuzz(0, 60)).toBe(0);
  });
});

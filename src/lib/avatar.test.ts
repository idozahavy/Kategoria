import { describe, expect, it } from 'vitest';

import { colorIndexForKey } from './avatar';

describe('colorIndexForKey', () => {
  it('always gives the same person the same color in range 1..8', () => {
    for (const key of ['ida', 'noam', 'מאיה', 'أحمد', '']) {
      const color = colorIndexForKey(key);
      expect(color).toBe(colorIndexForKey(key));
      expect(color).toBeGreaterThanOrEqual(1);
      expect(color).toBeLessThanOrEqual(8);
    }
  });

  it('spreads different names over several colors', () => {
    const colors = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(colorIndexForKey));
    expect(colors.size).toBeGreaterThan(3);
  });
});

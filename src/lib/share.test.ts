import { describe, expect, it, vi } from 'vitest';

import { resultsText, shareText } from './share';

describe('resultsText', () => {
  it('crowns winners, ranks the rest and ends with the link', () => {
    const text = resultsText(
      'We played!',
      [
        { name: 'Maya', score: 42, isWinner: true },
        { name: 'Noam', score: 38, isWinner: false },
      ],
      'https://example.test/',
    );
    expect(text).toBe('We played!\n\n👑 Maya · 42\n2. Noam · 38\n\nhttps://example.test/');
  });

  it('crowns every tied winner', () => {
    const text = resultsText(
      'h',
      [
        { name: 'A', score: 10, isWinner: true },
        { name: 'B', score: 10, isWinner: true },
      ],
      'u',
    );
    expect(text).toContain('👑 A · 10\n👑 B · 10');
  });
});

describe('shareText', () => {
  it('uses the share sheet when there is one', async () => {
    const share = vi.fn(() => Promise.resolve());
    expect(await shareText('hi', { share })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('treats a closed share sheet as cancelled, not copied', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const share = vi.fn(() => Promise.reject(new DOMException('closed', 'AbortError')));
    expect(await shareText('hi', { share, clipboard: { writeText } })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when sharing is refused', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const share = vi.fn(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    expect(await shareText('hi', { share, clipboard: { writeText } })).toBe('copied');
  });

  it('copies when there is no share sheet', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    expect(await shareText('hi', { clipboard: { writeText } })).toBe('copied');
  });

  it('reports failure instead of throwing when nothing works', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    expect(await shareText('hi', { clipboard: { writeText } })).toBe('failed');
    expect(await shareText('hi', {})).toBe('failed');
  });
});

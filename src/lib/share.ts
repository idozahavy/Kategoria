/** A final-standings line for the shared summary. */
export interface ShareRow {
  name: string;
  score: number;
  isWinner: boolean;
}

/** How a share attempt ended — drives the button's feedback. */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Plain-text game summary for a chat message: a heading, one line per player
 * (crown for the winners, rank for the rest) and a link back to the game.
 */
export function resultsText(heading: string, rows: readonly ShareRow[], url: string): string {
  const lines = rows.map((row, i) => {
    const mark = row.isWinner ? '👑' : `${String(i + 1)}.`;
    return `${mark} ${row.name} · ${String(row.score)}`;
  });
  return [heading, '', ...lines, '', url].join('\n');
}

/** The slice of `navigator` sharing needs — injectable for tests. */
export interface ShareTarget {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

/**
 * Hand the text to the phone's share sheet, or copy it where there is none
 * (most desktop browsers). Never throws: every path ends in an outcome.
 */
export async function shareText(
  text: string,
  target: ShareTarget = navigator,
): Promise<ShareOutcome> {
  if (typeof target.share === 'function') {
    try {
      await target.share({ text });
      return 'shared';
    } catch (err) {
      // Closing the share sheet rejects with AbortError — not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Anything else (e.g. NotAllowedError): fall through to the clipboard.
    }
  }
  if (target.clipboard) {
    try {
      await target.clipboard.writeText(text);
      return 'copied';
    } catch (err) {
      console.error('share: clipboard write failed', err);
    }
  }
  return 'failed';
}

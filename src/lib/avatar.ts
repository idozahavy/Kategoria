/** Player avatar helpers: emoji presets and custom-image downscaling. */

/** Kid-friendly picks shown in the avatar picker. */
export const AVATAR_EMOJI = [
  '🦁',
  '🐼',
  '🦊',
  '🐸',
  '🦄',
  '🐙',
  '🦖',
  '🐧',
  '🐯',
  '🐰',
  '🐶',
  '🐱',
  '🐵',
  '🤖',
  '👾',
  '🦋',
];

/** Longest edge of a stored custom image — keeps saves and rendering small. */
const AVATAR_MAX_SIZE = 512;
/** Lossy-compression quality for stored avatars — small files, no visible loss at 512px. */
const AVATAR_QUALITY = 0.85;

/**
 * Downscale an uploaded image to ≤512px on its longest edge and return it as a
 * compressed data URL, or null when the file can't be read as an image.
 */
export async function fileToAvatar(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, AVATAR_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    // toDataURL silently falls back to PNG when a codec is unsupported — prefer
    // WebP, then JPEG, so a photo never lands as a megabyte-scale PNG.
    const webp = canvas.toDataURL('image/webp', AVATAR_QUALITY);
    return webp.startsWith('data:image/webp')
      ? webp
      : canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
  } catch {
    return null; // not a decodable image — caller just keeps the old avatar
  }
}

/** How many --color-player-N tokens exist. */
const PLAYER_COLOR_COUNT = 8;

/**
 * A stable player color (1..8) for a leaderboard name key: the same person
 * keeps one color however the ranking shifts (FNV-1a hash of the key).
 */
export function colorIndexForKey(key: string): number {
  let hash = 0x811c9dc5;
  for (const ch of key) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % PLAYER_COLOR_COUNT) + 1;
}

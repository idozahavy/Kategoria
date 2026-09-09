/**
 * KB of font files (woff2) the service worker precaches on install, read
 * from the workbox manifest in dist/sw.js. Prints one bare number.
 *
 * Usage: node bench/sw-fonts.mjs   (run `npm run build` first)
 */
import { readFileSync, statSync } from 'node:fs';

const sw = readFileSync('dist/sw.js', 'utf8');
const files = [...sw.matchAll(/url:"(assets\/[^"]+\.woff2)"/g)].map((m) => m[1]);
if (files.length === 0) {
  console.error('no woff2 entries in dist/sw.js - run npm run build first');
  process.exit(1);
}
const bytes = files.reduce((sum, f) => sum + statSync(`dist/${f}`).size, 0);
console.log(Math.round(bytes / 1024));

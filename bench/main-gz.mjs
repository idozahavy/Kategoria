/**
 * Gzip size (KB, rounded) of the main JS chunk in dist/assets - what a first
 * visit actually downloads (Cloudflare Pages serves brotli, which is ~10% smaller).
 * Prints one bare number so perf-baseline.json / CHECK MODE can read it.
 *
 * Usage: node bench/main-gz.mjs   (run `npm run build` first)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const dir = 'dist/assets';
const main = readdirSync(dir).find((n) => /^index-.*\.js$/.test(n));
if (!main) {
  console.error('no dist/assets/index-*.js - run npm run build first');
  process.exit(1);
}
console.log(Math.round(gzipSync(readFileSync(`${dir}/${main}`)).length / 1024));

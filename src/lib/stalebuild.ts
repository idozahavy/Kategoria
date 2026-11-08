/**
 * A tab still running an earlier deploy can ask for a lazy chunk (PeerJS, a
 * language pack, a word list) that the current deploy no longer serves — the
 * service worker drops the old files as soon as the new version activates.
 * The browser then fails that import for the rest of the page's life, so
 * phones-join would fail on every try ("check your internet") until a manual
 * reload, which an installed app doesn't even offer. Reloading picks up the
 * current build. The cooldown stops a reload loop when the chunk is missing
 * for another reason (offline without a cached copy).
 */

const RELOAD_KEY = 'categories-build-reload';
const RELOAD_COOLDOWN_MS = 60_000;

/** Reloads the page for the current build; false when it reloaded too recently to try again. */
export function reloadForNewBuild(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false; // no session storage: no way to stop a loop, so don't start one
  }
  location.reload();
  return true;
}

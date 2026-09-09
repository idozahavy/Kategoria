import { readStorage, writeStorage } from './storage';
import type { CategoryDef } from './types';

/**
 * Remembers the category set-up between games — which categories were picked
 * and the ones the family typed themselves — so the next New Game starts from
 * the previous set instead of the factory defaults.
 */

export interface CategoryPrefs {
  selectedIds: string[];
  custom: CategoryDef[];
}

const PREFS_KEY = 'categories-setup-categories';
/** Longest custom category name the setup screen accepts. */
export const MAX_CATEGORY_NAME_LENGTH = 24;
const MAX_CUSTOM_CATEGORIES = 50;
const MAX_ID_LENGTH = 64;
const MAX_EMOJI_LENGTH = 8;

/** Only well-formed custom categories survive a read; ids are deduplicated. */
function parseCustom(raw: unknown): CategoryDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const custom: CategoryDef[] = [];
  for (const item of raw) {
    if (custom.length >= MAX_CUSTOM_CATEGORIES) break;
    if (typeof item !== 'object' || item === null) continue;
    const { id, customName, emoji } = item as Record<string, unknown>;
    if (typeof id !== 'string' || id === '' || id.length > MAX_ID_LENGTH || seen.has(id)) continue;
    if (typeof customName !== 'string') continue;
    const name = customName.trim();
    if (name === '' || name.length > MAX_CATEGORY_NAME_LENGTH) continue;
    seen.add(id);
    const def: CategoryDef = { id, customName: name };
    if (typeof emoji === 'string' && emoji !== '' && emoji.length <= MAX_EMOJI_LENGTH) {
      def.emoji = emoji;
    }
    custom.push(def);
  }
  return custom;
}

/**
 * The remembered set-up, with anything unknown (a retired builtin id, a
 * malformed entry) dropped. Null when nothing usable was saved.
 */
export function readCategoryPrefs(builtinIds: readonly string[]): CategoryPrefs | null {
  const raw = readStorage(PREFS_KEY);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { selectedIds, custom: rawCustom } = parsed as Record<string, unknown>;
  const custom = parseCustom(rawCustom);
  const known = new Set([...builtinIds, ...custom.map((c) => c.id)]);
  const selected = Array.isArray(selectedIds)
    ? [
        ...new Set(
          selectedIds.filter((id): id is string => typeof id === 'string' && known.has(id)),
        ),
      ]
    : [];
  if (selected.length === 0 && custom.length === 0) return null;
  return { selectedIds: selected, custom };
}

/** Remember the set a game just started with. Never throws. */
export function writeCategoryPrefs(prefs: CategoryPrefs): void {
  writeStorage(
    PREFS_KEY,
    JSON.stringify({
      selectedIds: [...prefs.selectedIds],
      custom: prefs.custom.map((c) => ({ ...c })),
    }),
  );
}

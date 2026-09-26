// Shared token-resolution helpers used by build-style-guide.mjs, verify-design.mjs
// and codemods/hex-to-token.mjs. Plain ESM, zero dependencies.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REF_RE = /^\{(.+)\}$/;

/** Read + JSON.parse a file, throwing a friendlier error on failure. */
export function readJson(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${err.message}`);
  }
}

/** Get design/ dir given a script's import.meta.url (script lives in design/scripts or design/scripts/codemods). */
export function findDesignRoot(scriptDir) {
  // Walk up until we find a directory containing tokens.json
  let dir = scriptDir;
  for (let i = 0; i < 5; i++) {
    try {
      readFileSync(path.join(dir, 'tokens.json'));
      return dir;
    } catch {
      dir = path.dirname(dir);
    }
  }
  throw new Error('Could not locate design/tokens.json from ' + scriptDir);
}

/** Look up a dot-path like "color.primitive.teal-600" inside the raw tokens tree. */
function getByPath(tree, dotPath) {
  const parts = dotPath.split('.');
  let node = tree;
  for (const part of parts) {
    if (node == null || typeof node !== 'object' || !(part in node)) {
      return undefined;
    }
    node = node[part];
  }
  return node;
}

/**
 * Resolve a single token node's $value, following {references} recursively.
 * `tree` is the full raw tokens.json root object.
 */
function resolveValue(value, tree, seen) {
  if (typeof value === 'string') {
    const m = value.match(REF_RE);
    if (m) {
      const refPath = m[1].trim();
      if (seen.has(refPath)) {
        throw new Error(`Circular token reference detected at ${refPath}`);
      }
      const node = getByPath(tree, refPath);
      if (node === undefined) {
        throw new Error(`Unresolved token reference: {${refPath}}`);
      }
      const nextSeen = new Set(seen);
      nextSeen.add(refPath);
      const nodeValue = node && typeof node === 'object' && '$value' in node ? node.$value : node;
      return resolveValue(nodeValue, tree, nextSeen);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveValue(v, tree, seen));
  }
  if (value && typeof value === 'object') {
    // shadow-like composite value: resolve each field
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveValue(v, tree, seen);
    }
    return out;
  }
  return value;
}

/**
 * Walk the whole tokens tree, producing a flat map of dot-path -> resolved value
 * for every leaf token (an object carrying "$value").
 */
export function flattenAndResolve(tokens) {
  const flat = {};
  const errors = [];

  function walk(node, prefix) {
    if (node == null || typeof node !== 'object') return;
    if ('$value' in node) {
      try {
        flat[prefix] = resolveValue(node.$value, tokens, new Set([prefix]));
      } catch (err) {
        errors.push({ path: prefix, message: err.message });
      }
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$')) continue;
      if (child && typeof child === 'object') {
        walk(child, prefix ? `${prefix}.${key}` : key);
      }
    }
  }

  walk(tokens, '');
  return { flat, errors };
}

/** Semantic color key -> CSS variable name suffix (without leading --). */
export const COLOR_VAR_MAP = {
  bg: 'color-bg',
  surface: 'color-surface',
  text: 'color-text',
  muted: 'color-muted',
  border: 'color-border',
  'border-strong': 'color-border-strong',
  primary: 'color-primary',
  'primary-edge': 'color-primary-edge',
  'on-primary': 'color-on-primary',
  accent: 'color-accent',
  'accent-edge': 'color-accent-edge',
  'on-accent': 'color-on-accent',
  warning: 'color-warning',
  'on-warning': 'color-on-warning',
  success: 'color-success',
  'on-success': 'color-on-success',
  danger: 'color-danger',
  'danger-edge': 'color-danger-edge',
  'on-danger': 'color-on-danger',
  focus: 'color-focus',
  scrim: 'color-scrim',
  'player-1': 'color-player-1',
  'player-2': 'color-player-2',
  'player-3': 'color-player-3',
  'player-4': 'color-player-4',
  'player-5': 'color-player-5',
  'player-6': 'color-player-6',
  'player-7': 'color-player-7',
  'player-8': 'color-player-8',
};

/** Contrast pairs to verify in each theme: [textKey, bgKey]. */
export const CONTRAST_PAIRS = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['on-primary', 'primary'],
  ['on-accent', 'accent'],
  ['on-success', 'success'],
  ['on-danger', 'danger'],
  ['on-warning', 'warning'],
];

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const int = parseInt(full, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function srgbChannel(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

export function isHexColor(value) {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/** WCAG contrast ratio between two hex colors, 1..21. */
export function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Build the full flat set of CSS custom properties (name -> value string) for a theme's semantic colors. */
export function buildColorVars(flat, theme) {
  const vars = {};
  for (const [key, varSuffix] of Object.entries(COLOR_VAR_MAP)) {
    const tokenPath = `color.${theme}.${key}`;
    if (tokenPath in flat) {
      vars[`--${varSuffix}`] = flat[tokenPath];
    }
  }
  return vars;
}

function quoteFontName(name) {
  return /[\s]/.test(name) && !name.startsWith('"') ? `"${name}"` : name;
}

/** Build the non-color, theme-independent CSS custom properties. */
export function buildBaseVars(flat) {
  const vars = {};

  // Spacing
  for (const key of ['1', '2', '3', '4', '5', '6', '7']) {
    const p = `space.${key}`;
    if (p in flat) vars[`--space-${key}`] = flat[p];
  }

  // Radius
  for (const key of ['sm', 'md', 'lg', 'pill']) {
    const p = `radius.${key}`;
    if (p in flat) vars[`--radius-${key}`] = flat[p];
  }

  // Border
  if ('border.width' in flat) vars['--border-width'] = flat['border.width'];
  if ('border.edge-width' in flat) vars['--border-edge-width'] = flat['border.edge-width'];

  // Size (touch targets, illustration emoji)
  for (const key of ['touch', 'touch-chip', 'illustration', 'illustration-sm']) {
    const p = `size.${key}`;
    if (p in flat) vars[`--size-${key}`] = flat[p];
  }

  // Shadow
  if ('shadow.card' in flat) {
    const s = flat['shadow.card'];
    vars['--shadow-card'] = `${s.offsetX} ${s.offsetY} ${s.blur} ${s.color}`;
  }

  // Z-index
  for (const key of ['base', 'sticky', 'overlay', 'modal', 'toast']) {
    const p = `z.${key}`;
    if (p in flat) vars[`--z-${key}`] = String(flat[p]);
  }

  // Typography
  if ('typography.family.base' in flat) {
    const families = flat['typography.family.base'];
    vars['--font-family-base'] = (Array.isArray(families) ? families : [families])
      .map(quoteFontName)
      .join(', ');
  }
  for (const key of ['display', 'h1', 'h2', 'body', 'small']) {
    const p = `typography.size.${key}`;
    if (p in flat) vars[`--font-size-${key}`] = flat[p];
  }
  for (const key of ['display', 'heading', 'subheading', 'body']) {
    const p = `typography.weight.${key}`;
    if (p in flat) vars[`--font-weight-${key}`] = String(flat[p]);
  }
  for (const key of ['display', 'h1', 'h2', 'body', 'small']) {
    const p = `typography.lineHeight.${key}`;
    if (p in flat) vars[`--line-height-${key}`] = String(flat[p]);
  }

  // Motion
  for (const key of ['fast', 'press', 'enter', 'pulse']) {
    const p = `motion.duration.${key}`;
    if (p in flat) vars[`--duration-${key}`] = flat[p];
  }
  if ('motion.easing.spring' in flat) {
    vars['--easing-spring'] = `cubic-bezier(${flat['motion.easing.spring'].join(', ')})`;
  }
  if ('motion.easing.standard' in flat) {
    vars['--easing-standard'] = `cubic-bezier(${flat['motion.easing.standard'].join(', ')})`;
  }

  return vars;
}

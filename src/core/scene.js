// Turns a screen's config plus the data its script produced into concrete draw
// instructions.
//
// This is the layer that makes a screen definable in JSON. The config says
// "put this value on row 40, right-aligned, green if it's up" and this module
// works out pixel positions, text widths, truncation and colours.

import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, resolve as resolvePath, basename } from 'node:path';
import {
  alignX,
  fitText,
  measureText,
  fontHeight,
  fontBottomExtent,
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
} from './text.js';
import { SMALL_FONT, unsupportedSmallChars } from './text.js';
import { resolve, applyFormat, resolveColor } from './template.js';
import { helpers } from './format.js';

const DEFAULT_LABEL_COLOR = '#FFFFFF';
const DEFAULT_VALUE_COLOR = '#00FFAA';
const DEFAULT_FONT = 2;
const DEFAULT_FALLBACK = '-';

// Backgrounds are small and change rarely; re-reading them every rotation is
// pointless work.
const gifCache = new Map();

/**
 * Build the scene for one screen.
 *
 * @param {object} screen  the loaded screen (config + optional render module)
 * @param {object} context { data, fetchedAt, palette, brightness, assetDirs }
 */
export function buildScene(screen, context) {
  // A screen with render.js takes over layout entirely — the escape hatch for
  // anything the config can't express.
  const spec = screen.render
    ? screen.render({
        data: context.data,
        config: screen.config,
        fetchedAt: context.fetchedAt,
        helpers,
      })
    : screen.config;

  // "textMode": "small" swaps the renderer for the whole screen, so every
  // measurement below has to use the small font's metrics too. Per-item font
  // choices are ignored rather than silently mismeasured — the two renderers
  // draw into different layers and can't be mixed within one screen.
  const small = (spec.textMode ?? screen.config.textMode) === 'small';
  const inner = small ? { ...context, forceFont: SMALL_FONT } : context;

  const items = [
    ...expandRows(spec.rows, inner),
    ...toArray(spec.items).map((item) => buildItem(item, inner)),
  ].filter(Boolean);

  return {
    small,
    background: resolveBackground(spec.background ?? screen.config.background, spec, context),
    brightness: spec.brightness ?? screen.config.brightness ?? context.brightness,
    items,
    // Surfaced by `npm run preview` — catching a vertical collision here beats
    // discovering it on the device from across the room.
    warnings: [...findOverlaps(items), ...(small ? findMissingGlyphs(items) : [])],
  };
}

/**
 * Two lines whose glyphs occupy the same rows will visibly collide. Font
 * heights are approximate, so this warns rather than adjusting anything.
 */
function findOverlaps(items) {
  const warnings = [];
  const sorted = [...items].sort((a, b) => a.y - b.y);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.y === next.y) continue; // same line, side by side — fine
    const bottom = current.y + fontHeight(current.font);
    if (bottom > next.y) {
      warnings.push(
        `"${current.text}" (y=${current.y}, font ${current.font}, ~${fontHeight(current.font)}px tall) ` +
          `runs into "${next.text}" at y=${next.y}`
      );
    }
  }

  // Clipping is governed by the text box, not the ink, so this uses the larger
  // of the two measurements.
  for (const item of sorted) {
    const lowest = DISPLAY_HEIGHT - fontBottomExtent(item.font);
    if (item.y > lowest) {
      warnings.push(
        `"${item.text}" at y=${item.y} will clip against the bottom — ` +
          `the lowest usable row for font ${item.font} is y=${lowest}`
      );
    }
  }

  return warnings;
}

/**
 * The small font has no glyph for a handful of characters — they draw as blank
 * space rather than failing, which looks like a layout bug rather than a
 * missing character.
 */
function findMissingGlyphs(items) {
  const missing = new Set();
  for (const item of items) {
    for (const char of unsupportedSmallChars(item.text)) missing.add(char);
  }
  if (missing.size === 0) return [];
  return [
    `the small font has no glyph for ${[...missing].map((c) => `"${c}"`).join(', ')} — ` +
      `they will draw as blank space`,
  ];
}

// ── Adaptive styling ──────────────────────────────────────────────────────

/**
 * Pick a style variant based on the value being drawn.
 *
 * This is the "938 vs 1.2K vs 16.9M need different treatment" problem: rules
 * are tested in order and the first match wins, so put the most specific first
 * and finish with a bare rule as the fallback.
 *
 *   "adapt": [
 *     { "if": { "maxChars": 3 }, "valueFont": 4 },
 *     { "if": { "under": 1000000 }, "valueFont": 2 },
 *     { "valueFont": 1 }
 *   ]
 */
function applyAdapt(spec, rawValue, text) {
  if (!Array.isArray(spec.adapt)) return spec;

  for (const rule of spec.adapt) {
    const { if: condition, ...overrides } = rule;
    if (matchesCondition(condition, rawValue, text, spec)) {
      return { ...spec, ...overrides };
    }
  }
  return spec;
}

function matchesCondition(condition, rawValue, text, spec) {
  // A rule with no "if" is the fallback and always matches.
  if (!condition) return true;

  const number = Number(rawValue);
  const string = String(text ?? '');
  const font = spec.valueFont ?? spec.font ?? DEFAULT_FONT;

  if (condition.under !== undefined) {
    if (!Number.isFinite(number) || !(number < condition.under)) return false;
  }
  if (condition.atLeast !== undefined) {
    if (!Number.isFinite(number) || !(number >= condition.atLeast)) return false;
  }
  if (condition.maxChars !== undefined && string.length > condition.maxChars) return false;
  if (condition.minChars !== undefined && string.length < condition.minChars) return false;
  if (condition.equals !== undefined && string !== String(condition.equals)) return false;

  if (condition.maxPixels !== undefined && measureText(string, font) > condition.maxPixels) {
    return false;
  }
  if (condition.minPixels !== undefined && measureText(string, font) < condition.minPixels) {
    return false;
  }

  return true;
}

/**
 * Choose the largest font from a list that still fits the space available.
 * Saves writing the same "if it's short use the big font" rule on every row.
 */
function pickAutoFont(fonts, text, budget, fallback) {
  if (!Array.isArray(fonts) || fonts.length === 0) return fallback;
  for (const font of fonts) {
    if (measureText(text, font) <= budget) return font;
  }
  return fonts[fonts.length - 1];
}

// ── Rows ──────────────────────────────────────────────────────────────────

/**
 * `rows` is either an explicit array, or an object with `each` that repeats a
 * template over a list. The repeat form is what lets one config handle "show
 * the first 2 coins" without knowing which coins.
 */
function expandRows(rows, context) {
  if (!rows) return [];

  if (Array.isArray(rows)) {
    return rows.flatMap((row) => buildRow(row, context));
  }

  if (typeof rows === 'object' && rows.each !== undefined) {
    return expandRepeat(rows, context);
  }

  throw new Error('"rows" must be an array, or an object with "each"');
}

function expandRepeat(spec, context) {
  const list = resolve(spec.each, context);
  if (!Array.isArray(list)) {
    throw new Error(`"each": ${JSON.stringify(spec.each)} did not resolve to an array`);
  }

  const limit = spec.limit ?? list.length;
  const startY = spec.startY ?? 40;
  const stepY = spec.stepY ?? 12;

  return list.slice(0, limit).flatMap((entry, index) =>
    buildRow(
      { ...spec, y: spec.y ?? startY + index * stepY },
      // Inside a repeat, {{paths}} resolve against the current entry.
      { ...context, data: entry, index }
    )
  );
}

function buildRow(rowSpec, context) {
  if (!passesCondition(rowSpec, context)) return [];
  if (rowSpec.y == null) {
    throw new Error(`row ${JSON.stringify(rowSpec.label ?? rowSpec.value)} has no "y"`);
  }

  // Resolve the value first: it's what the adapt rules are tested against.
  const rawValue = resolve(rowSpec.value, context);
  const firstPass = renderText(rowSpec.value, rowSpec.format, rowSpec, context, '');
  const row = applyAdapt(rowSpec, rawValue, firstPass);

  const {
    y,
    font = DEFAULT_FONT,
    labelColor = DEFAULT_LABEL_COLOR,
    labelX = 1,
    valueOffset = 0,
    gap = 2,
    fallback = DEFAULT_FALLBACK,
  } = row;

  // Label and value are styled independently — a small caption above a big
  // number is the usual reason anyone reaches for this.
  const labelFont = context.forceFont ?? row.labelFont ?? font;
  const labelY = row.labelY ?? y;
  const valueY = row.valueY ?? y;

  const label = renderText(row.label, row.labelFormat, row, context, '');
  // Re-render in case an adapt rule changed the format, prefix or suffix.
  const value = renderText(row.value, row.format, row, context, fallback);

  // The label is measured first so the value knows how much room is left.
  const labelWidth = label ? measureText(label, labelFont) : 0;
  const valueBudget = DISPLAY_WIDTH - labelWidth - labelX - gap;

  const valueFont =
    context.forceFont ??
    (row.autoFont
      ? pickAutoFont(row.autoFont, value, valueBudget, row.valueFont ?? font)
      : (row.valueFont ?? font));

  const out = [];

  if (label) {
    // The value is the reason the row exists, so the label yields to it.
    const valueWidth = value ? measureText(value, valueFont) : 0;
    const budget = DISPLAY_WIDTH - valueWidth - labelX - gap;
    const fitted = fitText(label, budget, labelFont);
    // If a truncated label degenerated to nothing but the ellipsis, it's noise
    // — a bare ".." beside a very wide value reads as a glitch, so show only
    // the value. A label that genuinely is "." and fits is left alone.
    const truncated = measureText(label, labelFont) > budget;
    if (!truncated || /[^.]/.test(fitted)) {
      out.push({
        text: fitted,
        x: labelX,
        y: labelY,
        color: resolveColor(labelColor, context, DEFAULT_LABEL_COLOR),
        font: labelFont,
        width: DISPLAY_WIDTH,
        dir: 0,
        speed: 0,
      });
    }
  }

  if (value) {
    out.push({
      text: value,
      x:
        row.valueX ??
        alignX(value, 'right', {
          font: valueFont,
          width: DISPLAY_WIDTH,
          offset: valueOffset - (context.rightMargin ?? 0),
        }),
      y: valueY,
      color: resolveColor(row.color ?? row.valueColor, context, DEFAULT_VALUE_COLOR),
      font: valueFont,
      width: DISPLAY_WIDTH,
      dir: 0,
      speed: 0,
    });
  }

  return out;
}

// ── Free-form items ───────────────────────────────────────────────────────

function buildItem(itemSpec, context) {
  if (!passesCondition(itemSpec, context)) return null;

  const source = itemSpec.text ?? itemSpec.value;
  const rawValue = resolve(source, context);
  const firstPass = renderText(source, itemSpec.format, itemSpec, context, itemSpec.fallback ?? '');
  const item = applyAdapt(itemSpec, rawValue, firstPass);

  const {
    y,
    x,
    align,
    offset = 0,
    scroll = false,
    speed,
    width = DISPLAY_WIDTH,
    maxWidth,
    dir = 0,
    fallback = '',
  } = item;

  const text = renderText(item.text ?? item.value, item.format, item, context, fallback);
  if (!text) return null;
  if (y == null) throw new Error(`item "${text}" has no "y"`);

  // autoFont picks the largest font from the list that still fits.
  const font =
    context.forceFont ??
    (item.autoFont
      ? pickAutoFont(item.autoFont, text, maxWidth ?? (x != null ? width - x : width), DEFAULT_FONT)
      : (item.font ?? DEFAULT_FONT));

  // Anything too wide either scrolls or gets trimmed — never silently runs off
  // the edge.
  const shown = scroll ? text : fitText(text, maxWidth ?? (x != null ? width - x : width), font);

  // Only right-aligned text needs the edge margin; left and centre don't.
  const edgeOffset = align === 'right' ? offset - (context.rightMargin ?? 0) : offset;

  return {
    text: shown,
    x: x != null ? x : alignX(shown, align || 'left', { font, width, offset: edgeOffset }),
    y,
    color: resolveColor(item.color, context, DEFAULT_LABEL_COLOR),
    font,
    width,
    dir,
    // Divoom scrolls whenever speed > 0.
    speed: scroll ? (speed ?? 100) : 0,
  };
}

/**
 * Optional "when" / "unless" on any row or item, so a screen can show one thing
 * or another depending on its data — a firm countdown vs. a "TBD", a row that
 * only appears when there's something to put in it.
 */
function passesCondition(spec, context) {
  if (spec.when !== undefined && !isTruthy(resolve(spec.when, context))) return false;
  if (spec.unless !== undefined && isTruthy(resolve(spec.unless, context))) return false;
  return true;
}

function isTruthy(value) {
  if (value == null || value === '' || value === false || value === 0) return false;
  // A JSON config can only express these as strings, so honour the intent.
  if (value === 'false' || value === '0') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Resolve a template, format it, then wrap it. Formatting a value that came
 * from a single {{placeholder}} sees the raw type, so numbers and ISO dates
 * reach the formatters intact.
 */
function renderText(template, format, opts, context, fallback) {
  if (template == null) return '';

  const value = resolve(template, context);
  if (value == null || value === '') return fallback;

  let text;
  try {
    text = applyFormat(value, format);
  } catch (err) {
    throw new Error(`${err.message} (while rendering ${JSON.stringify(template)})`);
  }

  if (text === '') return fallback;
  return `${opts.prefix ?? ''}${text}${opts.suffix ?? ''}`;
}

// ── Background ────────────────────────────────────────────────────────────

function resolveBackground(name, spec, context) {
  if (!name) return null;

  const resolved = String(resolve(name, context));
  const path = findAsset(resolved, context.assetDirs);
  if (!path) {
    throw new Error(`background "${resolved}" not found in: ${context.assetDirs.join(', ')}`);
  }

  if (!gifCache.has(path)) gifCache.set(path, readFileSync(path));

  return {
    buffer: gifCache.get(path),
    name: basename(path),
    speed: spec.backgroundSpeed ?? 100,
  };
}

/**
 * Look up an image by name. The screen's own folder is searched first, so a
 * screen you download stays self-contained.
 */
function findAsset(nameOrPath, assetDirs = []) {
  if (isAbsolute(nameOrPath)) return existsSync(nameOrPath) ? nameOrPath : null;

  for (const dir of assetDirs) {
    const candidate = resolvePath(dir, nameOrPath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

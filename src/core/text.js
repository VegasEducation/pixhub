// Text measurement for the Divoom built-in fonts.
//
// The device draws text at an (x, y) top-left origin and gives us no way to ask
// how wide a string will be, so centring or right-aligning anything requires a
// local width table. Divoom font 2 (the default here) is proportional, so the
// table is per-character.
//
// These widths are empirical — measured on a Pixoo 64, in pixels, including the
// 1px gap the firmware puts after each glyph. Every character that appears in a
// bundled screen's labels was checked against the panel with screens/testcard
// by right-aligning it and looking for a gap or an overrun.
//
// Still estimated, because they only turn up in free-form text from an API:
//   D I J L N O P Q R U X Y Z  f j m q v x y z  and most punctuation.
// If your device or firmware differs, override individual characters with the
// FONT_WIDTHS env var rather than editing this file — see
// docs/writing-a-screen.md.

// Pixoo is Divoom's product line, not a single device: it comes in 16x16, 32x32
// and 64x64. Everything bundled here — artwork, row positions, the font width
// table — was built and measured for the 64.
//
// PIXOO_SIZE lets the maths follow a smaller panel, but be honest about what
// that does and doesn't do: alignment, centring and clipping will be correct,
// while every bundled screen's y coordinates and images will still be sized for
// a 64 and will need redoing. Untested on 16 or 32 hardware.
const SIZE = (() => {
  const n = Number(process.env.PIXOO_SIZE);
  return [16, 32, 64].includes(n) ? n : 64;
})();

export const DISPLAY_WIDTH = SIZE;
export const DISPLAY_HEIGHT = SIZE;

const FONT_2_WIDTHS = {
  // Narrower than any glyph. 3 left a visible gap across four spaces; 1 then
  // clipped, so it is 2.
  ' ': 2,
  // digits — the ones that matter most, since screens are mostly numbers
  0: 6, 1: 4, 2: 5, 3: 5, 4: 6, 5: 5, 6: 6, 7: 5, 8: 6, 9: 6,
  // punctuation
  // '.' ',' and '$' measured on the test card. A comma is one pixel wider than
  // a period (it carries a tail); '$' is narrower than a digit.
  '.': 2, ',': 3, ':': 2, ';': 3, "'": 2, '"': 4, '!': 2, '|': 2, '`': 2,
  '-': 3, '+': 6, '=': 6, '*': 5, '/': 5, '\\': 5, '_': 6, '~': 6, '^': 5,
  '(': 3, ')': 3, '[': 3, ']': 3, '{': 4, '}': 4, '<': 5, '>': 5,
  '?': 5, '@': 8, '#': 7, '$': 5, '%': 8, '&': 7,
  // uppercase
  // 'K' and 'M' measured. 'W' is one wider than 'M' — at 9 it overran the edge.
  A: 8, B: 6, C: 6, D: 6, E: 5, F: 5, G: 7, H: 7, I: 2, J: 5, K: 6, L: 5, M: 9,
  N: 7, O: 6, P: 6, Q: 7, R: 6, S: 6, T: 6, U: 6, V: 8, W: 11, X: 6, Y: 6, Z: 5,
  // lowercase
  a: 6, b: 6, c: 5, d: 5, e: 6, f: 4, g: 5, h: 5, i: 2, j: 3, k: 5, l: 2, m: 8,
  n: 5, o: 6, p: 6, q: 5, r: 4, s: 5, t: 5, u: 5, v: 5, w: 9, x: 5, y: 5, z: 5,
};

// The other built-in fonts are fixed-width, so one advance value covers each.
//
// BE AWARE: only font 2 above has been measured on a real device. The values
// here are reasonable defaults, not verified metrics — this firmware doesn't
// answer Device/GetTimeDialFontList, so there's no way to ask the device.
// If you use another font and alignment looks off, correct it with
// FONT_WIDTH_<n> in .env (e.g. FONT_WIDTH_4=7) instead of assuming these are
// right, and run `npm run calibrate -- <font>` to check.
const FIXED_WIDTH_FONTS = { 0: 6, 1: 6, 3: 6, 4: 8, 5: 6, 6: 6, 7: 6, 8: 8 };

// Two different vertical numbers, because they answer different questions.
//
// FONT_HEIGHTS is the ink: how far apart two rows must be to avoid colliding.
// Rows 9px apart render cleanly in font 2, so 9.
//
// FONT_BOTTOM_EXTENT is how far the text box reaches below its y coordinate,
// which is what decides whether a row clips against the bottom of the panel.
// It is larger than the ink — the firmware pads the box. Measured for font 2:
// y=52 sits clear, y=55 shows only its top half, so the box runs about 12px.
// Using the ink height for this let a visibly clipped row pass unwarned.
const FONT_HEIGHTS = { 0: 8, 1: 8, 2: 9, 3: 9, 4: 13, 5: 9, 6: 9, 7: 9, 8: 13 };
const FONT_BOTTOM_EXTENT = { 0: 11, 1: 11, 2: 12, 3: 12, 4: 16, 5: 12, 6: 12, 7: 12, 8: 16 };

/** Per-font advance overrides, e.g. FONT_WIDTH_4=7 */
function loadFontWidthOverrides() {
  const out = {};
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^FONT_WIDTH_(\d+)$/);
    if (!match) continue;
    const width = Number(value);
    if (Number.isFinite(width) && width > 0) out[Number(match[1])] = width;
  }
  return out;
}

const FONT_WIDTH_OVERRIDES = loadFontWidthOverrides();

/** Per-font height overrides, e.g. FONT_HEIGHT_4=12 */
function loadFontHeightOverrides() {
  const out = {};
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^FONT_HEIGHT_(\d+)$/);
    if (!match) continue;
    const height = Number(value);
    if (Number.isFinite(height) && height > 0) out[Number(match[1])] = height;
  }
  return out;
}

const FONT_HEIGHT_OVERRIDES = loadFontHeightOverrides();

/** Ink height in pixels — how far apart rows must be to not collide. */
export function fontHeight(font = 2) {
  if (isSmallFont(font)) return SMALL_INK_HEIGHT;
  return FONT_HEIGHT_OVERRIDES[font] ?? FONT_HEIGHTS[font] ?? 9;
}

/**
 * How far the text box reaches below its y — what clipping depends on.
 * The lowest usable row for a font is therefore DISPLAY_HEIGHT minus this.
 */
export function fontBottomExtent(font = 2) {
  // The small font is drawn into the image rather than by the firmware, so
  // there is no padded text box — the glyph is all there is.
  if (isSmallFont(font)) return SMALL_INK_HEIGHT;
  const override = FONT_HEIGHT_OVERRIDES[font];
  if (override !== undefined) return override + 3;
  return FONT_BOTTOM_EXTENT[font] ?? 12;
}

/** True for the one font whose per-character widths have actually been measured. */
export function isVerifiedFont(font) {
  // The small font's metrics come from the renderer's own source, so they are
  // exact rather than measured.
  return Number(font) === 2 || isSmallFont(font);
}

const DEFAULT_CHAR_WIDTH = 6;

// The bridge's own font (PICO-8), used when a screen sets "textMode": "small".
// It doesn't involve the device's fonts at all — pixoo-rest renders the glyphs
// and pushes an image. Every glyph is 3px wide on a 4px advance and 5px tall,
// straight from the library source, so nothing here needed measuring: exactly
// 16 characters per line, and rows can sit 6px apart.
export const SMALL_FONT = 'small';
const SMALL_ADVANCE = 4;
const SMALL_INK_HEIGHT = 6;

// Anything outside this set draws as blank space — the library has no glyph.
const SMALL_FONT_CHARS = new Set(
  "!$%'()+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz{|}~ "
);

function isSmallFont(font) {
  return font === SMALL_FONT;
}

/** Characters the small font can't draw, so a screen can be warned about them. */
export function unsupportedSmallChars(text) {
  return [...new Set([...String(text)].filter((c) => !SMALL_FONT_CHARS.has(c)))];
}

/** User overrides, e.g. FONT_WIDTHS="M:8,W:8,1:3". Applied to the font-2 table. */
function loadOverrides() {
  const raw = process.env.FONT_WIDTHS;
  if (!raw) return {};
  const out = {};
  for (const pair of raw.split(',')) {
    const idx = pair.lastIndexOf(':');
    if (idx <= 0) continue;
    const char = pair.slice(0, idx).trim();
    const width = Number(pair.slice(idx + 1).trim());
    if (char && Number.isFinite(width)) out[char] = width;
  }
  return out;
}

const OVERRIDES = loadOverrides();

/** Width in pixels of a single character in the given font. */
export function charWidth(char, font = 2) {
  if (isSmallFont(font)) return SMALL_ADVANCE;
  if (font !== 2) {
    return FONT_WIDTH_OVERRIDES[font] ?? FIXED_WIDTH_FONTS[font] ?? DEFAULT_CHAR_WIDTH;
  }
  if (OVERRIDES[char] !== undefined) return OVERRIDES[char];
  return FONT_2_WIDTHS[char] ?? DEFAULT_CHAR_WIDTH;
}

/** Width in pixels of a string in the given font. */
export function measureText(text, font = 2) {
  let width = 0;
  for (const char of String(text)) width += charWidth(char, font);
  return width;
}

/**
 * Resolve an alignment into an x coordinate.
 *
 * @param {string} text     the string being drawn
 * @param {'left'|'center'|'right'} align
 * @param {object} [opts]
 * @param {number} [opts.font=2]
 * @param {number} [opts.width=64]  usable width, normally the display width
 * @param {number} [opts.offset=0]  nudge in pixels; positive moves right
 */
export function alignX(text, align = 'left', opts = {}) {
  const { font = 2, width = DISPLAY_WIDTH, offset = 0 } = opts;
  const textWidth = measureText(text, font);

  let x;
  if (align === 'right') x = width - textWidth;
  else if (align === 'center') x = Math.round((width - textWidth) / 2);
  else x = 0;

  return clamp(x + offset, 0, Math.max(0, width - 1));
}

/**
 * Trim a string until it fits within maxWidth pixels, appending an ellipsis
 * character if anything was removed. Returns the original string when it fits.
 */
export function fitText(text, maxWidth, font = 2, ellipsis = '.') {
  const str = String(text);
  if (measureText(str, font) <= maxWidth) return str;

  const suffix = ellipsis.repeat(2);
  const suffixWidth = measureText(suffix, font);
  let out = '';
  let width = 0;

  for (const char of str) {
    const next = width + charWidth(char, font);
    if (next + suffixWidth > maxWidth) break;
    out += char;
    width = next;
  }

  return out.trimEnd() + suffix;
}

/**
 * Shorten by dropping trailing words until the string fits, which reads far
 * better than mid-word truncation for names: "Falcon 9 Block 5" becomes
 * "Falcon 9" rather than "Falcon 9 Bloc..".
 *
 * Falls back to character truncation if even the first word is too wide.
 */
export function fitWords(text, maxWidth, font = 2) {
  const words = String(text).trim().split(/\s+/);

  for (let count = words.length; count > 0; count--) {
    const candidate = words.slice(0, count).join(' ');
    if (measureText(candidate, font) <= maxWidth) return candidate;
  }

  return fitText(words[0] ?? '', maxWidth, font);
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

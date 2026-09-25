// Formatting helpers for a 64x64 display, where every pixel of width is
// contested. Kept in one place so nothing reinvents "make this number short".
//
// These back the named formats a screen.json refers to ("compact", "price"),
// and are handed to a render.js as `helpers`.

import { measureText, fitText, fitWords } from './text.js';

/**
 * Compact a number to fit a few pixels: 1234 -> "1.2K", 5400000 -> "5.4M".
 * Drops the decimal once the mantissa reaches 100 so "123.4K" becomes "123K".
 */
export function compact(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';

  const abs = Math.abs(n);
  const units = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];

  for (let i = 0; i < units.length; i++) {
    const [size, suffix] = units[i];
    if (abs < size) continue;

    const scaled = n / size;
    const places = Math.abs(scaled) >= 100 ? 0 : digits;

    // Rounding can carry past the unit: 999,999 would render "1000K" when it
    // plainly means "1M". Step up and use the larger unit instead.
    if (Math.abs(Number(scaled.toFixed(places))) >= 1000 && i > 0) {
      return atUnit(n, units[i - 1], digits);
    }
    return atUnit(n, units[i], digits);
  }

  // Same carry, one step lower: 999.6 is "1K", not "1000".
  const rounded = Math.round(n);
  if (Math.abs(rounded) >= 1000) return atUnit(n, units[units.length - 1], digits);
  return String(rounded);
}

function atUnit(n, [size, suffix], digits) {
  const scaled = n / size;
  const places = Math.abs(scaled) >= 100 ? 0 : digits;
  return trimZeros(scaled.toFixed(places)) + suffix;
}

/**
 * Price formatting that adapts precision to magnitude — $64.2K needs no
 * decimals, $0.4271 needs four.
 *
 * `compactAbove` defaults low (10k) because a six-figure price written out in
 * full is ~45px wide, which leaves no room for a label beside it.
 */
export function price(value, { symbol = '$', compactAbove = 10_000 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';

  const abs = Math.abs(n);
  if (abs >= compactAbove) return symbol + compact(n);
  if (abs >= 1000) return symbol + Math.round(n).toLocaleString('en-US');
  if (abs >= 1) return symbol + n.toFixed(2);
  if (abs >= 0.001) return symbol + trimZeros(n.toFixed(4));
  // Meme-coin territory: "$0.0000241" is 53px and leaves no room for a label,
  // so drop to exponent notation, which is half the width and no less precise.
  return symbol + n.toExponential(1);
}

/** Signed percentage, e.g. "+2.1%" / "-0.4%". */
export function percent(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

/** Insert thousands separators: 3902 -> "3,902". */
export function commas(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US');
}

/**
 * Countdown to a future date, sized for the display:
 * "5d 3h", "3h 20m", "12m", "LIVE" once the target has passed.
 */
export function countdown(target, { now = Date.now(), past = 'LIVE' } = {}) {
  const t = target instanceof Date ? target.getTime() : Date.parse(target);
  if (!Number.isFinite(t)) return '-';

  let diff = t - now;
  if (diff <= 0) return past;

  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);

  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Short local date/time, e.g. "Aug 8 14:00".
 * Honours the TZ environment variable like every other date in the process.
 */
export function shortDateTime(value, { timeZone = process.env.TZ, hour12 = false } = {}) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';

  const opts = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12 };
  if (timeZone) opts.timeZone = timeZone;
  return new Intl.DateTimeFormat('en-US', opts).format(d).replace(',', '');
}

/** Clock time only, e.g. "14:32". */
export function clockTime(value = new Date(), { timeZone = process.env.TZ, hour12 = false } = {}) {
  const d = value instanceof Date ? value : new Date(value);
  const opts = { hour: '2-digit', minute: '2-digit', hour12 };
  if (timeZone) opts.timeZone = timeZone;
  return new Intl.DateTimeFormat('en-US', opts).format(d);
}

/** Colour picker for deltas: green up, red down, grey flat. */
export function trendColor(value, { up = '#00FF88', down = '#FF4444', flat = '#AAAAAA' } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return flat;
  return n > 0 ? up : down;
}

function trimZeros(str) {
  return str.includes('.') ? str.replace(/\.?0+$/, '') : str;
}

export const helpers = {
  compact,
  price,
  percent,
  commas,
  countdown,
  shortDateTime,
  clockTime,
  trendColor,
  // Re-exported for render.js escape hatches that size their own text.
  measure: measureText,
  fit: fitText,
  fitWords,
};

// The bridge between the JSON your script prints and the text on the display.
//
// A screen's config refers to values with {{paths}}, formats them with named
// formatters, and picks colours from the data. This module is what makes a
// screen definable entirely in JSON, with no code.

import * as fmt from './format.js';
import { fitText, fitWords } from './text.js';

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Read a dotted path out of the data your script produced.
 *
 * "btc.price", "coins.0.symbol", "results.0.status.abbrev" all work.
 * "." or "" means the whole payload, which is how a script that prints a bare
 * JSON array is iterated.
 */
function getPath(data, path) {
  const trimmed = String(path).trim();
  if (trimmed === '' || trimmed === '.') return data;

  return trimmed
    .replace(/\[(\d+)\]/g, '.$1') // coins[0].price -> coins.0.price
    .split('.')
    .reduce((value, key) => {
      if (value == null) return undefined;
      return value[key];
    }, data);
}

/**
 * Resolve a config string against the data.
 *
 * A string that is exactly one placeholder returns the *raw* value, so numbers
 * stay numbers and reach the formatters intact. Anything else is string
 * substitution, so "T-{{countdown}}" and "{{sym}}/USD" work as written.
 */
export function resolve(template, context) {
  if (typeof template !== 'string') return template;

  const whole = template.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
  if (whole) return lookup(whole[1], context);

  if (!TEMPLATE_RE.test(template)) return template;
  TEMPLATE_RE.lastIndex = 0;

  return template.replace(TEMPLATE_RE, (_, path) => {
    const value = lookup(path, context);
    return value == null ? '' : String(value);
  });
}

/**
 * Built-ins are prefixed with $ so they can't collide with a key from your
 * script. $now is what lets a clock screen exist with no script at all.
 */
function lookup(path, context) {
  const key = String(path).trim();
  if (key === '$now') return new Date().toISOString();
  if (key === '$fetchedAt') return context.fetchedAt;
  if (key.startsWith('$env.')) return process.env[key.slice(5)];
  return getPath(context.data, key);
}

// ── Formatters ────────────────────────────────────────────────────────────
// Referenced by name in a screen's config: "format": "compact".
// An argument may follow a colon: "price:€", "percent:2", "fitWords:62".

const FORMATTERS = {
  text: (v) => (v == null ? '' : String(v)),
  compact: (v, arg) => fmt.compact(v, arg == null ? 1 : Number(arg)),
  price: (v, arg) => fmt.price(v, arg ? { symbol: arg } : undefined),
  percent: (v, arg) => fmt.percent(v, arg == null ? 1 : Number(arg)),
  commas: (v) => fmt.commas(v),
  round: (v, arg) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '-';
    const places = arg == null ? 0 : Number(arg);
    return places > 0 ? n.toFixed(places) : String(Math.round(n));
  },
  countdown: (v, arg) => fmt.countdown(v, arg ? { past: arg } : undefined),
  datetime: (v) => fmt.shortDateTime(v),
  time: (v) => fmt.clockTime(v),
  date: (v, arg) =>
    new Intl.DateTimeFormat('en-US', {
      weekday: arg === 'long' ? 'long' : 'short',
      month: 'short',
      day: 'numeric',
      ...(process.env.TZ ? { timeZone: process.env.TZ } : {}),
    }).format(v ? new Date(v) : new Date()),
  upper: (v) => String(v ?? '').toUpperCase(),
  lower: (v) => String(v ?? '').toLowerCase(),
  fit: (v, arg) => fitText(String(v ?? ''), Number(arg) || 64),
  fitWords: (v, arg) => fitWords(String(v ?? ''), Number(arg) || 64),
};

export const FORMATTER_NAMES = Object.keys(FORMATTERS);

/** Apply a named formatter, e.g. "price:€" or "compact". */
export function applyFormat(value, spec) {
  if (!spec) return value == null ? '' : String(value);

  const colon = String(spec).indexOf(':');
  const name = colon === -1 ? String(spec) : String(spec).slice(0, colon);
  const arg = colon === -1 ? undefined : String(spec).slice(colon + 1);

  const formatter = FORMATTERS[name];
  if (!formatter) {
    throw new Error(`unknown format "${name}" — available: ${FORMATTER_NAMES.join(', ')}`);
  }
  return formatter(value, arg);
}

/**
 * Resolve a colour spec. Accepts, in order of how often you'll want them:
 *
 *   "#FF3B00"                     literal
 *   "accent"                      a name from the palette
 *   "trend:{{change}}"            green up, red down, grey flat
 *   { "match": "{{status}}",      pick by value
 *     "cases": { "Go": "green" },
 *     "default": "grey" }
 */
export function resolveColor(spec, context, fallback = '#FFFFFF') {
  if (!spec) return fallback;

  if (typeof spec === 'object') {
    const value = String(resolve(spec.match, context) ?? '');
    const chosen = spec.cases?.[value] ?? spec.default;
    return resolveColor(chosen, context, fallback);
  }

  const str = String(spec);

  if (str.startsWith('trend:')) {
    const value = resolve(str.slice(6), context);
    return fmt.trendColor(value);
  }

  if (str.startsWith('#')) return str;

  return context.palette?.[str] || fallback;
}

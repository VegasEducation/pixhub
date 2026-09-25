// Human durations ("30s", "5m", "1h") <-> milliseconds.
// Screens declare refresh intervals in this format so screen.json stays readable.

const UNITS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * Parse a duration into milliseconds.
 * Accepts a number (treated as seconds), or a string like "45s", "10m", "2h", "1d".
 * Compound strings ("1h30m") are supported.
 */
export function toMs(value, fallbackMs = 0) {
  if (value == null || value === '') return fallbackMs;
  if (typeof value === 'number' && Number.isFinite(value)) return value * 1000;

  const str = String(value).trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(str)) return Number(str) * 1000;

  const matches = [...str.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/g)];
  if (matches.length === 0) return fallbackMs;

  return matches.reduce((sum, [, n, unit]) => sum + Number(n) * UNITS[unit], 0);
}


// Global configuration, all of it from .env.
//
// The split is deliberate: .env answers "which screens, in what order, for how
// long, on which device". Everything about how an individual screen looks or
// where its data comes from lives in that screen's own folder.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { toMs } from './duration.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Names screens can use instead of hex codes.
const PALETTE = {
  white: '#FFFFFF',
  black: '#000000',
  grey: '#AAAAAA',
  dim: '#666666',
  accent: '#00FFAA',
  green: '#00FF88',
  red: '#FF4444',
  amber: '#FFAA00',
  blue: '#3399FF',
  orange: '#FF6600',
  yellow: '#FFCC33',
};

export function loadConfig({ envPath = resolve(ROOT, '.env') } = {}) {
  loadEnv(envPath);

  const dataDir = resolve(ROOT, process.env.DATA_DIR || 'data');

  return {
    root: ROOT,

    bridgeUrl: process.env.PIXOO_BRIDGE || 'http://pixoo-rest:5000',
    mode: (process.env.MODE || 'all').toLowerCase(),

    // Which screens, in what order, and optionally for how long each.
    screens: parseScreens(process.env.SCREENS),

    // Right-aligned text stops this many pixels short of the edge. Sitting
    // flush at column 63 looks cramped, and leaves no slack for a character
    // that renders a pixel wider than the width table thinks.
    rightMargin: numberOr(process.env.TEXT_RIGHT_MARGIN, 2),

    rotateMs: toMs(process.env.ROTATE_SECONDS, 30_000),
    brightness: numberOr(process.env.PIXOO_BRIGHTNESS, 40),
    commandDelayMs: numberOr(process.env.PIXOO_COMMAND_DELAY_MS, 50),
    scriptTimeoutMs: toMs(process.env.SCRIPT_TIMEOUT_SECONDS, 30_000),

    dataDir,
    statePath: resolve(dataDir, 'state.json'),

    // Searched after the screen's own folder, for images shared between
    // screens (black.gif lives here).
    assetDirs: [resolve(ROOT, process.env.ASSETS_DIR || 'assets')],

    screenDirs: [resolve(ROOT, process.env.SCREENS_DIR || 'screens')],

    palette: PALETTE,

    http: {
      enabled: boolOr(process.env.HTTP_ENABLED, true),
      port: numberOr(process.env.HTTP_PORT, 8080),
      host: process.env.HTTP_HOST || '0.0.0.0',
    },
  };
}

/**
 * SCREENS="ltt,crypto:60,spacex"
 *
 * Order is rotation order. An optional ":seconds" overrides ROTATE_SECONDS for
 * that screen — useful when one screen scrolls and needs longer to be read.
 * Unset means "every screen you can find".
 */
function parseScreens(raw) {
  if (!raw || !raw.trim()) return [];

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.lastIndexOf(':');
      if (colon === -1) return { name: part, durationMs: null };

      const name = part.slice(0, colon).trim();
      const duration = toMs(part.slice(colon + 1).trim(), 0);
      return { name, durationMs: duration || null };
    });
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolOr(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

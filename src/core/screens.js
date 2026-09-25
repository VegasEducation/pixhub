// Screen discovery.
//
// A screen is a folder containing a screen.json. That's the whole registration
// mechanism — no list to edit, no import to add. Drop the folder in, name it in
// SCREENS, restart.

import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from './log.js';
import { toMs } from './duration.js';
import { resolveCommand } from './runner.js';

const log = logger('screens');

const CONFIG_FILE = 'screen.json';
const RENDER_FILE = 'render.js';

/**
 * Load every screen folder found in the given directories.
 * Returns a Map of name -> screen. Earlier directories win on name collision.
 */
export async function discoverScreens(screenDirs) {
  const found = new Map();

  for (const dir of screenDirs) {
    if (!existsSync(dir)) continue;

    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry.startsWith('_')) continue;

      const screenDir = join(dir, entry);
      if (!statSync(screenDir).isDirectory()) continue;
      if (!existsSync(join(screenDir, CONFIG_FILE))) continue;
      if (found.has(entry)) continue;

      try {
        found.set(entry, await loadScreen(entry, screenDir));
      } catch (err) {
        // One malformed screen must not stop the others from displaying.
        log.error(`skipping "${entry}": ${err.message}`);
      }
    }
  }

  return found;
}

async function loadScreen(name, dir) {
  const configPath = join(dir, CONFIG_FILE);

  let config;
  try {
    config = JSON.parse(stripComments(readFileSync(configPath, 'utf8')));
  } catch (err) {
    throw new Error(`${CONFIG_FILE} is not valid JSON: ${err.message}`);
  }

  validate(dir, config);

  const screen = {
    name,
    dir,
    config,
    title: config.name || name,
    description: config.description || '',
    requiredEnv: config.requiredEnv || [],
    // Which stored dataset this screen reads, and writes if it has a script.
    // Defaults to the screen's own name, so screens are independent unless you
    // deliberately point several at one — the way to show the same scrape on
    // several screens without fetching it several times.
    dataset: config.dataset || name,
    refreshMs: toMs(config.refresh, 15 * 60_000),
    // null means "use the global ROTATE_SECONDS"
    durationMs: config.duration ? toMs(config.duration) : null,
    hasScript: Boolean(config.script || config.command),
    render: null,
  };

  // Optional escape hatch: a screen that needs real logic to lay itself out
  // exports a render function and takes over from the JSON.
  const renderPath = join(dir, RENDER_FILE);
  if (existsSync(renderPath)) {
    const module = await import(pathToFileURL(renderPath).href);
    const fn = module.render || module.default;
    if (typeof fn !== 'function') {
      throw new Error(`${RENDER_FILE} must export a render function`);
    }
    screen.render = fn;
  }

  // Fail loudly at load time rather than on the first poll.
  if (screen.hasScript) resolveCommand(screen);

  return screen;
}

function validate(dir, config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`${CONFIG_FILE} must contain a JSON object`);
  }

  // A screen needs something to draw: rows, items, a render.js, or at minimum
  // a background image (a picture-only screen is a legitimate thing to want).
  const hasLayout = config.rows || config.items || config.background;
  if (!hasLayout && !existsSync(join(dir, RENDER_FILE))) {
    throw new Error(`${CONFIG_FILE} defines no "rows", "items" or "background" — nothing to show`);
  }

  if (config.rows && !Array.isArray(config.rows) && config.rows.each === undefined) {
    throw new Error('"rows" must be an array, or an object with "each"');
  }
}

/**
 * Allow // comments in screen.json. Strictly non-standard, but these files are
 * written by hand and being able to annotate a row is worth more than purity.
 */
function stripComments(text) {
  return text.replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Put the discovered screens in the order SCREENS asks for, dropping any that
 * can't run and explaining why.
 *
 * A screen missing its API key is skipped with a message rather than failing
 * hard — a fresh clone with no keys should still show what it can.
 */
export function selectScreens(config, discovered) {
  const requested =
    config.screens.length > 0
      ? config.screens
      // No SCREENS set: show everything that's available, alphabetically.
      : [...discovered.keys()].sort().map((name) => ({ name, durationMs: null }));

  const selected = [];

  for (const entry of requested) {
    const screen = discovered.get(entry.name);

    if (!screen) {
      log.error(
        `SCREENS lists "${entry.name}" but no such folder. ` +
          `Found: ${[...discovered.keys()].join(', ') || 'none'}`
      );
      continue;
    }

    const missing = screen.requiredEnv.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      log.warn(`"${entry.name}" skipped — set ${missing.join(', ')} in .env to enable it`);
      continue;
    }

    selected.push({
      ...screen,
      log: logger(entry.name),
      // Per-screen duration: SCREENS entry wins, then screen.json, then global.
      durationMs: entry.durationMs ?? screen.durationMs ?? config.rotateMs,
      // The screen's own folder is searched for images first, so a screen you
      // download is self-contained.
      assetDirs: [screen.dir, ...config.assetDirs],
    });
  }

  warnAboutDatasets(selected);
  return selected;
}

/**
 * Two screens writing one dataset means duplicate fetches and a race over who
 * wrote last; a screen reading a dataset nobody writes will never have data.
 * Both are silent failures otherwise.
 */
function warnAboutDatasets(screens) {
  const writers = new Map();
  for (const screen of screens.filter((s) => s.hasScript)) {
    writers.set(screen.dataset, [...(writers.get(screen.dataset) || []), screen.name]);
  }

  for (const [dataset, names] of writers) {
    if (names.length > 1) {
      log.warn(
        `screens ${names.join(', ')} all have a script and share dataset "${dataset}" — ` +
          `they will each fetch, and overwrite each other. Give one the script and the ` +
          `rest just "dataset": "${dataset}".`
      );
    }
  }

  for (const screen of screens) {
    // A screen with no script and no explicit dataset is simply data-less,
    // like a clock — that's fine and not what this is looking for.
    if (screen.hasScript || screen.dataset === screen.name) continue;
    if (!writers.has(screen.dataset)) {
      log.warn(
        `"${screen.name}" reads dataset "${screen.dataset}" but no screen with a script ` +
          `writes it, so it will never have data`
      );
    }
  }
}

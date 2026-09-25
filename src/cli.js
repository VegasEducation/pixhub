// Developer CLI. The point is to iterate on a screen without restarting the
// stack or waiting for the rotation to come round. Run it with no arguments
// for the command list.

import { mkdirSync } from 'node:fs';
import { loadConfig } from './core/config.js';
import { discoverScreens, selectScreens } from './core/screens.js';
import { Store } from './core/store.js';
import { PixooDevice } from './core/pixoo.js';
import { runScript, resolveCommand } from './core/runner.js';
import { buildScene } from './core/scene.js';
import {
  measureText,
  charWidth,
  alignX,
  fontHeight,
  isVerifiedFont,
  DISPLAY_WIDTH,
  DISPLAY_HEIGHT,
} from './core/text.js';
import { FORMATTER_NAMES } from './core/template.js';
import { logger, log } from './core/log.js';

const [command, ...args] = process.argv.slice(2);

const commands = {
  list,
  screens: list,
  data: runOne,
  run: runOne,
  preview,
  show,
  measure,
  formats,
  calibrate,
  help: usage,
};

const handler = commands[command || 'help'];
if (!handler) {
  console.error(`Unknown command "${command}"\n`);
  await usage();
  process.exit(1);
}

await handler(...args).catch((err) => {
  // Almost every failure here is the user's screen, not a bug in pixhub, and a
  // stack trace buries the one line that says what to fix.
  if ((process.env.LOG_LEVEL || '').toLowerCase() === 'debug') log.error(err);
  else console.error(`\nError: ${err.message}\n`);
  process.exit(1);
});

// ── commands ─────────────────────────────────────────────────────────────

async function usage() {
  console.log(`pixhub cli

  npm run screens                   list every screen folder that was found
  npm run data    -- <screen>       run its script, print the JSON it produced
  npm run preview -- <screen>       render the layout as ASCII, no device needed
  npm run show    -- <screen>       push it to the Pixoo right now
  npm run measure -- "<text>" [font]  pixel width of a string
  npm run formats                   list the available "format" values
  npm run calibrate -- <font>       check a font's width table on the device

Layout tuning:

  npm run preview -- ltt --data '{"subs":938,"views":4210}'
      render with values you invent, to see how the layout copes

  npm run preview -- ltt --samples
      render every case in that screen's "samples" array — the fast way to
      check 938 vs 1.2K vs 16.9M all still fit
`);
}

async function formats() {
  console.log(`\nformat values for screen.json:\n  ${FORMATTER_NAMES.join(', ')}\n`);
  console.log(`Some take an argument after a colon, e.g. "price:€", "compact:0",`);
  console.log(`"percent:2", "countdown:LAUNCHED", "fitWords:62".\n`);
}

async function list() {
  const { config, discovered, screens } = await setup();

  console.log(`\nScreens found in ${config.screenDirs.join(', ')}:`);
  for (const [name, screen] of discovered) {
    const source = screen.hasScript ? describeCommand(screen) : 'no script';
    const needs = screen.requiredEnv.length ? `  needs ${screen.requiredEnv.join(', ')}` : '';
    console.log(`  ${name.padEnd(12)} ${source.padEnd(24)}${needs}`);
  }

  console.log(`\nRotation (SCREENS in .env):`);
  if (screens.length === 0) console.log('  (none)');
  for (const screen of screens) {
    const every = screen.hasScript ? `refresh ${Math.round(screen.refreshMs / 1000)}s` : 'static';
    console.log(
      `  ${screen.name.padEnd(12)} shown ${String(Math.round(screen.durationMs / 1000)).padStart(3)}s   ${every}`
    );
  }
  console.log();
}

async function runOne(name) {
  requireArg(name, 'data');
  const ctx = await setup();
  const screen = findScreen(ctx, name);

  if (!screen.hasScript) {
    console.log(`"${name}" has no script — it renders from config alone.`);
    return;
  }

  mkdirSync(ctx.config.dataDir, { recursive: true });
  console.log(`running: ${describeCommand(screen)}\n`);

  const data = await runScript(screen, {
    log: logger(name),
    timeoutMs: ctx.config.scriptTimeoutMs,
    retries: 0,
  });

  ctx.store.saveSuccess(name, data);
  console.log(JSON.stringify(data, null, 2));
  console.log(`\nRefer to these in screen.json as {{paths}}, e.g. ${samplePaths(data).join(', ')}\n`);
}

async function preview(name, ...rest) {
  requireArg(name, 'preview');
  const flags = parseFlags(rest);
  const ctx = await setup();
  const screen = findScreen(ctx, name);
  const record = ctx.store.get(screen.dataset);

  // --samples renders every case in the screen's "samples" array, which is how
  // you check that 938, 1.2K and 16.9M all still fit without waiting for the
  // real numbers to get there.
  if (flags.samples) {
    const samples = screen.config.samples;
    if (!Array.isArray(samples) || samples.length === 0) {
      console.error(
        `"${name}" has no "samples" in its screen.json. Add an array of example\n` +
          `payloads to check how the layout behaves at different magnitudes.`
      );
      process.exit(1);
    }
    samples.forEach((data, i) => {
      const scene = buildScene(screen, { ...sceneContext(ctx, screen, record), data });
      drawPreview(`${name} — sample ${i + 1}/${samples.length}`, screen, scene, data);
    });
    return;
  }

  // --data lets you try any values at all without touching the script.
  let data = record?.data ?? null;
  if (flags.data) {
    try {
      data = JSON.parse(flags.data);
    } catch (err) {
      console.error(`--data is not valid JSON: ${err.message}`);
      process.exit(1);
    }
  } else if (screen.hasScript && !data) {
    console.error(`No stored data for "${name}". Run: npm run data -- ${name}`);
    process.exit(1);
  }

  const scene = buildScene(screen, { ...sceneContext(ctx, screen, record), data });
  drawPreview(name, screen, scene);
}

/**
 * Draw right-aligned strings at a given font. If the width table for that font
 * is correct they finish flush against the right edge; a gap or an overflow
 * means the table is wrong and needs FONT_WIDTH_<n> set in .env.
 */
async function calibrate(font = '2') {
  const ctx = await setup();
  const f = Number(font);

  const device = new PixooDevice({
    baseUrl: ctx.config.bridgeUrl,
    commandDelayMs: ctx.config.commandDelayMs,
    log,
  });

  if (!(await device.isReachable())) {
    console.error(`Bridge not reachable at ${ctx.config.bridgeUrl}. Is pixoo-rest running?`);
    process.exit(1);
  }

  const samples = ['88', '888', '8.8K', '16.9M', 'WWWW'];
  const items = samples.map((text, i) => ({
    text,
    font: f,
    x: alignX(text, 'right', { font: f }),
    y: 2 + i * (fontHeight(f) + 2),
    color: '#00FFAA',
    width: DISPLAY_WIDTH,
    dir: 0,
    speed: 0,
  }));

  await device.renderScene({ background: null, brightness: ctx.config.brightness, items });

  console.log(`\nDrew ${samples.length} right-aligned strings at font ${f}.`);
  console.log(`Each should finish flush against the right edge of the display.\n`);
  for (const [i, text] of samples.entries()) {
    console.log(`  y=${items[i].y}  "${text}"  computed ${measureText(text, f)}px wide`);
  }
  // Font 2 is proportional and ignores FONT_WIDTH_2 entirely, so don't send
  // anyone down that road.
  console.log(
    isVerifiedFont(f)
      ? `\nIf one stops short or runs off, a specific character's width is wrong.\n` +
          `Font 2 is proportional, so correct the individual glyph in .env:\n` +
          `  FONT_WIDTHS="M:8,W:8"\n`
      : `\nIf they stop short or run off, this font's advance is wrong.\n` +
          `Font ${f} is treated as fixed-width — one value covers every character:\n` +
          `  FONT_WIDTH_${f}=<pixels per character>\n`
  );
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) continue;
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

async function show(name) {
  requireArg(name, 'show');
  const ctx = await setup();
  const screen = findScreen(ctx, name);

  const device = new PixooDevice({
    baseUrl: ctx.config.bridgeUrl,
    commandDelayMs: ctx.config.commandDelayMs,
    log,
  });

  if (!(await device.isReachable())) {
    console.error(`Bridge not reachable at ${ctx.config.bridgeUrl}. Is pixoo-rest running?`);
    process.exit(1);
  }

  const record = ctx.store.get(screen.dataset);
  const scene = buildScene(screen, sceneContext(ctx, screen, record));
  await (scene.small ? device.renderSceneSmall(scene) : device.renderScene(scene));
  console.log(`pushed "${name}" to ${ctx.config.bridgeUrl}`);
}

async function measure(text, font = '2') {
  requireArg(text, 'measure');
  const f = Number(font);
  console.log(`"${text}" font ${f} = ${measureText(text, f)}px of ${DISPLAY_WIDTH}px`);
  console.log(`  ${[...String(text)].map((c) => `${c}:${charWidth(c, f)}`).join(' ')}`);
}

// ── helpers ──────────────────────────────────────────────────────────────

async function setup() {
  const config = loadConfig();
  const discovered = await discoverScreens(config.screenDirs);
  const screens = selectScreens(config, discovered);
  const store = new Store(config.statePath);
  return { config, discovered, screens, store };
}

function sceneContext(ctx, screen, record) {
  return {
    data: record?.data ?? null,
    fetchedAt: record?.fetchedAt ?? null,
    palette: ctx.config.palette,
    brightness: ctx.config.brightness,
    rightMargin: ctx.config.rightMargin,
    assetDirs: screen.assetDirs ?? [screen.dir, ...ctx.config.assetDirs],
  };
}

/**
 * Resolve a name to a screen, falling back to any discovered folder even if
 * it isn't in SCREENS yet — that's the whole point when you're building one.
 */
function findScreen({ screens, discovered, config }, name) {
  const selected = screens.find((s) => s.name === name);
  if (selected) return selected;

  const found = discovered.get(name);
  if (found) {
    console.log(`("${name}" is not in SCREENS — using it anyway)`);
    return { ...found, assetDirs: [found.dir, ...config.assetDirs] };
  }

  console.error(`No screen "${name}". Found: ${[...discovered.keys()].join(', ') || 'none'}`);
  process.exit(1);
}

function describeCommand(screen) {
  try {
    return resolveCommand(screen)?.description ?? 'no script';
  } catch (err) {
    return `broken: ${err.message}`;
  }
}

/** A couple of example {{paths}} from real data, to save people guessing. */
function samplePaths(data, prefix = '', depth = 0) {
  if (depth > 2 || data == null) return [];

  if (Array.isArray(data)) {
    return samplePaths(data[0], `${prefix}0.`, depth + 1);
  }
  if (typeof data === 'object') {
    return Object.keys(data)
      .slice(0, 3)
      .flatMap((key) => {
        const value = data[key];
        return value !== null && typeof value === 'object'
          ? samplePaths(value, `${prefix}${key}.`, depth + 1)
          : [`{{${prefix}${key}}}`];
      });
  }
  return [`{{${prefix.replace(/\.$/, '')}}}`];
}

function requireArg(value, command) {
  if (value) return;
  console.error(`Usage: npm run ${command} -- <screen>`);
  process.exit(1);
}

/**
 * ASCII approximation of the 64x64 display. Each column is one pixel and each
 * character sits at its true starting pixel, so anything that collides here
 * collides on the device too.
 */
function drawPreview(name, screen, scene, data) {
  const rows = new Map();

  for (const item of scene.items) {
    if (!rows.has(item.y)) rows.set(item.y, new Array(DISPLAY_WIDTH).fill('·'));
    const row = rows.get(item.y);

    let cursor = item.x;
    for (const char of item.text) {
      if (cursor >= 0 && cursor < DISPLAY_WIDTH) {
        row[cursor] = row[cursor] === '·' ? char : '#';
      }
      cursor += charWidth(char, item.font);
    }
    if (cursor > DISPLAY_WIDTH) row[DISPLAY_WIDTH - 1] = item.speed > 0 ? '~' : '>';
  }

  const border = '+'.padEnd(DISPLAY_WIDTH + 1, '-') + '+';
  console.log(`\n  screen: ${name}  (${screen.title})`);
  console.log(
    `  background: ${screen.config.background || '(none)'}   brightness: ${scene.brightness}`
  );
  if (data) console.log(`  data: ${JSON.stringify(data).slice(0, 120)}`);
  console.log(`  ${border}`);

  for (let y = 0; y < DISPLAY_HEIGHT; y++) {
    const row = rows.get(y);
    if (row) console.log(`  |${row.join('')}| y=${y}`);
  }

  console.log(`  ${border}`);

  // Per-item detail, so a font or an x that isn't what you expected is visible
  // without re-reading the config.
  for (const item of scene.items) {
    const width = measureText(item.text, item.font);
    const unverified = isVerifiedFont(item.font) ? '' : '  (font not verified on device)';
    console.log(
      `    y=${String(item.y).padStart(2)}  x=${String(item.x).padStart(2)}  ` +
        `font ${item.font}  ${String(width).padStart(2)}px  "${item.text}"${unverified}`
    );
  }

  for (const warning of scene.warnings ?? []) {
    console.log(`  ! ${warning}`);
  }

  console.log(`  ${scene.items.length} text item(s); '#' = overlap, '>' = overflow, '~' = scrolls\n`);
}

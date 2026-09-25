// Entry point. MODE selects which halves run in this process:
//
//   all       run scripts and drive the display (default, one container)
//   gatherer  run scripts only
//   pusher    drive the display only, from a store someone else fills
//
// Splitting is an option, not a requirement. Start with `all`.

import { mkdirSync } from 'node:fs';
import { loadConfig } from './core/config.js';
import { discoverScreens, selectScreens } from './core/screens.js';
import { Store } from './core/store.js';
import { PixooDevice } from './core/pixoo.js';
import { Gatherer } from './core/gatherer.js';
import { Pusher } from './core/pusher.js';
import { startServer } from './core/server.js';
import { log } from './core/log.js';

async function main() {
  const config = loadConfig();
  mkdirSync(config.dataDir, { recursive: true });

  log.info(`pixhub starting — mode=${config.mode}`);

  const discovered = await discoverScreens(config.screenDirs);
  log.info(`found ${discovered.size} screen(s): ${[...discovered.keys()].join(', ') || 'none'}`);

  const screens = selectScreens(config, discovered);
  if (screens.length === 0) {
    log.error('no screens to show — check SCREENS in .env and the screens/ folder');
  } else {
    log.info(
      `rotation: ${screens
        .map((s) => `${s.name}(${Math.round(s.durationMs / 1000)}s)`)
        .join(' -> ')}`
    );
  }

  const store = new Store(config.statePath);

  // Forget data for screens no longer selected, so the state file and the
  // status page don't accumulate ghosts.
  // Datasets, not screen names — several screens can share one.
  const active = new Set(screens.map((s) => s.dataset));
  for (const name of Object.keys(store.all())) {
    if (!active.has(name)) store.remove(name);
  }

  const runGatherer = config.mode === 'all' || config.mode === 'gatherer';
  const runPusher = config.mode === 'all' || config.mode === 'pusher';

  let gatherer = null;
  let pusher = null;
  let device = null;

  if (runGatherer) {
    gatherer = new Gatherer({ screens, store, config, log });
    gatherer.start();
  }

  if (runPusher) {
    device = new PixooDevice({
      baseUrl: config.bridgeUrl,
      commandDelayMs: config.commandDelayMs,
      log: log.child('pixoo'),
    });
    pusher = new Pusher({ screens, store, device, config, log });
  }

  const server = config.http.enabled
    ? startServer({ config, store, screens, pusher, gatherer, device, log })
    : null;

  shutdownOn(['SIGINT', 'SIGTERM'], () => {
    log.info('shutting down');
    gatherer?.stop();
    pusher?.stop();
    server?.close();
  });

  // Last, so the status page is already answering while the pusher waits for
  // the bridge to come up.
  if (pusher) await pusher.start();
}

function shutdownOn(signals, handler) {
  let done = false;
  for (const signal of signals) {
    process.on(signal, () => {
      if (done) process.exit(0);
      done = true;
      handler();
      setTimeout(() => process.exit(0), 1000).unref();
    });
  }
}

process.on('unhandledRejection', (err) => {
  log.error('unhandled rejection:', err instanceof Error ? err : String(err));
});

main().catch((err) => {
  log.error(err);
  process.exit(1);
});

// Runs each screen's script on its own schedule and stores what it printed.
// Never touches the display.

import { runScript } from './runner.js';

export class Gatherer {
  #screens;
  #store;
  #config;
  #log;
  #timers = new Map();
  #inFlight = new Map();

  constructor({ screens, store, config, log }) {
    this.#screens = screens.filter((s) => s.hasScript);
    this.#store = store;
    this.#config = config;
    this.#log = log.child('gatherer');
  }

  /**
   * Start polling. First runs are staggered so a handful of screens booting
   * together don't fire every request at once — several free APIs rate-limit on
   * burst rather than average.
   */
  start() {
    if (this.#screens.length === 0) {
      this.#log.info('no screens have scripts to run');
      return;
    }

    this.#screens.forEach((screen, index) => {
      setTimeout(() => {
        this.refresh(screen.name);
        const timer = setInterval(() => this.refresh(screen.name), screen.refreshMs);
        timer.unref?.();
        this.#timers.set(screen.name, timer);
      }, index * 750);

      this.#log.info(`"${screen.name}" every ${Math.round(screen.refreshMs / 1000)}s`);
    });
  }

  stop() {
    for (const timer of this.#timers.values()) clearInterval(timer);
    this.#timers.clear();
  }

  /**
   * Run one screen's script now. Concurrent calls for the same screen share the
   * in-flight run rather than spawning duplicate processes.
   */
  async refresh(name) {
    if (this.#inFlight.has(name)) return this.#inFlight.get(name);

    const screen = this.#screens.find((s) => s.name === name);
    if (!screen) return null;

    const promise = this.#run(screen).finally(() => this.#inFlight.delete(name));
    this.#inFlight.set(name, promise);
    return promise;
  }

  async #run(screen) {
    const started = Date.now();

    try {
      const data = await runScript(screen, {
        log: screen.log,
        timeoutMs: this.#config.scriptTimeoutMs,
      });

      this.#store.saveSuccess(screen.dataset, data);
      screen.log.info(`ran in ${Date.now() - started}ms`);
      return data;
    } catch (err) {
      this.#store.saveFailure(screen.dataset, err);
      const stale = this.#store.get(screen.dataset)?.data ? ' (keeping last good data)' : '';
      screen.log.error(`${err.message}${stale}`);
      return null;
    }
  }
}

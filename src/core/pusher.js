// Owns the display: decides what's on screen and pushes it. Reads the store,
// never writes it, so a failing script can't blank the display.

import { buildScene } from './scene.js';

export class Pusher {
  #screens;
  #store;
  #device;
  #config;
  #log;
  #index = 0;
  #timer = null;
  #current = null;
  #lastRenderAt = null;
  #lastError = null;
  #busy = false;
  #stopped = false;

  constructor({ screens, store, device, config, log }) {
    this.#screens = screens;
    this.#store = store;
    this.#device = device;
    this.#config = config;
    this.#log = log.child('pusher');
  }

  get status() {
    return {
      current: this.#current,
      lastRenderAt: this.#lastRenderAt,
      showable: this.#showable().map((s) => s.name),
      // A screen's script can be running perfectly while nothing reaches the
      // display — a dead bridge, or a device that stopped answering. Without
      // this the status page reports everything healthy while the panel is
      // frozen on whatever it last managed to draw.
      error: this.#lastError,
    };
  }

  /**
   * A screen is showable once its dataset has data. Screens still waiting on a
   * first successful run are skipped rather than drawn full of dashes, which
   * would look like real readings.
   *
   * A screen with no script AND no shared dataset — a clock, say — has no data
   * to wait for and is always showable.
   */
  #showable() {
    return this.#screens.filter((screen) => {
      const dataless = !screen.hasScript && screen.dataset === screen.name;
      return dataless || this.#store.hasData(screen.dataset);
    });
  }

  async start() {
    if (this.#screens.length === 0) {
      this.#log.warn('no screens selected — nothing to display');
      return;
    }

    await this.#waitForDevice();
    await this.#tick();
  }

  stop() {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /**
   * Show the next screen, then schedule the one after it.
   *
   * A timeout chain rather than a fixed interval, because each screen sets its
   * own duration — a scrolling screen can ask for longer than a static one.
   */
  async #tick() {
    if (this.#stopped) return;

    const shown = await this.next();
    const delay = shown?.durationMs ?? this.#config.rotateMs;

    this.#timer = setTimeout(() => {
      this.#tick().catch((err) => this.#log.error(err.message));
    }, delay);
    this.#timer.unref?.();
  }

  /** Advance to the next showable screen. Returns the screen shown, or null. */
  async next() {
    const screens = this.#showable();
    if (screens.length === 0) {
      this.#log.warn('waiting for a screen to produce data');
      return null;
    }

    const screen = screens[this.#index % screens.length];
    this.#index = (this.#index + 1) % screens.length;
    const ok = await this.show(screen.name);
    return ok ? screen : null;
  }

  /** Render a specific screen immediately, by name. */
  async show(name) {
    const screen = this.#screens.find((s) => s.name === name);
    if (!screen) {
      this.#log.warn(`no screen called "${name}"`);
      return false;
    }

    // Rotation and a manual "show now" would otherwise interleave their
    // commands and leave a half-drawn screen.
    if (this.#busy) {
      this.#log.debug('render already in progress, skipping');
      return false;
    }
    this.#busy = true;

    try {
      const record = this.#store.get(screen.dataset);

      const scene = buildScene(screen, {
        data: record?.data ?? null,
        fetchedAt: record?.fetchedAt ?? null,
        palette: this.#config.palette,
        brightness: this.#config.brightness,
        rightMargin: this.#config.rightMargin,
        assetDirs: screen.assetDirs,
      });

      // A screen using the small font composes its whole frame in the bridge
      // and pushes one image; the default path sends device text commands.
      await (scene.small
        ? this.#device.renderSceneSmall(scene)
        : this.#device.renderScene(scene));

      this.#current = name;
      this.#lastRenderAt = new Date().toISOString();
      this.#lastError = null;
      screen.log.info('displayed');
      return true;
    } catch (err) {
      // Keep it short: the bridge returns an HTML error page when the device
      // stops answering, and the whole thing is no use on a status card.
      this.#lastError = {
        screen: name,
        message: err.message.split('\n')[0].slice(0, 200),
        at: new Date().toISOString(),
      };
      screen.log.error(`render failed: ${err.message}`);
      return false;
    } finally {
      this.#busy = false;
    }
  }

  /**
   * On a cold `docker compose up` the pusher is usually ready before
   * pixoo-rest has bound its port.
   */
  async #waitForDevice(attempts = 20, delayMs = 3000) {
    for (let i = 1; i <= attempts; i++) {
      if (await this.#device.isReachable()) {
        this.#log.info(`bridge ready at ${this.#device.baseUrl}`);
        return;
      }
      this.#log.warn(`bridge not reachable (${i}/${attempts}), retrying in ${delayMs / 1000}s`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    this.#log.error('bridge never became reachable — continuing anyway, renders will fail');
  }
}

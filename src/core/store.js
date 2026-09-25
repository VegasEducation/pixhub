// Snapshot store: the seam between fetching and displaying.
//
// The gatherer writes the last good payload for each screen here; the pusher only
// ever reads. That decoupling is what lets the display keep showing sane numbers
// while an API is down, and lets a screen poll every 20 minutes while the display
// rotates every 30 seconds.
//
// A JSON file is deliberate: no native modules means the Docker image builds in
// seconds on a Raspberry Pi. Swap this module for SQLite if you ever want
// history — the interface is four methods.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  #path;
  #state;

  constructor(path) {
    this.#path = path;
    this.#state = this.#load();
  }

  #load() {
    if (!existsSync(this.#path)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.#path, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      // A truncated file from a hard power cut shouldn't stop the display
      // from booting — start clean and let the next poll refill it.
      return {};
    }
  }

  #persist() {
    mkdirSync(dirname(this.#path), { recursive: true });
    // Write-then-rename: a crash mid-write leaves the previous file intact
    // rather than a half-written one.
    const tmp = `${this.#path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.#state, null, 2));
    renameSync(tmp, this.#path);
  }

  /** Record a successful fetch. Clears any previous error for that key. */
  saveSuccess(key, data) {
    this.#state[key] = {
      data,
      fetchedAt: new Date().toISOString(),
      error: null,
      errorAt: null,
      failures: 0,
    };
    this.#persist();
  }

  /**
   * Record a failed fetch without discarding the last good data — a stale
   * price beats a blank screen.
   */
  saveFailure(key, error) {
    const previous = this.#state[key] || {};
    this.#state[key] = {
      ...previous,
      data: previous.data ?? null,
      error: String(error?.message || error),
      errorAt: new Date().toISOString(),
      failures: (previous.failures || 0) + 1,
    };
    this.#persist();
  }

  /** Full record for a key: { data, fetchedAt, error, errorAt, failures }. */
  get(key) {
    return this.#state[key] || null;
  }

  /** True when there is usable data to render, regardless of recent errors. */
  hasData(key) {
    return this.#state[key]?.data != null;
  }

  /** All records, for the status endpoint. */
  all() {
    return { ...this.#state };
  }

  /** Forget a screen's snapshot — used when a screen leaves the rotation. */
  remove(key) {
    if (!(key in this.#state)) return;
    delete this.#state[key];
    this.#persist();
  }
}

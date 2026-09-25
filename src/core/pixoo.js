// Device client. This is a client, not a driver.
//
// The protocol work is done by pixoo-rest (https://github.com/4ch1m/pixoo-rest
// by 4ch1m), a separate project we don't own and don't vendor — Compose pulls
// its published image. It handles the awkward parts of the Divoom protocol
// (chunked GIF upload, palette conversion, resizing) and exposes them over
// plain HTTP. It in turn builds on the pixoo Python library by
// SomethingWithComputers, which is where the small font comes from.
//
// Nothing above this file knows the wire format. If you want to drive the Pixoo
// some other way (direct TCP, a different bridge), reimplement this class and
// nothing else changes.

const MAX_TEXT_IDS = 20; // Divoom firmware limit on simultaneous HTTP text items

export class PixooDevice {
  #baseUrl;
  #commandDelayMs;
  #timeoutMs;
  #log;

  #lastBrightness = null;

  constructor({ baseUrl, commandDelayMs = 50, timeoutMs = 15_000, log }) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#commandDelayMs = commandDelayMs;
    this.#timeoutMs = timeoutMs;
    this.#log = log;
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  async #request(path, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const res = await fetch(`${this.#baseUrl}${path}`, { ...init, signal: controller.signal });
      const text = await res.text();
      if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Raw Divoom command, forwarded by pixoo-rest to the device. */
  passthrough(path, body) {
    return this.#request(`/passthrough/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** True once the bridge answers — used to wait for it at startup. */
  async isReachable() {
    try {
      await this.#request('/', { method: 'GET' });
      return true;
    } catch {
      return false;
    }
  }

  clearText() {
    return this.passthrough('draw/clearHttpText', { Command: 'Draw/ClearHttpText' });
  }

  /**
   * Upload a GIF as the background. pixoo-rest resizes for us, so source images
   * can be any square size — the bundled examples are 512x512 so they stay
   * editable.
   */
  async sendGif(buffer, filename = 'frame.gif', speed = 100) {
    const form = new FormData();
    form.append('gif', new Blob([buffer], { type: 'image/gif' }), filename);
    form.append('speed', String(speed));
    form.append('skip_first_frame', 'false');
    return this.#request('/sendGif', { method: 'POST', body: form });
  }

  /**
   * Draw a text item. `id` must be unique per visible string — reusing an id
   * replaces the earlier text, which is how the scene renderer avoids ghosting.
   *
   * `speed: 0` does NOT mean "don't scroll". If the string is wider than
   * TextWidth the firmware scrolls it anyway, and 0 gives the fastest, least
   * readable scroll there is. Nothing here relies on that because scene.js
   * truncates anything that would overflow — but a caller that skips the scene
   * layer needs to know.
   */
  sendText({ id, text, x, y, color = '#FFFFFF', font = 2, width = 64, speed = 0, dir = 0 }) {
    return this.passthrough('draw/sendHttpText', {
      Command: 'Draw/SendHttpText',
      TextId: id,
      x,
      y,
      dir,
      font,
      TextWidth: width,
      speed,
      TextString: String(text),
      color,
    });
  }

  setBrightness(level) {
    const clamped = Math.min(Math.max(Math.round(level), 0), 100);
    return this.#request(`/brightness/${clamped}`, {
      method: 'PUT',
      headers: { accept: 'application/json' },
    });
  }

  /**
   * Push a resolved scene to the device.
   *
   * Order matters and is not obvious: text must be cleared before the GIF goes
   * up (otherwise the old strings sit on top of the new background for a beat),
   * and brightness is set last so the screen doesn't flash at the previous level
   * while it draws. The small delay between commands is not superstition — the
   * device drops commands that arrive back-to-back.
   */
  async renderScene(scene) {
    await this.clearText();
    await this.#pause();

    if (scene.background) {
      await this.sendGif(scene.background.buffer, scene.background.name, scene.background.speed);
      await this.#pause();
    }

    const items = scene.items.slice(0, MAX_TEXT_IDS);
    if (scene.items.length > MAX_TEXT_IDS) {
      this.#log?.warn(
        `scene has ${scene.items.length} text items, device allows ${MAX_TEXT_IDS} — extras dropped`
      );
    }

    for (const [index, item] of items.entries()) {
      // No pause after the last one — nothing follows it that could be dropped.
      if (index > 0) await this.#pause();
      await this.sendText({ ...item, id: index + 1 });
    }

    // Brightness rarely changes between screens, and it's a whole extra round
    // trip. Only send it when it's actually different.
    if (scene.brightness != null && scene.brightness !== this.#lastBrightness) {
      await this.#pause();
      await this.setBrightness(scene.brightness);
      this.#lastBrightness = scene.brightness;
    }
  }

  // ── The other text path ──────────────────────────────────────────────────
  //
  // Everything above asks the *device* to draw text, on an overlay above the
  // picture, using its own fonts. The smallest of those is about 7px tall.
  //
  // These endpoints instead have pixoo-rest render glyphs itself into a frame
  // buffer, which is then pushed as one image. Its font is 3x5 on a 4px
  // advance, so it fits far more on screen — at the cost of the text being part
  // of the picture rather than an overlay, which means no hardware scrolling.

  /** Load an image into the bridge's buffer without pushing it yet. */
  async loadImage(buffer, filename = 'bg.gif', { push = false } = {}) {
    const form = new FormData();
    form.append('image', new Blob([buffer], { type: 'image/gif' }), filename);
    form.append('x', '0');
    form.append('y', '0');
    form.append('push_immediately', String(push));
    return this.#request('/image', { method: 'POST', body: form });
  }

  /** Fill the buffer with a solid colour, for screens with no background. */
  async fillBuffer({ r = 0, g = 0, b = 0, push = false } = {}) {
    const form = new FormData();
    form.append('r', String(r));
    form.append('g', String(g));
    form.append('b', String(b));
    form.append('push_immediately', String(push));
    return this.#request('/fill', { method: 'POST', body: form });
  }

  /** Draw text into the buffer with the bridge's own small font. */
  async drawSmallText(text, { x = 0, y = 0, color = '#FFFFFF', push = false } = {}) {
    const { r, g, b } = hexToRgb(color);
    const form = new FormData();
    form.append('text', String(text));
    form.append('x', String(x));
    form.append('y', String(y));
    form.append('r', String(r));
    form.append('g', String(g));
    form.append('b', String(b));
    form.append('push_immediately', String(push));
    return this.#request('/text', { method: 'POST', body: form });
  }

  /**
   * Push a scene using the small font.
   *
   * The whole frame is composed in the bridge and sent once, so this needs no
   * inter-command delay — the device sees a single image, not a burst of text
   * commands.
   */
  async renderSceneSmall(scene) {
    // The device's own text overlay would otherwise sit on top of the image we
    // are about to push, leaving the previous screen's text visible.
    await this.clearText();
    await this.#pause();

    if (scene.background) {
      await this.loadImage(scene.background.buffer, scene.background.name);
    } else {
      await this.fillBuffer();
    }

    const items = scene.items;
    if (items.length === 0) {
      // Nothing to draw over it, so the background still needs pushing.
      await this.fillBuffer({ push: true });
      return;
    }

    for (const [index, item] of items.entries()) {
      await this.drawSmallText(item.text, {
        x: item.x,
        y: item.y,
        color: item.color,
        // The final call is what sends the composed frame to the device.
        push: index === items.length - 1,
      });
    }

    if (scene.brightness != null && scene.brightness !== this.#lastBrightness) {
      await this.setBrightness(scene.brightness);
      this.#lastBrightness = scene.brightness;
    }
  }

  #pause() {
    return new Promise((resolve) => setTimeout(resolve, this.#commandDelayMs));
  }
}

/** "#00FFAA" -> { r: 0, g: 255, b: 170 }, since /text takes components. */
function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

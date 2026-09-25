# Architecture

> **Built and tested on a Pixoo 64.** Pixoo is a product line — 16×16 and 32×32
> models exist. They should work with `PIXOO_SIZE` set, but that is **completely
> untested and display problems should be expected**; every coordinate below
> assumes 64×64. See the README's [Other panel sizes](../README.md#other-panel-sizes).

Read this if you're changing the engine. To write a screen you only need
[writing-a-screen.md](writing-a-screen.md).

## The shape of it

```
.env (SCREENS) ──┐
                 ├─▶ screens ──▶ selected ──┬─▶ gatherer ──▶ runner ──▶ your script
screens/*/ ──────┘                          │                              │
                                            │                            store
                                            └─▶ pusher ◀──────────────────┘
                                                   │
                                          scene ◀ template
                                                   │
                                                 pixoo ──▶ pixoo-rest ──▶ device
```

**The store is the seam.** The gatherer only writes; the pusher only reads.
Nothing else crosses. That one decision buys three properties:

- Script cadence and rotation cadence are independent. A screen can run its
  script every 20 minutes against a rate-limited API while the display changes
  every 30 seconds.
- A failing script cannot blank the display — the last good payload stays.
- Either half can run in its own process (`MODE=gatherer` / `MODE=pusher`)
  without any screen changing.

## Modules

| File | Responsibility |
|---|---|
| `core/config.js` | Read `.env` into one settings object; parse `SCREENS` |
| `core/screens.js` | Find screen folders, load and validate `screen.json` |
| `core/runner.js` | Spawn a screen's script, enforce a timeout, parse its stdout |
| `core/gatherer.js` | Run each script on its own interval |
| `core/store.js` | Persist last-known-good data per screen |
| `core/pusher.js` | Decide what's on display; drive rotation |
| `core/template.js` | `{{paths}}`, formats, data-driven colours |
| `core/scene.js` | Turn `screen.json` + data into concrete draw calls |
| `core/text.js` | Font width tables; measurement, alignment, truncation |
| `core/pixoo.js` | The only module that knows the wire protocol |
| `core/format.js` | Display-sized formatting primitives |
| `core/server.js` | Status page and control API |

## Design notes

**Screens are found, not registered.** `screens.js` scans for folders containing
a `screen.json`. There's no list to edit and no import to add, so a screen is
something you can zip up and send to someone.

**The script contract is stdout.** A subprocess boundary costs a few
milliseconds per poll and buys language independence — which matters more here
than the milliseconds, because the interesting screens are the ones nobody
anticipated. It also means a screen can't crash the engine, hold its event loop,
or leak memory into it.

**Layout is data.** `screen.json` describes what to draw; `template.js` and
`scene.js` interpret it. This keeps visual changes out of code, which is what
makes a screen editable by someone who doesn't write JavaScript. `render.js`
exists for the rare layout that genuinely needs logic.

**Countdowns are formats, not values.** Anything time-relative has to be
computed when the screen is *drawn*, not when the script runs, or it's stale by
up to one refresh interval. That's why `countdown`, `time` and `date` are render
-time formats and `{{$now}}` is a built-in.

**Failures are contained at every layer.** A malformed `screen.json` is logged
and skipped. A script that exits non-zero keeps its previous data. A render that
throws skips that rotation slot. One bad screen never takes the display down.

**Text ids are assigned by the engine.** The Divoom API needs a unique `TextId`
per visible string and silently overwrites on collision. `scene.js` assigns them
positionally, so no screen has to think about it.

**Command order in `pixoo.js` is not arbitrary.** Text is cleared before the GIF
uploads (otherwise old strings sit over the new background for a beat), and
brightness is set last (otherwise the screen draws at the previous level and
visibly jumps). The delay between commands isn't superstition either — the
device drops commands that arrive back to back.

**Font widths are a lookup table.** The device won't tell you how wide a string
will render, so right-aligning anything requires knowing locally. The table in
`text.js` is measured, not derived, and is overridable per character via
`FONT_WIDTHS` so a firmware difference needs no code change.

**Screens without data are hidden, not blanked.** A screen whose script has
never succeeded is skipped in rotation. Drawing it full of `-` would look like
real readings.

**No runtime dependencies.** `.env` parsing, scheduling and storage are each a
few dozen lines rather than three packages, and the store is a JSON file rather
than SQLite. The payoff is an image that builds in seconds on a Pi with no
native compilation, and a supply chain of exactly zero.

## Rotation timing

The pusher uses a `setTimeout` chain rather than a fixed interval, because each
screen sets its own duration — a scrolling screen can ask for longer than a
static one. Precedence: `:seconds` in `SCREENS`, then `duration` in
`screen.json`, then `ROTATE_SECONDS`.

## Storage

`data/state.json`, one record per screen:

```json
{
  "crypto": {
    "data": [ ... ],
    "fetchedAt": "2026-08-06T14:22:42.000Z",
    "error": null,
    "errorAt": null,
    "failures": 0
  }
}
```

Written with write-then-rename so a crash mid-write can't corrupt it; a
truncated file is discarded on load rather than crashing the boot. Records for
screens no longer selected are dropped at startup.

If you want history — sparklines, day-over-day deltas — replace `store.js`. The
interface is `saveSuccess`, `saveFailure`, `get`, `hasData`, `all`, `remove`.

## Adding a different display

`pixoo.js` is the only module that knows the wire format. Implement the same
methods (`renderScene`, `setBrightness`, `isReachable`) against another
transport and everything above it — screens included — works unchanged.

## What pixhub doesn't include

`core/pixoo.js` is a client, not a driver. The actual protocol work happens in
[pixoo-rest](https://github.com/4ch1m/pixoo-rest) (by 4ch1m), which is built on
the [pixoo](https://github.com/SomethingWithComputers/pixoo) Python library (by
SomethingWithComputers). Neither is our code and neither is vendored here —
Compose pulls the published image at run time.

That boundary is why `pixoo.js` is the only module that knows anything about the
wire format, and it's what makes the second text renderer possible at all: the
small font is the `pixoo` library rasterising glyphs, not the device drawing
them.

Note that the `pixoo` library is CC BY-NC-SA 4.0. It doesn't affect this
repository's MIT licence, since none of it is included here, but anyone
considering commercial use should read it — see the Credits section of the
README.

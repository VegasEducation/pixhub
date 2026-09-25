# Artwork

> **Built and tested on a Pixoo 64.** Pixoo is a product line — 16×16 and 32×32
> models exist. They should work with `PIXOO_SIZE` set, but that is **completely
> untested and display problems should be expected**; every coordinate below
> assumes 64×64. See the README's [Other panel sizes](../README.md#other-panel-sizes).

Backgrounds are GIFs. `pixoo-rest` downscales whatever you send to 64×64, so
source files can stay at a comfortable editing size — the bundled ones are
512×512, which is 8× the display.

## The bundled backgrounds are static — they don't have to be

Every image shipped with pixhub is a **single-frame** GIF. That's a choice about
those particular pictures, not a limitation: the format is GIF because that's
what the device accepts, and **animated GIFs work exactly the same way**.

Drop an animated GIF in a screen's folder, name it as the `background`, and it
plays. Control the frame rate per screen:

```json
"background": "rocket-launch.gif",
"backgroundSpeed": 100
```

Lower is faster. Text drawn on top stays put while the background animates —
with `textMode: "device"`, at least, since the device draws text on an overlay
above the picture. With `textMode: "small"` the text is composited *into* a
frame, so an animated background will play without the text.

Worth knowing: an animated background is re-uploaded on every rotation, so a
long or large animation makes screen changes slower. Keep them short.

## The template

A 64×64 screen fits an image *or* text, not both, unless you plan for it. The
bundled artwork uses one pattern:

```
      0 ┌──────────────────────────┐
        │                          │
        │          LOGO            │   image lives here
        │                          │
     37 ├──────────────────────────┤   1px divider
     40 │  Subs               16.9M │   text lives here
     52 │  Views               9.7B │
     63 └──────────────────────────┘
```

Everything below the divider is pure black, so drawn text sits on a clean
background. The divider itself is only a visual separator — nothing in the code
knows about it. It's the `y` values in screen.json that decide where text lands.

## Measured positions

Verified against the actual files, in 64px display coordinates:

| File | Source size | Divider at | Rows the screen uses |
|---|---|---|---|
| `screens/ltt/ltt.gif` | 512×512 | y 37–38 | `40`, `52` |
| `screens/crypto/bitcoin.gif` | 512×512 | y 37–38 | `40`, `52` |
| `screens/spacex/spacex.gif` | 512×512 | y 22–24 | `26`, `36`, `46`, `56` |
| `assets/black.gif` | 64×64 | — | anywhere |

If you make artwork with a different divider height, change the `y` values in
that screen's `screen.json` — no code involved.

## Making your own

1. Start from a 512×512 canvas with a **black** background. Black reads as
   "off" on an LED matrix, so it's genuinely invisible; dark grey is not.
2. Put your logo in the top portion. Leave `(64 - firstRowY) × 8` pixels of
   black at the bottom for text — for two rows of text that's about 200px of a
   512px canvas.
3. Optionally draw a 1–2px white line as a divider (12px at 512 scale).
4. Export as GIF. Animated GIFs work; set `backgroundSpeed` to control them.
5. Drop it in the screen's own folder (or `assets/`) and reference it by
   filename.

Detail below about 3 source pixels — 8px at 512 — disappears entirely at 64×64.
Bold shapes and flat colour survive the downscale; gradients and thin outlines
do not. Check the result on the device, not in your editor.

## Where files are looked up

`"background": "weather.gif"` is searched for in order:

1. The screen's own folder (`screens/weather/weather.gif`) — which is what
   makes a screen self-contained enough to hand to someone else.
2. `assets/` — for images shared between screens.

An absolute path also works if you keep artwork somewhere else entirely.

## Text-only screens

Clearing text doesn't clear the previous screen's image, so a screen with no
`background` inherits whatever came before it. Use `"background": "black.gif"` —
a plain 64×64 black frame included in `assets/` for exactly this.

## Trademarks

The Linus Tech Tips, Bitcoin and SpaceX marks in `screens/` belong to their
respective owners and are included only as example artwork for a personal
display. This project is not affiliated with, endorsed by, or sponsored by any
of them. Replace them with your own images before redistributing.

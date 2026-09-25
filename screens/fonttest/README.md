# fonttest — a tool, not a display

Shows what the device's built-in font ids actually look like, side by side.

## Why this exists

`Draw/SendHttpText` takes a `font` number, but the ids aren't documented
anywhere reliable and this firmware doesn't answer
`Device/GetTimeDialFontList`. Worse, **ids the firmware doesn't recognise fall
back to a default rather than failing**, so "I asked for a smaller font and got
a bigger one" is a normal experience.

The only way to know is to draw the same text at each id and look.

## How to use it

```ini
SCREENS=fonttest
FONTTEST_FONTS=0 1 2 3
FONTTEST_TEXT=Ag8
```

then `docker compose up -d pixhub` (**not** `restart` — that won't re-read
`.env`).

Each row draws `FONTTEST_TEXT` at one font id, labelled on the left. The label
is always font 2 so it stays readable even if the font being tested renders as
nothing.

`Ag8` is the default sample on purpose: a capital, a descender and a digit in
three characters, so you can judge cap height and overall size at a glance.

What to look for:

- rows visibly **smaller or larger** than f2
- rows **identical to each other** — that's the firmware falling back
- rows **blank or garbled** — an id it doesn't support at all

Four rows at a time, since a tall font needs the spacing. Raise `FONTTEST_STEP`
if rows collide.

## What was found on a Pixoo 64

All of 0–7 render and are distinct, ordered smallest first:

```
f2  <  f0  <  f3  <  f1        f4, f5, f7 larger and similar; f6 largest
                               f5 and f6 noticeably bold
```

**f2 is the smallest built-in font there is.** Every bundled screen uses it.

If you want smaller text than f2, the device can't do it — but the bridge can.
Set `"textMode": "small"` on a screen for a 3×5 font at 16 characters a line;
see [`../ltt-small`](../ltt-small).

## If a font looks wrong

Only font 2's character widths have been measured. The others are estimates, so
right-aligning or centring in them will be off until you correct it:

```ini
FONT_WIDTH_4=7      # pixels per character for a fixed-width font
FONT_HEIGHT_4=12    # row height, if rows collide or clip
```

Check a font with `npm run calibrate -- 4`, which draws right-aligned samples —
if they don't finish flush against the edge, the width is wrong. Previews mark
any font other than 2 as unverified so you know when you're on an estimate.

## This screen is also the render.js example

There's no `rows` or `items` in `screen.json` here — the layout comes from
[`render.js`](render.js), because each row needs a *different* font and the
config format deliberately can't express that. It's the one case the escape
hatch exists for, and it's about twenty lines. See
[../../docs/writing-a-screen.md](../../docs/writing-a-screen.md#the-renderjs-escape-hatch).

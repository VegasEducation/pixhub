# testcard — a tool, not a display

Checks pixhub's font width table against your actual panel.

## Why this exists

The Pixoo won't tell you how wide a string will render, and this firmware
doesn't answer the command that lists font metrics. So to centre or right-align
anything, pixhub keeps its own table of character widths in
[`src/core/text.js`](../../src/core/text.js).

Every character in the bundled screens' labels was measured with this card. If
your device or firmware differs, this is how you find out and fix it.

## How to use it

```ini
SCREENS=testcard
TESTCARD_CHARS=$ , . % K M W
```

then `docker compose up -d pixhub` (**not** `restart` — that reuses the
container and won't re-read `.env`).

Every line is drawn **right-aligned and flush to the edge**, so the right side
of the panel acts as a ruler:

| What you see | What it means |
|---|---|
| line ends exactly at the edge | that character's width is correct |
| line stops short | pixhub thinks it's **wider** than it really is |
| line runs off or wraps | pixhub thinks it's **narrower** than it really is |

Single characters are repeated five times, so a 1px error shows up as 5px and is
hard to miss. The dim label on the left says which row is which — though on very
wide characters it's dropped, because the line leaves no room for it.

## Configuring what it draws

```ini
TESTCARD_CHARS=A B C D E F     # space separated, one per row, six rows max
TESTCARD_REPEAT=5              # copies per row
```

Entries **longer than one character are drawn as-is**, which checks several
characters at once:

```ini
TESTCARD_CHARS=BTCBTC|ETHETH|AugAug|$1,908
```

Use `|` as the separator when an entry needs to contain a space — `8 8 8 8 8` is
the only way to measure the space character itself.

String rows are fast when they pass and ambiguous when they fail: `ETHETH` being
short tells you E or H is wrong but not which. Fall back to one per row.

## Fixing what you find

**Correct it in `.env`, not in source:**

```ini
FONT_WIDTHS="M:8,W:8"    # individual characters of font 2 (proportional)
FONT_WIDTH_4=7           # advance for a fixed-width font
FONT_HEIGHT_4=12         # row height, if rows collide or clip
```

Only edit [`src/core/text.js`](../../src/core/text.js) if you want the change to
be the new default for everyone — and note the header there lists which
characters are measured and which are still estimates.

There's also `npm run calibrate -- <font>`, which draws a quick right-aligned
sample without changing `SCREENS`.

## When you're done

Put your real screens back:

```ini
SCREENS=ltt,crypto,spacex
```

# Writing a screen

> **Built and tested on a Pixoo 64.** Pixoo is a product line — 16×16 and 32×32
> models exist. They should work with `PIXOO_SIZE` set, but that is **completely
> untested and display problems should be expected**; every coordinate below
> assumes 64×64. See the README's [Other panel sizes](../README.md#other-panel-sizes).

A screen is a folder in `screens/`. It needs one file:

```
screens/weather/
├── screen.json     # required — layout and settings
├── fetch.sh        # optional — prints JSON to stdout
└── weather.gif     # optional — background image
```

`screens/` is bind-mounted, so adding or editing a screen needs a restart, not a
rebuild. Add the folder name to `SCREENS` in `.env` and it joins the rotation.

Start by reading `screens/clock/` — it's a `screen.json` and nothing else.

---

## The script

**The entire contract: print JSON to stdout, exit 0.**

Anything else is yours. The container has `sh`, `python3`, `node`, `curl` and
`jq`; a compiled binary works too. The script runs with its own folder as the
working directory and inherits every variable from `.env`, which is how it gets
API keys.

```sh
#!/bin/sh
# screens/crypto/fetch.sh — a complete, working screen script
curl -sfS "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
```

```python
#!/usr/bin/env python3
import json, os, sys, urllib.request

with urllib.request.urlopen(f"https://api.example.com/x?key={os.environ['MY_KEY']}") as r:
    data = json.load(r)

# Diagnostics go to stderr — stdout is JSON only.
print(f"got {len(data)} records", file=sys.stderr)
print(json.dumps({"count": len(data)}))
```

**stdout is JSON only.** A stray `echo`, a progress line, or `set -x` output
will break parsing. Everything else goes to stderr, where it's logged (visible
with `LOG_LEVEL=debug`).

**Exit non-zero to signal failure.** The error is logged and shown on the status
page, and the previous good data is kept — the display doesn't blank because an
API had a bad minute. Failed runs are retried automatically with backoff, so
your script doesn't need to.

**Return display-ready values.** Splitting strings, picking one item out of a
list, unit conversion — do it in the script, where you have a real language.
The config is for placement and formatting.

Two exceptions that must *not* be precomputed: **countdowns and clocks**. A
script that runs every 15 minutes would produce a countdown up to 15 minutes
stale. Return the raw timestamp and use the `countdown` or `time` format, which
are evaluated each time the screen is drawn.

### How the script is run

| in `screen.json` | what happens |
|---|---|
| `"script": "fetch.sh"` | run directly if executable, else by extension |
| `"command": ["node", "x.js", "--flag"]` | run verbatim |

Recognised extensions: `.js` `.mjs` (node), `.py` (python3), `.sh` (sh),
`.bash`, `.rb`, `.pl`. A script doesn't need its executable bit — that's checked
first, and the interpreter is used otherwise, so a screen still works after a
checkout that dropped file modes.

Scripts also get `PIXHUB_SCREEN` and `PIXHUB_SCREEN_DIR`, so one script can
serve several screens that point at it.

---

## screen.json

```json
{
  "name": "Crypto prices",
  "description": "Price and 24h direction",

  "script": "fetch.sh",
  "refresh": "5m",
  "requiredEnv": ["SOME_API_KEY"],

  "background": "bitcoin.gif",
  "duration": "45s",
  "brightness": 60,

  "rows": [ ... ],
  "items": [ ... ]
}
```

| field | |
|---|---|
| `name` | shown on the status page |
| `description` | shown on the status page |
| `script` / `command` | how to get data; omit for a screen with none |
| `dataset` | which saved data to read/write; defaults to the screen name |
| `refresh` | how often to run it — `"45s"`, `"10m"`, `"2h"`, `"1h30m"` |
| `textMode` | `"device"` (default) or `"small"` — see below |
| `requiredEnv` | screen is skipped, with a message, if any are unset |
| `background` | image filename, looked up in this folder then `assets/` |
| `backgroundSpeed` | frame speed for animated GIFs (default 100) |
| `duration` | seconds on screen; overridden by `:seconds` in `SCREENS` |
| `brightness` | 0–100 for this screen only |
| `rows` | label-left / value-right lines |
| `items` | free-form text |
| `samples` | example payloads for `preview --samples` |

`//` comments are allowed in `screen.json`. Everything is optional except
something to draw.

Be honest with `refresh` — note the API's rate limit in a comment next to it. A
screen that gets people rate-limited is a bad screen.

---

## Sharing data between screens

A script's output is saved under a **dataset**, which defaults to the screen's
own name. Point several screens at the same dataset and they share one fetch:

```json
{ "name": "Prices", "script": "fetch.sh", "dataset": "crypto", "rows": [ ... ] }
{ "name": "Movers", "dataset": "crypto", "rows": [ ... ] }
```

Exactly one screen in the group has the script; the rest just name the dataset
and read it. This is how you show five views of one scrape without hitting the
API five times, and it's what `ltt-small` does — same data as `ltt`, different
layout and renderer, one API call.

Screens sharing a dataset are still independent in every other way: their own
artwork, layout, duration, brightness and text mode.

pixhub warns at startup if two screens with scripts share a dataset (they'd
each fetch and overwrite each other) or if a screen reads a dataset nothing
writes (it would never have data).

## Referring to your data

`{{paths}}` reach into whatever your script printed.

```
{{price}}                  top-level key
{{current.temperature}}    nested
{{coins.0.symbol}}         array index
{{.}}                      the whole payload (a script that prints an array)
```

Run `npm run data -- <screen>` to print the JSON and a few example paths.

Built-ins, prefixed with `$` so they can't collide with your keys:

| | |
|---|---|
| `{{$now}}` | current time, ISO — this is how the clock screen needs no script |
| `{{$fetchedAt}}` | when this screen's data was last collected |
| `{{$env.SOME_VAR}}` | an environment variable |

A string that is exactly one placeholder passes the **raw value** through, so
numbers and timestamps reach the formatters intact. Anything else is text
substitution: `"{{symbol}}/USD"` and `"T-{{days}}d"` work as written.

---

## Rows

Most screens are a stack of `Label ............ Value`.

```json
"rows": [
  { "label": "Subs", "value": "{{subs}}", "format": "compact", "y": 40 },
  { "label": "Views", "value": "{{views}}", "format": "compact", "y": 52 }
]
```

Every position, size and colour in a row is set here, per screen. Label and
value are styled independently, so a small caption can sit beside a big number.

| field | default | |
|---|---|---|
| `y` | *required* | top edge for the row, 0–63 |
| `label` | — | left-aligned text |
| `value` | — | right-aligned text |
| `format` | — | applied to `value` (see below) |
| `labelFormat` | — | applied to `label` |
| `prefix` / `suffix` | — | wrapped around the formatted value |
| `font` | `2` | default size for both parts of the row |
| `labelFont` | `font` | size of the label alone |
| `valueFont` | `font` | size of the value alone |
| `labelY` | `y` | vertical position of the label alone |
| `valueY` | `y` | vertical position of the value alone |
| `labelX` | `1` | left inset of the label |
| `valueX` | auto | exact x; omit to right-align |
| `valueOffset` | `0` | nudge the right-aligned value; positive = right |
| `gap` | `2` | minimum pixels between label and value |
| `color` | `#00FFAA` | the value's colour |
| `labelColor` | `#FFFFFF` | |
| `fallback` | `-` | shown when the path resolves to nothing |
| `when` / `unless` | — | show this row conditionally |
| `adapt` | — | change any of the above based on the value (below) |
| `autoFont` | — | pick the largest size that fits (below) |

The value gets the width it needs and the label is truncated around it, because
the value is the reason the row exists. Different fonts have different heights,
so when you mix them use `labelY` / `valueY` to line them up.

### Repeating a row over a list

When your script returns a list and you don't know — or don't care — how long it
is:

```json
"rows": {
  "each": "{{.}}",
  "limit": 2,
  "startY": 40,
  "stepY": 12,

  "label": "{{symbol}}",
  "labelFormat": "upper",
  "value": "{{current_price}}",
  "format": "price",
  "color": "trend:{{price_change_percentage_24h}}"
}
```

Inside `each`, `{{paths}}` resolve against the current entry. `limit` is how
many rows to draw — this is where you decide how many values the screen shows.
`startY` and `stepY` place them.

---

## Items

For anything that isn't a label/value pair.

```json
"items": [
  { "text": "{{mission}}", "y": 36, "x": 1, "scroll": true },
  { "text": "{{net}}", "format": "countdown", "prefix": "T-", "y": 56, "align": "center" }
]
```

| field | default | |
|---|---|---|
| `text` | *required* | |
| `y` | *required* | top edge, 0–63 |
| `x` | — | exact position; omit to use `align` |
| `align` | `left` | `left` \| `center` \| `right` |
| `offset` | `0` | nudge an aligned item; positive = right |
| `format`, `prefix`, `suffix` | — | as for rows |
| `color` | `#FFFFFF` | |
| `font` | `2` | 2 is proportional; 0/1/4/8 are fixed-width |
| `scroll` | `false` | scroll instead of truncating |
| `speed` | `100` | scroll speed, when `scroll` is on |
| `maxWidth` | 64 | truncation budget in pixels |
| `fallback` | `""` | empty means the item is skipped entirely |
| `when` / `unless` | — | show conditionally |
| `adapt` | — | change any of the above based on the value (below) |
| `autoFont` | — | pick the largest size that fits (below) |

Text wider than the display is truncated with `..` unless `scroll` is set —
nothing silently runs off the edge.

---

## Adapting to the value

A subscriber count can be `938`, `1.2K` or `16.9M`. Those are 17, 20 and 27
pixels wide, and what looks right for one looks wrong for the others. Rather
than picking a compromise, state the rules.

### `adapt`

Rules are tested in order; **the first match wins**. A rule with no `if` is the
fallback, so put it last. Anything a row or item accepts can be overridden —
font, position, colour, format, prefix.

```json
{
  "label": "Subs",
  "value": "{{subs}}",
  "y": 40,

  "adapt": [
    { "if": { "under": 10000 },   "format": "commas" },
    { "if": { "maxChars": 5 },    "format": "compact", "valueFont": 2 },
    {                             "format": "compact", "valueFont": 1 }
  ]
}
```

Conditions inside `if` — give several and **all** must hold:

| | |
|---|---|
| `under` | raw number is less than this |
| `atLeast` | raw number is this or more |
| `maxChars` / `minChars` | length of the formatted string |
| `maxPixels` / `minPixels` | measured width of the formatted string |
| `equals` | formatted string matches exactly |

`under` and `atLeast` test the **raw** value from your script, so
`{ "under": 1000000 }` means "below a million" regardless of how it's
formatted. `maxChars` and `maxPixels` test the **formatted** string, which is
what actually has to fit. A rule that changes `format` re-renders the value
afterwards.

### `autoFont`

When the rule is simply "use the biggest size that fits", skip the rules:

```json
{ "label": "Subs", "value": "{{subs}}", "format": "compact",
  "y": 40, "autoFont": [4, 2, 1] }
```

Fonts are tried in order and the first whose rendered width fits the space left
by the label is used. If none fit, the last one is used and the label gives up
room — so put your smallest font last.

### Vertical positions are yours too

`adapt` can move things, not just resize them. A taller font usually needs to
sit higher to stay optically centred:

```json
"adapt": [
  { "if": { "maxChars": 3 }, "valueFont": 4, "valueY": 38, "labelY": 42 },
  { "valueFont": 2 }
]
```

---

## Tuning the layout

You should not have to redeploy and squint at the device to get this right.

**Try values you invent:**

```bash
npm run preview -- ltt --data '{"subs":938,"views":4210}'
```

**Check every magnitude at once.** Put the cases your layout has to survive in a
`samples` array in `screen.json`:

```json
"samples": [
  { "subs": 42,       "views": 938 },
  { "subs": 9840,     "views": 421000 },
  { "subs": 16900000, "views": 9709487658 },
  { "subs": null,     "views": 12300000 }
]
```

```bash
npm run preview -- ltt --samples
```

Every sample renders in sequence. This is the fast way to confirm that a change
which fixed `16.9M` didn't break `938`.

**Read the numbers, not just the picture.** Each preview prints the resolved
position, font and measured width of every string:

```
    y=40  x= 1  font 2  21px  "Subs"
    y=40  x=37  font 2  27px  "16.9M"
```

and warns when two lines will collide vertically:

```
  ! "42" (y=28, font 4, ~10px tall) runs into "Subs" at y=34
```

---

## Two ways to draw text

There are two completely separate text paths, and a screen picks one with a
single line. This is probably the most useful thing to know about the project,
because the second one isn't obvious from Divoom's own tooling.

```json
"textMode": "device"    // the default — the Pixoo draws the text
"textMode": "small"     // the bridge draws it, much smaller
```

|  | `device` (default) | `small` |
|---|---|---|
| Who renders | the Pixoo's firmware | pixoo-rest, in software |
| Font | the device's built-ins, `font: 0`–`8` | fixed 3×5 PICO-8 |
| Character width | 2–11px, proportional | exactly 4px |
| Characters per line | ~8–12 | **16** |
| Row spacing | 9px, lowest row `y=52` | **6px, down to `y=58`** |
| Rows on screen | about 6 | about **10** |
| Scrolling | yes, in hardware | **no** |
| How it reaches the sign | text overlaid on the picture | composed into the picture |

**Use `device` when** you want a logo with a couple of big readable numbers, or
you need text to scroll. It's the default for good reason.

**Use `small` when** you want to fit more on screen. `screens/ltt-small` is the
same data and the same artwork as `screens/ltt`, but with three rows instead of
two — and it still clears the bottom edge that font 2 can't reach.

Everything else is identical: the same `rows`, `items`, `{{paths}}`, formats,
colours, `adapt` rules and alignment all work in both. Only the renderer
changes.

### Why they can't be mixed on one screen

The device draws its text on an overlay *above* the picture; the bridge draws
into the picture *itself*. Both can technically be on screen at once, but their
coordinates and metrics don't relate to each other in any way you'd want to
reason about, so `textMode` applies to a whole screen. Per-item `font` values
are ignored when `textMode` is `small`.

### Small font specifics

- 88 characters are supported: letters, digits, and
  ``!$%'()+,-./:;<=>?@[]^_{|}~``. **A backtick, a double quote, a backslash, an
  ampersand, an asterisk or a hash draws as blank space** — the font has no
  glyph for them.
- 16 characters per line, exactly. `measureText` knows this, so `align`,
  truncation and `adapt` all behave.
- No hardware scrolling. `"scroll": true` is ignored — long text is truncated
  instead, so give it a `maxWidth` or keep it short.
- Metrics come from the renderer's own source rather than measurement, so
  they're exact. Nothing to calibrate.

## Checking character widths against your device

`screens/testcard/` is a tool rather than a display. Point `SCREENS` at it and
every line is drawn **flush against the right edge**, which turns the edge of
the panel into a ruler:

| what you see | what it means |
|---|---|
| line ends exactly at the edge | that character's width is correct |
| line stops short | pixhub thinks it's wider than it really is |
| line runs off or wraps | pixhub thinks it's narrower than it really is |

Single characters are repeated five times, so a 1px error shows up as a 5px
error and is impossible to miss. The label on the left tells you which row is
which.

```ini
SCREENS=testcard
TESTCARD_CHARS=$ , . % K M W
```

Entries longer than one character are drawn as-is, which is how you check a
real value: `TESTCARD_CHARS="$1,908 16.9M 9.7B"`.

Then correct anything that's off with `FONT_WIDTHS` in `.env` — see below — and
restart. Put your normal screens back in `SCREENS` when you're done.

## A caution about fonts

**Only font 2 has been measured on real hardware.** It's proportional, it's what
every bundled screen uses, and its per-character widths are accurate.

The other fonts are treated as fixed-width with estimated advances. This
firmware doesn't answer the device's font-list query, so there's no way to ask
it — if you use another font, verify it:

```bash
npm run calibrate -- 4
```

That draws right-aligned strings at that font. If the width table is right they
finish flush against the right edge; a gap or an overflow means it's wrong.
Correct it in `.env` without touching code:

```ini
FONT_WIDTH_4=7          # advance for fixed-width font 4
FONT_WIDTHS="M:8,W:8"   # individual glyphs of font 2
```

Approximate heights, used for the overlap warnings: font 0/1 ≈ 6px, 2/3/5/6/7 ≈
7px, 4/8 ≈ 10px.

Previews mark any font other than 2 as unverified, so you'll know when you're
relying on an estimate.

---

## Formats

`"format": "price"`, or with an argument, `"format": "price:€"`.

| | example |
|---|---|
| `text` | unchanged (default) |
| `compact` | `16900000` → `16.9M`; `compact:0` → `17M` |
| `price` | `64354` → `$64.4K`; `0.42` → `$0.4200`; `price:€` |
| `percent` | `2.1` → `+2.1%`; `percent:2` → `+2.10%` |
| `commas` | `3902` → `3,902` |
| `round` | `21.7` → `22`; `round:1` → `21.7` |
| `countdown` | ISO date → `2d 3h`, `12m`, `LIVE`; `countdown:LAUNCHED` |
| `datetime` | ISO date → `Aug 8 14:00` |
| `date` | → `Thu, Aug 6`; `date:long` → `Thursday, Aug 6` |
| `time` | → `14:32` |
| `upper` / `lower` | case |
| `fit:62` | truncate to 62px, adding `..` |
| `fitWords:62` | drop trailing words to fit — `Falcon 9 Block 5` → `Falcon 9` |

Dates honour `TZ` from `.env`. `npm run formats` prints this list.

---

## Colours

```json
"color": "#FF3B00"
"color": "accent"
"color": "trend:{{change24h}}"
"color": { "match": "{{status}}",
           "cases": { "Go": "green", "TBC": "amber" },
           "default": "grey" }
```

- **Hex** — literal.
- **Name** — `white` `black` `grey` `dim` `accent` `green` `red` `amber` `blue`
  `orange` `yellow`.
- **`trend:{{path}}`** — green when positive, red when negative, grey at zero.
- **`match`** — pick by value, with a `default` for anything unlisted.

---

## Conditional rows and items

`when` shows something only if a value is truthy; `unless` is the inverse.
Empty string, `0`, `false`, `null` and an empty array all count as false.

```json
{ "when": "{{firm}}", "text": "{{net}}", "format": "countdown", "prefix": "T-", "y": 56 },
{ "unless": "{{firm}}", "text": "{{status}}", "fallback": "TBD", "y": 56 }
```

That pair is how the `spacex` screen shows a real countdown when the launch time
is confirmed, and a status word when it isn't.

---

## Where things go on a 64×64 display

Font 2 is about 7px tall, so roughly six lines fit. The bundled artwork puts a
logo on top and leaves the bottom black:

| background | divider at | rows that fit |
|---|---|---|
| `ltt.gif`, `bitcoin.gif` | y≈37 | `y: 40`, `y: 52` |
| `spacex.gif` | y≈23 | `y: 26, 36, 46, 56` |
| `black.gif` | — | anywhere |

**A text-only screen still needs a background.** Clearing text doesn't clear the
previous screen's image, so a screen with no `background` inherits it. Use
`"background": "black.gif"`.

See [artwork.md](artwork.md) for making your own.

---

## The render.js escape hatch

If a layout genuinely can't be expressed in JSON, put a `render.js` in the
screen's folder. It takes over completely and returns the same `rows`/`items`
structure, built however you like:

```js
// screens/mine/render.js
export function render({ data, config, fetchedAt, helpers }) {
  const rows = data.sensors
    .filter((s) => s.active)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((s, i) => ({ label: s.name, value: `${s.value}C`, y: 32 + i * 11 }));

  return { background: config.background, rows };
}
```

You'll rarely need it. `each` + `limit`, `when`/`unless`, `trend:` and `match:`
cover most of what looks like it needs code.

---

## Developing

```bash
npm run screens                # was it found? does its script resolve?
npm run data    -- weather     # does the script work? what's the shape?
npm run preview -- weather     # does the layout fit?
npm run show    -- weather     # what does it actually look like?
```

All four work on any screen folder, even one that isn't in `SCREENS` yet.
In the container:

```bash
docker compose exec pixhub node src/cli.js preview weather
```

A screen with a malformed `screen.json` is logged and skipped; the rest keep
running.

---

## Checklist

- [ ] Script writes **only** JSON to stdout, diagnostics to stderr
- [ ] Non-zero exit on failure, with a message saying what to fix
- [ ] Options come from environment variables, nothing hardcoded
- [ ] API keys listed in `requiredEnv`
- [ ] `refresh` respects the API's rate limit, with a comment saying what it is
- [ ] Countdowns and clocks use `{{timestamp}}` + a format, not a precomputed string
- [ ] Long text either scrolls or has a `maxWidth`
- [ ] Background image lives in the screen's own folder
- [ ] `samples` covers the smallest and largest values you expect
- [ ] `npm run preview -- <screen> --samples` is clean at every one of them —
      no `#`, no unintended `>`, no `!` overlap warnings
- [ ] Any font other than 2 has been checked with `npm run calibrate`

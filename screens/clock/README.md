# clock — the smallest possible screen

Time and date. **Start here if you're writing your own screen** — it's a single
config file with nothing else in the folder.

## What's non-obvious here

**There is no script.** No `fetch.sh`, no `fetch.py`, nothing. A screen only
needs a script if it has something to fetch, and the time doesn't.

**`{{$now}}` is a built-in.** Placeholders starting with `$` don't come from a
script — they're provided by pixhub:

| | |
|---|---|
| `{{$now}}` | current time, as an ISO timestamp |
| `{{$fetchedAt}}` | when this screen's data was last collected |
| `{{$env.SOME_VAR}}` | an environment variable |

The `time` and `date` formats turn that timestamp into `14:32` and `Thu, Aug 6`.
Both are applied when the screen is **drawn**, so the clock is correct every
time it comes round rather than frozen at whenever a script last ran.

**It has a background even though there's no logo.** `black.gif` is a plain
black frame, and it's there for a real reason: clearing text does *not* clear
the previous screen's image. Without a background this screen would draw its
time over whatever the last screen left behind.

## Make it yours

In `screen.json`:

```json
{ "text": "{{$now}}", "format": "time", "y": 24, "align": "center", "color": "accent" }
```

- `"format": "time"` → `14:32`. Want 12-hour? The `time` format follows the
  container's `TZ`; for a different zone, set `TZ` in `.env`.
- `"align": "center"` centres it using the measured font widths.
- `"color": "accent"` is a palette name — `white` `grey` `dim` `accent` `green`
  `red` `amber` `blue` `orange` `yellow`, or any `#RRGGBB`.

Want it bigger? Add `"font": 4` — but read
[../../docs/writing-a-screen.md](../../docs/writing-a-screen.md#a-caution-about-fonts)
first, because only font 2's widths have been measured on real hardware.

Want more on screen? Add `"textMode": "small"` and you'll fit around ten rows.

## Not in the rotation by default

Add `clock` to `SCREENS` in `.env` to see it:

```ini
SCREENS=ltt,crypto,spacex,clock:10
```

The `:10` gives it ten seconds instead of the default.

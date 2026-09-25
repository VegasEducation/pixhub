# ltt-small — the same data, drawn small

This screen exists to be compared with [`../ltt`](../ltt). Same YouTube channel,
same artwork, same numbers — a completely different text renderer.

## What's non-obvious here

**There is no script in this folder.** Look at `screen.json`: it has
`"dataset": "ltt"` instead. The `ltt` screen fetches, this one reads what `ltt`
saved. The YouTube API is called **once** no matter how many screens show the
result.

That's the general mechanism, not a special case — any number of screens can
name the same dataset, and exactly one of them carries the script. It's how
you'd build five views of one crypto scrape without fetching five times.

**`"textMode": "small"` is the entire difference in appearance.**

|  | `"device"` (what `ltt` uses) | `"small"` (this screen) |
|---|---|---|
| Who draws the text | the Pixoo's firmware | pixoo-rest, in software |
| Character width | 5–11px, proportional | exactly 4px |
| Characters per line | ~8–12 | 16 |
| Row spacing | 9px, lowest row y=52 | 6px, down to y=58 |
| Rows that fit | 2 here | **3 here** |
| Scrolling | yes, in hardware | no |

Divoom's own app gives you neither of these directly — the small font isn't a
device feature at all, it's the bridge rendering glyphs into the image before
sending it.

**That's why there's a third row.** "Videos" fits here and doesn't on `ltt`.
The rows also sit lower (y=42/50/58) because the small font clears a bottom
edge that font 2 can't reach.

## Switching a screen between the two

One line in any `screen.json`:

```json
"textMode": "small"     // or "device", which is the default
```

Everything else — `rows`, `{{paths}}`, formats, colours, `adapt`, alignment —
works identically in both. Only the renderer changes.

## If it doesn't look right

| Symptom | Where to look |
|---|---|
| Screen never appears | needs `YT_API_KEY` and the `ltt` screen must be in `SCREENS` to do the fetching |
| Blank gaps in the text | the 3×5 font has no glyph for `` ` `` `"` `\` `&` `*` `#` — `preview` warns |
| Too cramped to read | that's the trade; use `"textMode": "device"` and fewer rows |
| Text won't scroll | it can't. Scrolling is a firmware feature and this text is part of the picture |

## Don't want both?

Drop `ltt-small` from `SCREENS`, or delete this folder. Nothing else depends on
it. If you delete `ltt` instead, move `fetch.py` here and remove the `dataset`
line — otherwise nothing fetches.

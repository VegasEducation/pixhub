# ltt — YouTube channel stats

Subscriber and view counts for any YouTube channel. Bundled pointing at Linus
Tech Tips because it's a concrete example, not because it's special.

## What's non-obvious here

**This screen uses the device's own fonts** — `textMode` isn't set, so it
defaults to `"device"`. The Pixoo draws the text itself, in font 2, on an
overlay above the picture. That's why the numbers are chunky and readable from
across a room, and why only **two rows** fit.

Compare with [`../ltt-small`](../ltt-small), which is the same data drawn with
the bridge's 3×5 font and fits three rows. Same data, one API call, two very
different looks — put both in `SCREENS` and watch them alternate.

**The row positions aren't arbitrary.** `ltt.gif` has a divider line at y≈37,
so text starts at y=37 and y=48. Font 2's lowest usable row is y=52 — below
that it clips against the bottom of the panel.

**The `adapt` rules change the number format by magnitude.** A channel with
9,840 subscribers shows the exact figure; one with 16.9M shows that. Without
this, a small channel would read "9.8K" and lose the precision it has room for.

## Point it at your own channel

In `.env` — no file editing needed:

```ini
YT_API_KEY=...            # required; free from console.cloud.google.com
YT_HANDLE=@YourChannel    # or YT_CHANNEL_ID=UC...
```

Then swap `ltt.gif` for your own artwork. Keep the divider around y≈37 or move
the `y` values in `screen.json` to match — see [../../docs/artwork.md](../../docs/artwork.md).

## The background

`ltt.gif` is a **static** 512×512 GIF — one frame. It's a GIF only because
that's what the device takes; there's nothing static about the format. An
**animated** GIF works just as well: drop one in and set `"backgroundSpeed"` in
`screen.json` to control the frame rate.

## If it doesn't look right

| Symptom | Where to look |
|---|---|
| Screen never appears | `YT_API_KEY` is blank — it's in `requiredEnv`, so the screen is skipped with a log line |
| "channel not found" | `YT_HANDLE` / `YT_CHANNEL_ID` in `.env`; handles need the `@` |
| Text sits too high or low | the `y` values in `screen.json` — smaller y is higher up |
| Text overlaps or clips | `npm run preview -- ltt` warns about both |
| Numbers formatted oddly | the `adapt` rules in `screen.json` |
| Right-aligned values look off | the font width table — see [`../testcard`](../testcard) |

Check the layout at every magnitude without waiting for real numbers:

```bash
docker compose exec pixhub node src/cli.js preview ltt --samples
```

## Cost

One API call per refresh, against a 10,000/day quota. At the default 30 minutes
that's 48 a day. You could poll far harder, but subscriber counts are rounded by
the API anyway and won't visibly move faster.

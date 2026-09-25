# vegasedu

Subscriber and view counts for [Vegas Education](https://youtube.com/@vegaseducation),
the channel this project was originally built for.

## Why this exists when `ltt` already does

[`../ltt`](../ltt) is the example to copy: generic, configurable, pointed at a
channel everyone recognises. This one is the same screen after it has been made
someone's own, and the differences are the interesting part.

**The channel lives in the script, not in `.env`.** `ltt` reads `YT_HANDLE`,
which is a single global variable, so the moment you want two YouTube screens
showing two different channels, one of them has to stop reading it. A screen
that is about one specific channel is the one that should give way. Override
with `VEGASEDU_CHANNEL_ID` or `VEGASEDU_HANDLE` if you fork this rather than
editing the script.

It is pinned by channel id rather than handle, for the reason `ltt` documents:
an owner can change a handle, and the id never moves.

**The artwork is 64×64, not 512×512.** Every other screen here ships art at
512×512 and lets `pixoo-rest` downscale. This one predates that convention and
was drawn at native panel resolution. It still works, and it is a useful
illustration that the size is about how much detail survives the downscale, not
about whether the screen renders at all.

## Setup

```ini
YT_API_KEY=...                 # required; free from console.cloud.google.com
VEGASEDU_CHANNEL_ID=UC...      # optional; defaults to the Vegas Education id
VEGASEDU_HANDLE=@someone       # optional; used only if no channel id is set
```

Without `YT_API_KEY` the screen self-disables with a log line rather than
failing every poll, which is what `requiredEnv` in `screen.json` is doing.

## Making it yours

Copy the folder, drop in your own 64×64 or 512×512 GIF, change `CHANNEL_ID` in
`fetch.py` and the `name` in `screen.json`, then add the folder name to
`SCREENS`. Nothing else needs touching. That is the whole point of the layout
living in `screen.json` rather than in code.

## Quota

A `channels.list` call costs 1 unit against a 10,000/day quota, so the 30-minute
refresh is nowhere near the limit. It matches how fast the numbers actually
move, not what the API will tolerate.

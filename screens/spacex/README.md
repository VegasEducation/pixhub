# spacex — next rocket launch

Vehicle, mission, date and countdown for the next launch. No API key needed.
Despite the name and artwork it works for any launch provider.

## Why this screen scrolls

**Mission names are long and unpredictable.** "Starlink Group 17-38" is 90px
wide on a 64px display, and the next one might be longer. There's no sensible
place to truncate it — "Starlink Gr.." tells you nothing — so that line is set
to `"scroll": true` and the device scrolls it in hardware.

Two consequences worth knowing:

- **This screen must use `"textMode": "device"`** (the default). Scrolling is a
  firmware feature, and it only applies to text the *device* draws. Switch this
  screen to `"small"` and the mission line would be truncated instead.
- **`"duration": "45s"`** rather than the usual 30. A scrolling line needs time
  to make a full pass before the rotation moves on.

## Other non-obvious bits

**Four rows fit here, not two.** `spacex.gif` has its divider much higher
(y≈23) than the other artwork, leaving room for y=25, 34, 43 and 52. Font 2's
lowest usable row is 52, so that bottom line is right at the limit.

**The last line is two items, only one of which draws.** They use `when` and
`unless` on `{{firm}}`:

- The API's launch time is precise → shows a real countdown, `T-2d 3h`
- It isn't → shows the status word instead, e.g. `Go` or `TBD`

A countdown to a time the provider has only narrowed to "sometime in October"
would imply precision that isn't there. **If you'd rather always see a
countdown**, delete the `"unless"` item and remove `"when": "{{firm}}"` from the
other.

**The countdown is computed when the screen is drawn, not when the script
runs.** The script returns the raw timestamp and the `countdown` format does the
arithmetic. A precomputed countdown would be up to 15 minutes stale, since
that's the refresh interval.

**The script trims the vehicle name.** The API says "Falcon 9 Block 5", which is
70px wide. `fetch.js` strips the variant to "Falcon 9" — that's a script job,
not a layout job.

## Track a different provider

In `.env`:

```ini
LAUNCH_PROVIDER=Rocket Lab      # or "United Launch Alliance", "CASC"...
```

Leave it blank for the next launch worldwide. Swap `spacex.gif` for matching
artwork — keep the divider around y≈23 or move the `y` values.

## The background

`spacex.gif` is a **static** 512×512 GIF. An animated one works equally well —
set `"backgroundSpeed"` in `screen.json`.

## If it doesn't look right

| Symptom | Where to look |
|---|---|
| "HTTP 429" / no data | ~15 requests/hour anonymously. Don't lower `"refresh"`; a free `LL_API_KEY` raises it |
| Shows `Go` instead of a countdown | the API's launch time isn't precise — see above |
| Mission name doesn't scroll | `"scroll": true` needs `textMode` to be `device` |
| Scroll gets cut off | raise `"duration"` |
| Bottom row clipped | y=52 is the lowest font 2 manages; `preview` warns past it |

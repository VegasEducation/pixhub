# pixhub

A modular screen engine for the [Divoom Pixoo 64](https://divoom.com/products/pixoo-64).

> ### Hardware this was built on
>
> **Everything here was built and tested on a Pixoo 64.** Pixoo is Divoom's
> product line rather than a single device, and 16×16 and 32×32 models exist.
>
> Those smaller panels should work — set `PIXOO_SIZE` and the alignment maths
> follows — but **this is completely untested on them, and you should expect
> display problems**. Every bundled screen's row positions and artwork are drawn
> for a 64×64, so they'll need redoing at any other size. Treat it as a starting
> point to fix up, not as support. See [Other panel sizes](#other-panel-sizes).

**A screen is a folder.** Put a script in it that prints JSON, and a config that
says where the values go. That's it — no framework to learn, no language you're
required to use.

```
screens/crypto/
├── fetch.sh        # prints JSON to stdout. Any language. One line of curl here.
├── screen.json     # where the values go, how often to run, which image
└── bitcoin.gif     # the background
```

Then in `.env`:

```ini
SCREENS=ltt,crypto,spacex
ROTATE_SECONDS=30
```

Drop a folder in, name it in `SCREENS`, restart. Screens you download from
someone else work the same way — everything a screen needs is inside its folder.

---

## How it works

There are **three jobs**, running in **two containers**:

**The fetcher** *(in the `pixhub` container)* — gets fresh values and saves
them. Each screen has its own script that runs on its own timer: a coin price, a
subscriber count, a temperature, the next bus, etc. Whatever the script prints is
saved under a named **dataset**. It never touches the sign.

**The painter** *(also in `pixhub`)* — reads the most recently saved values,
lays out the screen according to its config, and sends the finished result on.
It never fetches anything, so it always has something to draw.

**The translator** *(the `pixoo-rest` container)* — speaks the Pixoo's own
protocol so nothing else has to. Everything else talks plain HTTP to it, and it
deals with the sign.

> **We didn't write the translator.** `pixoo-rest` is a separate open-source
> project by [4ch1m](https://github.com/4ch1m/pixoo-rest) — not ours, and not
> official Divoom software either. Docker Compose pulls its published image
> straight from Docker Hub; no copy of it lives in this repo. It's here because
> it already solves the awkward part well, and there's no sense rewriting it.
> See [Credits](#credits).

```
your script ──▶ fetcher ──▶ [ saved datasets ] ──▶ painter ──▶ translator ──▶ sign
                (a timer)                          (a timer)   (pixoo-rest)
```

The fetcher and painter share one container because that's simpler to run.
They're still separate jobs, and `MODE=gatherer` / `MODE=pusher` splits them
across two containers if you ever want that.

### Sharing data between screens

Give the screens the same `dataset`. Exactly one of them has the script:

```json
{ "name": "Prices",  "script": "fetch.sh", "dataset": "crypto", "rows": [ ... ] }
{ "name": "Movers",  "dataset": "crypto", "rows": [ ... ] }
{ "name": "Totals",  "dataset": "crypto", "rows": [ ... ] }
```

`dataset` defaults to the screen's own name, so screens are independent unless
you deliberately point several at one. `ltt` and `ltt-small` do exactly this —
same YouTube data, two different layouts, one API call. pixhub warns at startup
if two screens with scripts share a dataset, or if a screen reads one that
nothing writes.

- **Any language.** `sh`, `python3`, `node`, `jq` and `curl` are in the image.
  A working screen can be three lines of shell.
- **Layout is data, not code.** Move a row, recolour a value, change a format —
  edit JSON. No JavaScript unless you want it.
- **No pixel maths.** Say "right-align this on row 40" and the engine handles
  font widths, truncation, text ids and command ordering.

---

## What's included

| Screen | Shows | Written in | Needs a key? |
|---|---|---|---|
| `ltt` | Subscribers and views for a YouTube channel | Python | Yes, free |
| `ltt-small` | The same, in the small font — three rows instead of two | — | Yes, free |
| `vegasedu` | The same, pointed at one specific channel with its own art | Python | Yes, free |
| `crypto` | Price and 24h direction for any coins | Shell + curl | No |
| `spacex` | Next launch: vehicle, mission, date, countdown | Node | No |
| `clock` | Time and date — **no script at all** | — | No |
| `testcard` | Tool: checks font widths against your panel | Node | No |
| `fonttest` | Tool: shows what the device's font ids look like | — | No |

Three languages on purpose: the contract is stdout, so pick whatever you're
fastest in. Read `screens/clock/` first — it's a config file and nothing else.

**Every screen folder has its own README** explaining what it demonstrates, how
to point it at your own data, and what to change when it doesn't look right.
Those are the fastest way in.

### Two ways to draw text

One line in a screen's config picks between them:

```json
"textMode": "device"    // default — the Pixoo draws it, its own fonts, can scroll
"textMode": "small"     // the bridge draws it: 3x5 glyphs, 16 chars a line
```

The small font fits roughly **10 rows instead of 6** and 16 characters per line,
at the cost of hardware scrolling. `ltt` and `ltt-small` are the same data and
artwork drawn each way, so you can put both in `SCREENS` and compare them on the
panel. Everything else — rows, formats, colours, alignment — works identically.

Divoom's own software gives you neither of these directly. Full detail in
[docs/writing-a-screen.md](docs/writing-a-screen.md#two-ways-to-draw-text).

---

## Quick start

Requirements: a **Pixoo 64** on your LAN with a fixed IP (give it a DHCP
reservation — a device that moves is the most common cause of a blank screen),
plus Docker and Docker Compose. Other panel sizes in the Pixoo line are
untested — see [Other panel sizes](#other-panel-sizes).

```bash
git clone https://github.com/VegasEducation/pixhub.git
cd pixhub
cp .env.example .env
```

Edit `.env`:

```ini
PIXOO_IP=192.168.1.50        # required
SCREENS=ltt,crypto,spacex    # rotation order
YT_API_KEY=                  # optional; leave blank to skip the ltt screen
```

```bash
docker compose up -d --build
docker compose logs -f pixhub
```

The display starts cycling within seconds. Open `http://<this-host>:8080` for a
status page showing every screen, when its script last ran, the JSON it
produced, and any errors.

A screen whose API key is missing is skipped with a log line, so you can run
with no keys at all and still get `crypto`, `spacex` and `clock`.

---

## Choosing what's displayed

Everything global lives in `.env`:

```ini
# Folder names from screens/, in rotation order.
# Blank or unset = rotate through everything found.
SCREENS=ltt,crypto,spacex

# Default time on screen. Add ":seconds" to any entry to override it:
#   SCREENS=ltt,crypto:15,spacex:45
ROTATE_SECONDS=30

PIXOO_BRIGHTNESS=40
```

Everything about an individual screen lives in its own `screen.json`:

```json
{
  "name": "Crypto prices",
  "script": "fetch.sh",
  "refresh": "5m",
  "duration": "45s",
  "brightness": 60,
  "background": "bitcoin.gif",
  "rows": [ ... ]
}
```

Precedence for how long a screen stays up: the `:seconds` in `SCREENS`, then
`duration` in `screen.json`, then `ROTATE_SECONDS`. Brightness works the same
way — per screen if set, otherwise the global.

Changes need `docker compose restart pixhub`.

---

## Writing a screen

Two files. First, something that prints JSON:

```sh
#!/bin/sh
# screens/weather/fetch.sh
curl -sfS "https://api.open-meteo.com/v1/forecast\
?latitude=47.6&longitude=-122.3&current=temperature_2m,wind_speed_10m"
```

Then say where the values go:

```json
{
  "name": "Weather",
  "script": "fetch.sh",
  "refresh": "15m",
  "background": "black.gif",

  "rows": [
    { "label": "Temp", "value": "{{current.temperature_2m}}",
      "format": "round", "suffix": "C", "y": 40 },

    { "label": "Wind", "value": "{{current.wind_speed_10m}}",
      "format": "round", "y": 52 }
  ]
}
```

Add `weather` to `SCREENS`, restart, done. `{{paths}}` reach into whatever your
script printed; `format` turns raw values into something that fits 64 pixels.

Every position, size, spacing and colour lives in that file — `x`, `y`, `font`,
`labelFont`, `valueFont`, `labelY`, `valueY`, `labelX`, `valueX`, `gap`,
`align`, `offset`, `maxWidth`. And because `938`, `1.2K` and `16.9M` don't want
the same treatment, a row can change any of those based on the value it's
showing:

```json
"adapt": [
  { "if": { "under": 10000 }, "format": "commas" },
  { "if": { "maxChars": 5 },  "format": "compact", "valueFont": 2 },
  {                           "format": "compact", "valueFont": 1 }
]
```

First match wins. Conditions test the raw number (`under`, `atLeast`) or the
formatted string (`maxChars`, `maxPixels`, `equals`). Or skip the rules and let
it choose: `"autoFont": [4, 2, 1]` uses the largest size that still fits.

**[Full guide →](docs/writing-a-screen.md)** — every config field, all the
formats, colours that follow the data, repeating a row over a list, conditional
rows, and the `render.js` escape hatch for layouts JSON can't express.

---

## Developer CLI

Iterating through the rotation is miserable, so don't:

```bash
npm run screens                 # what was found, and what's in rotation
npm run data    -- crypto       # run the script, print the JSON it produced
npm run preview -- crypto       # draw the layout in your terminal, no device
npm run show    -- crypto       # push it to the real Pixoo now
npm run formats                 # list the available "format" values
npm run measure -- "16.9M"      # how wide is this string, in pixels
npm run calibrate -- 4          # check a font's width table on the device
```

Getting text to sit right is the fiddly part, so two flags exist for it:

```bash
npm run preview -- ltt --data '{"subs":938,"views":4210}'   # values you invent
npm run preview -- ltt --samples                            # every case at once
```

No Node on the host? Every one works in the container:

```bash
docker compose exec pixhub node src/cli.js preview crypto
```

`data` also tells you the `{{paths}}` to use. `preview` renders the real layout
— each column is one pixel of the display, characters sit at their true
positions, and the resolved font and width of every string is printed
underneath. Anything that collides here collides on the device:

```
  screen: ltt — sample 3/4  (Linus Tech Tips)
  background: ltt.gif   brightness: 40
  data: {"subs":16900000,"views":9709487658}
  +----------------------------------------------------------------+
  |·S·····u····b····s···················1···6·····.·9·····M········| y=40
  |·V·····i·e····w······s·······················9·····.·7····B·····| y=52
  +----------------------------------------------------------------+
    y=40  x= 1  font 2  21px  "Subs"
    y=40  x=37  font 2  27px  "16.9M"
    y=52  x= 1  font 2  25px  "Views"
    y=52  x=45  font 2  19px  "9.7B"
  4 text item(s); '#' = overlap, '>' = overflow, '~' = scrolls
```

---

## Status page and API

`http://<host>:8080` — per-screen health, when each script last ran, the data it
returned, and buttons to re-run a script or jump the display to a screen.

| Endpoint | |
|---|---|
| `GET /api/status` | everything as JSON |
| `GET /api/screens/:name/data` | the JSON that screen's script last printed |
| `GET /healthz` | liveness |
| `POST /api/next` | advance the rotation |
| `POST /api/screens/:name/show` | put a screen on display now |
| `POST /api/screens/:name/refresh` | run its script now |

No authentication. Keep it on your LAN — don't port-forward it.

---

## Layout

| | |
|---|---|
| `screens/` | one folder per screen — bind-mounted, no rebuild to edit |
| `assets/` | images shared between screens (`black.gif` lives here) |
| `data/state.json` | last good data per screen |
| `.env` | which screens, in what order, for how long |
| `src/core/` | the engine — see [docs/architecture.md](docs/architecture.md) |

`pixoo-rest` — the translator, and not our code — is pinned to `1.6.2` on
purpose: 2.x is a rewrite that moved ports and dropped the `/sendGif` and
`/brightness` endpoints pixhub needs.

### Nudging text into place

Positions are pixels from the top-left, so **smaller `y` = higher up**. Every
screen's numbers live in its own `screen.json`, and there's no rebuild:

```bash
nano screens/ltt/screen.json                        # change a y value
docker compose restart pixhub                       # ~2 seconds
docker compose exec pixhub node src/cli.js show ltt # put it on the sign now
```

**Editing `.env` needs `docker compose up -d` instead** — `restart` reuses the
container, which loaded the environment when it was created, so your change
appears to do nothing. Screen folders are bind-mounted and re-read on restart,
so those only need the quicker command.

Right-aligned values stop `TEXT_RIGHT_MARGIN` pixels short of the edge (default
`2`) so nothing sits flush against the last column. Raise it in `.env` if values
still look tight against the right.

---

## Troubleshooting

**Nothing appears.** Check `docker compose logs pixoo-rest`. If it can't reach
the device, `PIXOO_IP` is wrong or the Pixoo moved. Confirm with `ping`.

**A screen is missing from the rotation.** It's not in `SCREENS`, is missing a
required env var, or its script has never succeeded — the status page says
which. Screens are hidden until they have real data rather than shown full of
dashes.

**"script printed something that isn't JSON".** Your script wrote to stdout
before the JSON — a progress message, a debug line, a shell trace. **stdout is
JSON only.** Send everything else to stderr; set `LOG_LEVEL=debug` to see it.

**A `{{path}}` shows `-`.** The path doesn't match the data. Run
`npm run data -- <screen>` and read the actual keys.

**Text is misaligned.** Only font 2 has been measured on real hardware — the
others are estimates, and previews mark them as unverified. Check one with
`npm run calibrate -- <font>`, then correct it in `.env` without touching code:
`FONT_WIDTH_4=7` for a fixed-width font, or `FONT_WIDTHS="M:8,W:8"` for
individual characters of font 2.

**Text sometimes doesn't appear.** The device drops commands sent too close
together. Raise `PIXOO_COMMAND_DELAY_MS` to `150` or `200`.

**Text runs off the right edge.** Static text is truncated with `..`
automatically. Set `"scroll": true` on the item to scroll it instead.

---

## Artwork

Backgrounds are GIFs at any square size — `pixoo-rest` downscales them, so the
bundled ones stay editable at 512×512. Each leaves black space under a divider
line for text; see [docs/artwork.md](docs/artwork.md) for the template and the
measured divider positions.

The bundled images are **static** single-frame GIFs, but nothing requires that —
**animated GIFs work just as well**. Drop one in and set `"backgroundSpeed"` to
control the frame rate.

The Linus Tech Tips, Bitcoin and SpaceX marks in `screens/` belong to their
respective owners and are included only as example artwork for a personal
display. This project is not affiliated with, endorsed by, or sponsored by any
of them. Replace them with your own images if you build something public.

---

## Contributing

Screens are very welcome — especially ones using APIs that need no key. A good
screen:

- keeps everything tunable in environment variables, nothing hardcoded,
- lists any required API keys in `requiredEnv` so it self-disables cleanly,
- writes only JSON to stdout, and diagnostics to stderr,
- notes the API's rate limit in a comment next to its `refresh`,
- ships its background image in its own folder,
- previews with no `#` (overlap) and no unintended `>` (overflow).

## Which "pixoo" is which

Four similar names turn up in this repo. They're different things:

| Name | What it is |
|---|---|
| **Divoom** | The company that makes the hardware. |
| **Pixoo** | Divoom's *product line* of pixel-art LED displays — not a company, and not one device. It comes in **16×16, 32×32 and 64×64**. This project is built for the 64. |
| **pixoo** (lowercase) | A community Python library for talking to those displays, by SomethingWithComputers. Named after the device; no connection to Divoom. |
| **pixoo-rest** | A community HTTP wrapper around that library, by 4ch1m. This is the second container. Also not Divoom's. |
| **pixhub** | This project. |

### Other panel sizes

Everything bundled here — the artwork, the row positions, the measured font
widths — is built for the **64×64**. If you have a Pixoo 16 or a Pixoo-Max
(32×32):

```ini
PIXOO_SIZE=32     # in .env; both containers pick it up
```

That makes the alignment, centring and clipping maths follow the smaller panel.
It does **not** resize anything else — every screen's `y` coordinates and images
are still drawn for a 64 and would need redoing, and a 32×32 fits about three
rows of font 2 rather than six. It's also **untested on non-64 hardware**; it
should give you a working starting point rather than a finished port.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — new screens are the most useful thing
to contribute, and [SECURITY.md](SECURITY.md) covers what this software does
that's worth knowing before you deploy it (it runs arbitrary scripts, and the
status page is unauthenticated by design).

## Credits

pixhub is the engine — screens, layout, scheduling, the status page. It talks to
the sign through software other people wrote, and pulls it as a published Docker
image rather than bundling any of it:

| | | |
|---|---|---|
| [**pixoo-rest**](https://github.com/4ch1m/pixoo-rest) | by 4ch1m | Puts an HTTP API in front of the Pixoo's own protocol. This is the `pixoo-rest` container. **Not** official Divoom software. |
| [**pixoo**](https://github.com/SomethingWithComputers/pixoo) | by SomethingWithComputers | The Python library `pixoo-rest` is built on. Handles the device protocol, and provides the 3×5 font behind `textMode: "small"`. |

Thanks to both — this project would be a lot more tedious without them.

### A licensing note worth reading

pixhub is MIT. The projects above are not, and **the `pixoo` library is
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) —
Attribution, NonCommercial, ShareAlike**.

For personal use on your own wall, that's fine and it's what everything here
assumes. If you're thinking about anything commercial, read those licenses
first — the non-commercial clause covers the container this depends on to reach
the device at all, and the small-font renderer in particular is that library's
code doing the drawing.

This repo contains none of their source; Compose fetches the image at run time.
That keeps pixhub's own licensing simple, but it doesn't make the dependency go
away. Not legal advice — just the thing you'd want to know before building a
product on it.

## License

MIT — see [LICENSE](LICENSE). Covers this repository only, not the third-party
software above or the example artwork.

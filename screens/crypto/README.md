# crypto — coin prices

Price and 24-hour direction for any coins CoinGecko lists. No API key needed.

## What's non-obvious here

**The script is one `curl` call and nothing else.** Open `fetch.sh` — there's no
parsing, no `jq`. CoinGecko's response is already the shape the screen wants, so
the whole "script" is a URL. That's the point: the contract is *print JSON to
stdout*, and sometimes the API has already done the work.

**The rows are generated, not listed.** `screen.json` has a `rows` object with
`"each": "{{.}}"` rather than an array. It repeats one row template over
whatever the script returned, so adding a third coin needs no new row — only a
higher `limit`.

`"limit": 2` is there because the artwork's divider sits at y≈37 and only two
rows fit below it in font 2. It isn't a limit on how many coins you can track.

**Colours come from the data.** `"color": "trend:{{price_change_percentage_24h}}"`
is green when a coin is up, red when down, grey when flat. No code.

**Prices switch format by magnitude** so they fit 64 pixels: `$64.4K` above
10,000, `$1,908` in the thousands, `$0.4271` under a dollar, and exponent
notation below a cent — `$0.0000241` is 53px wide and would leave no room for
the label.

## Track different coins

In `.env`:

```ini
CRYPTO_COINS=bitcoin,ethereum,solana
CRYPTO_CURRENCY=usd
```

Those are **CoinGecko ids, not ticker symbols** — `bitcoin`, not `BTC`. Find an
id at <https://api.coingecko.com/api/v3/coins/list>.

Showing more than two means either raising `"limit"` and tightening `"stepY"`,
switching this screen to `"textMode": "small"` for ~10 rows, or splitting across
two screens that share the dataset (see [`../ltt-small`](../ltt-small) for how).

## The background

`bitcoin.gif` is a **static** 512×512 GIF. Nothing requires that — an animated
GIF works too; set `"backgroundSpeed"` in `screen.json` to control it.

## If it doesn't look right

| Symptom | Where to look |
|---|---|
| No data, "HTTP 429" | CoinGecko rate limit. Raise `"refresh"`, or set `COINGECKO_API_KEY` (free) |
| A coin is missing | wrong id in `CRYPTO_COINS` — ids, not tickers |
| Only two coins show | `"limit"` in `screen.json` |
| Prices too long | the `price` format adapts already; for more room use `"textMode": "small"` |
| Rows too close or far | `"stepY"` in `screen.json` |

```bash
docker compose exec pixhub node src/cli.js data crypto      # what the API returned
docker compose exec pixhub node src/cli.js preview crypto   # how it lays out
```

## Cost

One call per refresh. The free tier allows roughly 30 calls a minute; the
default of 5 minutes is nowhere near it.

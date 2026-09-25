#!/bin/sh
# Crypto prices from CoinGecko. No API key needed.
#
# The entire contract is: print JSON to stdout, exit 0. CoinGecko's response is
# already the shape we want, so this screen is one curl call — no jq, no parsing.
#
# Change the coins without touching this file by setting CRYPTO_COINS in .env.
# Ids are CoinGecko ids ("bitcoin"), not tickers ("BTC"):
# https://api.coingecko.com/api/v3/coins/list

set -eu

COINS="${CRYPTO_COINS:-bitcoin,ethereum}"
CURRENCY="${CRYPTO_CURRENCY:-usd}"

# A free demo key raises the rate limit; entirely optional.
if [ -n "${COINGECKO_API_KEY:-}" ]; then
  set -- -H "x-cg-demo-api-key: ${COINGECKO_API_KEY}"
else
  set --
fi

curl -sfS --max-time 20 "$@" \
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=${CURRENCY}&ids=${COINS}&price_change_percentage=24h&sparkline=false"

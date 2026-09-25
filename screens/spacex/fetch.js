#!/usr/bin/env node
// Next rocket launch, from The Space Devs' Launch Library 2. No API key needed.
//
// Written in Node to show a third language — the contract is the same as every
// other screen: print JSON to stdout, exit 0.
//
// Not SpaceX-specific despite the artwork: set LAUNCH_PROVIDER to any launch
// service provider ("Rocket Lab", "United Launch Alliance", "CASC"), or to an
// empty string for the next launch worldwide.

const provider = process.env.LAUNCH_PROVIDER ?? 'SpaceX';

const url = new URL('https://ll.thespacedevs.com/2.3.0/launches/upcoming/');
url.searchParams.set('limit', '1');
// "list" is a far smaller response than the default and carries everything below.
url.searchParams.set('mode', 'list');
if (provider) url.searchParams.set('lsp__name', provider);

// Optional free key from thespacedevs.com; raises the rate limit.
const headers = { Accept: 'application/json' };
if (process.env.LL_API_KEY) headers.Authorization = `Token ${process.env.LL_API_KEY}`;

const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}

const launch = (await res.json()).results?.[0];
if (!launch) {
  console.error(`no upcoming launches for provider "${provider || 'any'}"`);
  process.exit(1);
}

// LL2 packs vehicle and payload into one string:
//   "Falcon 9 Block 5 | Starlink Group 17-38"
const [rocketRaw, ...rest] = String(launch.name || '').split('|');

// "Falcon 9 Block 5" is 70px wide on a 64px display, and the variant number is
// the least interesting part of it. Splitting here keeps screen.json to layout.
const rocket = rocketRaw.trim().replace(/\s+Block\s+\d+\w*$/i, '');

console.log(
  JSON.stringify({
    rocket,
    mission: rest.join('|').trim(),
    // NET = "no earlier than". It moves, sometimes by days.
    net: launch.net,
    status: launch.status?.abbrev || '',
    // "Minute"/"Hour" means the T-0 is firm; "Day"/"Month" means treat it loosely.
    firm: ['Minute', 'Hour'].includes(launch.net_precision?.name),
  })
);

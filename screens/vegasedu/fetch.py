#!/usr/bin/env python3
"""Vegas Education channel statistics.

Nearly identical to `ltt`, and that is the point: `ltt` is the generic example
to copy, and this is what one looks like once it is pointed at a real channel
with its own artwork.

The channel is set here rather than read from YT_HANDLE because that variable
is global to .env and `ltt` is already using it. Two screens cannot disagree
about a shared variable, so a screen tied to one specific channel carries its
own. Override with VEGASEDU_CHANNEL_ID or VEGASEDU_HANDLE if you fork this.

The id is preferred over the handle for the reason `ltt` gives: a handle can be
changed by its owner, an id cannot.
"""

import json
import os
import sys
import urllib.parse
import urllib.request

API = "https://www.googleapis.com/youtube/v3/channels"
CHANNEL_ID = os.environ.get("VEGASEDU_CHANNEL_ID", "UCp5lqiawjuOw-Lc3J3EnjuA")
HANDLE = os.environ.get("VEGASEDU_HANDLE")


def main():
    key = os.environ.get("YT_API_KEY")
    if not key:
        # stderr is for humans and shows up in the logs; stdout is only ever JSON.
        print("YT_API_KEY is not set", file=sys.stderr)
        return 1

    params = {"part": "statistics,snippet", "key": key}
    if HANDLE and not os.environ.get("VEGASEDU_CHANNEL_ID"):
        params["forHandle"] = HANDLE if HANDLE.startswith("@") else "@" + HANDLE
    else:
        params["id"] = CHANNEL_ID

    with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(params)}", timeout=20) as res:
        payload = json.load(res)

    items = payload.get("items") or []
    if not items:
        print(f"channel not found: {params.get('id') or params.get('forHandle')}", file=sys.stderr)
        return 1

    stats = items[0].get("statistics", {})
    print(json.dumps({
        "title": items[0].get("snippet", {}).get("title", ""),
        # Channels can hide their subscriber count; say so rather than showing 0.
        "subs": None if stats.get("hiddenSubscriberCount") else int(stats.get("subscriberCount", 0)),
        "views": int(stats.get("viewCount", 0)),
        "videos": int(stats.get("videoCount", 0)),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""YouTube channel statistics.

A screen's script can be written in anything that prints JSON to stdout — this
one is Python to show that. It needs a free API key from
https://console.cloud.google.com (enable "YouTube Data API v3"), set as
YT_API_KEY in .env.

Point it at your own channel with YT_HANDLE, and swap ltt.gif for your artwork.
"""

import json
import os
import sys
import urllib.parse
import urllib.request

API = "https://www.googleapis.com/youtube/v3/channels"


def main():
    key = os.environ.get("YT_API_KEY")
    if not key:
        # stderr is for humans and shows up in the logs; stdout is only ever JSON.
        print("YT_API_KEY is not set", file=sys.stderr)
        return 1

    params = {"part": "statistics,snippet", "key": key}

    # A channel id wins if given, since handles can be changed by their owner.
    channel_id = os.environ.get("YT_CHANNEL_ID")
    if channel_id:
        params["id"] = channel_id
    else:
        handle = os.environ.get("YT_HANDLE", "@LinusTechTips")
        params["forHandle"] = handle if handle.startswith("@") else "@" + handle

    with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(params)}", timeout=20) as res:
        payload = json.load(res)

    items = payload.get("items") or []
    if not items:
        print(f"channel not found: {params.get('id') or params.get('forHandle')}", file=sys.stderr)
        return 1

    channel = items[0]
    stats = channel.get("statistics", {})

    # Return display-ready values. Anything awkward about the API's shape is
    # better dealt with here than in the screen config.
    print(json.dumps({
        "title": channel.get("snippet", {}).get("title", ""),
        # Channels can hide their subscriber count; say so rather than showing 0.
        "subs": None if stats.get("hiddenSubscriberCount") else int(stats.get("subscriberCount", 0)),
        "views": int(stats.get("viewCount", 0)),
        "videos": int(stats.get("videoCount", 0)),
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())

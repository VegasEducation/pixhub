# Security

## Reporting a problem

Open a [private security advisory](../../security/advisories/new) rather than a
public issue. This is a hobby project run by volunteers, so please allow time
for a reply.

## What this software actually does

Worth understanding before you deploy it, because some of it surprises people:

**It runs arbitrary programs on your machine.** A screen's script is executed as
a subprocess. Installing a screen from someone else is equivalent to running
their code — read it first, exactly as you would any script you downloaded.

**The status page has no authentication.** Anyone who can reach
`http://<host>:8080` can see your screen data and change what's on the display.
It's a LAN tool. **Don't port-forward it or put it on the public internet.** Set
`HTTP_ENABLED=false` to turn it off entirely.

**Your `.env` is passed to every screen script** as environment variables. That
is how scripts get their API keys, but it means every screen can read every
key — including ones belonging to other screens. Only run screens you trust.

**Nothing is encrypted at rest.** `data/state.json` holds whatever your scripts
returned, in plain text.

**The Pixoo itself has no authentication.** Anything on your LAN can talk to it.
That's the device's design, not something pixhub can fix.

## Reducing exposure

- Keep the whole stack on a trusted LAN. It's designed for that.
- Use API keys scoped to read-only, and separate keys per project where the
  service allows it.
- `.env` is gitignored. Keep it that way — check before you commit if you fork.
- The container runs as a non-root user and needs no special privileges.

## Dependencies

pixhub itself has **zero runtime npm dependencies**, so there is no dependency
tree to audit.

It does depend on two third-party containers/libraries it doesn't vendor —
`pixoo-rest` and `pixoo`, both credited in the README. Their security is their
projects' concern; pixhub pins `pixoo-rest` to a specific version rather than
tracking `latest`.

# Contributing

The most useful thing you can contribute is **a screen**. The engine is
deliberately small and mostly finished; the interesting surface is what people
choose to display on a 64×64 panel.

## Contributing a screen

A screen is a self-contained folder — see
[docs/writing-a-screen.md](docs/writing-a-screen.md) for the full guide. A good
one to merge:

- **Works with no API key**, or clearly lists what it needs in `requiredEnv` so
  it self-disables rather than erroring.
- **Puts every option in an environment variable** — coins, channels,
  locations, units. Nobody should edit your script to point it at their own
  city.
- **Writes only JSON to stdout**, and diagnostics to stderr.
- **Respects the API's rate limit** in its default `refresh`, with a comment
  saying what the limit actually is. A screen that gets people rate-limited is
  a bad screen regardless of how it looks.
- **Ships its own background** in the screen's folder, and a `README.md`
  explaining what isn't obvious.
- **Includes `samples`** covering the extremes its layout has to survive, and
  previews cleanly at all of them:

  ```bash
  docker compose exec pixhub node src/cli.js preview yourscreen --samples
  ```

  No `#` (overlap), no unintended `>` (overflow), no `!` warnings.

Any language is fine. The contract is stdout.

## Contributing to the engine

Please open an issue before a large change — the design has a few deliberate
constraints that aren't obvious, and [docs/architecture.md](docs/architecture.md)
explains the reasoning behind them.

Two worth knowing up front:

- **No runtime dependencies.** `.env` parsing, scheduling and storage are each
  a few dozen lines rather than three packages. This keeps the image building
  in seconds on a Pi with no native compilation, and the supply chain at zero.
  A change that adds a dependency needs to be worth losing that.
- **Layout is data, not code.** New layout capability should be expressible in
  `screen.json`. `render.js` is the escape hatch for the rest.

## Before opening a pull request

There are no unit tests — the meaningful behaviour is on a physical panel. So:

```bash
docker compose exec pixhub node src/cli.js screens              # everything still loads
docker compose exec pixhub node src/cli.js preview <screen>     # layout is sane
docker compose exec pixhub node src/cli.js show <screen>        # and on the device
```

Please say in the PR **which hardware you tested on**. Everything here was
built on a Pixoo 64; the 16 and 32 in the product line are untested, and a
report from one of those is genuinely useful.

## House style

- `.editorconfig` covers indentation and line endings; most editors apply it.
- Comments should explain **why**, not what. The tricky parts of this project
  are all "why is it done this way" — command ordering, font metrics, the
  fetch/paint split — and those comments are the ones worth writing.
- Keep `screen.json` comments in place. They're non-standard JSON on purpose
  (stripped before parsing) because these files are read by people.

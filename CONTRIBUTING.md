# Contributing

This started as a personal tool and is shared in the open because the method is worth spreading. PRs, forks, and issues are all welcome.

## Good first contributions

- **A new `kind`.** The engine ships with `visual-ui`. A new kind (photography, type specimens, voice and tone, motion) means a measure strategy + a controlled tag vocabulary registered in `src/config.mjs`. This is the highest-leverage place to extend.
- **Measure strategies.** Better palette extraction, layout-grid detection, type-scale detection.
- **A real browser capture helper** for the critique step (kept out of the core on purpose, but a optional script would help).
- **Docs and examples.** More worked example boards (neutral / shareable only, see below).

## Ground rules

- **Keep taste inspectable.** The whole point is rules-not-vibes. Do not add stages that smuggle freeform adjectives back into the manifest.
- **No personal or copyrighted boards in PRs.** The demo board is synthetic on purpose. Do not commit screenshots of other people's work or anyone's private references.
- **Tests with logic.** Each stage has a `*.test.mjs` of pure-function unit tests. Keep them passing (`npm test`) and add cases for new behavior.
- **No em dashes in generated or committed prose.** The thesis generator sanitizes them; match that in docs.

## Dev setup

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY for the model stages
npm test
```

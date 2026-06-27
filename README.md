# Taste Engine

Teach an AI your creative taste from a board of references, then have it generate work in that taste and critique itself against it.

Most "AI design taste" tools extract surface tokens: colors, spacing, a border radius. Taste Engine extracts a **thesis with forbidden moves**. It turns a folder of references into inspectable data (not vibe-labels), clusters that data into named "DNA channels," and writes a thesis the generator builds from and rejects violations against. The taste lives in version-controlled JSON you can read, diff, and argue with, not in a prompt you cross your fingers over.

It runs locally through the Claude API. No subscription, no black box.

## Scope

Right now this is built and proven for **website / UI design** taste, that is the `visual-ui` kind the demo board uses. The pipeline is deliberately board-agnostic underneath: a `kind` selects the measure strategy and the tag vocabulary, so the same method extends to **any array of images** (photography, type specimens, product shots) by registering a new kind, not rewriting anything.

The longer arc is to push the same idea past images entirely, into **copywriting** (taste in voice and sentence rhythm) and eventually **video**. Those are not built yet. The architecture leaves room for them on purpose; treat them as direction, not a promise. We'll see.

## Why this shape

- **Taste as data, not vibes.** Every reference becomes a record with measured palette/contrast/density and a controlled set of rule-tags. Adjectives like "clean" or "bold" are not allowed in; only rules the generator can act on.
- **Forbidden moves are the high-value part.** Knowing what your taste *rejects* constrains a generator far more usefully than knowing what it likes.
- **A closed loop.** Generate a page, screenshot it, critique it into concrete testable rules, feed those rules back into the next generation. The taste sharpens with each round.

## How it works

A ten-stage pipeline. The middle stages call the Claude API; `import`, `measure`, and `atlas` are local-only. Everything past `tag` is a derived, inspectable artifact: the channels, the directions, and the thesis are all functions of your board, not anyone's opinion.

```
import -> link -> measure -> tag -> cluster -> directions -> thesis -> atlas -> generate -> critique
                                       |            |                              |
                                  DNA channels  candidate lanes              build one,
                                  (derived)     (derived from channels)      then critique
```

| Stage | What it does | Model |
|---|---|---|
| `import` | Scans a board folder, one manifest record per image. Idempotent. | local |
| `link` | Optional. Joins real names + URLs onto records from a `sources.txt`. | local |
| `measure` | Extracts dominant palette, contrast, and visual density per image. | local (Sharp) |
| `tag` | Vision pass: assigns rule-tags from a controlled vocabulary + WHY/AVOID/KEEP notes. Tags outside the vocabulary are dropped. | Haiku |
| `cluster` | Groups records into DNA channels, each a generative recipe with forbidden moves and representatives. | Sonnet |
| `directions` | Derives the candidate directions (choose-your-lane styles) from the board's own channels, favoring its heaviest. Writes `directions.json`. | Sonnet |
| `thesis` | Writes `THESIS.md` from the data: channels by weight, dominant palette, visual laws. | Sonnet |
| `atlas` | Builds a browsable HTML viewer of the board and its channels. | local |
| `generate` | Builds one self-contained HTML page from a chosen derived direction, injecting the union of its channels' forbidden moves. | Opus |
| `critique` | Vision pass over desktop + mobile screenshots: 3 to 8 concrete, testable rules appended for the next `generate`. | Sonnet |

## Quickstart

Requires Node 20+ and an [Anthropic API key](https://console.anthropic.com/).

```bash
git clone https://github.com/ericseandevlin/taste-engine.git
cd taste-engine
npm install
cp .env.example .env        # then paste your ANTHROPIC_API_KEY into .env

# Run the pipeline on the bundled neutral demo board:
npm run pipeline            # import -> measure -> tag -> cluster -> directions -> thesis -> atlas
```

Then open the atlas to browse the result:

```bash
cd boards && python3 -m http.server   # visit the printed URL, open demo's atlas
```

Already-generated example output ships in `boards/demo/` so you can see what a finished run looks like before spending a token.

### Generate: pick a direction, then refine

Generation works at two levels.

**First, choose a direction.** The `directions` stage already derived a handful of candidate lanes from *your board's* channels and wrote them to `boards/<board>/directions.json`, favoring the styles your board most expresses. These are not our opinion: a board full of austere grids yields austere directions; a board full of soft 3D yields a playful one. List them and generate one site per lane:

```bash
node -e "console.log(Object.keys(require('./boards/demo/directions.json').directions))"
npm run generate -- --direction <id>          # writes boards/demo/generated/<id>-001/index.html
```

Generate each lane, open them, and pick the one closest to what you want.

**Then refine within that lane.** Screenshot the page, critique it into concrete rules, and regenerate so the next version obeys them:

```bash
npm run capture  -- --slug <id>-001           # desktop.png + mobile.png via headless Chrome
npm run critique -- --slug <id>-001           # vision pass -> testable rules for this direction
npm run generate -- --direction <id>          # <id>-002 obeys the new rules
```

`capture` is a convenience helper that shells out to a system Chrome (nothing to install). The engine itself stays browser-free: `critique` just reads whatever `desktop.png` / `mobile.png` sit in the slug folder, so you can capture them with any tool instead, or pass `--shots a.png,b.png`. The demo ships a fully traveled example: compare `generated/swiss-mono-index-001` (`rulesApplied: 0`) with `swiss-mono-index-002` (`rulesApplied: 7`) to watch the loop tighten the page. Re-derive the lanes anytime with `npm run directions` (`--count` for more or fewer); `directions.json` is a generated artifact, re-running overwrites it.

### Make it yours: content vs. taste

Taste and content are separate things. The board defines the *taste*; `boards/<board>/profile.json` defines the *content*, your name, role, bio, projects, and contact. `generate` builds the page around your profile and is instructed not to invent anything. The demo ships a sample `profile.json` (Avery Quinn) so the example pages have real content you can trace to a file; replace its values with your own, or delete it. With no profile, `generate` prints a notice and falls back to clearly-labeled placeholder copy (`[Your Name]`, `[Project One]`), never a convincing fake. Every generated page's `meta.json` records `content: profile.json` or `content: placeholder`, so you always know which you are looking at.

## Bring your own board

The demo board is deliberately generic. To build a taste profile from your own references, drop a folder of images in and run one command, no source edits:

```bash
mkdir boards/myboard
cp ~/screenshots/*.png boards/myboard/     # 15 to 30 references; full-page beats hero-only (8+ for a quick try)
npm run pipeline  -- --board myboard       # import -> measure -> tag -> cluster -> directions -> thesis -> atlas
npm run generate  -- --board myboard --direction <id>
```

Any folder under `boards/` is treated as a `visual-ui` board by convention, so naming it is enough. Two optional extras: a `boards/myboard/sources.txt` (`name url` per line) lets the manifest cite real sources, and a `boards/myboard/profile.json` puts your own content on the generated pages (see Make it yours). You only need to edit `src/config.mjs` to give a board a different `kind`.

A `kind` (currently just `visual-ui`) selects the measure strategy and tag vocabulary, so new domains of taste (photography, type, motion) are a registry entry, not a rewrite.

## What you get

After a run, `boards/demo/` holds:

- `manifest.json` — the canonical, inspectable database. One record per image: measured palette/contrast/density, rule-tags, channels, WHY/AVOID/KEEP notes.
- `channels.json` — the DNA channels. Each is a generative recipe plus a forbidden-moves list and its representative images.
- `directions.json` — the candidate directions derived from those channels: the choose-your-lane styles, each a channel blend with a brief and palette.
- `THESIS.md` — the human-readable thesis generated from the data.
- `atlas/index.html` — a browsable viewer.
- `generated/` — pages the engine produced, with a lineage comment recording which channels and critique rules shaped each one.

## Cost

The demo board is small, so a full run is cheap (cents). Model routing by stage lives in `src/config.mjs`: Haiku for high-volume per-image tagging, Sonnet for analysis and writing, Opus for the hardest synthesis (generation). Override per run with `--model`.

## Project layout

```
src/            the engine (one module per stage, each with a *.test.mjs)
boards/demo/    the bundled neutral demo board + a finished example run
boards/demo/_sources/   the HTML mockups the demo board was rendered from
docs/METHOD.md  the full method, beat by beat
```

## Tests

```bash
npm test        # node --test over src/
```

The tests are pure-function unit tests with synthetic fixtures. They need no board and no API key.

## Credit

The method is adapted from the **Taste DNA Method**, originally shared by **Randy Roberts** ([@rndyrbrts](https://www.instagram.com/rndyrbrts/)) in [this reel](https://www.instagram.com/reels/DYoJ0GZi5p0/). This repo is an independent open-source implementation of that idea, shared with permission. If you build on it, keep the credit.

## License

MIT. See [LICENSE](LICENSE).

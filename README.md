# Taste Engine

Drop in a folder of reference images. Get a rule sheet you can edit, and a poster that obeys it.

Most "AI taste" tools read colors and spacing off a design and hand them back. Taste Engine reads a board of references and writes down what the board does and what it refuses to do: a short list of Do rules and Don't rules, each traced to the images it came from. Then it makes a poster from those rules, checks the poster against them, and repairs what broke. The rules live in a JSON file you can read, diff and argue with.

## Quickstart

Needs Node 20+ and one model key: [Google Gemini](https://aistudio.google.com/app/apikey) or [OpenRouter](https://openrouter.ai/keys).

```bash
git clone https://github.com/ericseandevlin/taste-engine.git
cd taste-engine
npm install
cp .env.example .env     # set GEMINI_API_KEY or OPENROUTER_API_KEY
npm run taste            # runs the bundled demo board
```

Open `boards/demo/result.html`. That page is the whole run: the board, the measured palette, the rule sheet, and each poster with a PASS or FAIL per rule.

No key yet? The demo board ships with its rule sheet already made, so `boards/demo/result.html` opens as it is.

## Your own board

```bash
mkdir boards/myboard
cp ~/refs/*.png boards/myboard/          # 6 to 12 images with one point of view
npm run taste -- --board myboard --copy "Open Studio | 20 Nov 2026 | Doors 7pm"
```

Two things make a board work:

- **Keep it focused.** A board of everything you like has no rules in common. Six images that agree beat thirty that do not.
- **Keep the copy short.** `--copy` takes a few lines split by `|`. A title, a date, a place.

If your references are posters and not websites, add `boards/myboard/board.json` with `{"kind": "poster"}`. That selects the vocabulary the images are read with.

## What one run does

| Step | What it does | Needs a key |
|---|---|---|
| `import` | Makes one record per image in `manifest.json`. | no |
| `measure` | Reads palette, contrast and density from the pixels. | no |
| `tag` | A vision model describes each image with a fixed vocabulary of rules. Words outside the vocabulary are dropped. | yes |
| `cluster` | Groups the images into lanes by shared behavior. Each lane gets a recipe and a list of forbidden moves. | yes |
| `directions` | Names the modes your board can support. Each mode is a blend of its heaviest lanes. | yes |
| `brief` | Composes the rule sheet: `brief.json` and a readable `brief.md`. | no |
| `poster` | Draws a poster from one mode, checks it against that mode's Don't rules and the copy, and redraws with the broken rules named. | yes |
| `result` | Builds `result.html`. | no |

A step whose output exists is skipped. A second run costs one new poster. `--force` redoes everything.

## Edit the rule sheet

`boards/<board>/brief.json` is the part that is yours. Every rule looks like this:

```json
{
  "id": "swiss-index.dont.gradient-backgrounds",
  "lane": "swiss-index",
  "kind": "dont",
  "rule": "Gradient backgrounds",
  "evidence": { "lane": "swiss-index", "refs": ["w004", "w005"] },
  "status": "extracted"
}
```

- Change `rule` and set `status` to `"edited"` to reword it.
- Set `status` to `"locked"` to keep it as it is through later runs.
- Set `status` to `"rejected"` to stop the engine from using it.

Then run `npm run poster -- --board myboard`. The next poster is made from your version. A later `npm run taste` keeps every rule you touched.

## More posters

```bash
npm run poster -- --board myboard --mode <mode-id>     # a different mode from brief.json
npm run poster -- --board myboard --rounds 3           # allow more repair rounds
npm run result -- --board myboard                      # rebuild the page
```

## Models

Text and vision steps use `gemini-3.5-flash`. Every image comes from one module, `src/image-agent.mjs`, and one model: `gemini-3.1-flash-image` (Nano Banana 2). With a Gemini key the calls go to Google. With only an OpenRouter key the same models run through OpenRouter. `--model` changes the text and vision model for a run.

A run on a small board costs cents.

## What the check is and is not

The check is a vision model's second opinion on rules that have a right answer: is the copy spelled as given, is there a gradient. It is not a quality score. Whether a poster is good is your call, and the engine does not try to make that call for you.

## What is in the lab

The repo also holds experiments that are not on the main path: website generation behind a context gate, a critique loop for pages, and a numeric fingerprint and distance score. The score did not agree with a human ranking when tested, so it is not part of the product. See [docs/LAB.md](docs/LAB.md).

## Tests

```bash
npm test
```

Unit tests on pure functions. They need no board and no key.

## Credit

The method is adapted from the **Taste DNA Method**, originally shared by **Randy Roberts** ([@rndyrbrts](https://www.instagram.com/rndyrbrts/)) in [this reel](https://www.instagram.com/reels/DYoJ0GZi5p0/). This repo is an independent open-source implementation of that idea, shared with permission. If you build on it, keep the credit. The full method is in [docs/METHOD.md](docs/METHOD.md).

## License

MIT. See [LICENSE](LICENSE).

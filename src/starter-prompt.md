# Taste Engine — starter prompt (reusable skeleton)

The compact, reusable version of the method. Swap the board path, add constraints,
point at a direction. Every critique becomes a rule the next generation must obey.

## The skeleton

> Point your agent at a local folder of reference images (the board). Do not
> describe taste in vibe words; make it data.
>
> 1. **Import** — scan `<BOARD_DIR>` and build `manifest.json`, one record per image
>    (id, file, title, source, local path).
> 2. **Link** — join real names + URLs onto the image groups from `sites.json`
>    (a one-time pull of your gallery). Group multiple images per site via `site`.
> 3. **Measure** — for each image, record palette (hex + coverage %), dimensions,
>    contrast, density. Generator-usable numbers only.
> 4. **Tag** — assign rules-not-vibes tags from a controlled vocabulary, candidate
>    channels, and a WHY / AVOID / KEEP note per image.
> 5. **Cluster** — group into 6-12 DNA channels by shared behavior. Each channel is
>    a generative recipe (ground, type, accent, photo, space, motion) + forbidden moves.
> 6. **Atlas** — build the browsable atlas before the art. Every item visible with
>    metadata, preview, tags, notes, source proof.
> 7. **Thesis** — regenerate the thesis from the channels: values, visual laws,
>    forbidden moves. The thesis sits on top of the data, not in place of it.
> 8. **Generate** — pick a direction (one channel or a blend), generate a live,
>    self-contained HTML page that exposes its grammar (lineage comment up top).
>    Inject the union of forbidden moves as hard constraints.
> 9. **Critique** — open it locally, screenshot desktop + mobile, watch motion.
>    Name failures concretely (element + problem + fix). Never "make it cooler".
>    Each critique becomes a rule fed back into the next generation.

## Run it (this repo)

```
node scripts/taste/import.mjs   --board <BOARD>
node scripts/taste/link.mjs     --board <BOARD>     # if a sites.json exists
node scripts/taste/measure.mjs  --board <BOARD>
node scripts/taste/tag.mjs      --board <BOARD>
node scripts/taste/cluster.mjs  --board <BOARD>
node scripts/taste/thesis.mjs   --board <BOARD>
node scripts/taste/atlas.mjs    --board <BOARD>
node scripts/taste/generate.mjs --board <BOARD> --direction <DIR>
# screenshot the result, then:
node scripts/taste/critique.mjs --board <BOARD> --direction <DIR> --slug <DIR>-001
node scripts/taste/generate.mjs --board <BOARD> --direction <DIR>   # obeys new rules
```

## Add a new board

Register it in `scripts/taste/config.mjs` (`BOARDS` + a `KINDS` entry with its
own `tagVocabulary` and `channelSeeds`). Drop images in `taste/<board>/`. The
pipeline is board-agnostic via `--board`.

## Add a direction

Add an entry to `taste/<board>/directions.json`: a name, the channel ids to blend,
a palette line, a brief, and any notes (extra forbidden moves). Then
`generate.mjs --direction <name>`.

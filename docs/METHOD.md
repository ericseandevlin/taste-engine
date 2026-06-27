# The Method

Taste Engine is an implementation of the **Taste DNA Method** (credit in the README). The core claim: creative taste is teachable to a model if you stop describing it in adjectives and start encoding it as inspectable rules a generator can act on and reject against.

## The principle

A vague prompt ("make it clean and modern") gives a model nothing to obey or violate. A board of references the model can actually inspect, reduced to measured facts and a controlled vocabulary of rules, gives it both a target and a set of tripwires. The most valuable output is not the list of things your taste likes. It is the list of things your taste **forbids**, because forbidden moves constrain a generator where preferences only nudge it.

## The beats

1. **Collect.** Gather a folder the agent can inspect, 15 to 30 references. Not a Pinterest board of remote low-res pins, a local folder of full-page captures. The dataset shape matters: the generator wants local, diffable, version-controlled images.
2. **Annotate (optional).** Note what you like about each, in your own words. This becomes raw material, not the final tags.
3. **Import.** Turn files into a structured manifest: one record per image with id, title, source, dimensions. The manifest is the canonical database everything else sits on.
4. **Measure.** Extract what the eye does in generator-usable terms: dominant palette, contrast, visual density. Numbers, not impressions.
5. **Tag.** A vision pass assigns rules from a controlled vocabulary, not freeform adjectives. Anything outside the vocabulary is dropped on purpose, so taste stays inspectable data. Each record also gets short WHY / AVOID / KEEP notes.
6. **Cluster.** Group records into 6 to 12 DNA channels by shared *behavior*, not shared subject. Two black-and-white sites can belong to different channels if they behave differently; a photo site and a type site can share one if they move the same way.
7. **Atlas.** Build a browsable view of the board and its channels so you can see the clustering and correct it.
8. **Thesis.** Write the thesis the generator builds from: values, visual laws, and the forbidden-moves list. Generated from the data, sitting on top of the manifest and channels, not hand-waved prose.
9. **Directions.** Derive the candidate directions from the board's own channels, not from anyone's opinion. Each direction is a coherent blend of one to three channels the board actually contains, weighted toward its heaviest, with a brief and palette pulled from the board's data. This is the step that keeps the engine honest: a board with one playful image yields no playful direction. The styles you choose between are a function of your moodboard.
10. **Generate.** Build one self-contained artifact from a chosen direction. Inject the union of its channels' forbidden moves plus any accumulated critique rules. Content is separate from taste: a `profile.json` supplies the real name, bio, and work, and the generator is told not to invent. With no profile it falls back to clearly-labeled placeholder copy rather than a convincing fake.
11. **Critique.** Screenshot the result and judge it concretely. Vague critiques are rejected; only testable rules survive ("the wordmark must not carry a faux shadow," not "feels off"). The rules append to the direction and shape the next generation.
12. **Mutate.** Selection is the fitness function. Keep what survives critique, regenerate the rest. Each round tightens the loop.
13. **Starter prompt.** Distill the reusable skeleton so the next board, or the next person, starts from the pattern rather than from scratch (see `src/starter-prompt.md`).

## Why not the paid token-extractors

Surface-token tools read a design's color, spacing, and radius and hand them back. That captures the residue of taste, not its logic. They cannot tell you what a taste refuses, which is the part that makes generated work feel like yours instead of like a generic average. A thesis with forbidden moves can, and it costs a folder of references and an API key rather than a subscription.

## Extending to other kinds of taste

A `kind` selects the measure strategy and the tag vocabulary. `visual-ui` ships here. The seams are board-agnostic, so a new kind (photography, voice and tone, motion) is a registry entry in `src/config.mjs` plus a measure strategy and a vocabulary, not a pipeline rewrite.

# The lab

These parts of the repo work, have tests, and are not on the main path. Run them with `node src/<name>.mjs`. Each one is here because it taught something.

## Website generation (`generate.mjs`, `surfaces.mjs`)

Builds an HTML page from a mode. A board carries taste. A website also needs an audience, content, a structure and a job, and a board carries none of those. So `generate` asks for that context first and stops if it is missing (`--context file.json`, or `--skip-gate` to bypass). On the demo board a first page passed 0 of 8 critique rules and a rebuild passed 3 of 8. Posters are the default output for this reason.

## Page critique (`critique.mjs`, `scripts/capture.mjs`, `scripts/check-rules.mjs`)

Screenshots a generated page, turns what is wrong into testable rules, and feeds them to the next build. Known fault: `capture.mjs` shoots a 1440 by 3600 window, so a `100vh` hero is 3600 px tall.

## Canvas fit (`fit.mjs`)

For HTML output on a fixed canvas: finds boxes that leave the canvas and text clipped inside a box. It agreed with a human eye on 4 of 4 test posters.

## Fingerprint and score (`fingerprint.mjs`, `score.mjs`, `features.mjs`, `validate.mjs`, `calibrate.mjs`)

An attempt to measure how close an output sits to a board as one number. It was tested twice against a blind human ranking and failed both times: 5 of 15 pairs in agreement against a bar of 12. The measured facts are still used to describe a board (the palette in the rule sheet). They are not used to score an output.

## Atlas, thesis, link (`atlas.mjs`, `thesis.mjs`, `link.mjs`)

A browsable viewer of a board's lanes, a prose thesis written from the data, and a join of names and URLs onto references from a `sources.txt`.

## Gallery (`docs/gallery/`)

One recorded website run on the demo board, shown as it happened, weak results included.

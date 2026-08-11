# Roadmap

Taste Engine teaches an AI your creative taste from a board of references, extracts it as inspectable rules with **forbidden moves**, then generates and self-critiques against those rules. This file is the narrative — the story of where the product is going. The working backlog lives in [issues](https://github.com/ericseandevlin/taste-engine/issues) filed under milestones.

## Where we are

`visual-ui` is the one kind that ships today. The 12-stage pipeline works end-to-end on a website reference board: import → measure → tag → cluster → directions → thesis → atlas → fingerprint, with generate/critique/score as an interactive loop. The fingerprint v1 artifact is the canonical proof the stages produce real, inspectable data.

Two gaps are blocking the next step:

1. **No flow control.** `run-pipeline.mjs` fires all eight stages in sequence with no dependency checks. A user can run `thesis` without `cluster`, or `generate` without `directions`. Nothing tells them what to do next. Each stage produces garbage or crashes when its prerequisites are missing.
2. **One kind only.** The board-agnostic architecture is proven by design but not by example. Until a second kind exists, the "board-agnostic" claim is aspirational.

## MVP — flow control + poster kind

> Milestone [#1](https://github.com/ericseandevlin/taste-engine/milestone/1)

The MVP proves the board-agnostic thesis with a second kind, *and* fixes the flow so a user can actually run it. Posters are the right second kind: a fixed canvas, under 15 words of copy, no navigation, no states, no user tasks — the only variable is whether the generator can execute a coherent brief.

**Workstreams:**

- **Flow control.** Each stage checks for its prerequisite output files and refuses with a clear "run X first" message. A new `status` command reports which stages have run, which are pending, and what's blocking. This is the "what do I do next" answer, made into a command.
- **Poster kind.** New entry in the `KINDS` registry with a tag vocabulary drawn from a real reference board, not invented. The `swiss-focus` board (44 references, already extracted into a working brief) ports in as the first poster board. Posters have different taste axes than websites — composition, type-as-mass, color-field, density, print conventions — and the vocabulary reflects that.
- **Survey port.** The content/context capture layer (what's this poster for, who sees it, where it lives, what it must accomplish) currently lives in a separate life-os folder, orphaned. It moves into taste-engine as the step that runs *before* generate, so the moodboard carries taste and the survey carries everything the moodboard cannot.
- **Architecture cleanup.** The current poster scripts hardcode `/Users/eric/taste-engine/...` paths — coupled to one machine, not portable. They move to relative imports and run anywhere.

**Done when:** a new user can drop a folder of poster references into `boards/myboard/`, run `npm run status -- --board myboard`, follow the prompts through each gated stage, answer the survey, and generate a critiqued poster — without ever touching the source or hitting a confusing dead end.

## v0.2 — second board + harness

> Milestone [#2](https://ericseandevlin/taste-engine/milestone/2)

With two kinds proven, v0.2 extends the engine and hardens the loop.

- **Third kind.** Photography or copywriting (voice and sentence rhythm) — the kind that pushes the engine past visual taste and validates the registry seam a second time.
- **Automated critique loop.** generate → screenshot → critique → regenerate, firing without manual intervention. Each round appends testable rules and tightens the output.
- **OpenRouter-compatible model path.** The engine currently calls Anthropic directly. An OpenRouter path lets users run it on any provider and keeps the engine consistent with the Vellum open-source routing setup.

## v1.0 — public release

> Milestone [#3](https://github.com/ericseandevlin/taste-engine/milestone/3)

The release version, ready for someone who isn't the author to use.

- **Onboarding.** A new user gets from clone to first generated artifact in under 30 minutes.
- **Docs.** README, METHOD, and a quickstart that doesn't assume prior context.
- **CI on the pipeline.** The 12 stages run against a fixture board on every PR.
- **Versioned artifacts.** Fingerprint, thesis, and channels formats carry explicit versions so downstream tools can depend on them.

## How to use this roadmap

- **The narrative lives here.** Read this to understand direction.
- **The work lives in [issues](https://github.com/ericseandevlin/taste-engine/issues).** Each issue is filed under a milestone and labeled by workstream (`flow-control`, `poster-kind`, `survey`, `architecture`, `docs`, `enhancement`).
- **The milestones** track the three phases. Issues roll up into them.
# Security policy

## Supported versions

Taste Engine is pre-1.0. Only the latest commit on `main` gets security fixes.

## Report a vulnerability

Do not open a public issue for a security problem.

1. Go to the **Security** tab of this repo and click **Report a vulnerability**. This opens a private report that only the maintainer can read.
2. If that button is not there, email ericdevlin@me.com with "taste-engine security" in the subject.

Please include:

- what you found and where (file, command, or stage)
- the steps to reproduce it
- what an attacker could do with it

## What to expect

- A reply within 7 days.
- A fix or a plan within 30 days for a confirmed problem.
- Credit in the release notes, unless you ask for none.

## Scope

In scope:

- code in `src/` and `scripts/`
- the GitHub Actions workflows in `.github/`
- a dependency that this repo pins to a vulnerable version

Out of scope:

- your own API keys in your own `.env` file. Keep that file out of commits.
- the content of images that a model returns
- faults in the model providers themselves. Report those to the provider.

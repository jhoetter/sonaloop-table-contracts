# Where this repository comes from

This repository is a **one-way mirror, one commit per release,** of the directory `packages/table-contracts` of the private monorepo in which @sonaloop/table-contracts is developed
(state: version 0.2.0, monorepo commit bfd2ea6a4278, 2026-11-08). Each commit is a release: its message is the section of CHANGELOG.md for that
version, and it ends with the lines `Release: <version>` and `Monorepo-Commit: <sha>` (the commit of the monorepo it was made from). The day-to-day history
of the monorepo is not part of this repository.

## Who is the source of truth?

For now the **monorepo**: changes to the package are made there and mirrored here by appending a commit to `main` for each new version (fast-forward only, never
overwritten, never force-pushed). Before every push the export scans the file names, the content and the commit message of what it is about to push for key
patterns, and it refuses a release message that names internal things.

## How to contribute

Open a pull request against `main` (see CONTRIBUTING.md). Do not commit to `main` directly: a commit that does not come from the monorepo stops the next
mirror run until the maintainers have taken it over. Accepted changes are applied in the monorepo and appear here with the next mirror run.

## Local checks

```sh
npm install --no-save --ignore-scripts zod typescript tsx esbuild @types/node   # versions as in .github/workflows/ci.yml
npm run typecheck
npm test
npm run build -- --out dist-package
```

# Contributing

Thank you for looking at `@sonaloop/table-contracts`. The package is small on purpose: a table described as plain data, checked, hashed, compared and used to
validate rows. Changes are welcome when they keep it that way.

## What this repository is

A **mirror**. The package is developed in the maintainers' monorepo and mirrored here, one commit per release, by appending commits to `main` (see SOURCE.md). A pull
request here is reviewed here, applied in the monorepo by a maintainer and comes back with the next mirror run. Please do not push to `main` directly: a commit that
did not come from the monorepo stops the next mirror run until it has been taken over.

## Set up

Node 22 or newer. The package has one dependency, `zod`; the tools are installed without touching `package.json`:

```sh
npm install --no-save --ignore-scripts zod@3.25.76 typescript@5.9.3 tsx@4.23.13 esbuild@0.25.12 @types/node@22.19.0
npm run typecheck     # tsc, no emit
npm test              # node --test test/*.spec.mjs
npm run build -- --out dist-package    # the installable package (ESM, declarations, JSON Schema)
npm run compat        # the standard contracts against the last tagged version: only additive changes
npm run scan          # key patterns in the files and in the whole history
```

## Rules that keep the package stable

- **The vocabulary is closed.** A new column type, a new column property or a new rule is a decision of the maintainers, not a pull request. Open an issue first.
- **Contracts are immutable.** A new version of a contract may only extend it (an optional column, a select option, a looser bound, a changed description). Anything
  else needs a new contract id. `npm run compat` enforces this against the last tag.
- **The canonical form and the normal form decide every hash.** A change to either one changes every hash and fails the golden tests on purpose; it needs a maintainer's
  decision and a new format version.
- **No dependency besides `zod`, no Node built-in and no `process.env` in `src/`.** The sources run in a browser, a worker and Node.
- **Every hard bound is a named key** of `ROW_LIMITS` or `CONTRACT_LIMITS` in `src/limits.ts`, and an overrun is a readable error.
- Messages name the contract, the column, the rule and an example. They are English and plain text.
- Keep contracts and tests free of personal data: use `example.org` addresses and made-up names.

## Pull requests

One topic per pull request, a test for every change of behaviour, and a line in `CHANGELOG.md`. By contributing you agree that your contribution is licensed under
the Apache License 2.0 (section 5 of the license), the license of this package.

## Reporting a security problem

Do not open a public issue; see SECURITY.md.

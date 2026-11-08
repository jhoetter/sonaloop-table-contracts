# Working on this package (for people and coding agents)

`@sonaloop/table-contracts`: a table described as plain data (`sonaloop.table-contract.v1`), checked, hashed, compared, rows validated, row types derived.

- One dependency (`zod`), no Node built-in and no `process.env` in `src/` (it runs in a browser, a worker and Node), no I/O.
- The vocabulary is closed. A new column type or property needs a decision of the maintainers; do not add one.
- Every hard bound is a named key of `ROW_LIMITS` / `CONTRACT_LIMITS` (`src/limits.ts`).
- A change to the canonical form or the normal form changes every hash: the golden hashes in `test/public.spec.mjs` fail on purpose. Contracts are immutable; only
  additive versions (`npm run compat` compares with the last tag).
- `npm run typecheck`, `npm test`, `npm run build -- --out dist-package`, `npm run compat` and `npm run scan` are what CI runs (see CONTRIBUTING.md).
- Messages are English plain text and name the contract, the column, the rule and an example.

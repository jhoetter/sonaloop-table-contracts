# Changelog

## 0.2.0

First public release. Version 0.1.0 was an internal version that was never published; it is listed below for completeness.

- The format `sonaloop.table-contract.v1`, the checks, the canonical form and content hash, the compatibility rules, row validation, row types and the six standard contracts
  `contact`, `account`, `consent`, `content-item`, `media-asset` and `campaign` (see 0.1.0 below for the full list).
- `checkContract`: a `list` of `email` must carry `privacy: "personal"`, like an `email` column (finding `email-privacy`).
- `SystemFields.imported?: boolean` (additive): true for a row a table core took over from the export of another core (set by the core from the provenance, never from the data).
- `currentConsent(table, contactId, purpose?, { includeImported? })`: an imported consent row does not count as proof unless `includeImported` is true (default false); the options type is
  `ConsentOptions`. A restore into the same core is not marked and counts as before ("same core" is what the export file states; the table core decides it, not this package).
- `imported` is a reserved column name (`RESERVED_COLUMNS`): `checkContract` refuses a column of that name (`column-reserved`).

## 0.1.0 (internal, never published)

- Format `sonaloop.table-contract.v1`: closed zod schema `tableContractSchema` (15 column types, `list` and `timestamp` included),
  semantic checks `checkContract` / `parseContract` with findings `{ code, path, message, example }`.
- Canonical JSON after RFC 8785 (`canonicalize`), normal form (`normalizeContract`) and content hash `contractHash`
  (`sha256:<hex>`, own synchronous SHA-256).
- `defineContract` with const type parameter and the row types `RowOf`, `CreateOf`, `PatchOf`.
- `validateRow` (pure row check after the format, modes `create`, `replace`, `patch`, `allowUnknown` for newer versions;
  errors `{ contract, column, rule, message, example }`) and `comparableValue` (e-mail trimmed and lower-cased).
- `compareContracts` (`{ compatible, additions, breaking }` after the change rules; breaking means a new contract id).
- Bundle files `sonaloop.contract-bundle.v1` (`bundleOf`, `serializeBundle`, `parseBundle`) and locks `sonaloop.contracts-lock.v1`
  (`lockOf`, `serializeLock`, `parseLock`, `verifyLock`).
- JSON Schema of the shape for editors (`contractJsonSchema`, `schema/table-contract.v1.schema.json`).
- Standard contracts v1: `contact`, `account`, `consent` (append-only ledger), `content-item`, `media-asset`, `campaign`
  (`standard`, one export each, `standard/<id>.json`, `listStandardContracts`). All of them use `partition: "tenant"`; their texts are English.
- Consent helpers `currentConsent` and `recordConsent` (for a structurally typed table). They read the page cursor `nextCursor` of the table client
  (`cursor` stays an alias) and stop with an error when a table returns the same cursor twice (`ConsentPage`).
- `build.mjs` builds the installable ESM package with declarations; the repository files: LICENSE (Apache-2.0), NOTICE, README, CONTRIBUTING.md,
  SECURITY.md, a CI workflow (typecheck, tests, build, compatibility with the last tagged version, secret scan) and the checks behind it
  (`test/public.spec.mjs`, `scripts/check-compat.ts`, `scripts/scan-secrets.mjs`).

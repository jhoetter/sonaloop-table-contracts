# @sonaloop/table-contracts

A table described as plain data. A **table contract** (`sonaloop.table-contract.v1`) names one table: id, version, purpose,
columns, rules and privacy. This package checks a contract, hashes it, compares two versions, validates rows against it and
derives TypeScript row types from it, without code generation. It does no I/O and has one dependency: `zod`.

## Install

```sh
npm install @sonaloop/table-contracts
```

Node 20 or newer. The package is an ES module with TypeScript declarations; `zod` (3.25.76 or newer, below 5) is its only dependency. To build it from source, see CONTRIBUTING.md.

```ts
import { defineContract, validateRow, contractHash, type CreateOf, type RowOf } from '@sonaloop/table-contracts';

export const deal = defineContract({
  schema: 'sonaloop.table-contract.v1',
  id: 'crm.deal',
  version: 1,
  title: 'Deal',
  purpose: 'A sales deal with stage and value.',
  partition: 'organization',
  personal: { subjectRef: ['contactId'] },
  columns: [
    { name: 'title', type: 'text', required: true, description: 'Short name of the deal.' },
    { name: 'stage', type: 'select', options: ['open', 'won', 'lost'], required: true, index: true },
    { name: 'value', type: 'number', min: 0 },
    { name: 'contactId', type: 'reference', target: 'contact', index: true, privacy: 'pseudonymous' },
    { name: 'tags', type: 'list', items: 'text' },
  ],
});

type Deal = RowOf<typeof deal>;          // { id, revision, createdAt, ..., title: string; stage: 'open' | 'won' | 'lost'; value?: number; ... }
const draft: CreateOf<typeof deal> = { title: 'Framework agreement', stage: 'open' };
// const wrong: CreateOf<typeof deal> = { title: 'x', stage: 'pending' };   // type error: not an option

validateRow(deal, { stage: 'open' }, { mode: 'create' });
// { ok: false, errors: [{ contract: 'crm.deal', column: 'title', rule: 'required', message: 'Required column "title" is missing.', example: '{ "title": "Text" }' }] }

contractHash(deal); // 'sha256:…' over the canonical JSON (RFC 8785) of the normal form
```

`defineContract` keeps the literal type (const type parameter, no `as const` needed) and throws when the contract has a finding,
so a broken contract fails when its module loads.

## The contract

| Field | Required | Rule |
| --- | --- | --- |
| `schema` | yes | `sonaloop.table-contract.v1` |
| `id` | yes | `<name>` for a standard contract, `<namespace>.<name>` otherwise (`^[a-z][a-z0-9-]{0,39}(\.[a-z][a-z0-9-]{0,39})?$`); namespace `platform` is reserved |
| `version` | yes | integer from 1 |
| `title`, `purpose` | yes | plain text; `title` ≤ 120, `purpose` ≤ 400 characters |
| `partition` | yes | `tenant` (all apps of the tenant with a grant) or `organization` (only callers of the row's organization) |
| `personal` | no | `{ subjectKey?: columns that identify a person, subjectRef?: reference columns to such rows }`; without it no column may be `personal` |
| `retentionDays` | no | integer > 0: rows are deleted that many days after their last change |
| `appendOnly` | no | `true`: rows can only be created (a ledger) |
| `columns` | yes | 1 to 64, unique names |
| `rules` | no | `[{ anyRequired: [columns] }]`: at least one of the columns is set |
| `$schema` | no | editor hint (see below); not part of the contract or its hash |

### Columns (closed vocabulary)

Name: camelCase, `^[a-z][A-Za-z0-9]{0,62}$`. Reserved for the system columns of every row: `id`, `revision`, `createdAt`,
`updatedAt`, `createdBy`, `updatedBy`, `contractVersion`, `partition`.

| Type | Value | Notes |
| --- | --- | --- |
| `text`, `markdown` | string | up to 32000 characters |
| `number` | number | `min`, `max`, `integer` |
| `boolean` | `true` / `false` | |
| `date` | `"YYYY-MM-DD"` | a valid calendar day |
| `timestamp` | `"2026-11-07T09:30:00.000Z"` | ISO 8601, UTC, milliseconds |
| `url` | string | `http:` or `https:`, no user info |
| `email` | string | valid address, compared trimmed and lower-cased; must be `privacy: "personal"` |
| `select` | one of `options` | 1 to 50 options |
| `reference` | row id of `target` | `target` is a contract id |
| `list` | array of `items` | `items`: text, number, boolean, date, timestamp, url, email, select, reference; up to 1000 entries |
| `object` | object of `fields` | sub-columns one level deep; deeper data is `json` |
| `json` | any JSON | checked for shape and size only |
| `image`, `video` | file reference | |

Properties: `required`, `unique` (implies `index`), `index` (equality search and sort; not on json, object, list), `min` / `max` /
`integer` (numbers), `options`, `target`, `items`, `fields`, `description` (≤ 200 characters), `privacy` (`technical` default,
`pseudonymous`, `personal`; **required** for `json` and `object`), `secret` (text, json, object: never shown outside the app).
An unknown key is an error. Computed fields, defaults, patterns, lengths and per-column permissions are app logic, not contract.

## API

| Function | Does |
| --- | --- |
| `checkContract(input)` | all findings `{ code, path, message, example }`; never throws |
| `parseContract(input)` | the valid contract or a thrown `ContractError` with the findings |
| `defineContract(contract)` | the same object, frozen, with its literal type; throws on a finding |
| `canonicalize(value)` | canonical JSON after RFC 8785 (refuses cycles, NaN, lone surrogates, non-plain objects) |
| `normalizeContract(input)`, `contractHash(input)` | normal form (defaults dropped) and `sha256:<hex>` of its canonical JSON |
| `compareContracts(older, newer)` | `{ compatible, additions, breaking }` after the change rules below |
| `validateRow(contract, data, { mode, allowUnknown? })` | `{ ok, value }` or `{ ok: false, errors: [{ contract, column, rule, message, example }] }` |
| `comparableValue(column, value)` | the value `unique` and `index` compare by |
| `bundleOf`, `serializeBundle`, `parseBundle` | bundle files `sonaloop.contract-bundle.v1` (sorted by id, canonical) |
| `lockOf`, `serializeLock`, `parseLock`, `verifyLock` | lock files `sonaloop.contracts-lock.v1` (`{ id, version, hash, source }`) |
| `contractJsonSchema()` | JSON Schema of the shape, also shipped as `schema/table-contract.v1.schema.json` |

`validateRow` is pure: it cannot know whether a reference's target exists or a unique value is free; a table store does that.
Modes: `create` and `replace` carry the whole row (required columns, `anyRequired`); `patch` carries the changed columns (`null`
clears an optional one). `allowUnknown` passes through columns of a newer contract version. Bounds: depth 20, 10000 values,
128000 characters per row, 32000 per string, 1000 list entries. Messages are English.

## Versions

A newer version may only extend: a new optional column, a new `select` option, `required` to optional, a lower `min`, a higher
`max`, a new `index`, a changed `title`, `purpose` or `description`. Everything else (removing or renaming a column, another
type, adding `required` or `unique`, narrower bounds, removing an option, another `partition`, `appendOnly`, `personal`,
`target`, privacy or secret) needs a **new contract id**. The same version with different content is a conflict.

## Editor support

```json
{ "$schema": "./node_modules/@sonaloop/table-contracts/schema/table-contract.v1.schema.json", "schema": "sonaloop.table-contract.v1" }
```

The JSON Schema covers the closed shape; `checkContract` adds the semantic rules.

## Standard contracts

Six contracts that many applications share ship with the package (`standard/<id>.json`, `standard`, `listStandardContracts()`). Use one before you make a table of your
own: `contact` (a person the organisation knows), `account` (the business a person belongs to), `consent` (an append-only ledger of consents), `content-item`, `media-asset` and
`campaign`. Their ids carry no namespace; every other contract is `<namespace>.<name>`.

## Stability

A contract is immutable once it has a hash. A newer version may only extend it (see "Versions"); everything else is a new contract id. The canonical form and the
normal form are part of the format: the hashes of the standard contracts are pinned by tests, and `npm run compat` compares the standard contracts with the last tagged
version. The package follows semantic versioning; the vocabulary of the format is closed and grows only by a new format version.

## License

Apache License 2.0 (LICENSE, NOTICE). Contributions: CONTRIBUTING.md. Security reports: SECURITY.md.

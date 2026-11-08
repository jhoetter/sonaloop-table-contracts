// The tests that travel with the package (they run in this directory alone, with the tools CI installs): the standard contracts and their hashes, the files generated
// from the sources, the bundle and lock formats, the row check, the compatibility rules, the canonical form. `node --import tsx --test test/*.spec.mjs`.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  CONTRACT_JSON_SCHEMA_FILE, RESERVED_COLUMNS, bundleOf, canonicalize, checkContract, compareContracts, contractHash, contractJsonSchema, currentConsent, defineContract, listStandardContracts,
  lockOf, parseBundle, parseLock, recordConsent, serializeBundle, serializeLock, standard, validateRow, verifyLock,
} from '../src/index.ts';

// Contracts are immutable: a changed hash fails here on purpose. A change is a new version of the contract, and an additive one.
const GOLDEN = {
  account: 'sha256:50aac39e210fb15644795e4157c7d549e724df2cb3f71417d47481be7f15f63a',
  campaign: 'sha256:671cc46667b9e8a2186affbf0ed729093fd4989344cc86b70892577656b4d6ee',
  consent: 'sha256:c4ba76b3b600a2fefa2b9fd9b8fcd792600b0452f820f7f38dfc2244409e9c79',
  contact: 'sha256:82871ff570be301ea364dcf820292563cd35c5e9bc5d68bbd29551e04d19b36d',
  'content-item': 'sha256:079306f3e3ad5ebf2e786317a5ed3545115e46bc344b4857408b8f89d86e3367',
  'media-asset': 'sha256:7093b43a7584a377ce9462727b1191a113d9f66f1151e36b4771d2c3e106dc54',
};
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const contracts = Object.values(standard);

test('the six standard contracts are valid, at version 1, and have their golden hashes', () => {
  assert.deepEqual(Object.fromEntries(listStandardContracts().map(entry => [entry.id, entry.hash])), GOLDEN);
  for (const contract of contracts) {
    assert.deepEqual(checkContract(contract), [], contract.id);
    assert.equal(contract.version, 1, contract.id);
    assert.ok(/^[\x20-\x7e]*$/.test(`${contract.title}${contract.purpose}${contract.columns.map(column => column.description ?? '').join('')}`), `${contract.id}: plain English text`);
  }
});

test('standard/*.json are the canonical JSON of the sources, one file per contract', () => {
  assert.deepEqual(readdirSync(new URL('../standard/', import.meta.url)).sort(), contracts.map(contract => `${contract.id}.json`).sort());
  for (const contract of contracts) {
    const text = read(`standard/${contract.id}.json`);
    assert.equal(text, `${canonicalize(JSON.parse(text))}\n`, `${contract.id}.json is canonical`);
    assert.equal(contractHash(JSON.parse(text)), GOLDEN[contract.id], `${contract.id}.json has the golden hash`);
  }
});

test('the JSON Schema file is the one the sources generate', () => {
  assert.equal(read(CONTRACT_JSON_SCHEMA_FILE), `${JSON.stringify(contractJsonSchema(), null, 2)}\n`);
});

test('a bundle and a lock round-trip, and the lock notices a changed contract', () => {
  const bundle = bundleOf(contracts);
  assert.deepEqual(parseBundle(serializeBundle(bundle)), bundle);
  const lock = lockOf([{ bundle, source: 'standard' }]);
  assert.deepEqual(parseLock(serializeLock(lock)), lock);
  assert.deepEqual(verifyLock(bundle, lock), []);
  const changed = bundleOf(contracts.map(contract => (contract.id === 'account' ? { ...contract, purpose: `${contract.purpose} More.` } : contract)));
  assert.deepEqual(verifyLock(changed, lock).map(finding => finding.code), ['lock-hash']);
});

test('validateRow names contract, column, rule and an example', () => {
  const result = validateRow(standard.contact, {}, { mode: 'create' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map(error => [error.contract, error.rule]), [['contact', 'any-required']]);
  assert.ok(result.errors[0].message && result.errors[0].example);
  const column = validateRow(standard.account, { domain: 'example.org' }, { mode: 'create' });
  assert.equal(column.errors[0].column, 'name');
  assert.equal(column.errors[0].rule, 'required');
  assert.equal(validateRow(standard.contact, { email: 'lena@example.org' }, { mode: 'create' }).ok, true);
});

test('the change rules: an optional column is an addition, a changed type or a removed column breaks, the same version with other content breaks', () => {
  const older = standard.account;
  const column = { name: 'region', type: 'text' };
  const more = compareContracts(older, { ...older, version: 2, columns: [...older.columns, column] });
  assert.deepEqual([more.compatible, more.additions.map(change => change.code)], [true, ['column-added']]);
  const retyped = compareContracts(older, { ...older, version: 2, columns: older.columns.map(entry => (entry.name === 'name' ? { ...entry, type: 'number' } : entry)) });
  assert.deepEqual(retyped.breaking.map(change => change.code), ['type-changed']);
  assert.deepEqual(compareContracts(older, { ...older, version: 2, columns: older.columns.slice(1) }).breaking.map(change => change.code), ['column-removed']);
  assert.deepEqual(compareContracts(older, { ...older, columns: [...older.columns, column] }).breaking.map(change => change.code), ['same-version']);
});

test('the format is closed, and a contract that breaks it is refused when it is defined', () => {
  assert.ok(checkContract({ ...standard.account, surprise: true }).length > 0);
  assert.throws(() => defineContract({ ...standard.account, columns: [{ name: 'Bad-Name', type: 'text' }] }), /Bad-Name/);
  assert.equal(canonicalize({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
});

test('`imported` is a system column: no contract may declare it, and the standard contracts do not', () => {
  assert.ok(RESERVED_COLUMNS.includes('imported'));
  const declared = { ...standard.account, columns: [...standard.account.columns, { name: 'imported', type: 'boolean' }] };
  assert.deepEqual(checkContract(declared).map(finding => [finding.code, finding.path]), [['column-reserved', 'columns[' + standard.account.columns.length + '].name']]);
  assert.throws(() => defineContract(declared), /imported/);
  for (const contract of listStandardContracts().map(entry => standard[entry.id === 'content-item' ? 'contentItem' : entry.id === 'media-asset' ? 'mediaAsset' : entry.id])) {
    assert.ok(!contract.columns.some(column => column.name === 'imported'), contract.id);
  }
  // A row cannot bring the mark in through its data either: the table core sets it, never the writer.
  assert.equal(validateRow(standard.account, { name: 'Example', imported: true }, { mode: 'create' }).ok, false);
});

test('an imported consent row is a hint, not proof: currentConsent ignores it unless includeImported, and a row of the same core counts as before', async () => {
  const rows = [];
  const table = {
    async query({ where }) { return { items: rows.filter(row => row.contactId === where.contactId && (where.purpose === undefined || row.purpose === where.purpose)), nextCursor: null }; },
    async create(data) { const row = { ...data, id: `cs_${rows.length + 1}`, createdAt: '2026-11-07T10:00:00.000Z' }; rows.push(row); return row; },
  };
  const source = { principal: 'app:website' };
  await recordConsent(table, { contactId: 'ct_1', purpose: 'newsletter', status: 'denied', at: '2026-11-01T09:00:00.000Z', source });
  rows.push({ id: 'cs_import', createdAt: '2026-11-07T10:00:00.000Z', contactId: 'ct_1', purpose: 'newsletter', status: 'granted', at: '2026-11-05T09:00:00.000Z', source, imported: true });
  assert.equal((await currentConsent(table, 'ct_1', 'newsletter'))?.status, 'denied', 'the imported grant is no proof');
  assert.equal((await currentConsent(table, 'ct_1', 'newsletter', { includeImported: true }))?.status, 'granted', 'with includeImported it is the latest entry');
  assert.deepEqual([...(await currentConsent(table, 'ct_1'))].map(([purpose, row]) => `${purpose}:${row.status}`), ['newsletter:denied']);
  assert.deepEqual([...(await currentConsent(table, 'ct_1', undefined, { includeImported: true }))].map(([purpose, row]) => `${purpose}:${row.status}`), ['newsletter:granted']);
  // Only imported rows: without the option there is no consent at all.
  rows.splice(0, 1);
  assert.equal(await currentConsent(table, 'ct_1', 'newsletter'), undefined);
  assert.equal((await currentConsent(table, 'ct_1', 'newsletter', { includeImported: true }))?.status, 'granted');
});

import { z } from 'zod/v4';
import { canonicalize } from './canonical.ts';
import { parseContract } from './check.ts';
import type { TableContract } from './format.ts';
import { contractHash, normalizeContract } from './hash.ts';
import { ContractError, jsonProblem, type Finding } from './json.ts';

/** Format of a bundle file (`contracts/contracts.json` for an app's own contracts, `contracts/vendor.json` for resolved ones). */
export const BUNDLE_SCHEMA = 'sonaloop.contract-bundle.v1';
/** Format of `contracts.lock.json`: id, version, hash and source of every contract an app uses. */
export const LOCK_SCHEMA = 'sonaloop.contracts-lock.v1';

/** Contracts in normal form, sorted by id, each id once. Stored as canonical JSON. */
export interface ContractBundle {
  readonly schema: typeof BUNDLE_SCHEMA;
  readonly contracts: readonly TableContract[];
}

export interface LockEntry {
  readonly id: string;
  readonly version: number;
  /** `sha256:<hex>` of the contract (`contractHash`). */
  readonly hash: string;
  /** Where the contract comes from, e.g. `app`, `@sonaloop/table-contracts@0.2.0`, `git:<project>@<commit>`. */
  readonly source: string;
}

export interface ContractsLock {
  readonly schema: typeof LOCK_SCHEMA;
  readonly contracts: readonly LockEntry[];
}

const HASH = /^sha256:[0-9a-f]{64}$/;
const lockSchema = z.strictObject({
  schema: z.literal(LOCK_SCHEMA),
  contracts: z.array(z.strictObject({ id: z.string(), version: z.number().int().min(1), hash: z.string().regex(HASH), source: z.string().min(1).max(200) })),
});
const bundleShape = z.strictObject({ schema: z.literal(BUNDLE_SCHEMA), contracts: z.array(z.unknown()) });

const byId = (left: { id: string }, right: { id: string }) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
const fail = (code: string, path: string, message: string, example: string): never => { throw new ContractError([{ code, path, message, example }]); };

/** A bundle of the given contracts: each checked (`parseContract`), normalized, sorted by id. Throws `ContractError` on a finding or a duplicate id. */
export function bundleOf(contracts: readonly unknown[]): ContractBundle {
  const parsed = contracts.map((contract, index) => {
    try {
      return normalizeContract(parseContract(contract));
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      throw new ContractError(error.findings.map(finding => ({ ...finding, path: `contracts[${index}]${finding.path ? `.${finding.path}` : ''}` })));
    }
  });
  const ids = new Set<string>();
  for (const contract of parsed) {
    if (ids.has(contract.id)) fail('bundle-duplicate', 'contracts', `Contract "${contract.id}" appears twice in the bundle.`, 'Each contract id once.');
    ids.add(contract.id);
  }
  return { schema: BUNDLE_SCHEMA, contracts: [...parsed].sort(byId) };
}

/** The file text of a bundle: canonical JSON (RFC 8785) and a final newline. */
export function serializeBundle(bundle: ContractBundle): string {
  return `${canonicalize(bundleOf(bundle.contracts))}\n`;
}

/** Reads a bundle file (text or parsed JSON). Throws `ContractError` when it is not a valid bundle or not in its stored form (sorted, normal form). */
export function parseBundle(input: unknown): ContractBundle {
  const value = typeof input === 'string' ? parseJson(input) : input;
  const problem = jsonProblem(value);
  if (problem) throw new ContractError([problem]);
  const shape = bundleShape.safeParse(value);
  if (!shape.success) fail('bundle-shape', '', `Not a valid ${BUNDLE_SCHEMA} file: ${shape.error.issues[0]?.message ?? ''}`, `{ "schema": "${BUNDLE_SCHEMA}", "contracts": [] }`);
  const bundle = bundleOf(shape.data!.contracts);
  if (canonicalize(bundle) !== canonicalize(value))
    fail('bundle-not-canonical', '', 'The bundle is not in its stored form (sorted by id, normal form); generate it again.', 'serializeBundle(bundleOf(contracts))');
  return bundle;
}

/** A lock for bundles and their source (an app's own contracts with source `app`, resolved ones with their package or Git pin). */
export function lockOf(entries: readonly { readonly bundle: ContractBundle; readonly source: string }[]): ContractsLock {
  const contracts = entries.flatMap(({ bundle, source }) => bundle.contracts.map(contract => ({ id: contract.id, version: contract.version, hash: contractHash(contract), source })));
  const ids = new Set<string>();
  for (const entry of contracts) {
    if (ids.has(entry.id)) fail('lock-duplicate', 'contracts', `Contract "${entry.id}" comes from two sources.`, 'Each contract id from exactly one source.');
    ids.add(entry.id);
  }
  return parseLock({ schema: LOCK_SCHEMA, contracts: contracts.sort(byId) });
}

/** The file text of a lock: sorted by id, two-space JSON (readable in a diff), final newline. */
export function serializeLock(lock: ContractsLock): string {
  const checked = parseLock(lock);
  return `${JSON.stringify({ schema: checked.schema, contracts: [...checked.contracts].sort(byId).map(({ id, version, hash, source }) => ({ id, version, hash, source })) }, null, 2)}\n`;
}

/** Reads a lock file (text or parsed JSON). Throws `ContractError` when it is not a valid lock. */
export function parseLock(input: unknown): ContractsLock {
  const value = typeof input === 'string' ? parseJson(input) : input;
  const problem = jsonProblem(value);
  if (problem) throw new ContractError([problem]);
  const shape = lockSchema.safeParse(value);
  if (!shape.success) {
    const issue = shape.error.issues[0];
    fail('lock-shape', issue?.path.join('.') ?? '', `Not a valid ${LOCK_SCHEMA} file: ${issue?.message ?? ''}`, '{ "id": "contact", "version": 1, "hash": "sha256:…", "source": "app" }');
  }
  return shape.data! as ContractsLock;
}

/**
 * Findings of a lock against the bundles it pins (empty = consistent): a contract without lock entry, a different version or hash
 * (the message names both hashes), a lock entry without contract, a contract in two bundles.
 */
export function verifyLock(bundles: ContractBundle | readonly ContractBundle[], lock: ContractsLock): Finding[] {
  const findings: Finding[] = [];
  const entries = new Map(parseLock(lock).contracts.map(entry => [entry.id, entry]));
  const seen = new Set<string>();
  for (const bundle of Array.isArray(bundles) ? (bundles as readonly ContractBundle[]) : [bundles as ContractBundle]) {
    for (const contract of bundle.contracts) {
      const path = `contracts.${contract.id}`;
      if (seen.has(contract.id)) findings.push({
        code: 'bundle-duplicate', path, message: `Contract "${contract.id}" appears in two bundles.`,
        example: 'Own contracts in contracts.json, resolved ones in vendor.json.',
      });
      seen.add(contract.id);
      const entry = entries.get(contract.id);
      const hash = contractHash(contract);
      if (!entry) findings.push({ code: 'lock-missing', path, message: `Contract "${contract.id}" is missing from the lock.`, example: 'Write the lock again (lockOf).' });
      else if (entry.version !== contract.version)
        findings.push({ code: 'lock-version', path, message: `The lock names version ${entry.version}, the bundle ${contract.version}.`, example: `"version": ${contract.version}` });
      else if (entry.hash !== hash) findings.push({ code: 'lock-hash', path, message: `Hash differs: lock ${entry.hash}, bundle ${hash}.`, example: `"hash": "${hash}"` });
    }
  }
  for (const id of entries.keys())
    if (!seen.has(id))
      findings.push({ code: 'lock-extra', path: `contracts.${id}`, message: `The lock names "${id}", but no bundle contains it.`, example: 'Remove the entry or add the contract to a bundle.' });
  return findings;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fail('not-json', '', `Not JSON: ${(error as Error).message}`, '{ "schema": "…", "contracts": [] }');
  }
}

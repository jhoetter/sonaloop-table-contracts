import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { canonicalContract } from '../src/hash.ts';
import { standard } from '../src/standard/index.ts';

/** Writes `standard/<id>.json` (canonical JSON of each standard contract) from the TypeScript sources. A test pins files and sources. */
const directory = new URL('../standard/', import.meta.url);
for (const file of readdirSync(directory)) if (file.endsWith('.json')) rmSync(new URL(file, directory));
for (const contract of Object.values(standard)) writeFileSync(new URL(`${contract.id}.json`, directory), `${canonicalContract(contract)}\n`);

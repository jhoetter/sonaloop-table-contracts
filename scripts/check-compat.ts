import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { compareContracts } from '../src/index.ts';

/**
 * Compares the standard contracts (`standard/*.json`) of the working tree with those of the last tagged version (`v*`, newest first) or of `--against <ref>`:
 * a contract may only be extended (the rules of the format); one that is gone, or changed in any other way, is an error. Without a tag there is nothing to compare.
 * Exit 0 compatible (or nothing to compare), 1 not compatible, 2 usage.
 */
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const flag = process.argv.indexOf('--against');
if (process.argv.length > 2 && flag < 0) { console.error('Usage: check-compat [--against <ref>]'); process.exit(2); }
const reference = flag >= 0 ? process.argv[flag + 1] : git('tag', '--list', 'v*', '--sort=-version:refname').split('\n').find(Boolean);
if (!reference) { console.log('No tagged version yet (no tag v*): nothing to compare.'); process.exit(0); }

const published = git('ls-tree', '--name-only', '-r', reference, '--', 'standard/').split('\n').filter(name => name.endsWith('.json'));
const current = new Set(readdirSync(new URL('../standard/', import.meta.url)).map(name => `standard/${name}`));
const problems: string[] = [];
let additions = 0;
for (const file of published) {
  const before: unknown = JSON.parse(git('show', `${reference}:${file}`));
  if (!current.has(file)) { problems.push(`${file}: the contract exists in ${reference} and is gone; a published contract is never removed`); continue; }
  const result = compareContracts(before, JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')));
  for (const change of result.breaking) problems.push(`${file}: ${change.message} (${change.path})`);
  additions += result.additions.length;
}
if (problems.length) {
  console.error(`Not compatible with ${reference}:\n${problems.map(problem => `  ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log(`Compatible with ${reference}: ${published.length} standard contract(s), ${additions} addition(s), nothing breaking.`);

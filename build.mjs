/**
 * Builds the installable package: ESM bundle (zod external) plus declarations, README, CHANGELOG, LICENSE, NOTICE and the JSON Schema.
 * `--out <dir>` writes the package tree; `--pack <dir>` also writes the tarball there (`npm pack`) and prints its path.
 * The package stays `private` (npm refuses to publish it) unless `--publishable` is given, which is what the release does and nothing else. Only the publishable manifest
 * names the author, the repository, the home page and the issues page of the public home (PUBLIC below) and carries search keywords; no `private` key, no scripts.
 * No network, no registry, nothing is published. Paths are resolved from this directory; the tools (esbuild, typescript) are found from here, in a monorepo or alone.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index >= 0 ? resolve(process.cwd(), args[index + 1]) : undefined; };
const pack = option('--pack');
const publishable = args.includes('--publishable');
const stage = option('--out') ?? mkdtempSync(join(tmpdir(), 'table-contracts-'));
const source = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));

/** Who wrote the package and where it lives, for the registry page of the published package. A name only: no e-mail address. */
const REPOSITORY = 'https://github.com/jhoetter/sonaloop-table-contracts';
const PUBLIC = {
  author: 'Johannes Hötter',
  repository: { type: 'git', url: `git+${REPOSITORY}.git` },
  homepage: `${REPOSITORY}#readme`,
  bugs: { url: `${REPOSITORY}/issues` },
  keywords: ['data-contract', 'table-contract', 'schema', 'validation', 'canonical-json', 'typescript'],
};

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const dist = join(stage, 'dist');

await build({
  entryPoints: [join(here, 'src/index.ts')], absWorkingDir: here, outdir: dist, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  external: ['zod', 'zod/*'], legalComments: 'none', logLevel: 'warning',
});

// Declarations: emit them from the sources, then point the relative `.ts` specifiers at `.js`.
const types = join(stage, '.types');
writeFileSync(join(stage, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2022', lib: ['ES2023', 'DOM'], module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true,
    declaration: true, emitDeclarationOnly: true, allowImportingTsExtensions: true, rootDir: join(here, 'src'), outDir: types, types: [],
  },
  files: readdirSync(join(here, 'src'), { recursive: true }).filter(name => name.endsWith('.ts')).map(name => join(here, 'src', name)),
}));
execFileSync(process.execPath, [tsc, '-p', join(stage, 'tsconfig.json')], { stdio: 'inherit' });
rmSync(join(stage, 'tsconfig.json'));
for (const file of readdirSync(types, { recursive: true }).filter(name => name.endsWith('.d.ts'))) {
  mkdirSync(dirname(join(dist, file)), { recursive: true });
  writeFileSync(join(dist, file), readFileSync(join(types, file), 'utf8').replace(/(from |import\()(['"])(\.\.?\/[^'"]+)\.ts\2/g, '$1$2$3.js$2'));
}
rmSync(types, { recursive: true, force: true });

writeFileSync(join(stage, 'package.json'), `${JSON.stringify({
  name: source.name, version: source.version, description: source.description, ...(publishable ? {} : { private: true }), license: source.license,
  ...(publishable ? PUBLIC : {}),
  type: 'module', sideEffects: false,
  main: './dist/index.js', types: './dist/index.d.ts',
  ...(publishable ? { publishConfig: { access: 'public' } } : {}),
  engines: { node: '>=20' },
  files: ['dist', 'schema', 'standard', 'README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE'],
  exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' }, './schema/*.json': './schema/*.json', './standard/*.json': './standard/*.json', './package.json': './package.json' },
  dependencies: source.dependencies,
}, null, 2)}\n`);
for (const name of ['README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE']) cpSync(join(here, name), join(stage, name));
for (const name of ['schema', 'standard']) cpSync(join(here, name), join(stage, name), { recursive: true });

if (pack) {
  mkdirSync(pack, { recursive: true });
  const [result] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', pack], { cwd: stage, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
  process.stdout.write(`${join(pack, result.filename)}\n`);
}

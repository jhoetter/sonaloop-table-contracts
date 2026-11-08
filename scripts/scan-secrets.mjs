// Looks for secrets in everything this repository holds: the file names and the text of every file in every commit, and the commit messages. No dependencies; a finding
// names the place and the kind, never the value. Exit 0 clean, 1 findings.
import { spawnSync } from 'node:child_process';

const NAMES = [
  /^\.env(?:\..+)?$/i, /\.(?:pem|key|p12|pfx|jks|keystore|ppk|kdbx|tfstate)$/i, /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?$/i,
  /^\.(?:npmrc|netrc|pgpass|git-credentials|htpasswd)$/i, /^(?:credentials|secrets?)\.(?:json|ya?ml|env)$/i, /^service-account.*\.json$/i,
];
const SAFE_NAME = /^\.env\.(?:example|sample|template)$/i;
const PATTERNS = [
  ['private-key-block', /-----BEGIN (?!(?:RSA |EC )?PUBLIC KEY|CERTIFICATE|X509 CRL|TRUSTED CERTIFICATE)[A-Z0-9 ]{3,40}-----/],
  ['google-oauth-client-secret', /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ['api-key-sk', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['stripe-secret-key', /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['aws-access-key-id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['webhook-signing-secret', /\bwhsec_[A-Za-z0-9+/=]{16,}/],
  ['age-secret-key', /\bAGE-SECRET-KEY-1[A-Z0-9]{20,}/],
  ['sendgrid-key', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ['url-credentials', /[A-Za-z][A-Za-z0-9+.-]{1,20}:\/\/[^\s/:@'"`]{1,100}:[^\s/@'"`]{3,200}@/],
];

const run = (args, input) => {
  const result = spawnSync('git', args, { input, maxBuffer: 1 << 29 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.toString().trim().split('\n').slice(-2).join(' | ')}`);
  return result.stdout;
};

const findings = [];
const objects = run(['rev-list', '--objects', '--all']).toString().split('\n').filter(Boolean).map(line => {
  const space = line.indexOf(' ');
  return space < 0 ? { id: line, path: '' } : { id: line.slice(0, space), path: line.slice(space + 1) };
});
const types = run(['cat-file', '--batch-check=%(objecttype)'], objects.map(entry => entry.id).join('\n') + '\n').toString().split('\n');
const blobs = objects.filter((entry, index) => types[index] === 'blob' && entry.path);
for (const path of new Set(blobs.map(entry => entry.path))) {
  const name = path.split('/').at(-1);
  if (!SAFE_NAME.test(name) && NAMES.some(pattern => pattern.test(name))) findings.push({ place: path, kind: 'secret-file-name' });
}
const scanText = (place, text) => {
  text.split('\n').forEach((line, index) => {
    for (const [kind, pattern] of PATTERNS) if (pattern.test(line)) findings.push({ place: `${place}:${index + 1}`, kind });
  });
};
const unique = [...new Map(blobs.map(entry => [entry.id, entry])).values()];
const body = run(['cat-file', '--batch'], unique.map(entry => entry.id).join('\n') + '\n');
for (let offset = 0, index = 0; offset < body.length && index < unique.length; index++) {
  const end = body.indexOf(10, offset);
  const [, , size] = body.subarray(offset, end).toString().split(' ');
  const content = body.subarray(end + 1, end + 1 + Number(size));
  offset = end + 1 + Number(size) + 1;
  if (!content.subarray(0, 8000).includes(0)) scanText(unique[index].path, content.toString('utf8'));
}
run(['log', '--all', '--format=%H%x01%B%x00']).toString().split('\0').filter(entry => entry.trim()).forEach(entry => {
  const [sha, message] = entry.trim().split('\x01');
  scanText(`commit ${sha.slice(0, 10)}`, message ?? '');
});

if (findings.length) {
  console.error(`Secret scan: ${findings.length} finding(s). Places (no values):\n${findings.slice(0, 40).map(item => `  ${item.place}  ${item.kind}`).join('\n')}`);
  process.exit(1);
}
console.log(`Secret scan: clean (${unique.length} files in the whole history, all commit messages).`);

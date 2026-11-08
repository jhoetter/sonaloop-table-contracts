# Security policy

## Supported versions

The latest released version of `@sonaloop/table-contracts` (every 0.x release is a candidate for a fix; older ones are not patched).

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Use GitHub's private vulnerability reporting for this repository (Security tab, "Report a
vulnerability"). Say which version you looked at, what you did and what happened; a minimal contract or row that shows the problem helps most.

You will get an answer in the same place. A confirmed problem is fixed in a new version and described in `CHANGELOG.md` once the fix is released.

## What counts

This package validates data and computes hashes; it opens no network connection, reads no file and runs no code from a contract. Reports about these are welcome:

- a contract or a row that makes `checkContract`, `parseContract`, `validateRow`, `canonicalize` or `contractHash` run for an unreasonable time, use unreasonable
  memory or throw something other than the documented errors (the bounds in `src/limits.ts` are meant to stop this);
- two different contracts with the same hash, or one contract with two hashes;
- a row that `validateRow` accepts although the contract forbids it, where the difference lets a caller write data the contract was written to keep out;
- a `__proto__`-style key, a cyclic value or a huge value that gets past the checks.

Not in scope: weaknesses in your own application around the package, and the content of contracts you wrote.

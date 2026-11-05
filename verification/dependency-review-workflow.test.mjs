import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';

test('dependency review covers the tracked npm, Dart and Ruby manifests', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const review = parse(readFileSync(new URL('../.github/workflows/dependency-review.yaml', import.meta.url), 'utf8'));
  const manifests = new Set(['package.json', 'package-lock.json', 'pubspec.yaml', 'pubspec.lock', 'Gemfile', 'Gemfile.lock']);
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter((path) => manifests.has(basename(path)));
  assert.ok(tracked.length > 0);
  assert.deepEqual(review.on.pull_request.branches, ['release/1.0']);
  assert.deepEqual(tracked.filter((path) => !review.on.pull_request.paths.includes(path)), []);
});

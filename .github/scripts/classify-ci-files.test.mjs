import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyChangedPaths,
  isLightweightValidationPath,
  parseNullDelimitedPaths,
} from './classify-ci-files.mjs';

test('documentation-only changes skip the full release gate', () => {
  assert.deepEqual(
    classifyChangedPaths([
      'docs/engineering/architecture.md',
      'docs/api/data-and-targets.md',
      'README.md',
    ]),
    { fullValidation: false },
  );
});

test('repository documentation uses lightweight validation', () => {
  assert.equal(isLightweightValidationPath('README.md'), true);
  assert.equal(isLightweightValidationPath('CONTRIBUTING.md'), true);
  assert.equal(isLightweightValidationPath('docs/README.md'), true);
});

test('product, package, verification, and workflow changes require the full release gate', () => {
  for (const path of [
    'src/index.ts',
    'package.json',
    'package-lock.json',
    'verification/package/run.mjs',
    '.github/workflows/ci.yaml',
  ]) {
    assert.equal(classifyChangedPaths([path]).fullValidation, true, path);
  }
});

test('empty and mixed diffs fail closed to full validation', () => {
  assert.equal(classifyChangedPaths([]).fullValidation, true);
  assert.equal(
    classifyChangedPaths([
      'docs/engineering/verification.md',
      'src/index.ts',
    ]).fullValidation,
    true,
  );
});

test('invalid paths are rejected and NUL-delimited paths are preserved', () => {
  assert.throws(() => classifyChangedPaths(['../README.md']), /invalid repository path/);
  assert.deepEqual(parseNullDelimitedPaths('docs/a file.md\0docs/line\nbreak.md\0'), [
    'docs/a file.md',
    'docs/line\nbreak.md',
  ]);
});

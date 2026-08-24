import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyChangedPaths,
  isLightweightValidationPath,
  parseNullDelimitedPaths,
} from './classify-ci-files.mjs';

test('internal Markdown documentation only skips the full release gate', () => {
  assert.deepEqual(
    classifyChangedPaths([
      'docs/reference/patch-map-product-policy.md',
      'docs/tasks/2026/07-30/patch-map-package-promotion/BRIEF.md',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ]),
    { fullValidation: false },
  );
});

test('published documentation remains a full release-gate change', () => {
  assert.equal(isLightweightValidationPath('README.md'), false);
  assert.equal(isLightweightValidationPath('docs/patch-map/README.md'), false);
  assert.equal(
    classifyChangedPaths(['docs/patch-map/README.md']).fullValidation,
    true,
  );
});

test('product, package, verification, and workflow changes require the full release gate', () => {
  for (const path of [
    'src/patch-map/index.ts',
    'package.json',
    'package-lock.json',
    'scripts/verification/patch-map-package.mjs',
    '.github/workflows/ci.yaml',
  ]) {
    assert.equal(classifyChangedPaths([path]).fullValidation, true, path);
  }
});

test('empty and mixed diffs fail closed to full validation', () => {
  assert.equal(classifyChangedPaths([]).fullValidation, true);
  assert.equal(
    classifyChangedPaths([
      'docs/reference/patch-map-product-policy.md',
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

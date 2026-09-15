import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyChangedPaths,
  isLightweightValidationPath,
  parseNullDelimitedPaths,
  requiresFlutterValidation,
} from './classify-ci-files.mjs';

test('internal documentation-only changes skip the full release gate', () => {
  assert.deepEqual(
    classifyChangedPaths([
      'docs/engineering/architecture.md',
      'docs/engineering/verification.md',
      'CONTRIBUTING.md',
    ]),
    { fullValidation: false, flutterValidation: false },
  );
});

test('only non-packaged engineering documentation uses lightweight validation', () => {
  assert.equal(isLightweightValidationPath('CONTRIBUTING.md'), true);
  assert.equal(isLightweightValidationPath('docs/engineering/README.md'), true);
});

test('packaged public documentation and assets require the full release gate', () => {
  for (const path of [
    'README.md',
    'docs/README.md',
    'docs/api/data-and-targets.md',
    'docs/assets/fira-code-6.2-license.txt',
  ]) {
    assert.equal(classifyChangedPaths([path]).fullValidation, true, path);
  }
});

test('product, package, verification, and workflow changes require the full release gate', () => {
  for (const path of [
    'packages/javascript/src/index.ts',
    'package.json',
    'package-lock.json',
    'packages/javascript/verification/package/run.mjs',
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
      'packages/javascript/src/index.ts',
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

test('shared contract and npm source changes select both runtime gates', () => {
  for (const path of ['conformance/fixtures/gallery.json',
    'verification/conformance/compare.mjs', 'docs/api/presentation.md']) {
    assert.equal(requiresFlutterValidation(path), true);
    assert.deepEqual(classifyChangedPaths([path]), { fullValidation: true, flutterValidation: true });
  }
  assert.equal(requiresFlutterValidation('packages/javascript/src/index.ts'), true);
  assert.equal(requiresFlutterValidation('packages/javascript/tests/integration/multi-instance.test.ts'), true);
  assert.equal(requiresFlutterValidation('.github/workflows/ci.yaml'), true);
  for (const path of ['package.json', 'package-lock.json', '.nvmrc', 'verification/package.json',
    'verification/tsconfig.json', 'verification/eslint.config.js', 'docs/assets/fira-code-6.2-license.txt']) {
    assert.equal(requiresFlutterValidation(path), true, path);
  }
  assert.equal(classifyChangedPaths([]).flutterValidation, true);
});

test('Flutter-only changes select the native gate without npm release measurements', () => {
  for (const path of ['packages/flutter/lib/patch_map.dart', 'packages/flutter/pubspec.yaml',
    'packages/flutter/test/engine/controller_test.dart', 'verification/flutter/package.mjs']) {
    assert.deepEqual(classifyChangedPaths([path]), { fullValidation: false, flutterValidation: true });
  }
});

test('npm-only build and measurement changes stay in the npm gate', () => {
  for (const path of ['packages/javascript/vite.config.ts',
    'packages/javascript/performance/runners/benchmark.mjs',
    'packages/javascript/verification/package/run.mjs']) {
    assert.deepEqual(classifyChangedPaths([path]), { fullValidation: true, flutterValidation: false });
  }
});

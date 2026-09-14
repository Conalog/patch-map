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

test('native and shared contract paths select Flutter validation without dropping existing npm gates', () => {
  for (const path of ['packages/patch_map/lib/patch_map.dart', 'conformance/fixtures/gallery.json',
    'verification/conformance/compare.mjs', 'docs/api/presentation.md']) {
    assert.equal(requiresFlutterValidation(path), true);
    assert.deepEqual(classifyChangedPaths([path]), { fullValidation: true, flutterValidation: true });
  }
  assert.equal(requiresFlutterValidation('src/index.ts'), true);
  assert.equal(requiresFlutterValidation('tests/integration/multi-instance.test.ts'), true);
  assert.equal(requiresFlutterValidation('.github/workflows/ci.yaml'), true);
  for (const path of ['package.json', 'package-lock.json', 'tsconfig.json', 'docs/assets/fira-code-6.2-license.txt']) {
    assert.equal(requiresFlutterValidation(path), true, path);
  }
  assert.equal(classifyChangedPaths([]).flutterValidation, true);
});

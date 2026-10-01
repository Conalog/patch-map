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
    { fullValidation: false, flutterValidation: false, contractValidation: false },
  );
});

test('only non-packaged engineering documentation uses lightweight validation', () => {
  assert.equal(isLightweightValidationPath('CONTRIBUTING.md'), true);
  assert.equal(isLightweightValidationPath('docs/engineering/README.md'), true);
});

test('packaged public documentation and assets require the full release gate', () => {
  for (const path of [
    'README.md',
    'packages/javascript/docs/README.md',
    'packages/javascript/docs/api/data-and-targets.md',
    'packages/javascript/docs/assets/fira-code-6.2-license.txt',
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

test('shared contracts select both runtime gates and comparison', () => {
  for (const path of ['conformance/fixtures/gallery.json',
    'verification/conformance/compare.mjs']) {
    assert.equal(requiresFlutterValidation(path), true);
    assert.deepEqual(classifyChangedPaths([path]), { fullValidation: true, flutterValidation: true, contractValidation: true });
  }
  assert.deepEqual(classifyChangedPaths(['packages/javascript/src/index.ts']),
    { fullValidation: true, flutterValidation: false, contractValidation: true });
  assert.deepEqual(classifyChangedPaths(['packages/javascript/tests/integration/multi-instance.test.ts']),
    { fullValidation: true, flutterValidation: false, contractValidation: true });
  assert.equal(requiresFlutterValidation('.github/workflows/ci.yaml'), true);
  for (const path of ['package.json', 'package-lock.json', '.nvmrc', 'verification/package.json',
    'verification/tsconfig.json', 'verification/eslint.config.js', 'packages/javascript/docs/assets/fira-code-6.2-license.txt']) {
    assert.equal(requiresFlutterValidation(path), true, path);
  }
  assert.equal(classifyChangedPaths([]).flutterValidation, true);
});

test('JavaScript Markdown keeps npm and contract checks without Flutter SDK or native builds', () => {
  for (const path of ['packages/javascript/docs/README.md',
    'packages/javascript/docs/getting-started.md', 'packages/javascript/docs/api/presentation.md',
    'packages/javascript/docs/integration/host.md', 'packages/javascript/docs/assets/fonts.md',
    'packages/javascript/docs/compatibility.md']) {
    assert.deepEqual(classifyChangedPaths([path]),
      { fullValidation: true, contractValidation: true, flutterValidation: false }, path);
  }
});

test('mixed Markdown changes retain all gates required by native, shared or workflow inputs', () => {
  for (const path of ['packages/flutter/lib/conalog_patch_map.dart', 'packages/flutter/pubspec.yaml',
    'packages/flutter/example/ios/Runner/Info.plist', 'shared/assets/fonts/FiraCode-VF.ttf',
    'verification/assets/prepare.mjs', 'conformance/manifest.json', '.github/workflows/ci.yaml']) {
    for (const paths of [[path, 'packages/javascript/docs/api/text.md'], ['packages/javascript/docs/api/text.md', path]]) {
      assert.deepEqual(classifyChangedPaths(paths),
        { fullValidation: true, contractValidation: true, flutterValidation: true }, path);
    }
  }
  assert.deepEqual(classifyChangedPaths(['packages/javascript/docs/api/text.md', 'packages/javascript/src/index.ts']),
    { fullValidation: true, contractValidation: true, flutterValidation: false });
});

test('non-Markdown documentation assets retain both package checks', () => {
  for (const path of ['packages/javascript/docs/assets/fira-code-6.2-license.txt',
    'packages/javascript/docs/assets/unreviewed.svg', 'packages/javascript/docs/new-file']) {
    assert.deepEqual(classifyChangedPaths([path]),
      { fullValidation: true, contractValidation: true, flutterValidation: true }, path);
  }
});

test('Flutter-only changes select the native gate without npm release measurements', () => {
  for (const path of ['packages/flutter/lib/conalog_patch_map.dart', 'packages/flutter/pubspec.yaml',
    'packages/flutter/test/engine/controller_test.dart', 'verification/flutter/package.mjs']) {
    assert.deepEqual(classifyChangedPaths([path]), { fullValidation: false, flutterValidation: true, contractValidation: true });
  }
});

test('Shared assets and preparation select both package gates', () => {
  for (const path of ['shared/assets/icons/object.svg', 'shared/assets/fonts/FiraCode-VF.woff2',
    'shared/assets/fonts/FiraCode-VF.ttf', 'verification/assets/prepare.mjs']) {
    assert.deepEqual(classifyChangedPaths([path]),
      { fullValidation: true, flutterValidation: true, contractValidation: true }, path);
  }
});

test('npm-only build and measurement changes stay in the npm gate', () => {
  for (const path of ['packages/javascript/vite.config.ts',
    'packages/javascript/performance/runners/benchmark.mjs',
    'packages/javascript/verification/package/run.mjs']) {
    assert.deepEqual(classifyChangedPaths([path]), { fullValidation: true, flutterValidation: false, contractValidation: false });
  }
});

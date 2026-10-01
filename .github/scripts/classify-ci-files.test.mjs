import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  classifyChangedPaths,
  classifyGitDiff,
  isLightweightValidationPath,
  parseNullDelimitedPaths,
  requiresFlutterValidation,
} from './classify-ci-files.mjs';

const JS_PATH = 'packages/javascript';
const DART_PATH = 'packages/flutter';
const MANIFEST = '.release-please-manifest.json';
const JS_ONLY = { fullValidation: true, flutterValidation: false, contractValidation: true };
const DART_ONLY = { fullValidation: false, flutterValidation: true, contractValidation: true };
const BOTH = { fullValidation: true, flutterValidation: true, contractValidation: true };

function metadataFixture() {
  const pkg = { name: '@conalog/patch-map', version: '1.0.0-alpha.9', scripts: { build: 'vite build' } };
  const before = {
    [MANIFEST]: { [JS_PATH]: pkg.version },
    [`${JS_PATH}/package.json`]: pkg,
    'package-lock.json': {
      name: 'patch-map-workspace', lockfileVersion: 3,
      packages: {
        '': { name: 'patch-map-workspace' },
        [JS_PATH]: { name: pkg.name, version: pkg.version },
        'node_modules/yaml': { version: '2.9.1', integrity: 'original-integrity' },
        verification: { name: '@patch-map/verification', devDependencies: { yaml: '2.9.1' } },
      },
    },
  };
  const after = structuredClone(before);
  const readFile = (path, side) => JSON.stringify((side === 'base' ? before : after)[path]);
  return { before, after, readFile };
}

function updateJsVersion(after) {
  after[MANIFEST][JS_PATH] = '1.0.0-alpha.10';
  after[`${JS_PATH}/package.json`].version = '1.0.0-alpha.10';
  after['package-lock.json'].packages[JS_PATH].version = '1.0.0-alpha.10';
}

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

test('JavaScript release metadata selects npm without Flutter or native builds', () => {
  const { after, readFile } = metadataFixture();
  updateJsVersion(after);
  const paths = [MANIFEST, 'package-lock.json', `${JS_PATH}/package.json`, `${JS_PATH}/CHANGELOG.md`];
  assert.deepEqual(classifyChangedPaths(paths, { readFile }), JS_ONLY);
  for (const path of paths.slice(0, 3)) {
    assert.deepEqual(classifyChangedPaths([path], { readFile }), JS_ONLY, path);
  }
});

test('first and later Dart release metadata select Flutter without npm builds or measurements', () => {
  for (const first of [true, false]) {
    const { before, after, readFile } = metadataFixture();
    if (!first) before[MANIFEST][DART_PATH] = '1.0.0-alpha.1';
    after[MANIFEST][DART_PATH] = first ? '1.0.0-alpha.1' : '1.0.0-alpha.2';
    assert.deepEqual(classifyChangedPaths([MANIFEST, `${DART_PATH}/pubspec.yaml`, `${DART_PATH}/CHANGELOG.md`], { readFile }), DART_ONLY);
  }
});

test('release metadata preserves gates from other affected owners', () => {
  const { after, readFile } = metadataFixture();
  updateJsVersion(after);
  const jsPaths = [MANIFEST, 'package-lock.json', `${JS_PATH}/package.json`];
  for (const path of ['shared/assets/icons/object.svg', 'verification/assets/prepare.mjs',
    `${DART_PATH}/lib/conalog_patch_map.dart`, '.github/workflows/ci.yaml']) {
    assert.deepEqual(classifyChangedPaths([...jsPaths, path], { readFile }), BOTH, path);
  }
  after[MANIFEST][DART_PATH] = '1.0.0-alpha.1';
  assert.deepEqual(classifyChangedPaths([MANIFEST], { readFile }), BOTH);
  const dart = metadataFixture();
  dart.after[MANIFEST][DART_PATH] = '1.0.0-alpha.1';
  assert.deepEqual(classifyChangedPaths([MANIFEST, `${JS_PATH}/src/index.ts`], { readFile: dart.readFile }), BOTH);
});

test('npm metadata dependency, tooling and identity changes retain Flutter validation', () => {
  for (const mutate of [
    (after) => { after[`${JS_PATH}/package.json`].scripts.build = 'new build'; },
    (after) => { after[`${JS_PATH}/package.json`].dependencies = { yaml: '2.9.2' }; },
    (after) => { after[`${JS_PATH}/package.json`].name = 'different-package'; },
  ]) {
    const { after, readFile } = metadataFixture();
    updateJsVersion(after);
    mutate(after);
    assert.deepEqual(classifyChangedPaths([`${JS_PATH}/package.json`], { readFile }), BOTH);
  }
  for (const mutate of [
    (lock) => { lock.packages['node_modules/yaml'].version = '2.9.2'; },
    (lock) => { lock.packages['node_modules/yaml'].integrity = 'different-integrity'; },
    (lock) => { lock.packages.verification.devDependencies.yaml = '2.9.2'; },
    (lock) => { delete lock.packages.verification; },
    (lock) => { lock.packages[JS_PATH].devDependencies = { vite: 'new-version' }; },
    (lock) => { lock.lockfileVersion = 2; },
  ]) {
    const { after, readFile } = metadataFixture();
    updateJsVersion(after);
    mutate(after['package-lock.json']);
    assert.deepEqual(classifyChangedPaths(['package-lock.json'], { readFile }), BOTH);
  }
});

test('unknown, removed or invalid manifest owners and unavailable metadata keep broad validation', () => {
  for (const mutate of [
    (after) => { after[MANIFEST]['packages/new-runtime'] = '1.0.0'; },
    (after) => { delete after[MANIFEST][JS_PATH]; },
    (after) => { after[MANIFEST][DART_PATH] = '1.0.0-alpha.1+-alpha.1'; },
    (after) => { after[MANIFEST] = {}; },
    (after) => { after[MANIFEST] = []; },
  ]) {
    const { after, readFile } = metadataFixture();
    mutate(after);
    assert.deepEqual(classifyChangedPaths([MANIFEST], { readFile }), BOTH);
  }
  const removed = metadataFixture();
  removed.before[MANIFEST][DART_PATH] = '1.0.0-alpha.1';
  assert.deepEqual(classifyChangedPaths([MANIFEST], { readFile: removed.readFile }), BOTH);
  for (const readFile of [() => '{', () => { throw new Error('missing blob'); }]) {
    for (const path of [MANIFEST, 'package-lock.json', `${JS_PATH}/package.json`]) {
      assert.deepEqual(classifyChangedPaths([path], { readFile }), BOTH, path);
    }
  }
});

test('Git comparison reads immutable release metadata for each package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'patch-map-ci-routing-'));
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null',
    '-c', 'user.name=CI routing fixture', '-c', 'user.email=fixture@example.invalid',
    ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  const write = async (files) => {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
    }
    git('add', '.');
    git('commit', '--quiet', '-m', 'test: write release metadata fixture');
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '--quiet');
    const { before, after } = metadataFixture();
    const base = await write(before);
    updateJsVersion(after);
    const js = await write({ ...after, [`${JS_PATH}/CHANGELOG.md`]: '# alpha.10\n' });
    assert.deepEqual(classifyGitDiff(base, js, { root }), JS_ONLY);
    const dartManifest = { ...after[MANIFEST], [DART_PATH]: '1.0.0-alpha.1' };
    const dart = await write({ [MANIFEST]: dartManifest, [`${DART_PATH}/pubspec.yaml`]: 'version: 1.0.0-alpha.1\n', [`${DART_PATH}/CHANGELOG.md`]: '# alpha.1\n' });
    assert.deepEqual(classifyGitDiff(js, dart, { root }), DART_ONLY);
    assert.deepEqual(classifyGitDiff(base, dart, { root }), BOTH);
    assert.throws(() => classifyGitDiff('HEAD', dart, { root }), /full lowercase Git SHA/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the CI aggregate accepts intentional package skips and rejects missing required gates', () => {
  const workflow = readFileSync(new URL('../workflows/ci.yaml', import.meta.url), 'utf8');
  const aggregate = workflow.slice(workflow.indexOf('      - name: Require all gates'));
  const block = aggregate.match(/ {8}run: \|\n((?: {10}[^\n]*\n?)+)/u);
  assert.ok(block, 'missing CI aggregate shell gate');
  const script = block[1].replace(/^ {10}/gmu, '');
  const js = {
    CLASSIFIER_RESULT: 'success', FULL_VALIDATION: 'true', GATES_RESULT: 'success',
    FLUTTER_VALIDATION: 'false', FLUTTER_RESULT: 'skipped', NATIVE_RESULT: 'skipped',
    CONTRACT_VALIDATION: 'true', CONTRACT_RESULT: 'success',
  };
  const dart = { ...js, FULL_VALIDATION: 'false', GATES_RESULT: 'skipped',
    FLUTTER_VALIDATION: 'true', FLUTTER_RESULT: 'success', NATIVE_RESULT: 'success' };
  const both = { ...dart, FULL_VALIDATION: 'true', GATES_RESULT: 'success' };
  const docs = { ...js, FULL_VALIDATION: 'false', GATES_RESULT: 'skipped',
    CONTRACT_VALIDATION: 'false', CONTRACT_RESULT: 'skipped' };
  const run = (values) => execFileSync('bash', ['--noprofile', '--norc', '-e', '-c', script],
    { env: { ...process.env, ...values }, stdio: 'pipe' });
  for (const values of [js, dart, both, docs]) assert.doesNotThrow(() => run(values));
  for (const values of [
    { ...js, GATES_RESULT: 'skipped' }, { ...js, GATES_RESULT: 'failure' },
    { ...dart, GATES_RESULT: 'success' }, { ...dart, FLUTTER_RESULT: 'skipped' },
    { ...dart, NATIVE_RESULT: 'failure' }, { ...dart, CONTRACT_RESULT: 'skipped' },
    { ...js, CLASSIFIER_RESULT: 'failure' }, { ...js, FULL_VALIDATION: '' },
  ]) assert.throws(() => run(values));
});

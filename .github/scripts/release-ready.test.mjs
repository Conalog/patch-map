import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pubspecField } from './release-metadata.mjs';
import { releaseReadiness } from './release-ready.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runner = resolve(root, '.github/scripts/release-ready.mjs');

async function withInputs(check) {
  const directory = await mkdtemp(resolve(tmpdir(), 'patch-map-workspace-'));
  const paths = ['package.json', 'packages/javascript/package.json', 'verification/package.json',
    'package-lock.json', '.release-please-manifest.json', 'release-please-config.json', 'conformance/manifest.json'];
  try {
    const inputs = Object.fromEntries(await Promise.all(paths.map(async (path) => [
      path, JSON.parse(await readFile(resolve(root, path), 'utf8')),
    ])));
    const write = async (path, value) => {
      await mkdir(dirname(resolve(directory, path)), { recursive: true });
      await writeFile(resolve(directory, path), JSON.stringify(value));
    };
    for (const [path, value] of Object.entries(inputs)) await write(path, value);
    await mkdir(resolve(directory, 'packages/flutter'), { recursive: true });
    const pubspec = await readFile(resolve(root, 'packages/flutter/pubspec.yaml'), 'utf8');
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), pubspec);
    const run = (scope) => execFileSync(process.execPath, [runner, ...(scope ? ['--scope', scope] : [])], { cwd: directory, encoding: 'utf8', stdio: 'pipe' });
    await check({ directory, inputs, write, pubspec, run });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('release readiness accepts the private tooling workspace and rejects publication or stale lock identity', async () => {
  await withInputs(async ({ directory, inputs, write, pubspec, run }) => {
    assert.equal(run(), 'true');
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), pubspec.replace(/version: .+/u, 'version: 0.2.0'));
    assert.throws(run, /Dart package and release versions/u);
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), pubspec);
    const released = { ...inputs['.release-please-manifest.json'], 'packages/flutter': pubspecField(pubspec, 'version') };
    await write('.release-please-manifest.json', released);
    assert.equal(run(), 'true');
    await write('.release-please-manifest.json', inputs['.release-please-manifest.json']);
    await write('verification/package.json', { ...inputs['verification/package.json'], private: false });
    assert.throws(run, /unexpected workspace/u);
    await write('verification/package.json', inputs['verification/package.json']);
    const stale = structuredClone(inputs['package-lock.json']);
    delete stale.packages.verification;
    await write('package-lock.json', stale);
    assert.throws(run, /must match/u);
  });
});

test('JS readiness ignores Dart package, version and foundation metadata', async () => {
  await withInputs(async ({ directory, inputs, write, run }) => {
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), 'malformed pubspec');
    await writeFile(resolve(directory, 'conformance/manifest.json'), '{malformed');
    await write('.release-please-manifest.json', { ...inputs['.release-please-manifest.json'], 'packages/flutter': 'invalid' });
    assert.equal(run('js'), 'true');
    assert.equal(releaseReadiness('js', directory), true);
    assert.throws(() => run('dart'), /pubspec/u);
    await write('packages/javascript/package.json', { ...inputs['packages/javascript/package.json'], name: 'wrong' });
    assert.throws(() => run('js'), /unexpected workspace/u);
  });
});

test('Dart readiness ignores malformed JS package and invalid JS release/lock versions', async () => {
  await withInputs(async ({ directory, inputs, write, run }) => {
    await writeFile(resolve(directory, 'packages/javascript/package.json'), '{malformed');
    const lock = structuredClone(inputs['package-lock.json']);
    lock.packages['packages/javascript'] = { name: 'wrong', version: 'invalid' };
    await write('package-lock.json', lock);
    await write('.release-please-manifest.json', { ...inputs['.release-please-manifest.json'], 'packages/javascript': 'invalid' });
    assert.equal(run('dart'), 'true');
    assert.equal(releaseReadiness('dart', directory), true);
    assert.throws(() => run('js'), /SyntaxError/u);
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), 'name: wrong\nversion: 0.2.0\npublish_to: none\n');
    assert.throws(() => run('dart'), /Dart package and release versions/u);
  });
});

test('repository readiness ignores both runtime manifests and release versions', async () => {
  await withInputs(async ({ directory, write, run }) => {
    for (const path of ['packages/javascript/package.json', 'packages/flutter/pubspec.yaml',
      'conformance/manifest.json', '.release-please-manifest.json']) {
      await writeFile(resolve(directory, path), '{malformed');
    }
    assert.equal(run('repository'), 'true');
    assert.equal(releaseReadiness('repository', directory), true);
    await write('verification/package.json', { name: '@patch-map/verification', private: false });
    assert.throws(() => run('repository'), /unexpected workspace/u);
  });
});

test('all scopes retain repository identity, scripts and independent release configuration checks', async () => {
  await withInputs(async ({ inputs, write, run }) => {
    for (const scope of ['repository', 'js', 'dart', 'all']) {
      assert.equal(run(scope), 'true');
      const lock = structuredClone(inputs['package-lock.json']);
      delete lock.packages.verification;
      await write('package-lock.json', lock);
      assert.throws(() => run(scope), /must match/u);
      await write('package-lock.json', inputs['package-lock.json']);
      const workspace = structuredClone(inputs['package.json']);
      delete workspace.scripts['flutter:test'];
      await write('package.json', workspace);
      assert.throws(() => run(scope), /missing release scripts/u);
      await write('package.json', inputs['package.json']);
      await write('release-please-config.json', { ...inputs['release-please-config.json'], 'separate-pull-requests': false });
      assert.throws(() => run(scope), /independent npm\/Dart release ownership/u);
      await write('release-please-config.json', inputs['release-please-config.json']);
    }
  });
});

test('readiness rejects unsupported scopes and CLI arguments', async () => {
  assert.throws(() => releaseReadiness('npm'), /scope must be/u);
  for (const args of [['--scope'], ['js'], ['--scope', 'npm'], ['--scope', 'js', 'extra']]) {
    assert.throws(() => execFileSync(process.execPath, [runner, ...args], { cwd: root, stdio: 'pipe' }), /scope must be|usage:/u);
  }
});

test('selected runtime validates release versions and Dart foundation publication policy', async () => {
  await withInputs(async ({ directory, inputs, write, pubspec, run }) => {
    const invalid = '1.0.0+build';
    const lock = structuredClone(inputs['package-lock.json']);
    lock.packages['packages/javascript'].version = invalid;
    await write('package-lock.json', lock);
    await write('packages/javascript/package.json', { ...inputs['packages/javascript/package.json'], version: invalid });
    await write('.release-please-manifest.json', { ...inputs['.release-please-manifest.json'], 'packages/javascript': invalid });
    assert.throws(() => run('js'), /unsupported release version/u);
    assert.equal(run('dart'), 'true');
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), pubspec.replace(/version: .+/u, `version: ${invalid}`));
    assert.throws(() => run('dart'), /unsupported release version/u);
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), pubspec.replace(/^publish_to:.*\n/mu, ''));
    await write('conformance/manifest.json', { ...inputs['conformance/manifest.json'], implementationStatus: 'foundation' });
    assert.throws(() => run('dart'), /foundation must remain private/u);
    await write('conformance/manifest.json', { ...inputs['conformance/manifest.json'], implementationStatus: 'qualified' });
    assert.equal(run('dart'), 'true');
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), `${pubspec.replace(/^publish_to:.*\n/mu, '')}\npublish_to: none\n`);
    assert.throws(() => run('dart'), /qualified Dart packages use the public registry/u);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runner = resolve(root, '.github/scripts/release-ready.mjs');

test('release readiness accepts the private tooling workspace and rejects publication or stale lock identity', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'patch-map-workspace-'));
  const paths = ['package.json', 'packages/javascript/package.json', 'verification/package.json',
    'package-lock.json', '.release-please-manifest.json', 'release-please-config.json'];
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
    const run = () => execFileSync(process.execPath, [runner], { cwd: directory, encoding: 'utf8', stdio: 'pipe' });
    assert.equal(run(), 'true');
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), pubspec.replace(/version: .+/u, 'version: 0.2.0'));
    assert.throws(run, /Dart package and release versions/u);
    await writeFile(resolve(directory, 'packages/flutter/pubspec.yaml'), pubspec);
    const released = { ...inputs['.release-please-manifest.json'], 'packages/flutter': '1.0.0-alpha.1' };
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
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

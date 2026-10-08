import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const jsPath = 'packages/javascript';
const dartPath = 'packages/flutter';
const inputs = ['package.json', 'package-lock.json', '.release-please-manifest.json',
  'release-please-config.json', 'conformance/manifest.json', 'verification/package.json',
  'verification/assets/catalog.mjs', `${jsPath}/package.json`, `${jsPath}/CHANGELOG.md`,
  `${dartPath}/pubspec.yaml`, `${dartPath}/CHANGELOG.md`];

// Exercise the same tooling tests on the files modified by independent release
// PRs. The sandbox is input data, not a Git checkout, and never changes sources.
for (const [name, jsVersion, dartVersion] of [
  ['unreleased foundation', '1.0.0-alpha.9', undefined],
  ['JavaScript release PR', '1.0.0-alpha.10', undefined],
  ['first Dart release PR', '1.0.0-alpha.9', '1.0.0-alpha.1'],
  ['later Dart release PR', '1.0.0-alpha.9', '1.0.0-alpha.2'],
  ['both packages and beta transition', '1.0.0-beta.1', '1.0.0-beta.1'],
  ['stable package versions', '1.0.0', '1.0.0'],
]) {
  test(`release tooling accepts ${name} inputs`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), 'patch-map-release-inputs-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    for (const path of inputs) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      cpSync(join(root, path), join(directory, path));
    }
    cpSync(join(root, '.github/scripts'), join(directory, '.github/scripts'), { recursive: true });
    for (const path of ['node_modules', 'verification/node_modules']) {
      if (existsSync(join(root, path))) symlinkSync(join(root, path), join(directory, path), 'dir');
    }
    const json = (path) => JSON.parse(readFileSync(join(directory, path), 'utf8'));
    const save = (path, value) => writeFileSync(join(directory, path), `${JSON.stringify(value, null, 2)}\n`);
    const pkg = json(`${jsPath}/package.json`);
    pkg.version = jsVersion;
    save(`${jsPath}/package.json`, pkg);
    const lock = json('package-lock.json');
    lock.packages[jsPath].version = jsVersion;
    save('package-lock.json', lock);
    save('.release-please-manifest.json', {
      [jsPath]: jsVersion, ...(dartVersion ? { [dartPath]: dartVersion } : {}),
    });
    const pubspec = readFileSync(join(directory, `${dartPath}/pubspec.yaml`), 'utf8');
    writeFileSync(join(directory, `${dartPath}/pubspec.yaml`), pubspec.replace(/^version: .+$/mu, `version: ${dartVersion ?? '1.0.0-alpha.1'}`));
    for (const [path, version] of [[jsPath, jsVersion], [dartPath, dartVersion]]) {
      writeFileSync(join(directory, `${path}/CHANGELOG.md`), `# Changelog\n\n## ${version ?? 'Unreleased'}\n\n- Release input witness.\n`);
    }
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '.github/scripts/release-plan.test.mjs',
      '.github/scripts/release-ready.test.mjs', '.github/scripts/release-metadata.test.mjs'], {
      cwd: directory, env, encoding: 'utf8', timeout: 30_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${name}:\n${result.stdout}\n${result.stderr}`);
    assert.ok(Number(result.stdout.match(/^# tests (\d+)$/mu)?.[1]) >= 24, 'the release suites must execute, not be silently skipped');
  });
}

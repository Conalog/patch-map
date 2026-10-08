import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';
import { assertFvmPin, identifyToolchain, readToolchains, syncFvmPin } from './toolchains.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const recorded = readToolchains(root);
const machine = (sdk) => ({ frameworkVersion: sdk.flutter, dartSdkVersion: sdk.dart, frameworkRevision: sdk.frameworkRevision });

test('FVM follows the recorded CI role and preserves unrelated configuration', (t) => {
  const sandbox = mkdtempSync(join(tmpdir(), 'patch-map-toolchains-'));
  t.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const directory = join(sandbox, 'packages/flutter');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'toolchains.json'), JSON.stringify(recorded));
  writeFileSync(join(directory, '.fvmrc'), JSON.stringify({ flutter: '3.0.0', flavors: { demo: 'stable' } }));
  assert.throws(() => assertFvmPin(sandbox, readToolchains(sandbox)), /stale/u);
  syncFvmPin(sandbox, recorded);
  assertFvmPin(sandbox, readToolchains(sandbox));
  assert.deepEqual(JSON.parse(readFileSync(join(directory, '.fvmrc'), 'utf8')), { flutter: recorded.ci.flutter, flavors: { demo: 'stable' } });
  writeFileSync(join(directory, 'toolchains.json'), JSON.stringify({ ...recorded, service: { ...recorded.service, frameworkRevision: 'unknown' } }));
  assert.throws(() => readToolchains(sandbox), /Invalid service SDK/u);
});

test('installed SDK identity requires the role, bundled Dart and revision', () => {
  for (const role of ['ci', 'service']) assert.equal(identifyToolchain(machine(recorded[role]), recorded, role), role);
  assert.throws(() => identifyToolchain(machine(recorded.ci), recorded, 'service'), /expected service/u);
  assert.throws(() => identifyToolchain({ ...machine(recorded.ci), dartSdkVersion: '3.0.0' }, recorded), /Unqualified SDK/u);
  assert.throws(() => identifyToolchain({ ...machine(recorded.ci), frameworkRevision: '0'.repeat(40) }, recorded), /Unqualified SDK/u);
  assert.throws(() => identifyToolchain(machine(recorded.ci), recorded, 'invalid'), /expected invalid/u);
  // Two roles may intentionally converge after an upgrade; the requested role still owns the run.
  assert.equal(identifyToolchain(machine(recorded.ci), { ci: recorded.ci, service: recorded.ci }, 'service'), 'service');
});

test('workflow outputs are derived from the selected role', () => {
  for (const role of ['ci', 'service']) {
    const output = execFileSync(process.execPath, ['verification/flutter/toolchains.mjs', role], { cwd: root, encoding: 'utf8' });
    const values = Object.fromEntries(output.trim().split('\n').map((line) => line.split('=')));
    assert.deepEqual(values, { 'flutter-version': recorded[role].flutter, 'dart-version': recorded[role].dart,
      'flutter-channel': recorded[role].channel, 'framework-revision': recorded[role].frameworkRevision });
  }
});

const workflow = (name) => parse(readFileSync(join(root, '.github/workflows', name), 'utf8'));
const output = (key) => '${{ steps.sdk.outputs.' + key + ' }}';
function assertSdkWiring(document) {
  let installations = 0;
  for (const [name, job] of Object.entries(document.jobs)) {
    const setup = job.steps.findIndex((step) => step.uses?.startsWith('subosito/flutter-action@'));
    if (setup < 0) continue;
    installations += 1;
    const selector = job.steps.findIndex((step) => step.id === 'sdk');
    const node = job.steps.findIndex((step) => step.uses?.startsWith('actions/setup-node@'));
    assert.ok(node >= 0 && node < selector && selector < setup, `${name}: select SDK after Node and before Flutter`);
    assert.match(job.steps[selector].run, /node verification\/flutter\/toolchains\.mjs .* >> "\$GITHUB_OUTPUT"/u);
    assert.equal(job.steps[setup].with['flutter-version'], output('flutter-version'));
    assert.equal(job.steps[setup].with.channel, output('flutter-channel'));
    const dart = job.steps.findIndex((step) => step.uses?.startsWith('dart-lang/setup-dart@'));
    if (dart >= 0) assert.equal(job.steps[dart].with.sdk, output('dart-version'));
    const check = job.steps.findIndex((step) => step.run === 'node verification/flutter/toolchains.mjs check ci');
    if (name === 'flutter') {
      assert.deepEqual(job.strategy.matrix.toolchain, ['ci', 'service']);
      assert.equal(job.steps[selector].env.TOOLCHAIN_ROLE, '${{ matrix.toolchain }}');
      assert.match(job.steps[selector].run, /"\$TOOLCHAIN_ROLE"/u);
      const run = job.steps.find((step) => step.run === 'npm run flutter:verify');
      assert.equal(run.env.FLUTTER_TOOLCHAIN_ROLE, '${{ matrix.toolchain }}');
    } else {
      assert.match(job.steps[selector].run, /toolchains\.mjs ci /u);
      assert.ok(check > Math.max(setup, dart), `${name}: verify installed SDK after setup`);
    }
  }
  return installations;
}

test('CI and publishing wire each Flutter installation to the SDK authority', () => {
  const ci = workflow('ci.yaml');
  assert.equal(assertSdkWiring(ci), 2);
  assert.equal(assertSdkWiring(workflow('publish-dart.yaml')), 2);
  assert.ok(ci.jobs.contracts.steps.every((step) => !step.uses?.startsWith('subosito/') && !step.run?.includes('flutter pub get')));
});

test('CI caches SDK and pub downloads without bypassing SDK or dependency verification', () => {
  const ci = workflow('ci.yaml');
  for (const name of ['flutter', 'native-example']) {
    const job = ci.jobs[name];
    const setup = job.steps.find((step) => step.uses?.startsWith('subosito/flutter-action@'));
    assert.equal(setup.with.cache, true, `${name}: enable SDK and pub caches`);
    // The pinned action defaults include OS, SDK version/revision and architecture;
    // its pub key also includes lockfile hashes. Custom keys must not weaken them.
    assert.equal(setup.uses, 'subosito/flutter-action@fd55f4c5af5b953cc57a2be44cb082c8f6635e8e');
    for (const key of ['cache-key', 'pub-cache-key']) assert.equal(setup.with[key], undefined, `${name}: retain ${key} default`);
    const sdkCheck = job.steps.find((step) => step.run === (name === 'flutter'
      ? 'npm run flutter:verify' : 'node verification/flutter/toolchains.mjs check ci'));
    const dependencies = job.steps.find((step) => step.run?.includes('flutter pub get'));
    for (const step of [setup, sdkCheck, dependencies]) {
      assert.ok(step, `${name}: setup, SDK check and resolution are required`);
      assert.equal(step.if, undefined, `${name}: cache hits must not bypass validation or resolution`);
    }
    if (name === 'native-example') assert.equal(dependencies.run, 'flutter pub get --enforce-lockfile');
  }
});

test('wiring validation detects drift and omitted runtime role checks', () => {
  const hardcoded = workflow('publish-dart.yaml');
  hardcoded.jobs.publish.steps.find((step) => step.uses?.startsWith('subosito/')).with['flutter-version'] = '3.0.0';
  assert.throws(() => assertSdkWiring(hardcoded));
  const wrongRole = workflow('ci.yaml');
  delete wrongRole.jobs.flutter.steps.find((step) => step.run === 'npm run flutter:verify').env;
  assert.throws(() => assertSdkWiring(wrongRole));
  const unchecked = workflow('publish-dart.yaml');
  unchecked.jobs.publish.steps = unchecked.jobs.publish.steps.filter((step) => step.name !== 'Verify installed SDK');
  assert.throws(() => assertSdkWiring(unchecked));
});

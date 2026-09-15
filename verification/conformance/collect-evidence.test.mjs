import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { snapshotSources, analyzerSelectsProbe, parseDartReport, parseVitestReport, validateNativeIdentity } from './collect-evidence.mjs';

const root = '/workspace';
const vitest = () => ({ success: true, numTotalTests: 2, numPassedTests: 1, numFailedTests: 0,
  numFailedTestSuites: 0, numPendingTests: 1, testResults: [{ name: `${root}/tests/owner.test.ts`, status: 'passed',
    assertionResults: [{ title: 'works', fullName: 'owner works', status: 'passed' }, { title: 'opt-in', fullName: 'owner opt-in', status: 'pending' }] }] });
const dart = () => [
  { type: 'group', group: { id: 1, name: 'owner' } },
  { type: 'testStart', test: { id: 2, name: 'owner works', url: 'file:///workspace/test/owner.dart', groupIDs: [1] } },
  { type: 'testDone', testID: 2, result: 'success', skipped: false, hidden: false },
  { type: 'testStart', test: { id: 3, name: 'owner opt-in', url: 'file:///workspace/test/owner.dart', groupIDs: [1] } },
  { type: 'testDone', testID: 3, result: 'success', skipped: true, hidden: false },
  { type: 'done', success: true },
];
const lines = (events) => events.map((event) => JSON.stringify(event)).join('\n');

test('unit parsers preserve exact files/titles and never promote an opt-in skip', () => {
  const npm = parseVitestReport(root, vitest());
  assert.deepEqual(npm[0], { file: 'tests/owner.test.ts', test: 'works', fullName: 'owner works' });
  assert.equal(npm[1].skipped, true);
  const parsed = parseDartReport(root, lines(dart()));
  assert.deepEqual(parsed[0], { file: 'test/owner.dart', test: 'works', fullName: 'owner works' });
  assert.equal(parsed[1].skipped, true);
  const widgets = dart(); widgets[1].test.root_url = widgets[1].test.url;
  widgets[1].test.url = 'package:flutter_test/src/widget_tester.dart';
  assert.equal(parseDartReport(root, lines(widgets))[0].file, 'test/owner.dart');
});

test('machine errors, incomplete tails, unfinished tests and count drift fail closed', () => {
  const failed = vitest(); failed.numFailedTests = 1;
  assert.throws(() => parseVitestReport(root, failed), /failed/u);
  const count = vitest(); count.numPassedTests = 2;
  assert.throws(() => parseVitestReport(root, count), /count/u);
  const incomplete = dart().slice(0, -1);
  assert.throws(() => parseDartReport(root, lines(incomplete)), /incomplete/u);
  const error = dart(); error.splice(2, 0, { type: 'error', error: 'assertion failed' });
  assert.throws(() => parseDartReport(root, lines(error)), /machine error/u);
  const unfinished = dart(); unfinished.splice(2, 1);
  assert.throws(() => parseDartReport(root, lines(unfinished)), /unfinished/u);
});

test('analyzer selection uses exact argv path containment rather than a shared substring', () => {
  const one = { command: ['flutter', 'analyze', '--no-pub', 'test/conformance/one.dart'], workingDirectory: 'packages/flutter' };
  assert.equal(analyzerSelectsProbe(root, one, 'packages/flutter/test/conformance/one.dart'), true);
  assert.equal(analyzerSelectsProbe(root, one, 'packages/flutter/test/conformance/two.dart'), false);
  const all = { ...one, command: ['flutter', 'analyze', '--no-pub', 'lib', 'test'] };
  assert.equal(analyzerSelectsProbe(root, all, 'packages/flutter/test/conformance/two.dart'), true);
  assert.equal(analyzerSelectsProbe(root, all, 'packages/flutter/test-other/two.dart'), false);
});

test('native evidence binds the report path, build revision, source receipt and artifact SHA', () => {
  const input = { artifactReceipt: { path: '.artifacts/app-artifact.json' }, artifact: { path: '.artifacts/app.apk', sha256: 'a'.repeat(64) },
    report: { path: '.artifacts/report.json' }, sourceSnapshot: { path: '.artifacts/source.json' }, revision: 'build-7' };
  const receipt = { path: input.artifact.path, sha256: input.artifact.sha256, report: 'report.json', sourceManifest: 'source.json' };
  const log = 'All tests passed.\nPATCHMAP_NATIVE_CONTRACT /workspace/.artifacts/report.json\n';
  validateNativeIdentity(root, input, { revision: 'build-7' }, receipt, log);
  assert.throws(() => validateNativeIdentity(root, input, { revision: 'old' }, receipt, log), /revision/u);
  assert.throws(() => validateNativeIdentity(root, input, { revision: 'build-7' }, receipt, log.replace('report.json', 'other.json')), /execution log/u);
  assert.throws(() => validateNativeIdentity(root, input, { revision: 'build-7' }, { ...receipt, sha256: 'b'.repeat(64) }, log), /receipt mismatch/u);
});


test('evidence identity includes the shared workspace manifest and compiler/lint configuration', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'patch-map-source-config-'));
  try {
    await mkdir(resolve(directory, 'verification'));
    for (const name of ['package.json', 'tsconfig.json', 'eslint.config.js']) {
      await writeFile(resolve(directory, 'verification', name), '{}');
    }
    const before = await snapshotSources(directory);
    assert.deepEqual(Object.keys(before.files).sort(), [
      'verification/eslint.config.js', 'verification/package.json', 'verification/tsconfig.json',
    ]);
    await writeFile(resolve(directory, 'verification/tsconfig.json'), '{"strict":true}');
    const after = await snapshotSources(directory);
    assert.notEqual(after.fingerprint, before.fingerprint);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const source = readFileSync(new URL('../workflows/ci.yaml', import.meta.url), 'utf8');
const native = source.split('\n  flutter:\n')[1].split('\n  contracts:\n')[0];
const contracts = source.split('\n  contracts:\n')[1].split('\n  validation:\n')[0];
const aggregate = source.split('\n  validation:\n')[1];
const script = aggregate.split('        run: |\n')[1].split('\n')
  .map((line) => line.replace(/^ {10}/u, '')).join('\n');

test('public comparison has an independent job and native packaging retains its producer', () => {
  assert.match(contracts, /needs\.classify\.outputs\.contract_validation/u);
  assert.match(contracts, /node verification\/conformance\/run-public\.mjs/u);
  assert.doesNotMatch(native, /run-public\.mjs/u);
  assert.ok(native.indexOf('node verification/flutter/package.mjs') < native.indexOf('node verification/flutter/installed-consumer.mjs'));
  assert.match(aggregate, /needs: \[classify, gate, flutter, contracts\]/u);
});

test('aggregate rejects failures, cancellations and unexpected skips in each selected gate', () => {
  const baseline = {
    CLASSIFIER_RESULT: 'success', FULL_VALIDATION: 'true', GATES_RESULT: 'success',
    FLUTTER_VALIDATION: 'true', FLUTTER_RESULT: 'success',
    CONTRACT_VALIDATION: 'true', CONTRACT_RESULT: 'success',
  };
  const run = (overrides) => spawnSync('bash', ['-e', '-c', script], {
    env: { ...process.env, ...baseline, ...overrides }, encoding: 'utf8',
  }).status;
  assert.equal(run({}), 0);
  for (const key of ['CLASSIFIER_RESULT', 'GATES_RESULT', 'FLUTTER_RESULT', 'CONTRACT_RESULT']) {
    for (const value of ['failure', 'cancelled', 'skipped']) assert.notEqual(run({ [key]: value }), 0, `${key}=${value}`);
  }
  for (const prefix of ['FLUTTER', 'CONTRACT']) {
    assert.equal(run({ [`${prefix}_VALIDATION`]: 'false', [`${prefix}_RESULT`]: 'skipped' }), 0);
    assert.notEqual(run({ [`${prefix}_VALIDATION`]: 'false' }), 0);
    assert.notEqual(run({ [`${prefix}_VALIDATION`]: '' }), 0);
  }
});

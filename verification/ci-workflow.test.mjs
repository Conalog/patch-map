import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';
import { dartWorkflowPaths } from '../.github/scripts/dart-prequalification.mjs';

const workflow = parse(readFileSync(new URL('../.github/workflows/ci.yaml', import.meta.url), 'utf8'));
const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tooling = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// These routing expressions use the same equality and boolean operators as JS.
function selected(expression, context) {
  if (expression === undefined) return true;
  assert.match(expression, /^\$\{\{ .* \}\}$/u);
  return Boolean(runInNewContext(expression.slice(3, -2).trim(), context, { timeout: 100 }));
}

test('repository tooling has exactly one owner for every selected package gate', () => {
  assert.equal(root.scripts['verify:tooling'], 'npm run check --workspace @patch-map/verification --');
  assert.equal(tooling.scripts.check, 'npm run typecheck && npm run lint && npm test');
  for (const [full, contracts, expected] of [
    ['true', 'true', ['contracts']],
    ['false', 'true', ['contracts']],
    ['true', 'false', ['core']],
    ['false', 'false', []],
  ]) {
    const needs = { classify: { outputs: { full_validation: full, contract_validation: contracts } } };
    const owners = [];
    for (const [jobId, matrix] of [['gate', { gate: 'core' }], ['contracts', {}]]) {
      const job = workflow.jobs[jobId];
      const context = { needs, matrix };
      if (!selected(job.if, context)) continue;
      for (const step of job.steps) {
        if (!selected(step.if, context) || !step.run) continue;
        for (const command of step.run.trim().split('\n')) {
          assert.doesNotMatch(command, /npm run verify:(?:typecheck|lint|tests)\b/u,
            'partial tooling commands must not duplicate the complete check');
          if (command === 'npm run verify:tooling') owners.push(jobId === 'gate' ? 'core' : jobId);
        }
      }
    }
    assert.deepEqual(owners, expected, `full=${full}, contracts=${contracts}`);
  }
});

test('JavaScript static checks remain selected when shared tooling owns repository checks', () => {
  const context = { matrix: { gate: 'core' }, needs: { classify: { outputs: { contract_validation: 'true' } } } };
  for (const command of ['npm run js:typecheck', 'npm run js:lint']) {
    const step = workflow.jobs.gate.steps.find((candidate) => candidate.run === command);
    assert.ok(step, command);
    assert.equal(selected(step.if, context), true, command);
    assert.equal(selected(step.if, { ...context, matrix: { gate: 'package' } }), false, command);
  }
});

test('Flutter verification and native hosts can run independently while the aggregate waits for both', () => {
  for (const name of ['flutter', 'native-example']) {
    const job = workflow.jobs[name];
    assert.deepEqual([job.needs].flat(), ['classify'], `${name}: no dependency on another package gate`);
    for (const flag of ['true', 'false']) {
      const context = { needs: { classify: { outputs: { flutter_validation: flag } } } };
      assert.equal(selected(job.if, context), flag === 'true', `${name}: flutter_validation=${flag}`);
    }
    assert.ok(workflow.jobs.validation.needs.includes(name), `${name}: required aggregate dependency`);
  }
  assert.deepEqual(workflow.jobs['native-example'].strategy.matrix.include.map(({ platform }) => platform), ['android', 'ios']);
  assert.equal(workflow.jobs.validation.if, '${{ always() }}');
});

const readWorkflow = (name) => parse(readFileSync(new URL(`../.github/workflows/${name}.yaml`, import.meta.url), 'utf8'));
const commands = (job) => (job.steps ?? []).flatMap((step) => (step.run ?? '').trim().split('\n'));

test('required CI demands an uploaded qualification only for generated Dart release PRs', () => {
  const dart = workflow.jobs['dart-release'];
  const validation = workflow.jobs.validation;
  assert.equal(dart.uses, './.github/workflows/qualify-dart.yaml');
  assert.equal(dart.with['release-pr'], true);
  assert.ok(validation.needs.includes('dart-release'));
  const [gate] = validation.steps;
  assert.equal(gate.env.DART_RELEASE_RESULT, '${{ needs.dart-release.result }}');
  assert.equal(gate.env.DART_RELEASE_ARTIFACT_ID, '${{ needs.dart-release.outputs.artifact-id }}');
  for (const [required, result, artifact, passed] of [
    ['false', 'skipped', '', true],
    ['true', 'success', '42', true],
    ['true', 'success', '', false],
    ['true', 'failure', '', false],
    ['true', 'cancelled', '', false],
    ['true', 'skipped', '', false],
    ['', 'skipped', '', false],
  ]) {
    assert.equal(selected(dart.if, { needs: { classify: { outputs: { dart_release: required } } } }), required === 'true');
    const checked = spawnSync('bash', ['-e', '-c', gate.run], { env: {
      ...process.env,
      CLASSIFIER_RESULT: 'success',
      FULL_VALIDATION: 'false',
      GATES_RESULT: 'skipped',
      FLUTTER_VALIDATION: 'false',
      FLUTTER_RESULT: 'skipped',
      NATIVE_RESULT: 'skipped',
      CONTRACT_VALIDATION: 'false',
      CONTRACT_RESULT: 'skipped',
      DART_RELEASE: required,
      DART_RELEASE_RESULT: result,
      DART_RELEASE_ARTIFACT_ID: artifact,
    } });
    assert.equal(checked.status === 0, passed, `${required}/${result}/${artifact}`);
  }
});

test('readiness gates validate repository policy and only the selected consumer metadata', () => {
  assert.ok(commands(workflow.jobs.classify).includes('test "$(node .github/scripts/release-ready.mjs --scope repository)" = true'));
  assert.ok(commands(workflow.jobs.gate).includes('test "$(node .github/scripts/release-ready.mjs --scope js)" = true'));
  assert.ok(commands(workflow.jobs.flutter).includes('test "$(node .github/scripts/release-ready.mjs --scope dart)" = true'));
  assert.ok(commands(readWorkflow('release-please').jobs.release).includes('node .github/scripts/release-ready.mjs --scope repository'));
  assert.ok(commands(readWorkflow('publish').jobs.metadata).includes('test "$(node .github/scripts/release-ready.mjs --scope js)" = true'));
  assert.ok(commands(readWorkflow('qualify-dart').jobs.plan).includes('node .github/scripts/release-ready.mjs --scope dart'));
});

test('Dart artifact jobs install only verifier dependencies and preserve publication qualification', () => {
  const dart = readWorkflow('qualify-dart');
  const publishDart = readWorkflow('publish-dart');
  const install = 'npm ci --workspace verification --include-workspace-root=false --ignore-scripts';
  for (const job of [workflow.jobs.flutter, dart.jobs.plan, dart.jobs.verify, dart.jobs.checks, dart.jobs.renderer, dart.jobs.qualify]) {
    assert.ok(commands(job).includes(install));
    assert.ok(!commands(job).includes('npm ci'));
  }
  const verify = commands(dart.jobs.verify);
  assert.ok(!verify.includes('node verification/conformance/inventory.mjs'));
  assert.ok(!verify.includes('npm run verify:tooling'));
  assert.ok(verify.includes('node .github/scripts/dart-release.mjs prepare'));
  assert.ok(!Object.values(dart.jobs).flatMap(commands).includes('npm run flutter:verify:package'));
  const { checks, renderer, qualify } = dart.jobs;
  const { publish } = publishDart.jobs;
  for (const command of ['npm run flutter:analyze', 'npm run flutter:test']) {
    assert.ok(commands(checks).includes(command), command);
    assert.ok(!verify.includes(command), command);
  }
  assert.deepEqual(publishDart.on.pull_request.paths, dartWorkflowPaths);
  assert.equal(publishDart.jobs.qualify.uses, './.github/workflows/qualify-dart.yaml');
  assert.equal(dart.on.workflow_call.outputs['artifact-id'].value, '${{ jobs.qualify.outputs.artifact-id || jobs.plan.outputs.artifact-id }}');
  for (const job of [dart.jobs.plan, qualify]) {
    assert.equal(job.outputs['artifact-id'], '${{ steps.retain.outputs.artifact-id }}');
    assert.match(job.steps.find((step) => step.id === 'retain').uses, /^actions\/upload-artifact@/u);
  }
  assert.ok(Object.values(dart.jobs).every((job) => !job.permissions?.['id-token']));
  for (const job of [dart.jobs.verify, checks]) {
    assert.equal(job.needs, 'plan');
    for (const [verify, reused, expected] of [['true', '', true], ['true', 'true', false], ['false', '', false]]) {
      assert.equal(selected(job.if, { needs: { plan: { outputs: { verify, reused } } } }), expected);
    }
  }
  assert.deepEqual(renderer.strategy.matrix.include.map(({ platform }) => platform), ['android', 'ios']);
  assert.deepEqual(renderer.needs, ['plan', 'verify']);
  assert.deepEqual(qualify.needs, ['plan', 'verify', 'checks', 'renderer']);
  assert.equal(qualify.if, undefined);
  assert.ok(commands(qualify).includes('node .github/scripts/dart-release.mjs collect'));
  assert.equal(publish.needs, 'qualify');
  assert.equal(publish.environment, 'pub.dev');
  for (const [event, enabled, runsRenderer, uploads] of [
    ['pull_request', 'false', true, false], ['pull_request', 'true', true, false],
    ['push', 'false', false, false], ['push', 'true', true, true],
  ]) {
    const context = { github: { event_name: event }, vars: { PUBDEV_PUBLISH_ENABLED: enabled } };
    assert.equal(selected(renderer.if, context), runsRenderer);
    for (const [result, artifact, cancelled, allowed] of [
      ['success', '42', false, true],
      ['success', '', false, false],
      ['failure', '42', false, false],
      ['skipped', '', false, false],
      ['success', '42', true, false],
    ]) {
      const needs = { qualify: { result, outputs: { 'artifact-id': artifact } } };
      assert.equal(selected(publish.if, { ...context, needs, cancelled: () => cancelled }), uploads && allowed);
    }
  }
  assert.ok(commands(workflow.jobs.contracts).includes('npm ci'));
  assert.ok(commands(workflow.jobs.contracts).includes('node verification/conformance/inventory.mjs'));
});


test('every readiness invocation in the workflows is accepted by the actual CLI', () => {
  for (const owner of [workflow, readWorkflow('publish'), readWorkflow('qualify-dart'), readWorkflow('release-please')]) {
    for (const job of Object.values(owner.jobs)) {
      for (const command of commands(job)) {
        const match = command.match(/node (\.github\/scripts\/release-ready\.mjs)([^)"\n]*)/u);
        if (!match) continue;
        const argv = [match[1], ...match[2].trim().split(/\s+/u).filter(Boolean)];
        assert.equal(execFileSync(process.execPath, argv, { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' }), 'true');
      }
    }
  }
});

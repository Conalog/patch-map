import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';

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

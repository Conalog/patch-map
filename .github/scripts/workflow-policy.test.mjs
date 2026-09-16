import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('required workflow policy reports for version-only release pull requests', () => {
  const source = readFileSync(new URL('../workflows/workflow-policy.yaml', import.meta.url), 'utf8');
  const pullRequest = source.match(/^ {2}pull_request:\n((?: {4}[^\n]*\n)*)/mu)?.[1];
  assert.ok(pullRequest, 'workflow must handle pull_request events');
  assert.match(pullRequest, /^ {6}- release\/1\.0$/mu);
  assert.doesNotMatch(pullRequest, /^ {4}(?:paths|paths-ignore):/mu,
    'version/changelog/manifest-only release PRs must not leave the required check pending');
  assert.match(source, /^ {4}name: Shared · Workflow security$/mu,
    'retain the documented required status name');
});

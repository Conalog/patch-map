import assert from 'node:assert/strict';
import test from 'node:test';
import { findDartPrequalification, isDartReleasePullRequest, planDartPullRequest } from './dart-prequalification.mjs';

const repository = 'Conalog/patch-map';
const repo = { full_name: repository, id: 42 };
const tagCommit = 'a'.repeat(40);
const tagTree = 'b'.repeat(40);
const tagParent = 'c'.repeat(40);
const headSha = 'd'.repeat(40);
const pull = {
  number: 270,
  merged_at: '2026-11-04T06:30:00Z',
  merge_commit_sha: tagCommit,
  base: { ref: 'release/1.0', sha: tagParent, repo },
  head: { ref: 'release-please--branches--release/1.0--components--dart', sha: headSha, repo },
};

test('Dart release PRs qualify a changed version, while ordinary PRs keep the tooling gate', () => {
  const pubspec = 'packages/flutter/pubspec.yaml';
  const tooling = '.github/workflows/publish-dart.yaml';
  assert.equal(isDartReleasePullRequest(pull, repository), true);
  assert.deepEqual(planDartPullRequest(pull, repository, [pubspec], true), { verify: true, prequalify: true });
  assert.throws(() => planDartPullRequest(pull, repository, ['README.md'], true), /must change the package pubspec/u);
  assert.deepEqual(planDartPullRequest(pull, repository, [pubspec, tooling], false), { verify: false, prequalify: false });
  const ordinary = { ...pull, head: { ...pull.head, ref: 'fix/flutter' } };
  assert.equal(isDartReleasePullRequest(ordinary, repository), false);
  assert.deepEqual(planDartPullRequest(ordinary, repository, [pubspec], false), { verify: false, prequalify: false });
  assert.deepEqual(planDartPullRequest(ordinary, repository, [tooling], false), { verify: true, prequalify: false });
  const fork = { ...pull, head: { ...pull.head, repo: { full_name: 'fork/patch-map' } } };
  assert.equal(isDartReleasePullRequest(fork, repository), false);
  assert.throws(() => planDartPullRequest(fork, repository, [pubspec], true), /must change the package pubspec/u);
});

function fixture() {
  const pulls = [structuredClone(pull)];
  const run = {
    id: 123,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/ci.yaml',
    head_branch: pull.head.ref,
    repository: repo,
    head_repository: repo,
    head_sha: headSha,
    updated_at: '2026-11-04T06:20:00Z',
    pull_requests: [],
  };
  const api = async (path) => {
    if (path === `commits/${tagCommit}/pulls`) return pulls;
    if (path === `actions/workflows/ci.yaml/runs?event=pull_request&status=success&head_sha=${headSha}&per_page=30`) {
      return { workflow_runs: [run] };
    }
    assert.fail(`Unexpected API route ${path}`);
  };
  const find = (tree = tagTree) => findDartPrequalification({ api, repository, repositoryId: repo.id, tagCommit, tagTree: tree });
  return { find, pulls, run };
}

test('a merged PR run without an API association can supply evidence for the tagged tree', async () => {
  assert.deepEqual(await fixture().find(), { runId: 123, key: `pr-270-${tagTree}` });
  assert.deepEqual(await fixture().find(headSha), { runId: 123, key: `pr-270-${headSha}` });
  assert.equal(await fixture().find('invalid'), undefined);
});

for (const [name, change] of [
  ['tag is not the PR merge commit', ({ pulls }) => { pulls[0].merge_commit_sha = headSha; }],
  ['merged PR is ambiguous', ({ pulls }) => { pulls.push({ ...pull, number: 999 }); }],
  ['workflow run belongs to another repository', ({ run }) => { run.head_repository = { id: 99 }; }],
  ['workflow run came from another event', ({ run }) => { run.event = 'push'; }],
  ['workflow run came from another path', ({ run }) => { run.path = '.github/workflows/ci.yml'; }],
  ['workflow run used another head', ({ run }) => { run.head_sha = tagTree; }],
  ['workflow run did not succeed', ({ run }) => { run.conclusion = 'failure'; }],
  ['workflow run completed after merge', ({ run }) => { run.updated_at = '2026-11-04T06:40:00Z'; }],
]) {
  test(`Dart tag falls back when ${name}`, async () => {
    const state = fixture();
    change(state);
    assert.equal(await state.find(), undefined);
  });
}

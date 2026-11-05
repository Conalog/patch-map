import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pubspecField, releaseMetadata } from './release-metadata.mjs';

const baseBranch = 'release/1.0';
const releaseBranch = 'release-please--branches--release/1.0--components--dart';
const qualificationWorkflow = 'ci.yaml';
const pubspecPath = 'packages/flutter/pubspec.yaml';
export const dartWorkflowPaths = [
  '.github/workflows/publish-dart.yaml',
  '.github/workflows/qualify-dart.yaml',
  '.github/scripts/dart-release.mjs',
  '.github/scripts/dart-prequalification.mjs',
  '.github/scripts/pub-artifact.mjs',
  'verification/flutter/renderer-qualification.mjs',
  'verification/flutter/ios-launch/xcrun',
  'packages/flutter/example/ios/Gemfile',
  'packages/flutter/example/ios/Gemfile.lock',
];
const isSha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
const isId = (value) => Number.isSafeInteger(value) && value > 0;

export function isDartReleasePullRequest(pr, repository) {
  return pr?.base?.ref === baseBranch && pr.head?.ref === releaseBranch
    && pr.head.repo?.full_name === repository;
}

export function planDartPullRequest(pr, repository, changedPaths, required) {
  const release = isDartReleasePullRequest(pr, repository);
  if (required && (!release || !changedPaths.includes(pubspecPath))) {
    throw new Error('Dart release PR must change the package pubspec');
  }
  const verify = required || (!release && changedPaths.some((path) => dartWorkflowPaths.includes(path)));
  return { verify, prequalify: required };
}

export async function findDartPrequalification({ api, repository, repositoryId, tagCommit, tagTree }) {
  if (![tagCommit, tagTree].every(isSha) || !isId(repositoryId)) return;
  const pulls = await api(`commits/${tagCommit}/pulls`);
  const matching = pulls.filter((pr) => isId(pr.number) && pr.merged_at && pr.merge_commit_sha === tagCommit
    && pr.base?.ref === baseBranch && pr.base.repo?.full_name === repository
    && pr.head?.ref === releaseBranch && pr.head.repo?.full_name === repository && isSha(pr.head.sha));
  if (matching.length !== 1) return;
  const [pr] = matching;
  const { workflow_runs: runs } = await api(`actions/workflows/${qualificationWorkflow}/runs?event=pull_request&status=success&head_sha=${pr.head.sha}&per_page=30`);
  const run = runs.find((run) => isId(run.id) && run.event === 'pull_request' && run.status === 'completed'
    && run.conclusion === 'success' && run.path === `.github/workflows/${qualificationWorkflow}` && run.head_branch === releaseBranch
    && run.repository?.id === repositoryId && run.head_repository?.id === repositoryId
    && run.head_sha === pr.head.sha && Date.parse(run.updated_at) <= Date.parse(pr.merged_at));
  // GitHub can omit the PR association from a run after merge. The exact
  // artifact name binds the evidence to the PR and the checked-out merge tree.
  if (run) return { runId: run.id, key: prequalificationKey(pr.number, tagTree) };
}

function prequalificationKey(number, tree) {
  if (!isId(number) || !isSha(tree)) throw new Error('Invalid Dart prequalification identity');
  return `pr-${number}-${tree}`;
}

async function main(command) {
  const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const repository = process.env.GITHUB_REPOSITORY;
  if (command === 'identify-pr' || command === 'plan-pr') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (command === 'identify-pr') {
      output('required', isDartReleasePullRequest(event.pull_request, repository));
      return;
    }
    const { base, head } = event.pull_request;
    if (git('rev-parse', 'HEAD^1') !== base.sha || git('rev-parse', 'HEAD^2') !== head.sha) {
      throw new Error('Unexpected Dart PR merge parents');
    }
    const paths = git('diff', '--no-renames', '--name-only', '-z', 'HEAD^1', 'HEAD').split('\0');
    const { verify, prequalify } = planDartPullRequest(event.pull_request, repository, paths, process.env.RELEASE_PR === 'true');
    output('verify', verify);
    if (prequalify) {
      const version = pubspecField(readFileSync(pubspecPath, 'utf8'), 'version');
      output('package-version', releaseMetadata('dart', `dart-v${version}`)['package-version']);
      output('prequalification-key', prequalificationKey(event.number, git('rev-parse', 'HEAD^{tree}')));
    }
  } else if (command === 'find') {
    const api = async (path) => JSON.parse(execFileSync('gh', ['api', `repos/${repository}/${path}`],
      { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] }));
    try {
      const match = await findDartPrequalification({ api, repository, repositoryId: Number(process.env.GITHUB_REPOSITORY_ID),
        tagCommit: git('rev-parse', 'HEAD'), tagTree: git('rev-parse', 'HEAD^{tree}') });
      if (match) {
        output('run-id', match.runId);
        output('prequalification-key', match.key);
      }
      else console.log('No matching successful Dart release PR verification');
    } catch {
      console.log('Dart release PR evidence could not be queried; using full tag verification');
    }
  } else throw new Error('usage: dart-prequalification.mjs identify-pr | plan-pr | find');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv[2]);

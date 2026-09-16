import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../verification/package.json', import.meta.url));
const { Manifest } = require('release-please');
const { setLogger } = require('release-please/build/src/util/logger.js');
const quiet = Object.fromEntries(['info', 'warn', 'error', 'debug', 'trace'].map((level) => [level, () => {}]));
setLogger(quiet);

const root = new URL('../../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('release-please-config.json', root), 'utf8'));
const npmPath = 'packages/javascript';
const dartPath = 'packages/flutter';
const npmSha = 'a'.repeat(40);
const dartSha = 'b'.repeat(40);
const commit = (message, files, sha = 'c'.repeat(40)) => ({ message, files, sha });

// The real pinned planner, strategies, changelog generators and workspace plugin
// run against an in-memory GitHub boundary. No network or repository writes occur.
async function fixture(changes, { dartReleased = false } = {}) {
  const versions = { [npmPath]: '1.0.0-alpha.9' };
  if (dartReleased) versions[dartPath] = '0.1.0-alpha.1';
  const files = {
    'release-please-config.json': JSON.stringify(config),
    '.release-please-manifest.json': JSON.stringify(versions),
    [`${npmPath}/package.json`]: JSON.stringify({ name: '@conalog/patch-map', version: versions[npmPath] }),
    [`${dartPath}/pubspec.yaml`]: 'name: patch_map\nversion: 0.1.0-alpha.1\n',
    [`${npmPath}/CHANGELOG.md`]: '# Changelog\n',
    [`${dartPath}/CHANGELOG.md`]: readFileSync(new URL('packages/flutter/CHANGELOG.md', root), 'utf8'),
    'package-lock.json': JSON.stringify({
      name: 'patch-map-workspace', lockfileVersion: 3,
      packages: {
        '': { name: 'patch-map-workspace' },
        [npmPath]: { name: '@conalog/patch-map', version: versions[npmPath] },
        verification: { name: '@patch-map/verification', devDependencies: { 'release-please': '17.6.0' } },
      },
    }),
  };
  const releases = [{ tagName: 'v1.0.0-alpha.9', sha: npmSha, notes: 'Previous npm release' }];
  if (dartReleased) releases.unshift({ tagName: 'dart-v0.1.0-alpha.1', sha: dartSha, notes: 'First Dart release' });
  const commits = [
    ...changes,
    ...(dartReleased ? [commit('chore: release dart 0.1.0-alpha.1', [`${dartPath}/pubspec.yaml`], dartSha)] : []),
    commit('chore: release 1.0.0-alpha.9', [`${npmPath}/package.json`], npmSha),
    commit('feat: already shipped npm feature', [`${npmPath}/src/index.ts`], 'd'.repeat(40)),
    commit('chore: bootstrap', [], config['bootstrap-sha']),
  ];
  const calls = [];
  const openPullRequests = [];
  const mergedPullRequests = [];
  const github = {
    repository: { owner: 'Conalog', repo: 'patch-map' },
    async getFileJson(path) { return JSON.parse(files[path]); },
    async getFileContentsOnBranch(path) {
      assert.ok(Object.hasOwn(files, path), `unexpected planner file read: ${path}`);
      return { parsedContent: files[path], content: Buffer.from(files[path]).toString('base64'), sha: 'file-sha' };
    },
    async *releaseIterator() { yield* releases; },
    async *tagIterator() { yield* releases.map(({ tagName, sha }) => ({ name: tagName, sha })); },
    async *mergeCommitIterator() { yield* commits; },
    async *pullRequestIterator(branch, state) {
      assert.equal(branch, 'release/1.0');
      yield* state === 'OPEN' ? openPullRequests : state === 'MERGED' ? mergedPullRequests : [];
    },
    async createPullRequest() { assert.fail('existing release PR must be updated, not recreated'); },
    async updatePullRequest(number, candidate) {
      calls.push({ number, candidate });
      return { number };
    },
  };
  const manifest = await Manifest.fromManifest(github, 'release/1.0', undefined, undefined, { logger: quiet });
  return { manifest, files, versions, calls, openPullRequests, mergedPullRequests };
}

function applyUpdates(candidate, original) {
  const files = { ...original };
  for (const { path, updater, createIfMissing } of candidate.updates) {
    if (Object.hasOwn(files, path) || createIfMissing) {
      files[path] = updater.updateContent(files[path]);
    }
  }
  return files;
}

function candidateFor(candidates, path) {
  const candidate = candidates.find((entry) => entry.updates.some((update) => update.path === `${path}/CHANGELOG.md`));
  assert.ok(candidate, `missing release candidate for ${path}`);
  return candidate;
}

function asPullRequest(candidate, number) {
  return {
    number, title: candidate.title.toString(), body: candidate.body.toString(),
    headBranchName: candidate.headRefName, baseBranchName: 'release/1.0',
    labels: ['autorelease: pending'], files: [], sha: 'e'.repeat(40),
  };
}

test('release planner dependency remains aligned with the pinned action engine', () => {
  assert.equal(require('release-please/package.json').version, '17.6.0');
});

test('npm-only release preserves legacy tag history and updates only the npm version and root lockfile', async () => {
  const { manifest, files } = await fixture([commit('fix: repair npm selection', [`${npmPath}/src/index.ts`])]);
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  const npm = candidateFor(candidates, npmPath);
  assert.equal(npm.version.toString(), '1.0.0-alpha.10');
  assert.match(npm.headRefName, /--npm$/u);
  assert.doesNotMatch(npm.body.toString(), /already shipped npm feature/u);
  assert.match(npm.body.toString(), /v1\.0\.0-alpha\.9\.\.\.v1\.0\.0-alpha\.10/u);
  const updated = applyUpdates(npm, files);
  assert.equal(JSON.parse(updated[`${npmPath}/package.json`]).version, '1.0.0-alpha.10');
  assert.equal(JSON.parse(updated['package-lock.json']).packages[npmPath].version, '1.0.0-alpha.10');
  assert.equal(updated[`${dartPath}/pubspec.yaml`], files[`${dartPath}/pubspec.yaml`]);
  assert.deepEqual(JSON.parse(updated['.release-please-manifest.json']), { [npmPath]: '1.0.0-alpha.10' });
});

test('first Dart release is alpha.1 and leaves npm manifests and root lockfile unchanged', async () => {
  const { manifest, files } = await fixture([commit('feat: implement native brush', [`${dartPath}/lib/patch_map.dart`])]);
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  const dart = candidateFor(candidates, dartPath);
  assert.equal(dart.version.toString(), '0.1.0-alpha.1');
  assert.match(dart.headRefName, /--dart$/u);
  assert.ok(dart.updates.every(({ path }) => path.startsWith(`${dartPath}/`) || path === '.release-please-manifest.json'));
  const updated = applyUpdates(dart, files);
  assert.equal((updated[`${dartPath}/CHANGELOG.md`].match(/^## .*0\.1\.0-alpha\.1/gmu) ?? []).length, 1);
  assert.equal(updated['package-lock.json'], files['package-lock.json']);
  assert.equal(updated[`${npmPath}/package.json`], files[`${npmPath}/package.json`]);
  assert.deepEqual(JSON.parse(updated['.release-please-manifest.json']), {
    [npmPath]: '1.0.0-alpha.9', [dartPath]: '0.1.0-alpha.1',
  });
});

test('later Dart-only fix increments alpha.2 without a new npm candidate', async () => {
  const { manifest, files } = await fixture([commit('fix: repair native pointer', [`${dartPath}/lib/patch_map.dart`])], { dartReleased: true });
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  const dart = candidateFor(candidates, dartPath);
  assert.equal(dart.version.toString(), '0.1.0-alpha.2');
  assert.match(applyUpdates(dart, files)[`${dartPath}/pubspec.yaml`], /version: 0\.1\.0-alpha\.2/u);
});

test('shared feature produces two independently mergeable PRs and correctly named releases', async () => {
  const state = await fixture([commit('feat: add shared selection behavior', [`${npmPath}/src/index.ts`, `${dartPath}/lib/patch_map.dart`])]);
  const candidates = await state.manifest.buildPullRequests();
  assert.equal(candidates.length, 2);
  const npm = candidateFor(candidates, npmPath);
  const dart = candidateFor(candidates, dartPath);
  assert.notEqual(npm.headRefName, dart.headRefName);
  assert.ok(npm.updates.some(({ path }) => path === 'package-lock.json'));
  assert.ok(!dart.updates.some(({ path }) => path === 'package-lock.json'));
  const npmThenDart = applyUpdates(dart, applyUpdates(npm, state.files));
  const dartThenNpm = applyUpdates(npm, applyUpdates(dart, state.files));
  assert.deepEqual(JSON.parse(npmThenDart['.release-please-manifest.json']), {
    [npmPath]: '1.0.0-alpha.10', [dartPath]: '0.1.0-alpha.1',
  });
  assert.deepEqual(JSON.parse(npmThenDart['.release-please-manifest.json']), JSON.parse(dartThenNpm['.release-please-manifest.json']));
  state.mergedPullRequests.push(...candidates.map(asPullRequest));
  const releases = await state.manifest.buildReleases();
  assert.deepEqual(releases.map(({ tag }) => tag.toString()).sort(), ['dart-v0.1.0-alpha.1', 'v1.0.0-alpha.10']);
});

test('separate pending PRs route updates to the existing npm and Dart PR numbers', async () => {
  const state = await fixture([commit('feat: add shared selection behavior', [`${npmPath}/src/index.ts`, `${dartPath}/lib/patch_map.dart`])]);
  const candidates = await state.manifest.buildPullRequests();
  state.openPullRequests.push(...candidates.map((candidate, index) => {
    const pullRequest = asPullRequest(candidate, 100 + index);
    pullRequest.body = pullRequest.body.replace('shared selection behavior', 'older behavior');
    return pullRequest;
  }));
  await state.manifest.createPullRequests();
  assert.deepEqual(state.calls.map(({ number }) => number).sort(), [100, 101]);
  assert.deepEqual(new Set(state.calls.map(({ candidate }) => candidate.headRefName)), new Set(candidates.map(({ headRefName }) => headRefName)));
  // This proves planner routing only. GitHub.updatePullRequest/code-suggester's
  // remote behavior (upstream issue #2773) still requires an actual hosted run.
});

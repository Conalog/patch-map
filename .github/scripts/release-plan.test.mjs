import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { parseVersion, pubspecField } from './release-metadata.mjs';

const require = createRequire(new URL('../../verification/package.json', import.meta.url));
import { createReleaseManifest, runIndependentReleases } from './release-planner.mjs';
const { setLogger } = require('release-please/build/src/util/logger.js');
const quiet = Object.fromEntries(['info', 'warn', 'error', 'debug', 'trace'].map((level) => [level, () => {}]));
setLogger(quiet);

const root = new URL('../../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('release-please-config.json', root), 'utf8'));
const npmPath = 'packages/javascript';
const dartPath = 'packages/flutter';
const npmSha = '6986c632a47d3443ff17903c416291dfe4120340';
const dartSha = 'b'.repeat(40);
const commit = (message, files, sha = 'c'.repeat(40)) => ({ message, files, sha });

// The real pinned planner, strategies, changelog generators and workspace plugin
// run against an in-memory GitHub boundary. No network or repository writes occur.
// Package artifacts model this fixture's release history, never the checkout's
// pending release PR. Repository configuration remains the wiring under test.
async function fixture(changes, { dartReleased = false, jsReleased = false, missingLegacy = false, wrongLegacy = false, missingBoundary = false, betweenReleases = [], historical = [], packagePath, lockHistory = {}, staleBase = false } = {}) {
  const versions = { [npmPath]: jsReleased ? '1.0.0-alpha.10' : '1.0.0-alpha.9' };
  if (dartReleased) versions[dartPath] = '1.0.0-alpha.1';
  const files = {
    'release-please-config.json': JSON.stringify(config),
    '.release-please-manifest.json': JSON.stringify(versions),
    [`${npmPath}/package.json`]: JSON.stringify({ name: '@conalog/patch-map', version: versions[npmPath] }),
    [`${dartPath}/pubspec.yaml`]: 'name: conalog_patch_map\nversion: 1.0.0-alpha.1\n# Enable publication only after the first functional release is qualified.\npublish_to: none\n',
    [`${npmPath}/CHANGELOG.md`]: `# Changelog\n\n## ${versions[npmPath]}\n\n- Previous npm release.\n`,
    [`${dartPath}/CHANGELOG.md`]: `# Changelog\n\n## ${dartReleased ? versions[dartPath] : 'Unreleased'}\n\n- Native package foundation.\n`,
    'package-lock.json': JSON.stringify({
      name: 'patch-map-workspace', lockfileVersion: 3,
      packages: {
        '': { name: 'patch-map-workspace' },
        [npmPath]: { name: '@conalog/patch-map', version: versions[npmPath] },
        verification: { name: '@patch-map/verification', devDependencies: { 'release-please': '17.6.0' } },
      },
    }),
  };
  const releases = [{ tagName: jsReleased ? 'js-v1.0.0-alpha.10' : 'v1.0.0-alpha.9', sha: wrongLegacy ? 'f'.repeat(40) : npmSha, notes: 'Previous npm release' }];
  if (missingLegacy) releases.length = 0;
  if (dartReleased) releases.unshift({ tagName: 'dart-v1.0.0-alpha.1', sha: dartSha, notes: 'First Dart release' });
  const commits = [
    ...changes,
    ...(dartReleased ? [commit('chore: release dart 1.0.0-alpha.1', [`${dartPath}/pubspec.yaml`], dartSha)] : []),
    ...betweenReleases,
    ...(missingBoundary ? [] : [commit('chore: release previous npm', [jsReleased ? `${npmPath}/package.json` : 'package.json', 'package-lock.json'], npmSha)]),
    ...historical,
    commit('feat: already shipped npm feature', [`${npmPath}/src/index.ts`], 'd'.repeat(40)),
  ];
  const calls = [];
  const openPullRequests = [];
  const mergedPullRequests = [];
  const github = {
    repository: { owner: 'Conalog', repo: 'patch-map' },
    async getFileJson(path, ref) { return path === 'package-lock.json' && lockHistory[ref] ? lockHistory[ref] : JSON.parse(files[path]); },
    getGitHubApi() { return { octokit: { repos: {
      async getBranch({ branch }) { return { data: { commit: { sha: openPullRequests.find((pr) => pr.headBranchName === branch).fixtureHeadSha } } }; },
      async getCommit({ ref }) { assert.notEqual(ref, npmSha, 'bootstrap lock ownership must not be queried'); return { data: { parents: [{ sha: `${ref}-parent` }] } }; },
      async compareCommitsWithBasehead() { return { data: { behind_by: staleBase ? 1 : 0 } }; },
    } } }; },
    async buildChangeSet(updates) {
      const updated = applyUpdates({ updates }, files);
      return new Map(updates.filter(({ path }) => typeof updated[path] === 'string').map(({ path }) => [path, { content: updated[path] }]));
    },
    async getFileContentsOnBranch(path, ref) {
      const pr = openPullRequests.find((pr) => pr.fixtureHeadSha === ref || pr.headBranchName === ref);
      if (pr) {
        pr.baseFiles ??= structuredClone(files);
        const content = applyUpdates({ updates: pr.fixtureUpdates }, pr.baseFiles)[path];
        return { parsedContent: content, content: Buffer.from(content).toString('base64'), sha: 'head-file-sha' };
      }
      assert.ok(Object.hasOwn(files, path), `unexpected planner file read: ${path}`);
      return { parsedContent: files[path], content: Buffer.from(files[path]).toString('base64'), sha: 'file-sha' };
    },
    async *releaseIterator() { yield* releases; },
    async *tagIterator() { yield* releases.map(({ tagName, sha }) => ({ name: tagName, sha })); },
    async *mergeCommitIterator(_branch, options) { assert.equal(options.backfillFiles, true, 'all ownership scans need complete paths'); yield* commits; },
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
  const manifest = await createReleaseManifest(github, 'release/1.0', packagePath);
  return { manifest, github, files, versions, calls, commits, openPullRequests, mergedPullRequests };
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

function asPullRequest(candidate, number, baseFiles) {
  return {
    baseFiles, number, title: candidate.title.toString(), body: candidate.body.toString(),
    headBranchName: candidate.headRefName, baseBranchName: 'release/1.0',
    labels: ['autorelease: pending'], files: [], sha: 'test-merge-sha', fixtureHeadSha: number.toString(16).padEnd(40, 'e'), fixtureUpdates: candidate.updates,
  };
}

test('release planner dependency remains pinned to the verified engine', () => {
  assert.equal(require('release-please/package.json').version, '17.6.0');
});

test('shared-only assets and preparation fixes produce both release candidates once', async () => {
  for (const files of [
    ['shared/assets/icons/object.svg'], ['shared/assets/fonts/FiraCode-VF.woff2'],
    ['shared/assets/fonts/LICENSE.txt'], ['verification/assets/prepare.mjs'],
    ['shared/assets/icons/object.svg', `${npmPath}/src/index.ts`, `${dartPath}/pubspec.yaml`],
  ]) {
    const { manifest } = await fixture([commit('fix: repair shared assets', files)]);
    const candidates = await manifest.buildPullRequests();
    assert.equal(candidates.length, 2, files.join(', '));
    for (const path of [npmPath, dartPath]) {
      assert.equal((candidateFor(candidates, path).body.toString().match(/repair shared assets/gu) ?? []).length, 1);
    }
  }
});

test('native font derivation changes release only Dart', async () => {
  const { manifest } = await fixture([commit('fix: repair native font', [
    'shared/assets/fonts/FiraCode-VF.ttf', 'shared/assets/fonts/provenance.json',
  ])], { dartReleased: true, jsReleased: true });
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  assert.equal(candidateFor(candidates, dartPath).version.toString(), '1.0.0-alpha.2');
});

test('repository tooling does not create package releases or consumer notes', async () => {
  for (const path of [
    '.github/scripts/release-planner.mjs', '.github/workflows/ci.yaml', '.github/workflows/publish.yaml',
    'verification/ci-workflow.test.mjs', 'verification/package.json',
    'verification/docs/verify.mjs', 'verification/conformance/inventory.mjs',
    'verification/flutter/package.mjs',
    'package.json', 'package-lock.json', '.nvmrc', 'release-please-config.json',
  ]) {
    const { manifest } = await fixture([commit('fix: repair common release checks', [path])]);
    assert.deepEqual(await manifest.buildPullRequests(), [], path);
  }
});

test('mixed shared product and package paths add a release note once per consumer', async () => {
  const { manifest } = await fixture([commit('fix: repair mixed release inputs', [
    '.github/scripts/release-planner.mjs', 'verification/ci-workflow.test.mjs',
    'conformance/contracts.json', 'package.json', `${npmPath}/src/index.ts`, `${dartPath}/lib/conalog_patch_map.dart`,
  ])]);
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 2);
  for (const owner of [npmPath, dartPath]) {
    assert.equal((candidateFor(candidates, owner).body.toString().match(/repair mixed release inputs/gu) ?? []).length, 1);
  }
});

test('shared product contracts produce both release candidates and repository docs do not plan releases', async () => {
  const { manifest } = await fixture([commit('fix: repair shared contract', ['conformance/contracts.json'])]);
  assert.equal((await manifest.buildPullRequests()).length, 2);
  for (const path of ['docs/engineering/releases.md', 'CONTRIBUTING.md', 'AGENTS.md']) {
    const { manifest } = await fixture([commit('fix: repair repository guidance', [path])]);
    assert.deepEqual(await manifest.buildPullRequests(), [], path);
  }
});

test('shared product routing preserves conventional release types without releasing maintenance', async () => {
  for (const type of ['feat', 'fix', 'perf', 'deps']) {
    const { manifest } = await fixture([commit(`${type}: improve shared product inputs`, ['conformance/contracts.json'])]);
    assert.equal((await manifest.buildPullRequests()).length, 2, type);
  }
  for (const type of ['ci', 'docs', 'test', 'chore']) {
    const { manifest } = await fixture([commit(`${type}: maintain common release inputs`, ['.github/workflows/ci.yaml'])]);
    assert.deepEqual(await manifest.buildPullRequests(), [], type);
  }
});

test('shared contracts respect the independent published release boundaries', async () => {
  const { manifest } = await fixture([], {
    dartReleased: true, jsReleased: true,
    betweenReleases: [commit('fix: shared contract already shipped in Dart', ['conformance/contracts.json'], 'a'.repeat(40))],
    historical: [commit('fix: shared contract already shipped in both', ['conformance/contracts.json'], 'e'.repeat(40))],
  });
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  const npm = candidateFor(candidates, npmPath);
  assert.equal(npm.version.toString(), '1.0.0-alpha.11');
  assert.match(npm.body.toString(), /already shipped in Dart/u);
  assert.doesNotMatch(npm.body.toString(), /already shipped in both/u);
});

test('shared asset routing respects each independent published boundary', async () => {
  const { manifest } = await fixture([], {
    dartReleased: true, jsReleased: true,
    betweenReleases: [commit('fix: shared change already shipped in Dart', ['shared/assets/icons/object.svg'], 'a'.repeat(40))],
    historical: [commit('fix: shared change already shipped in both', ['shared/assets/icons/wifi.svg'], 'e'.repeat(40))],
  });
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  const npm = candidateFor(candidates, npmPath);
  assert.equal(npm.version.toString(), '1.0.0-alpha.11');
  assert.match(npm.body.toString(), /already shipped in Dart/u);
  assert.doesNotMatch(npm.body.toString(), /already shipped in both/u);
});

test('initial peer release bootstrap excludes the former single-package history', async () => {
  assert.equal(config['bootstrap-sha'], npmSha);
  const { manifest } = await fixture([], {
    historical: [
      commit('feat: historical npm rotation', ['package.json', 'package-lock.json', 'verification/package/run.mjs'], 'e'.repeat(40)),
      commit('fix: historical workflow policy', ['.github/workflows/ci.yaml'], 'f'.repeat(40)),
    ],
  });
  assert.deepEqual(await manifest.buildPullRequests(), []);
  const peer = await fixture([commit('feat: establish peer packages', [
    `${npmPath}/src/index.ts`, `${dartPath}/pubspec.yaml`, 'package.json', 'verification/package.json',
  ])], {
    historical: [commit('feat: historical npm rotation', ['package.json', 'verification/package/run.mjs'], 'e'.repeat(40))],
  });
  const candidates = await peer.manifest.buildPullRequests();
  assert.equal(candidates.length, 2);
  for (const owner of [npmPath, dartPath]) {
    const candidate = candidateFor(candidates, owner);
    assert.match(candidate.body.toString(), /establish peer packages/u);
    assert.doesNotMatch(candidate.body.toString(), /historical npm rotation/u);
  }
});

test('npm-only release preserves legacy tag history and updates only the npm version and root lockfile', async () => {
  const { manifest, files } = await fixture([commit('fix: repair npm selection', [`${npmPath}/src/index.ts`])]);
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  const npm = candidateFor(candidates, npmPath);
  assert.equal(npm.version.toString(), '1.0.0-alpha.10');
  assert.match(npm.headRefName, /--js$/u);
  assert.doesNotMatch(npm.body.toString(), /already shipped npm feature/u);
  assert.match(npm.body.toString(), /v1\.0\.0-alpha\.9\.\.\.js-v1\.0\.0-alpha\.10/u);
  const updated = applyUpdates(npm, files);
  assert.equal(JSON.parse(updated[`${npmPath}/package.json`]).version, '1.0.0-alpha.10');
  assert.ok(updated[`${npmPath}/CHANGELOG.md`].includes(files[`${npmPath}/CHANGELOG.md`].slice('# Changelog\n'.length).trim()));
  assert.equal(JSON.parse(updated['package-lock.json']).packages[npmPath].version, '1.0.0-alpha.10');
  assert.equal(updated[`${dartPath}/pubspec.yaml`], files[`${dartPath}/pubspec.yaml`]);
  assert.deepEqual(JSON.parse(updated['.release-please-manifest.json']), { [npmPath]: '1.0.0-alpha.10' });
});

test('first Dart release is alpha.1 and leaves npm manifests and root lockfile unchanged', async () => {
  const { manifest, files } = await fixture([commit('feat: implement native brush', [`${dartPath}/lib/conalog_patch_map.dart`])]);
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  const dart = candidateFor(candidates, dartPath);
  assert.equal(dart.version.toString(), '1.0.0-alpha.1');
  assert.match(dart.headRefName, /--dart$/u);
  assert.ok(dart.updates.every(({ path }) => path.startsWith(`${dartPath}/`) || path === '.release-please-manifest.json'));
  const updated = applyUpdates(dart, files);
  assert.equal(pubspecField(updated[`${dartPath}/pubspec.yaml`], 'version'), dart.version.toString());
  assert.equal(updated[`${dartPath}/pubspec.yaml`], files[`${dartPath}/pubspec.yaml`]);
  assert.equal(pubspecField(updated[`${dartPath}/pubspec.yaml`], 'publish_to'), 'none');
  assert.match(updated[`${dartPath}/pubspec.yaml`], /# Enable publication only after the first functional release is qualified\./u);
  assert.equal((updated[`${dartPath}/CHANGELOG.md`].match(/^## .*1\.0\.0-alpha\.1/gmu) ?? []).length, 1);
  assert.equal(updated['package-lock.json'], files['package-lock.json']);
  assert.equal(updated[`${npmPath}/package.json`], files[`${npmPath}/package.json`]);
  assert.deepEqual(JSON.parse(updated['.release-please-manifest.json']), {
    [npmPath]: '1.0.0-alpha.9', [dartPath]: '1.0.0-alpha.1',
  });
});

test('later Dart-only fix increments alpha.2 without a new npm candidate', async () => {
  const { manifest, files } = await fixture([commit('fix: repair native pointer', [`${dartPath}/lib/conalog_patch_map.dart`])], { dartReleased: true });
  const candidates = await manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  const dart = candidateFor(candidates, dartPath);
  assert.equal(dart.version.toString(), '1.0.0-alpha.2');
  const updatedPubspec = applyUpdates(dart, files)[`${dartPath}/pubspec.yaml`];
  const version = pubspecField(updatedPubspec, 'version');
  assert.equal(version, dart.version.toString());
  assert.equal(updatedPubspec, files[`${dartPath}/pubspec.yaml`].replace('version: 1.0.0-alpha.1', 'version: 1.0.0-alpha.2'));
  assert.doesNotThrow(() => parseVersion(version));
});

test('Dart channel transitions write the exact planned version without inherited suffixes', async () => {
  for (const version of ['1.0.0-beta.1', '1.0.0-rc.1', '1.0.0']) {
    const { manifest, files } = await fixture([commit(`feat: promote Dart\n\nRelease-As: ${version}`, [`${dartPath}/lib/conalog_patch_map.dart`])], { dartReleased: true });
    const dart = candidateFor(await manifest.buildPullRequests(), dartPath);
    assert.equal(dart.version.toString(), version);
    const updated = applyUpdates(dart, files);
    assert.equal(pubspecField(updated[`${dartPath}/pubspec.yaml`], 'version'), version);
    assert.equal(JSON.parse(updated['.release-please-manifest.json'])[dartPath], version);
  }
});

test('Dart release updates reject ambiguous pubspec version fields', async () => {
  const { manifest, files } = await fixture([commit('feat: update Dart', [`${dartPath}/lib/conalog_patch_map.dart`])]);
  const dart = candidateFor(await manifest.buildPullRequests(), dartPath);
  files[`${dartPath}/pubspec.yaml`] += 'version: 1.0.0-alpha.2\n';
  assert.throws(() => applyUpdates(dart, files), /one plain version scalar/u);
});

test('shared feature produces two independently mergeable PRs and correctly named releases', async () => {
  const state = await fixture([commit('feat: add shared selection behavior', [`${npmPath}/src/index.ts`, `${dartPath}/lib/conalog_patch_map.dart`])]);
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
    [npmPath]: '1.0.0-alpha.10', [dartPath]: '1.0.0-alpha.1',
  });
  assert.deepEqual(JSON.parse(npmThenDart['.release-please-manifest.json']), JSON.parse(dartThenNpm['.release-please-manifest.json']));
  state.mergedPullRequests.push(...candidates.map(asPullRequest));
  const releases = await state.manifest.buildReleases();
  assert.deepEqual(releases.map(({ name }) => name).sort(), ['dart: v1.0.0-alpha.1', 'js: v1.0.0-alpha.10']);
  assert.deepEqual(releases.map(({ tag }) => tag.toString()).sort(), ['dart-v1.0.0-alpha.1', 'js-v1.0.0-alpha.10']);
});

test('separate pending PRs route updates to the existing npm and Dart PR numbers', async () => {
  const state = await fixture([commit('feat: add shared selection behavior', [`${npmPath}/src/index.ts`, `${dartPath}/lib/conalog_patch_map.dart`])]);
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

test('a JS feature with root lock and tooling changes updates only the pending JS release', async () => {
  const state = await fixture([commit('feat: add peer foundations', [
    `${npmPath}/src/index.ts`, `${dartPath}/lib/conalog_patch_map.dart`,
  ])]);
  const oldCandidates = await state.manifest.buildPullRequests();
  state.openPullRequests.push(asPullRequest(candidateFor(oldCandidates, dartPath), 247),
    asPullRequest(candidateFor(oldCandidates, npmPath), 248));
  await state.manifest.createPullRequests();
  assert.deepEqual(state.calls, [], 'unchanged release notes still skip needless updates');
  state.commits.unshift(commit('feat: add image sessions', [
    `${npmPath}/src/image.ts`, `${npmPath}/package.json`, 'package-lock.json',
    '.github/scripts/release-planner.mjs', 'verification/package.json',
  ], 'f'.repeat(40)));
  await state.manifest.createPullRequests();
  assert.deepEqual(state.calls.map(({ number }) => number), [248]);
  assert.match(state.calls[0].candidate.body.toString(), /add image sessions/u);
  const dart = candidateFor(await state.manifest.buildPullRequests(), dartPath);
  assert.doesNotMatch(dart.body.toString(), /add image sessions/u);
  assert.match(dart.body.toString(), /add peer foundations/u);
});

test('tooling-only changes leave notes and already current release PRs untouched', async () => {
  const state = await fixture([commit('feat: add peer foundations', [
    `${npmPath}/src/index.ts`, `${dartPath}/lib/conalog_patch_map.dart`,
  ])]);
  const candidates = await state.manifest.buildPullRequests();
  state.openPullRequests.push(asPullRequest(candidateFor(candidates, dartPath), 247),
    asPullRequest(candidateFor(candidates, npmPath), 248));
  state.commits.unshift(commit('fix: repair common release planning', [
    '.github/scripts/release-planner.mjs', 'verification/package.json', 'package-lock.json',
  ], 'f'.repeat(40)));
  await state.manifest.createPullRequests();
  assert.deepEqual(state.calls, []);
});

test('ordinary planning removes a leaked JS note from the existing Dart release PR', async () => {
  const state = await fixture([
    commit('feat: add image sessions', [`${npmPath}/src/image.ts`, 'package-lock.json'], 'f'.repeat(40)),
    commit('feat: add peer foundations', [`${npmPath}/src/index.ts`, `${dartPath}/lib/conalog_patch_map.dart`]),
  ]);
  const candidates = await state.manifest.buildPullRequests();
  const dart = asPullRequest(candidateFor(candidates, dartPath), 247);
  dart.body = dart.body.replace('add peer foundations', 'add image sessions');
  state.openPullRequests.push(dart, asPullRequest(candidateFor(candidates, npmPath), 248));
  await state.manifest.createPullRequests();
  assert.deepEqual(state.calls.map(({ number }) => number), [247]);
  const repaired = state.calls[0].candidate;
  assert.doesNotMatch(repaired.body.toString(), /add image sessions/u);
  assert.match(repaired.body.toString(), /add peer foundations/u);
  assert.doesNotMatch(applyUpdates(repaired, state.files)[`${dartPath}/CHANGELOG.md`], /add image sessions/u);
});

test('JS-only root-lock changes do not create a Dart candidate before or after its first release', async () => {
  for (const dartReleased of [false, true]) {
    const { manifest } = await fixture([commit('feat: add image sessions', [
      `${npmPath}/src/image.ts`, `${npmPath}/package.json`, 'package-lock.json',
    ])], { dartReleased });
    const candidates = await manifest.buildPullRequests();
    assert.equal(candidates.length, 1);
    assert.match(candidateFor(candidates, npmPath).body.toString(), /add image sessions/u);
  }
});


test('migration preserves npm history even when Dart was released first', async () => {
  const { manifest } = await fixture([commit('fix: new npm fix', [`${npmPath}/src/index.ts`])], { dartReleased: true });
  const npm = candidateFor(await manifest.buildPullRequests(), npmPath);
  assert.doesNotMatch(npm.body.toString(), /already shipped npm feature/u);
  assert.match(npm.body.toString(), /v1\.0\.0-alpha\.9\.\.\.js-v1\.0\.0-alpha\.10/u);
});

test('subsequent JS release uses its real new-format predecessor', async () => {
  const { manifest } = await fixture([commit('fix: later npm fix', [`${npmPath}/src/index.ts`])], { jsReleased: true });
  const npm = candidateFor(await manifest.buildPullRequests(), npmPath);
  assert.equal(npm.version.toString(), '1.0.0-alpha.11');
  assert.match(npm.body.toString(), /js-v1\.0\.0-alpha\.10\.\.\.js-v1\.0\.0-alpha\.11/u);
  assert.doesNotMatch(npm.body.toString(), /already shipped npm feature/u);
});

test('migration refuses missing or mismatched historical release boundaries', async () => {
  for (const options of [{ missingLegacy: true }, { wrongLegacy: true }, { missingBoundary: true }]) {
    const { manifest } = await fixture([commit('fix: npm fix', [`${npmPath}/src/index.ts`])], options);
    await assert.rejects(manifest.buildPullRequests(), /historical release|outside the release branch/u);
  }
});

test('shared contract documentation and asset test changes never leak a JS note into Dart', async () => {
  for (const file of ['conformance/README.md', 'conformance/model/README.md', 'verification/assets/prepare.test.mjs']) {
    const shared = await fixture([commit('fix: improve verification', [file])]);
    assert.deepEqual(await shared.manifest.buildPullRequests(), []);
    const mixed = await fixture([commit('feat: add image output', [file, `${npmPath}/src/image.ts`])]);
    assert.equal((await mixed.manifest.buildPullRequests()).length, 1);
  }
});

test('immutable lock-only JS dependency patches release JS while private tooling patches do not', async () => {
  const before = { lockfileVersion: 3, packages: {
    [npmPath]: { name: '@conalog/patch-map', dependencies: { pixi: '1' } },
    verification: { devDependencies: { tool: '1' } },
    'node_modules/pixi': { version: '1', dependencies: { transit: '1' } },
    'node_modules/transit': { version: '1', integrity: 'original' },
    'node_modules/tool': { version: '1' },
  } };
  for (const target of ['transit', 'tool']) {
    const after = structuredClone(before);
    after.packages[`node_modules/${target}`].integrity = 'patched';
    const sha = 'f'.repeat(40);
    const state = await fixture([commit('deps: patch a dependency', ['package-lock.json'], sha)], {
      lockHistory: { [sha]: after, [`${sha}-parent`]: before },
    });
    const candidates = await state.manifest.buildPullRequests();
    assert.equal(candidates.length, target === 'transit' ? 1 : 0);
    if (candidates.length) assert.ok(candidateFor(candidates, npmPath));
  }
  const sha = 'f'.repeat(40);
  const invalid = await fixture([commit('deps: patch dependency', ['package-lock.json'], sha)], {
    lockHistory: { [sha]: {}, [`${sha}-parent`]: before },
  });
  await assert.rejects(invalid.manifest.buildPullRequests(), /Invalid workspace lock/);
});

test('pending peer tags do not block scoped planning, but the selected runtime remains guarded', async () => {
  const state = await fixture([commit('feat: add peer feature', [`${npmPath}/src/index.ts`, `${dartPath}/lib/conalog_patch_map.dart`])]);
  const candidates = await state.manifest.buildPullRequests();
  state.mergedPullRequests.push(asPullRequest(candidateFor(candidates, dartPath), 247));
  let created = 0;
  state.github.createPullRequest = async () => { created++; return { number: 248 }; };
  const js = await createReleaseManifest(state.github, 'release/1.0', npmPath);
  assert.equal((await js.createPullRequests()).length, 1);
  assert.equal(created, 1);
  const dart = await createReleaseManifest(state.github, 'release/1.0', dartPath);
  assert.deepEqual(await dart.createPullRequests(), []);
  assert.equal(created, 1);
});

test('release failures are reported after the independent peer attempt completes', async () => {
  const state = await fixture([commit('feat: implement Dart feature', [`${dartPath}/lib/conalog_patch_map.dart`])], { missingLegacy: true });
  let created = 0;
  state.github.createPullRequest = async () => { created++; return { number: 247 }; };
  await assert.rejects(runIndependentReleases(state.github), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 1);
    assert.match(error.errors[0].message, /packages\/javascript/);
    assert.match(error.errors[0].cause.message, /historical release/);
    return true;
  });
  assert.equal(created, 1);
});

test('both actual Git merge orders regenerate the remaining PR on the peer base without changing notes', async (t) => {
  for (const firstPath of [npmPath, dartPath]) {
    const secondPath = firstPath === npmPath ? dartPath : npmPath;
    const state = await fixture([commit('feat: establish peers', [`${npmPath}/src/index.ts`, `${dartPath}/lib/conalog_patch_map.dart`])], { staleBase: true });
    const candidates = await state.manifest.buildPullRequests();
    const first = candidateFor(candidates, firstPath), second = candidateFor(candidates, secondPath);
    const original = structuredClone(state.files);
    const directory = mkdtempSync(join(tmpdir(), 'patch-map-release-merge-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd: directory, encoding: 'utf8', stdio: 'pipe' }).trim();
    const save = (files) => {
      for (const [file, bytes] of Object.entries(files)) {
        mkdirSync(dirname(join(directory, file)), { recursive: true });
        writeFileSync(join(directory, file), bytes);
      }
      git('add', '.'); git('commit', '-qm', 'chore: release fixture'); return git('rev-parse', 'HEAD');
    };
    git('init', '-q'); const base = save(original);
    const firstFiles = applyUpdates(first, original);
    const firstHead = save(firstFiles);
    git('checkout', '-q', '--detach', base);
    const oldSecondHead = save(applyUpdates(second, original));
    assert.throws(() => git('merge-tree', '--write-tree', firstHead, oldSecondHead), /Command failed/);
    Object.assign(state.files, firstFiles);
    state.openPullRequests.push(asPullRequest(second, 249, original));
    const scoped = await createReleaseManifest(state.github, 'release/1.0', secondPath);
    await scoped.createPullRequests();
    assert.deepEqual(state.calls.map(({ number }) => number), [249]);
    const refreshed = state.calls[0].candidate;
    assert.equal(refreshed.body.toString(), second.body.toString());
    const refreshedFiles = applyUpdates(refreshed, firstFiles);
    const manifest = JSON.parse(refreshedFiles['.release-please-manifest.json']);
    assert.equal(manifest[npmPath], '1.0.0-alpha.10');
    assert.equal(manifest[dartPath], '1.0.0-alpha.1');
    assert.equal(JSON.parse(refreshedFiles['package-lock.json']).packages[npmPath].version, '1.0.0-alpha.10');
    git('checkout', '-q', '--detach', firstHead);
    const repairedHead = save(refreshedFiles);
    assert.doesNotThrow(() => git('merge-tree', '--write-tree', firstHead, repairedHead));
  }
});

test('a broken JS lock graph cannot prevent independent Dart planning', async () => {
  const sha = 'f'.repeat(40);
  const state = await fixture([
    commit('deps: patch JS dependency', ['package-lock.json'], sha),
    commit('feat: implement Dart feature', [`${dartPath}/lib/conalog_patch_map.dart`]),
  ], { packagePath: dartPath, lockHistory: { [sha]: {}, [`${sha}-parent`]: {} } });
  const candidates = await state.manifest.buildPullRequests();
  assert.equal(candidates.length, 1);
  assert.ok(candidateFor(candidates, dartPath));
});

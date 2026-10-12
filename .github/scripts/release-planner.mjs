import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assetConsumerPaths } from '../../verification/assets/catalog.mjs';
import { isContractInput } from '../../verification/conformance/inputs.mjs';
import { dependencyGraphChanged } from '../../verification/dependencies/closure.mjs';
import { parseVersion, pubspecField } from './release-metadata.mjs';

const require = createRequire(new URL('../../verification/package.json', import.meta.url));
const { GitHub, Manifest } = require('release-please');
const { ManifestPlugin } = require('release-please/build/src/plugin.js');
const { TagName } = require('release-please/build/src/util/tag-name.js');
const { BranchName } = require('release-please/build/src/util/branch-name.js');
const jsPath = 'packages/javascript';
const dartPath = 'packages/flutter';
const packagePaths = [jsPath, dartPath];
const legacyVersion = '1.0.0-alpha.9';
const legacyTag = `v${legacyVersion}`;
const legacySha = '6986c632a47d3443ff17903c416291dfe4120340';

function releaseConsumerPaths(path) {
  const assetConsumers = assetConsumerPaths(path);
  if (assetConsumers.length > 0) return assetConsumers;
  if (isContractInput(path)) return packagePaths;
  return [];
}

// CommitSplit already owns package-local paths. Only project shared product
// assets/contracts onto their consumers; tooling and CI impact is not release ownership.
// This changes planner input only; GitHub files and commit history stay intact.
function withReleaseConsumers(github, packagePath) {
  const lockReads = new Map();
  function readLock(ref) {
    if (!lockReads.has(ref)) lockReads.set(ref, github.getFileJson('package-lock.json', ref));
    return lockReads.get(ref);
  }
  return new Proxy(github, {
    get(target, key) {
      if (key === 'getFileJson' && packagePath) return async (path, ref) => {
        const content = await target.getFileJson(path, ref);
        if (path !== '.release-please-manifest.json') return content;
        return Object.hasOwn(content, packagePath) ? { [packagePath]: content[packagePath] } : {};
      };
      if (key === 'pullRequestIterator' && packagePath) return async function* (...args) {
        const component = packagePath === jsPath ? 'js' : 'dart';
        for await (const pr of target.pullRequestIterator(...args)) {
          if (BranchName.parse(pr.headBranchName)?.getComponent() === component) yield pr;
        }
      };
      if (key === 'mergeCommitIterator') return async function* (...args) {
        // Ownership needs every file, including large migration/rename PRs.
        // The SDK's default GraphQL history contains only the first 100 paths.
        for await (const commit of target.mergeCommitIterator(args[0], { ...args[1], backfillFiles: true })) {
          // The single-package bootstrap lock has no peer workspace records.
          // Yield the boundary untouched so release-please can stop at its SHA.
          if (commit.sha === legacySha) { yield commit; continue; }
          const consumers = new Set();
          for (const file of commit.files ?? []) {
            for (const path of releaseConsumerPaths(file)) consumers.add(path);
          }
          if (packagePath !== dartPath && commit.files?.includes('package-lock.json') && !commit.files.some((file) => file.startsWith(`${jsPath}/`))) {
            // Read immutable first-parent bytes, not the current branch lock.
            // Missing/unresolvable inputs abort planning rather than omit a fix.
            try {
              const { data } = await target.getGitHubApi().octokit.repos.getCommit({ ...target.repository, ref: commit.sha });
              const parent = data.parents[0]?.sha;
              if (!parent) throw new Error('Missing lockfile parent');
              const [before, after] = await Promise.all([readLock(parent), readLock(commit.sha)]);
              if (dependencyGraphChanged(before, after, jsPath)) consumers.add(jsPath);
            } catch (cause) {
              throw new Error(`Cannot resolve JS lock ownership for ${commit.sha}: ${cause.message}`, { cause });
            }
          }
          yield consumers.size === 0 ? commit : {
            ...commit,
            files: [...new Set([...commit.files, ...[...consumers].map((path) => `${path}/CHANGELOG.md`)])],
          };
        }
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

class IndependentManifest extends Manifest {
  async maybeUpdateExistingPullRequest(existing, candidate) {
    if (existing.body !== candidate.body.toString()) return super.maybeUpdateExistingPullRequest(existing, candidate);
    // The pinned SDK's PR.sha is GitHub's test-merge SHA, not the branch head.
    const repos = this.github.getGitHubApi().octokit.repos;
    const { data: head } = await repos.getBranch({ ...this.repository, branch: existing.headBranchName });
    const headSha = head.commit.sha;
    const { data } = await repos.compareCommitsWithBasehead({
      ...this.repository, basehead: `${this.targetBranch}...${headSha}`,
    });
    // Rebuild from the current base after a peer merge even when notes match.
    // This preserves the peer's manifest entry and satisfies latest-base gates.
    if (data.behind_by > 0) return this.updateExistingPullRequest(existing, candidate);
    const changes = await this.github.buildChangeSet(candidate.updates, this.targetBranch);
    for (const [path, change] of changes) {
      const current = await this.github.getFileContentsOnBranch(path, headSha);
      if (current.parsedContent !== change.content) return this.updateExistingPullRequest(existing, candidate);
    }
    return undefined;
  }
}

// Preserve the actual historical boundary and compare URL without creating aliases
// or rewriting published tags. Inactive after the first js-prefixed release.
class LegacyJsBoundary extends ManifestPlugin {
  async preconfigure(strategies, commits, releases) {
    if (releases[jsPath]?.sha) return strategies;
    let previous;
    for await (const release of this.github.releaseIterator()) {
      if (release.tagName === legacyTag) { previous = release; break; }
    }
    if (previous?.sha !== legacySha) throw new Error(`Missing or mismatched historical release ${legacyTag}`);
    const allowed = new Set();
    let found = false;
    for await (const commit of this.github.mergeCommitIterator(this.targetBranch)) {
      if (commit.sha === previous.sha) { found = true; break; }
      allowed.add(commit.sha);
    }
    if (!found) throw new Error(`${legacyTag} is outside the release branch history`);
    commits[jsPath] = (commits[jsPath] ?? []).filter((commit) => allowed.has(commit.sha));
    releases[jsPath] = { tag: TagName.parse(legacyTag), sha: previous.sha, notes: previous.notes ?? '' };
    return strategies;
  }
}

// The pinned Dart updater mistakes prerelease suffixes for app build numbers.
// A published package must use the planner's version without an extra suffix.
class DartPackageVersion extends ManifestPlugin {
  async run(candidates) {
    for (const { path, pullRequest } of candidates) {
      if (this.repositoryConfig[path]?.releaseType !== 'dart') continue;
      const version = pullRequest.version?.toString();
      const pubspecUpdate = pullRequest.updates.find((update) => update.path === `${path}/pubspec.yaml`);
      if (!version || !pubspecUpdate) throw new Error(`Missing Dart version update for ${path}`);
      parseVersion(version);
      pubspecUpdate.updater = {
        updateContent(content) {
          pubspecField(content, 'version');
          return content.replace(/^version: [^\r\n]+/mu, `version: ${version}`);
        },
      };
    }
    return candidates;
  }
}

export async function createReleaseManifest(github, branch = 'release/1.0', packagePath) {
  if (packagePath !== undefined && !packagePaths.includes(packagePath)) throw new Error('Unknown release package');
  github = withReleaseConsumers(github, packagePath);
  const parsed = await Manifest.fromManifest(github, branch, undefined, undefined, {}, packagePath);
  const manifest = new IndependentManifest(github, branch, parsed.repositoryConfig, parsed.releasedVersions, { ...parsed, plugins: [] });
  manifest.plugins = parsed.plugins;
  if (manifest.repositoryConfig[jsPath] && manifest.releasedVersions[jsPath]?.toString() === legacyVersion) {
    manifest.plugins.unshift(new LegacyJsBoundary(github, branch, manifest.repositoryConfig));
  }
  manifest.plugins.push(new DartPackageVersion(github, branch, manifest.repositoryConfig));
  return manifest;
}

export async function runIndependentReleases(github, branch = 'release/1.0') {
  const failures = [];
  for (const path of packagePaths) {
    try {
      const manifest = await createReleaseManifest(github, branch, path);
      await manifest.createReleases();
      await manifest.createPullRequests();
    } catch (cause) {
      failures.push(new Error(`${path}: release planning failed`, { cause }));
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Independent release failures (other package attempts completed)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.RELEASE_TOKEN) throw new Error('RELEASE_TOKEN is required');
  if (process.env.GITHUB_REPOSITORY !== 'Conalog/patch-map') throw new Error('Unexpected release repository');
  const github = await GitHub.create({ owner: 'Conalog', repo: 'patch-map', token: process.env.RELEASE_TOKEN });
  await runIndependentReleases(github);
}

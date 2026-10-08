import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assetConsumerPaths } from '../../verification/assets/catalog.mjs';
import { parseVersion, pubspecField } from './release-metadata.mjs';

const require = createRequire(new URL('../../verification/package.json', import.meta.url));
const { GitHub, Manifest } = require('release-please');
const { ManifestPlugin } = require('release-please/build/src/plugin.js');
const { TagName } = require('release-please/build/src/util/tag-name.js');
const jsPath = 'packages/javascript';
const dartPath = 'packages/flutter';
const packagePaths = [jsPath, dartPath];
const sharedReleaseFiles = new Set(['package.json', 'package-lock.json', '.nvmrc', 'release-please-config.json']);
const legacyVersion = '1.0.0-alpha.9';
const legacyTag = `v${legacyVersion}`;
const legacySha = '6986c632a47d3443ff17903c416291dfe4120340';

function releaseConsumerPaths(path) {
  const assetConsumers = assetConsumerPaths(path);
  if (assetConsumers.length > 0) return assetConsumers;
  if (path.startsWith('verification/flutter/')) return [dartPath];
  if (path.startsWith('.github/') || path.startsWith('verification/')
    || path.startsWith('conformance/') || sharedReleaseFiles.has(path)) return packagePaths;
  return [];
}

// CommitSplit only sees package-local paths. Project repository release inputs
// onto their consuming package boundaries, preserving each release SHA.
// This changes planner input only; GitHub files and commit history stay intact.
function withReleaseConsumers(github) {
  return new Proxy(github, {
    get(target, key) {
      if (key === 'mergeCommitIterator') return async function* (...args) {
        for await (const commit of target.mergeCommitIterator(...args)) {
          const consumers = new Set();
          for (const file of commit.files ?? []) {
            for (const path of releaseConsumerPaths(file)) consumers.add(path);
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

export async function createReleaseManifest(github, branch = 'release/1.0') {
  github = withReleaseConsumers(github);
  const manifest = await Manifest.fromManifest(github, branch);
  if (manifest.releasedVersions[jsPath]?.toString() === legacyVersion) {
    manifest.plugins.unshift(new LegacyJsBoundary(github, branch, manifest.repositoryConfig));
  }
  manifest.plugins.push(new DartPackageVersion(github, branch, manifest.repositoryConfig));
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.RELEASE_TOKEN) throw new Error('RELEASE_TOKEN is required');
  if (process.env.GITHUB_REPOSITORY !== 'Conalog/patch-map') throw new Error('Unexpected release repository');
  const github = await GitHub.create({ owner: 'Conalog', repo: 'patch-map', token: process.env.RELEASE_TOKEN });
  const manifest = await createReleaseManifest(github, 'release/1.0');
  await manifest.createReleases();
  await manifest.createPullRequests();
}

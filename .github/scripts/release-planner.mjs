import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../verification/package.json', import.meta.url));
const { GitHub, Manifest } = require('release-please');
const { ManifestPlugin } = require('release-please/build/src/plugin.js');
const { TagName } = require('release-please/build/src/util/tag-name.js');
const jsPath = 'packages/javascript';
const legacyVersion = '1.0.0-alpha.9';
const legacyTag = `v${legacyVersion}`;
const legacySha = '6986c632a47d3443ff17903c416291dfe4120340';

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

export async function createReleaseManifest(github, branch = 'release/1.0') {
  const manifest = await Manifest.fromManifest(github, branch);
  if (manifest.releasedVersions[jsPath]?.toString() === legacyVersion) {
    manifest.plugins.unshift(new LegacyJsBoundary(github, branch, manifest.repositoryConfig));
  }
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.RELEASE_TOKEN) throw new Error('RELEASE_TOKEN is required');
  if (process.env.GITHUB_REPOSITORY !== 'Conalog/patch-map') throw new Error('Unexpected release repository');
  const github = await GitHub.create({ owner: 'Conalog', repo: 'patch-map', token: process.env.RELEASE_TOKEN });
  const manifest = await createReleaseManifest(github);
  await manifest.createReleases();
  await manifest.createPullRequests();
}

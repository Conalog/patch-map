import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleaseQualification } from './dart-release.mjs';
import { assertPublishedContents, archiveFiles } from './pub-artifact.mjs';
import { rendererChecks, rendererEvidenceSchema } from '../../verification/flutter/renderer-qualification.mjs';

const digest = 'a'.repeat(64);
function qualifiedInput() {
  const toolchain = { frameworkVersion: '3.41.4', dartSdkVersion: '3.11.1', frameworkRevision: 'framework' };
  const run = (platform) => ({ artifactSha256: digest, toolchain: structuredClone(toolchain), reportSha256: digest,
    events: [...rendererChecks(platform).flatMap((name, id) => [
      { type: 'testStart', test: { id, name, url: 'renderer_release_test.dart' } },
      { type: 'testDone', testID: id, result: 'success' },
    ]), { type: 'done', success: true }],
  });
  return {
    fingerprints: { android: 'android-source', ios: 'ios-source' }, contract: 'contract', artifactSha256: digest, pubspec: 'version: 1.0.0-alpha.1\n',
    toolchains: { ci: { flutter: '3.41.4', dart: '3.11.1', frameworkRevision: 'framework' } },
    report: { installedConsumer: true, contractFingerprint: 'contract', artifactSha256: digest },
    evidence: { schemaRevision: rendererEvidenceSchema, platforms: {
      android: { ...run('android'), sourceFingerprint: 'android-source', device: { targetPlatform: 'android-arm64', sdk: 'Android 14' } },
      ios: { ...run('ios'), sourceFingerprint: 'ios-source', device: { targetPlatform: 'ios', sdk: 'iOS 26.3' } },
    } },
  };
}
test('renderer publication requires both native runs, exact source and installed artifact', () => {
  assert.equal(assertReleaseQualification(qualifiedInput()).qualified, true);
  for (const mutate of [
    (input) => { delete input.evidence.platforms.ios; },
    (input) => { input.evidence.platforms.ios.device.targetPlatform = 'android-arm64'; },
    (input) => { input.evidence.platforms.android.events.pop(); },
    (input) => { input.evidence.platforms.android.events[1].skipped = true; },
    (input) => { input.evidence.platforms.android.events = input.evidence.platforms.ios.events; },
    (input) => { input.evidence.platforms.android.sourceFingerprint = 'old'; },
    (input) => { input.evidence.platforms.android.toolchain.frameworkRevision = 'other'; },
    (input) => { input.evidence.schemaRevision = 'patch-map-conformance/1'; },
    (input) => { input.report.installedConsumer = false; },
    (input) => { input.evidence.platforms.ios.artifactSha256 = 'b'.repeat(64); },
    (input) => { input.artifactSha256 = 'b'.repeat(64); },
  ]) {
    const input = qualifiedInput(); mutate(input);
    assert.throws(() => assertReleaseQualification(input));
  }
});
test('registry retry verifies every published file, allowing only pub omission of .pubignore', () => {
  const report = { files: [{ path: '.pubignore', sha256: 'policy' }, { path: 'lib/conalog_patch_map.dart', sha256: 'source' }] };
  assertPublishedContents({ '.pubignore': 'policy', 'lib/conalog_patch_map.dart': 'source' }, report);
  assertPublishedContents({ 'lib/conalog_patch_map.dart': 'source' }, report, { registry: true });
  for (const files of [{}, { 'lib/conalog_patch_map.dart': 'changed' }, { 'lib/conalog_patch_map.dart': 'source', 'unexpected': 'x' }]) {
    assert.throws(() => assertPublishedContents(files, report, { registry: true }));
  }
});
test('archive inspection refuses traversal, symlinks and duplicate files before extraction', () => {
  const build = (kind) => spawnSync('python3', ['-c', String.raw`
import tarfile, io, sys
with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as tar:
  info = tarfile.TarInfo('../outside' if sys.argv[1] == 'traversal' else 'lib/main.dart')
  if sys.argv[1] == 'symlink': info.type = tarfile.SYMTYPE; info.linkname = '/etc/passwd'
  tar.addfile(info, io.BytesIO())
  if sys.argv[1] == 'duplicate': tar.addfile(info, io.BytesIO())
`, kind]).stdout;
  assert.equal(Object.keys(archiveFiles(build('normal'))).length, 1);
  for (const kind of ['traversal', 'symlink', 'duplicate']) assert.throws(() => archiveFiles(build(kind)), /invalid Dart archive/u);
});


test('publication extraction leaves the ignored repository tree and preserves verified bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'patch-map-extraction-test-'));
  let directory;
  try {
    await mkdir(join(root, '.release-dart'));
    const archive = spawnSync('python3', ['-c', String.raw`
import tarfile, io, sys
payload = b'name: conalog_patch_map\nversion: 1.0.0-alpha.1\n'
with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as tar:
  info = tarfile.TarInfo('pubspec.yaml'); info.size = len(payload)
  tar.addfile(info, io.BytesIO(payload))
`]).stdout;
    const digest = createHash('sha256').update(archive).digest('hex');
    const files = archiveFiles(archive);
    await writeFile(join(root, '.release-dart/conalog_patch_map.tar.gz'), archive);
    // Synthetic qualification belongs only to this isolated archive-path test.
    await writeFile(join(root, '.release-dart/compatibility.json'), JSON.stringify({ qualified: true, dart: { artifactSha256: digest } }));
    await writeFile(join(root, '.release-dart/installed-consumer.json'), JSON.stringify({ installedConsumer: true, artifactSha256: digest, files: Object.entries(files).map(([path, sha256]) => ({ path, sha256 })) }));
    const script = fileURLToPath(new URL('./pub-artifact.mjs', import.meta.url));
    execFileSync(process.execPath, [script, 'extract'], { cwd: root, env: { ...process.env, GITHUB_OUTPUT: join(root, 'output') } });
    directory = await readFile(join(root, '.release-dart/publication-directory.txt'), 'utf8');
    assert.ok(!directory.startsWith(`${root}/`));
    assert.ok(!directory.startsWith(`${resolve('.')}/`));
    assert.match(await readFile(join(directory, 'pubspec.yaml'), 'utf8'), /version: 1.0.0-alpha.1/u);
    assert.equal(await readFile(join(root, 'output'), 'utf8'), `package-directory=${directory}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

test('private candidates cannot qualify for public registry publication', () => {
  const input = qualifiedInput();
  input.pubspec += 'publish_to: none\n';
  assert.throws(() => assertReleaseQualification(input), /cannot qualify/u);
});

test('a failed native retry cannot leave the previous qualification available', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'patch-map-renderer-retry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, '.release-dart');
  await mkdir(output);
  const stale = ['android-renderer.json', 'dart-qualification.json', 'compatibility.json'];
  await Promise.all(stale.map((name) => writeFile(join(output, name), '{}')));
  const script = fileURLToPath(new URL('../../verification/flutter/renderer-qualification.mjs', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [script, 'android', 'missing-device'], { cwd: root, stdio: 'pipe' }), /toolchains\.json/u);
  for (const name of stale) await assert.rejects(readFile(join(output, name)), { code: 'ENOENT' });
});

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

const digest = 'a'.repeat(64);
function qualifiedInput() {
  const schemaRevision = 'patch-map-conformance/1';
  const runtime = { artifactSha256: digest, installedConsumer: true, witnesses: [{ id: 'feature', outcome: 'passed', assertions: ['observed feature'] }] };
  const platform = { outcome: 'passed', rendering: true, input: true, lifecycle: true, assets: true, accessibility: true, capture: true };
  return {
    manifest: { schemaRevision, requirements: [{ id: 'feature', required: true, cases: ['feature'] }], requiredPlatforms: ['android', 'ios'] },
    inventory: [], fingerprint: 'contract', sourceFingerprint: 'sources', artifactSha256: digest,
    report: { installedConsumer: true, contractFingerprint: 'contract', artifactSha256: digest },
    evidence: { schemaRevision, contractFingerprint: 'contract', provenance: { sourceFingerprint: 'sources' },
      runtimes: { npm: structuredClone(runtime), dart: structuredClone(runtime) },
      platforms: { android: structuredClone(platform), ios: structuredClone(platform) } },
  };
}
test('publication requires both platforms, every contract witness, exact source and installed artifact', () => {
  assert.equal(assertReleaseQualification(qualifiedInput()).qualified, true);
  for (const mutate of [
    (input) => { input.evidence.platforms.ios.input = false; },
    (input) => { input.evidence.runtimes.npm.witnesses = []; },
    (input) => { input.evidence.provenance.sourceFingerprint = 'old'; },
    (input) => { input.report.installedConsumer = false; },
    (input) => { input.evidence.runtimes.dart.artifactSha256 = 'b'.repeat(64); },
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

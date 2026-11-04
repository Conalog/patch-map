import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { pubspecField } from './release-metadata.mjs';
import { archiveFiles, assertPublishedContents } from './pub-artifact.mjs';
import { verifyInstalledDartConsumer } from '../../verification/flutter/installed-consumer.mjs';
import { contractFingerprint } from '../../verification/conformance/compare.mjs';
import { snapshotSources } from '../../verification/conformance/collect-evidence.mjs';
import { rendererChecks, rendererEvidenceSchema, rendererPlatforms, rendererSourceFingerprint, verifyRendererRun } from '../../verification/flutter/renderer-qualification.mjs';
import { readToolchains } from '../../verification/flutter/toolchains.mjs';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function assertReleaseQualification({ evidence, fingerprints, contract, report, artifactSha256, toolchains, pubspec }) {
  if (/^publish_to:/mu.test(pubspec)) throw new Error('private or custom-registry Dart artifacts cannot qualify for pub.dev');
  if (evidence?.schemaRevision !== rendererEvidenceSchema) throw new Error('renderer release evidence is required');
  if (report.installedConsumer !== true || report.contractFingerprint !== contract || report.artifactSha256 !== artifactSha256) {
    throw new Error('renderer qualification requires the exact installed Dart artifact');
  }
  for (const platform of rendererPlatforms) {
    verifyRendererRun(evidence.platforms?.[platform], { platform, sourceFingerprint: fingerprints[platform], artifactSha256, toolchains });
  }
  return { qualified: true, qualifiedPlatforms: rendererPlatforms, checks: Object.fromEntries(rendererPlatforms.map((platform) => [platform, rendererChecks(platform)])) };
}

async function main() {
  const [command, evidencePath] = process.argv.slice(2);
  if (command === 'prepare') {
    const report = await verifyInstalledDartConsumer();
    await mkdir('.release-dart', { recursive: true });
    await copyFile(report.artifactPath, '.release-dart/conalog_patch_map.tar.gz');
    await copyFile(report.reportPath, '.release-dart/installed-consumer.json');
    await writeFile('.release-dart/source-snapshot.json', `${JSON.stringify(await snapshotSources(process.cwd()), null, 2)}\n`);
    console.log(`Verified Dart artifact ${report.artifactSha256}`);
    return;
  }
  if (command !== 'collect' && (command !== 'qualify' || !evidencePath)) {
    throw new Error('usage: dart-release.mjs prepare | collect | qualify <dart-qualification.json>');
  }
  await rm('.release-dart/compatibility.json', { force: true });
  if (command === 'collect') await rm('.release-dart/dart-qualification.json', { force: true });
  const platformEntries = (read) => Promise.all(rendererPlatforms.map(async (platform) => [platform, await read(platform)])).then(Object.fromEntries);
  async function readNativeReceipt(platform) {
    const [receipt, log] = await Promise.all([
      json(`.release-dart/${platform}-renderer.json`), readFile(`.release-dart/${platform}-renderer.log`),
    ]);
    if (receipt.reportSha256 !== sha(log)) throw new Error(`${platform}: native test log differs from its receipt`);
    return receipt;
  }
  const [evidence, report, contract, artifact, pubspec, fingerprints] = await Promise.all([
    command === 'collect' ? platformEntries(readNativeReceipt)
      .then((platforms) => ({ schemaRevision: rendererEvidenceSchema, platforms })) : json(evidencePath),
    json('.release-dart/installed-consumer.json'), contractFingerprint(), readFile('.release-dart/conalog_patch_map.tar.gz'),
    readFile('packages/flutter/pubspec.yaml', 'utf8'), platformEntries((platform) => rendererSourceFingerprint(process.cwd(), platform)),
  ]);
  const artifactSha256 = sha(artifact);
  const files = archiveFiles(artifact);
  assertPublishedContents(files, report);
  if (files['pubspec.yaml'] !== sha(pubspec)) throw new Error('renderer qualification pubspec differs from the installed artifact');
  const result = assertReleaseQualification({ evidence, fingerprints, contract, report, artifactSha256, toolchains: readToolchains(), pubspec });
  const evidenceBytes = command === 'collect' ? `${JSON.stringify(evidence, null, 2)}\n` : await readFile(evidencePath);
  if (command === 'collect') await writeFile('.release-dart/dart-qualification.json', evidenceBytes);
  await writeFile('.release-dart/compatibility.json', `${JSON.stringify({
    schemaRevision: 'patch-map-dart-renderer-qualification/1', scope: 'flutter-renderer', ...result,
    contractFingerprint: contract, sourceFingerprints: fingerprints,
    dart: { version: pubspecField(pubspec, 'version'), artifactSha256 },
    publication: 'not-recorded', evidenceSha256: sha(evidenceBytes),
  }, null, 2)}\n`);
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

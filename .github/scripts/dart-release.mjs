import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { pubspecField } from './release-metadata.mjs';
import { verifyInstalledDartConsumer } from '../../verification/flutter/installed-consumer.mjs';
import { contractFingerprint, qualify } from '../../verification/conformance/compare.mjs';
import { snapshotSources } from '../../verification/conformance/collect-evidence.mjs';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function assertReleaseQualification({ evidence, manifest, inventory, fingerprint, sourceFingerprint, report, artifactSha256 }) {
  const result = qualify(manifest, inventory, evidence, fingerprint);
  if (!result.qualified) throw new Error(`incomplete release qualification: ${result.failures.join('; ')}`);
  if (evidence.provenance?.sourceFingerprint !== sourceFingerprint ||
      report.installedConsumer !== true || report.contractFingerprint !== fingerprint ||
      report.artifactSha256 !== artifactSha256 || evidence.runtimes.dart.artifactSha256 !== artifactSha256) {
    throw new Error('qualification must identify the current source and exact installed Dart artifact');
  }
  return result;
}

async function main() {
  const [command, evidencePath] = process.argv.slice(2);
  if (command === 'prepare') {
    const report = await verifyInstalledDartConsumer();
    await mkdir('.release-dart', { recursive: true });
    await copyFile(report.artifactPath, '.release-dart/patch_map.tar.gz');
    await copyFile(report.reportPath, '.release-dart/installed-consumer.json');
    await writeFile('.release-dart/source-snapshot.json', `${JSON.stringify(await snapshotSources(process.cwd()), null, 2)}\n`);
    console.log(`Verified Dart artifact ${report.artifactSha256}`);
    return;
  }
  if (command !== 'qualify' || !evidencePath) throw new Error('usage: dart-release.mjs prepare | qualify <collected-evidence.json>');
  const [evidence, manifest, inventory, report, snapshot, fingerprint, artifact] = await Promise.all([
    json(evidencePath), json('conformance/manifest.json'), json('conformance/public-api.json'),
    json('.release-dart/installed-consumer.json'), snapshotSources(process.cwd()), contractFingerprint(), readFile('.release-dart/patch_map.tar.gz'),
  ]);
  const result = assertReleaseQualification({ evidence, manifest, inventory, fingerprint, sourceFingerprint: snapshot.fingerprint, report, artifactSha256: sha(artifact) });
  const npm = await json('packages/javascript/package.json');
  await writeFile('.release-dart/compatibility.json', `${JSON.stringify({
    schemaRevision: 'patch-map-release-compatibility/1', qualified: result.qualified,
    contractRevision: manifest.contractRevision, contractFingerprint: fingerprint, sourceFingerprint: snapshot.fingerprint,
    npm: { version: npm.version, artifactSha256: evidence.runtimes.npm.artifactSha256 },
    dart: { version: pubspecField(await readFile('packages/flutter/pubspec.yaml', 'utf8'), 'version'), artifactSha256: report.artifactSha256 }, qualifiedPlatforms: manifest.requiredPlatforms,
    capabilities: manifest.requirements.map(({ id }) => id),
    // This is qualification, not a claim that either registry write succeeded.
    publication: 'not-recorded', evidenceSha256: sha(await readFile(evidencePath)),
  }, null, 2)}\n`);
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

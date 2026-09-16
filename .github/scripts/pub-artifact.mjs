import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseVersion, pubspecField } from './release-metadata.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Read bytes without extracting links or traversal paths. Pub omits .pubignore
// itself, while our installed-consumer archive preserves that packaging policy.
const INSPECT = String.raw`
import sys, tarfile, io, json, hashlib, pathlib
result = {}
destination = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
with tarfile.open(fileobj=io.BytesIO(sys.stdin.buffer.read()), mode='r:gz') as tar:
  for member in tar.getmembers():
    path = pathlib.PurePosixPath(member.name)
    if path.is_absolute() or '..' in path.parts or member.issym() or member.islnk():
      raise RuntimeError('unsafe package archive member')
    if member.isdir(): continue
    if not member.isfile() or str(path) in result: raise RuntimeError('invalid package archive entry')
    content = tar.extractfile(member).read()
    result[str(path)] = hashlib.sha256(content).hexdigest()
    if destination:
      target = destination / path
      target.parent.mkdir(parents=True, exist_ok=True)
      target.write_bytes(content)
print(json.dumps(result))
`;
export function archiveFiles(bytes, destination) {
  const result = spawnSync('python3', ['-c', INSPECT, ...(destination ? [destination] : [])], { input: bytes, maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`invalid Dart archive: ${result.stderr}`);
  return JSON.parse(result.stdout.toString());
}
export function assertPublishedContents(files, report, { registry = false } = {}) {
  const expected = Object.fromEntries(report.files.filter(({ path }) => !registry || path !== '.pubignore').map(({ path, sha256 }) => [path, sha256]));
  if (Object.keys(files).length !== Object.keys(expected).length || Object.entries(expected).some(([path, digest]) => files[path] !== digest)) {
    throw new Error('published Dart contents differ from the qualified artifact');
  }
}
async function main() {
  const command = process.argv[2];
  const report = JSON.parse(readFileSync('.release-dart/installed-consumer.json', 'utf8'));
  const compatibility = JSON.parse(readFileSync('.release-dart/compatibility.json', 'utf8'));
  const bytes = readFileSync('.release-dart/patch_map.tar.gz');
  if (!report.installedConsumer || compatibility.qualified !== true || hash(bytes) !== report.artifactSha256 || hash(bytes) !== compatibility.dart.artifactSha256) throw new Error('Dart artifact digest or qualification mismatch');
  assertPublishedContents(archiveFiles(bytes), report);
  if (command === 'extract') {
    // Outside the checkout: pub honors ancestor .gitignore entries, so an
    // artifact directory ignored by the repository would publish an empty package.
    const directory = mkdtempSync(join(tmpdir(), 'patch-map-pub-'));
    archiveFiles(bytes, directory);
    writeFileSync('.release-dart/publication-directory.txt', directory);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `package-directory=${directory}\n`);
    console.log(directory);
    return;
  }
  if (command !== 'registry') throw new Error('usage: pub-artifact.mjs extract | registry');
  const version = process.env.PACKAGE_VERSION;
  parseVersion(version);
  const directory = readFileSync('.release-dart/publication-directory.txt', 'utf8');
  const pubspec = readFileSync(join(directory, 'pubspec.yaml'), 'utf8');
  if (pubspecField(pubspec, 'name') !== 'patch_map' || pubspecField(pubspec, 'version') !== version) throw new Error('qualified Dart artifact identity mismatch');
  const response = await fetch(`https://pub.dev/api/packages/patch_map/versions/${version}`, { signal: AbortSignal.timeout(30000) });
  let published = false;
  if (response.ok) {
    const metadata = await response.json();
    const archive = await fetch(`https://pub.dev/api/archives/patch_map-${version}.tar.gz`, { signal: AbortSignal.timeout(30000) });
    if (!archive.ok) throw new Error(`cannot verify existing pub.dev archive: ${archive.status}`);
    const publishedBytes = Buffer.from(await archive.arrayBuffer());
    if (hash(publishedBytes) !== metadata.archive_sha256) throw new Error('pub.dev archive integrity mismatch');
    assertPublishedContents(archiveFiles(publishedBytes), report, { registry: true });
    published = true;
  } else if (response.status !== 404) throw new Error(`cannot establish pub.dev publication state: ${response.status}`);
  appendFileSync(process.env.GITHUB_OUTPUT, `already-published=${published}\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

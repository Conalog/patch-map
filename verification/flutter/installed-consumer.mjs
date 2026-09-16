import { readdir, readFile, writeFile, mkdir, mkdtemp, lstat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyFlutterPackage, dartImportViolations } from './package.mjs';
import { contractFingerprint } from '../conformance/compare.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ROOT_FILES = new Set(['pubspec.yaml', 'README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.pubignore', 'analysis_options.yaml']);
const EXCLUDED = new Set(['example', 'test', 'tool', 'build', 'coverage', '.dart_tool', '.gitignore', 'pubspec.lock', '.flutter-plugins-dependencies']);
export async function publicationFiles(packageRoot) {
  const files = [];
  async function visit(directory) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, item.name);
      if (item.isSymbolicLink()) throw new Error(`Dart artifact cannot contain symlinks: ${path}`);
      if (item.isDirectory()) await visit(path);
      else if (item.isFile()) files.push(relative(packageRoot, path).split('\\').join('/'));
      else throw new Error(`Unsupported artifact entry: ${path}`);
    }
  }
  for (const entry of await readdir(packageRoot, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    if (entry.name === 'lib' || entry.name === 'assets') {
      if (!entry.isDirectory()) throw new Error(`Dart product directory cannot be a symlink: ${entry.name}`);
      await visit(resolve(packageRoot, entry.name));
    }
    else if (ROOT_FILES.has(entry.name) && entry.isFile()) files.push(entry.name);
    else throw new Error(`Unreviewed Dart publication input: ${entry.name}`);
  }
  return files.sort();
}
const ARCHIVE = String.raw`
import sys, json, tarfile, gzip, io, pathlib
source, archive, extracted, paths = sys.argv[1:]
with open(archive, 'wb') as output:
  with gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0) as compressed:
    with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as tar:
      for name in json.loads(paths):
        content = (pathlib.Path(source) / name).read_bytes()
        info = tarfile.TarInfo(name)
        info.size = len(content); info.mode = 0o644; info.mtime = 0; info.uid = 0; info.gid = 0
        tar.addfile(info, io.BytesIO(content))
with tarfile.open(archive, 'r:gz') as tar:
  for member in tar.getmembers():
    target = pathlib.Path(extracted) / member.name
    if not member.isfile() or '..' in pathlib.PurePosixPath(member.name).parts or member.name.startswith('/'):
      raise RuntimeError('unsafe publication archive member')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(tar.extractfile(member).read())
`;
function command(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { command: [executable, ...args], status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export async function verifyInstalledDartConsumer({ root = process.cwd(), flutter = process.env.FLUTTER_BIN ?? 'flutter', prepareOnly = false } = {}) {
  await verifyFlutterPackage(root);
  const packageRoot = resolve(root, 'packages/flutter');
  const filenames = await publicationFiles(packageRoot);
  const inputs = [];
  for (const path of filenames) {
    const bytes = await readFile(resolve(packageRoot, path));
    inputs.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  const outputRoot = resolve(root, '.artifacts/flutter');
  await mkdir(outputRoot, { recursive: true });
  const workspace = await mkdtemp(resolve(outputRoot, 'installed-consumer-'));
  const archive = resolve(workspace, 'conalog_patch_map.tar.gz'), installed = resolve(workspace, 'package'), consumer = resolve(workspace, 'consumer');
  const packed = command('python3', ['-c', ARCHIVE, packageRoot, archive, installed, JSON.stringify(filenames)], root);
  if (packed.status !== 0) throw new Error(`Dart packaging failed: ${packed.stderr}`);
  for (const input of inputs) {
    const bytes = await readFile(resolve(installed, input.path));
    if (hash(bytes) !== input.sha256) throw new Error(`Source changed during packaging: ${input.path}`);
    if (input.path.startsWith('lib/') && input.path.endsWith('.dart')) {
      const errors = dartImportViolations(bytes.toString(), resolve(installed, input.path), installed);
      if (errors.length) throw new Error(errors.join('\n'));
    }
  }
  for (const forbidden of ['example', 'test', '.dart_tool', 'pubspec.lock']) {
    if (await lstat(resolve(installed, forbidden)).catch(() => null)) throw new Error(`Artifact contains ${forbidden}`);
  }
  await mkdir(resolve(consumer, 'test'), { recursive: true });
  await writeFile(resolve(consumer, 'pubspec.yaml'), `name: patch_map_installed_consumer\npublish_to: none\nenvironment:\n  sdk: '>=3.11.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\n  conalog_patch_map:\n    path: ../package\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n`);
  const consumerSource = await readFile(resolve(root, 'verification/flutter/installed-consumer.dart'));
  await writeFile(resolve(consumer, 'test/installed_consumer_test.dart'), consumerSource);
  const report = {
    schemaRevision: 'patch-map-installed-dart/1', contractFingerprint: await contractFingerprint(root),
    artifactSha256: hash(await readFile(archive)), artifactPath: relative(root, archive),
    contentsSha256: hash(JSON.stringify(inputs)), files: inputs,
    consumerSourceSha256: hash(consumerSource), installedConsumer: false, prepared: true,
    stages: [], assertions: [], platform: 'flutter-test-host', scope: 'installed public import, bundled native assets, controller query/pre-attachment mutation refusal/empty history/destroy; Widget input/capture and OS qualification remain separate',
  };
  const reportPath = resolve(workspace, 'report.json');
  const save = () => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await save();
  if (!prepareOnly) {
    const version = command(flutter, ['--version', '--machine'], consumer);
    if (version.status !== 0) throw new Error(`Flutter version failed: ${version.stderr}`);
    report.toolchain = JSON.parse(version.stdout);
    for (const [name, args] of [['pub-get', ['pub', 'get', '--offline']], ['analyze', ['analyze', '--no-pub', 'test/installed_consumer_test.dart']], ['test', ['test', '--no-pub', '--concurrency=1', '--timeout=30s', '--machine', 'test/installed_consumer_test.dart']]]) {
      const run = command(flutter, args, consumer);
      const log = `${name}.log`;
      await writeFile(resolve(workspace, log), `${run.stdout}\n${run.stderr}`);
      report.stages.push({ name, status: run.status, command: run.command, log, logSha256: hash(`${run.stdout}\n${run.stderr}`) });
      await save();
      if (run.status !== 0) throw new Error(`Installed Dart ${name} failed; see ${relative(root, resolve(workspace, log))}`);
      if (name === 'pub-get') report.dependencyLockSha256 = hash(await readFile(resolve(consumer, 'pubspec.lock')));
      if (name === 'test') {
        const events = run.stdout.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
        const tests = new Map(events.filter((event) => event.type === 'testStart').map((event) => [event.test.id, event.test.name]));
        report.assertions = events.filter((event) => event.type === 'testDone' && event.result === 'success' && event.hidden !== true && !event.skipped).map((event) => tests.get(event.testID));
        if (events.at(-1)?.type !== 'done' || events.at(-1)?.success !== true || report.assertions.length !== 2) throw new Error('Installed Dart consumer did not execute both required assertions');
      }
    }
    // The archive remains valid even if work continues; qualification must name
    // this exact contract/input snapshot rather than calling newer sources tested.
    report.installedConsumer = true;
    await save();
  }
  return { reportPath, ...report };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyInstalledDartConsumer({ prepareOnly: process.argv.includes('--prepare-only') });
  console.log(JSON.stringify({ reportPath: result.reportPath, artifactSha256: result.artifactSha256, contentsSha256: result.contentsSha256, files: result.files.length, installedConsumer: result.installedConsumer, assertions: result.assertions }));
}

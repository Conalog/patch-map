import { execFile, spawnSync } from 'node:child_process';
import { readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseDartReport, snapshotNativeSources } from '../conformance/collect-evidence.mjs';
import { identifyToolchain, readToolchains } from './toolchains.mjs';

export const rendererPlatforms = ['android', 'ios'];
export const rendererChecks = (platform) => [
  `release checks execute on ${platform}`,
  'native foundation mounts, decodes assets and tears down',
  'native map selects a tapped item, paints updates and detaches',
  'native alpha layers preserve assets, values and replacement',
];
export const rendererEvidenceSchema = 'patch-map-dart-renderer-evidence/1';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const nativeTest = 'integration_test/renderer_release_test.dart';
const nativeTestPath = `packages/flutter/example/${nativeTest}`;
const producers = [
  'verification/flutter/renderer-qualification.mjs', 'verification/flutter/toolchains.mjs',
  'verification/conformance/collect-evidence.mjs', 'verification/conformance/inputs.mjs',
];

// The host uses its checked-in lock, independent of the library's unlocked resolution.
async function rendererSourceInputs(root, platform) {
  const { files } = await snapshotNativeSources(root, platform);
  delete files['packages/flutter/pubspec.lock'];
  const producerHashes = await Promise.all(producers.map(async (path) => [path, hash(await readFile(resolve(root, path)))]));
  return { files, producers: producerHashes };
}

export async function rendererSourceFingerprint(root, platform) {
  return hash(JSON.stringify(await rendererSourceInputs(root, platform)));
}

function checkedTests(events) {
  if (!Array.isArray(events)) throw new Error('Missing renderer machine test events');
  return parseDartReport('.', events.map((event) => JSON.stringify(event)).join('\n'))
    .filter(({ skipped }) => !skipped).map(({ fullName }) => fullName);
}

export function verifyRendererRun(run, { platform, sourceFingerprint, artifactSha256, toolchains }) {
  const target = run?.device?.targetPlatform;
  if (typeof run?.device?.sdk !== 'string' || typeof target !== 'string' ||
    (platform === 'android' ? !target.startsWith('android-') : target !== 'ios')) {
    throw new Error(`${platform}: wrong or missing native test device`);
  }
  identifyToolchain(run.toolchain, toolchains, 'ci');
  if (run.sourceFingerprint !== sourceFingerprint || run.artifactSha256 !== artifactSha256) {
    throw new Error(`${platform}: renderer evidence does not identify the current source and artifact`);
  }
  const expected = rendererChecks(platform);
  const tests = checkedTests(run.events);
  if (!/^[a-f0-9]{64}$/u.test(run.reportSha256 ?? '') || tests.length !== expected.length || expected.some((name) => !tests.includes(name))) {
    throw new Error(`${platform}: required renderer integration checks did not pass`);
  }
}

async function main() {
  const [platform, deviceId] = process.argv.slice(2);
  if (!rendererPlatforms.includes(platform) || !deviceId) throw new Error('usage: renderer-qualification.mjs android|ios <flutter-device-id>');
  const root = process.cwd();
  const out = resolve(root, '.release-dart');
  const receiptPath = resolve(out, `${platform}-renderer.json`);
  // A new attempt supersedes the prior receipt, even if it fails before testing.
  await Promise.all([receiptPath, resolve(out, 'dart-qualification.json'), resolve(out, 'compatibility.json')]
    .map((path) => rm(path, { force: true })));
  const packageRoot = resolve(root, 'packages/flutter');
  const cwd = resolve(packageRoot, 'example');
  const flutter = process.env.FLUTTER_BIN ?? 'flutter';
  const maxBuffer = 16 * 1024 * 1024;
  function run(args) {
    const result = spawnSync(flutter, args, { cwd, encoding: 'utf8', maxBuffer, timeout: 5 * 60_000, killSignal: 'SIGKILL' });
    if (result.error) throw new Error(`Flutter ${args.join(' ')}: ${result.error.message}\n${result.stdout}\n${result.stderr}`);
    return result;
  }
  function successful(args) {
    const result = run(args);
    if (result.status !== 0) throw new Error(`Flutter ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  }
  const toolchains = readToolchains(root);
  const toolchain = JSON.parse(successful(['--version', '--machine']));
  identifyToolchain(toolchain, toolchains, 'ci');
  console.log(`Looking up the ${platform} test device`);
  const device = JSON.parse(successful(['devices', '--machine'])).find(({ id }) => id === deviceId);
  if (!device || !(platform === 'android' ? device.targetPlatform?.startsWith('android-') : device.targetPlatform === 'ios')) {
    throw new Error(`${deviceId} is not an available ${platform} device`);
  }
  const artifactSha256 = hash(await readFile(resolve(out, 'conalog_patch_map.tar.gz')));
  const report = await json(resolve(out, 'installed-consumer.json'));
  if (report.installedConsumer !== true || report.artifactSha256 !== artifactSha256) throw new Error('Prepare the installed Dart artifact before running the renderer checks');
  async function verifyPackageInputs() {
    for (const { path, sha256 } of report.files) {
      if (hash(await readFile(resolve(packageRoot, path))) !== sha256) throw new Error(`Renderer test package differs from the installed artifact: ${path}`);
    }
  }
  console.log('Installing the example dependencies from its lockfile');
  successful(['pub', 'get', '--enforce-lockfile']);
  const config = resolve(cwd, '.dart_tool/package_config.json');
  const dependency = (await json(config)).packages.find(({ name }) => name === 'conalog_patch_map');
  if (!dependency || await realpath(fileURLToPath(new URL(dependency.rootUri, pathToFileURL(config)))) !== packageRoot) {
    throw new Error('Renderer tests do not resolve the release package');
  }
  await verifyPackageInputs();
  const inputsBefore = await rendererSourceInputs(root, platform);
  const sourceFingerprint = hash(JSON.stringify(inputsBefore));
  console.log(`Starting the ${platform} renderer tests`);
  const result = await new Promise((resolve) => {
    const args = ['test', '--no-pub', '--machine', '-d', deviceId, `--dart-define=PATCH_MAP_RELEASE_PLATFORM=${platform}`, nativeTest];
    const child = execFile(flutter, args, { cwd, encoding: 'utf8', maxBuffer, timeout: 12 * 60_000, killSignal: 'SIGKILL' },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }));
    child.stdout.pipe(process.stdout, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
  });
  const log = resolve(out, `${platform}-renderer.log`);
  await writeFile(log, `${result.stdout}\n${result.stderr}`);
  if (result.error) {
    const reason = result.error.signal ?? result.error.code ?? 'unknown error';
    throw new Error(`${platform} renderer tests failed (${reason}); see ${log}`);
  }
  const machine = result.stdout.split(/\r?\n/u).filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
  const suites = machine.filter(({ type }) => type === 'suite');
  if (suites.length !== 1 || resolve(cwd, suites[0].suite.path) !== resolve(root, nativeTestPath)) throw new Error('Unexpected renderer integration test suite');
  // Keep the pass/fail transcript portable and leave local paths and device IDs in the raw log.
  const events = [];
  for (const event of machine) {
    if (event.type === 'testStart') {
      const { id, name } = event.test;
      events.push({ type: event.type, test: { id, name: name.startsWith('loading ') ? 'loading renderer suite' : name, url: nativeTestPath } });
    } else if (event.type === 'testDone') {
      const { type, testID, result, skipped, hidden } = event;
      events.push({ type, testID, result, skipped, hidden });
    } else if (event.type === 'done' || event.type === 'error') {
      events.push({ type: event.type, success: event.success });
    }
  }
  await verifyPackageInputs();
  const inputsAfter = await rendererSourceInputs(root, platform);
  if (hash(JSON.stringify(inputsAfter)) !== sourceFingerprint) {
    const before = { ...inputsBefore.files, ...Object.fromEntries(inputsBefore.producers) };
    const after = { ...inputsAfter.files, ...Object.fromEntries(inputsAfter.producers) };
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((path) => before[path] !== after[path])
      .map((path) => `${!before[path] ? 'added' : !after[path] ? 'removed' : 'modified'}: ${path}`);
    throw new Error(`${platform}: source inputs changed during verification\n${changed.join('\n')}`);
  }
  const receipt = { sourceFingerprint, artifactSha256, toolchain, device: { targetPlatform: device.targetPlatform, sdk: device.sdk, emulator: device.emulator }, events, reportSha256: hash(`${result.stdout}\n${result.stderr}`) };
  verifyRendererRun(receipt, { platform, sourceFingerprint, artifactSha256, toolchains });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Verified ${platform} renderer: ${rendererChecks(platform).length} checks; ${receiptPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

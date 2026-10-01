import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyInstalledDartConsumer } from './installed-consumer.mjs';
import { sha256 } from './package.mjs';
import { readToolchains, assertFvmPin, identifyToolchain } from './toolchains.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourcePackageRoot = join(root, 'packages/flutter');
let packageRoot = sourcePackageRoot;
const mode = process.argv[2] ?? 'verify';
if (!['analyze', 'test', 'package', 'verify'].includes(mode)) throw new Error('usage: run.mjs [analyze|test|package|verify]');
const flutter = realpathSync(process.env.FLUTTER_BIN ?? execFileSync('which', ['flutter'], { encoding: 'utf8' }).trim());
const dart = join(dirname(flutter), 'dart');
const sdk = JSON.parse(execFileSync(flutter, ['--version', '--machine'], { encoding: 'utf8' }));
const toolchains = readToolchains(root);
assertFvmPin(root, toolchains);
const role = identifyToolchain(sdk, toolchains, process.env.FLUTTER_TOOLCHAIN_ROLE);
let sdkWorkspace;
if (role !== 'ci') {
  sdkWorkspace = mkdtempSync(join(tmpdir(), 'patch-map-sdk-'));
  packageRoot = join(sdkWorkspace, 'package');
  cpSync(sourcePackageRoot, packageRoot, { recursive: true, filter: (path) => !/(?:^|\/)(?:\.dart_tool|\.fvm|build|\.symlinks)(?:\/|$)/u.test(path) });
  process.on('exit', () => rmSync(sdkWorkspace, { recursive: true, force: true }));
}
const exampleRoot = join(packageRoot, 'example');
const artifactRoot = join(root, '.artifacts/flutter');
mkdirSync(artifactRoot, { recursive: true });
const report = { scope: 'foundation tooling and installed import/SVG/font only', mode, toolchain: sdk, toolchainRole: role, flutter, dart, stages: [], inputHashes: {} };
for (const path of ['pubspec.yaml', '.fvmrc', 'toolchains.json', 'example/pubspec.yaml']) report.inputHashes[path] = sha256(readFileSync(join(packageRoot, path)));
const reportPath = join(artifactRoot, `verification-${role}-${mode}.json`);
const save = () => writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  process.stdout.write(output);
  const log = `${role}-${mode}-${report.stages.length}.log`;
  writeFileSync(join(artifactRoot, log), output);
  report.stages.push({ command: [command, ...args], cwd, status: result.status, log, logSha256: sha256(output) });
  save();
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Flutter stage failed; see ${join(artifactRoot, log)}`);
}
save();
run(flutter, ['pub', 'get'], packageRoot);
if (role !== 'ci') run(flutter, ['pub', 'get'], exampleRoot);
run(flutter, ['pub', 'get', '--enforce-lockfile'], exampleRoot);
report.exampleLockSha256 = sha256(readFileSync(join(exampleRoot, 'pubspec.lock')));
if (mode === 'analyze' || mode === 'verify') {
  const directories = ['lib', 'example/lib', 'example/test', 'example/integration_test', 'test'].filter((path) => existsSync(join(packageRoot, path)));
  run(dart, ['format', '--output=none', '--set-exit-if-changed', ...directories], packageRoot);
  run(flutter, ['analyze', '--no-pub', '--fatal-infos'], packageRoot);
}
if (mode === 'test' || mode === 'verify') {
  if (existsSync(join(packageRoot, 'test'))) run(flutter, ['test', '--no-pub'], packageRoot);
  run(flutter, ['test', '--no-pub'], exampleRoot);
}
if (mode === 'package' || mode === 'verify') {
  const installed = await verifyInstalledDartConsumer({ root, flutter });
  report.installedConsumerReport = installed.reportPath;
  report.artifactSha256 = installed.artifactSha256;
  report.contentsSha256 = installed.contentsSha256;
}
report.success = true;
save();
console.log(`Verified ${role} ${sdk.frameworkVersion}/${sdk.dartSdkVersion}; report: ${reportPath}`);

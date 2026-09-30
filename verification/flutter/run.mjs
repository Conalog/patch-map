import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packageRoot = join(root, 'packages/flutter');
const exampleRoot = join(packageRoot, 'example');
const mode = process.argv[2] ?? 'verify';
if (!['analyze', 'test', 'package', 'verify'].includes(mode)) {
  throw new Error('usage: run.mjs [analyze|test|package|verify]');
}

const sdk = JSON.parse(capture('flutter', ['--version', '--machine'], root));
const pin = JSON.parse(readFileSync(join(packageRoot, '.fvmrc'), 'utf8')).flutter;
if (sdk.frameworkVersion !== pin || sdk.dartSdkVersion !== '3.11.1') {
  throw new Error(`Use Flutter ${pin} / Dart 3.11.1; found ${sdk.frameworkVersion} / ${sdk.dartSdkVersion}`);
}

run('flutter', ['pub', 'get'], packageRoot);
run('flutter', ['pub', 'get', '--enforce-lockfile'], exampleRoot);

if (mode === 'analyze' || mode === 'verify') {
  run('dart', ['format', '--output=none', '--set-exit-if-changed', 'lib', 'example/lib', 'example/test'], packageRoot);
  run('flutter', ['analyze', '--no-pub', '--fatal-infos'], packageRoot);
}
if (mode === 'test' || mode === 'verify') {
  if (existsSync(join(packageRoot, 'test'))) {
    run('flutter', ['test', '--no-pub'], packageRoot);
  }
  run('flutter', ['test', '--no-pub'], exampleRoot);
}
if (mode === 'package' || mode === 'verify') verifyPackage();

function verifyPackage() {
  const temporary = mkdtempSync(join(tmpdir(), 'patch-map-flutter-'));
  try {
    const snapshot = join(temporary, 'source');
    const files = capture('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'packages/flutter'], root)
      .split('\0').filter(Boolean);
    for (const file of files) {
      const relative = file.slice('packages/flutter/'.length);
      const target = join(snapshot, relative);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, file), target);
    }
    run('flutter', ['pub', 'get'], snapshot);
    run('flutter', ['pub', 'publish', '--dry-run'], snapshot);

    // Dart 3.11.1's archive-only option uses pub's actual file selection.
    // No authentication or upload occurs. Keep it tied to the pinned SDK.
    const artifactRoot = join(root, '.artifacts/flutter');
    mkdirSync(artifactRoot, { recursive: true });
    const archive = join(artifactRoot, 'package.tar.gz');
    run('flutter', ['pub', 'publish', `--to-archive=${archive}`], snapshot);

    const entries = capture('tar', ['-tzf', archive], root).trim().split('\n');
    const required = ['pubspec.yaml', 'README.md', 'CHANGELOG.md', 'LICENSE', 'lib/conalog_patch_map.dart', 'example/lib/main.dart', 'example/pubspec.yaml'];
    const allowed = /^(?:lib\/(?:[a-zA-Z0-9_/-]+\.dart)?|example\/(?:lib\/(?:[a-zA-Z0-9_/-]+\.dart)?|pubspec\.yaml)?|pubspec\.yaml|README\.md|CHANGELOG\.md|LICENSE)$/u;
    const directories = new Set(['lib', 'example', 'example/lib']);
    const unexpected = entries.filter((entry) => !directories.has(entry) && !allowed.test(entry));
    const missing = required.filter((entry) => !entries.includes(entry));
    if (unexpected.length || missing.length) {
      throw new Error(`Unexpected package files: ${unexpected.join(', ')}; missing: ${missing.join(', ')}`);
    }

    const consumer = join(temporary, 'installed');
    mkdirSync(consumer);
    run('tar', ['-xzf', archive, '-C', consumer], root);
    run('flutter', ['pub', 'get'], join(consumer, 'example'));
    run('flutter', ['analyze', '--no-pub', '--fatal-infos'], join(consumer, 'example'));
    console.log(`Verified ${entries.length} package entries and the example's dependency on extracted package sources`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function capture(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' });
}

import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseVersion } from './release-metadata.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const JS_PATH = 'packages/javascript';
const DART_PATH = 'packages/flutter';
const RELEASE_METADATA_PATHS = new Set([
  `${JS_PATH}/package.json`, 'package-lock.json', '.release-please-manifest.json',
]);

export function isLightweightValidationPath(path) {
  return path === 'CONTRIBUTING.md'
    || path.startsWith('docs/engineering/');
}

export function requiresFlutterValidation(path) {
  return path.startsWith('packages/flutter/')
    || path.startsWith('shared/assets/')
    || path.startsWith('verification/assets/')
    || path.startsWith('conformance/')
    || path.startsWith('verification/conformance/')
    || path.startsWith('verification/flutter/')
    || (path.startsWith('packages/javascript/docs/') && !path.endsWith('.md'))
    || ['package.json', 'package-lock.json', '.nvmrc',
      'verification/package.json', 'verification/tsconfig.json', 'verification/eslint.config.js',
      'packages/javascript/package.json', 'packages/javascript/tsconfig.json',
      'packages/javascript/tsconfig.build.json'].includes(path)
    || ['.github/workflows/ci.yaml', '.github/workflows/publish-dart.yaml', '.github/workflows/release-please.yaml',
      'release-please-config.json', '.release-please-manifest.json'].includes(path)
    || path.startsWith('.github/scripts/dart-release.')
    || path.startsWith('.github/scripts/pub-artifact.')
    || path.startsWith('.github/scripts/release-')
    || path.startsWith('.github/scripts/classify-ci-files.');
}

export function requiresContractValidation(path) {
  return requiresFlutterValidation(path)
    || path.startsWith('packages/javascript/docs/')
    || path.startsWith('packages/javascript/src/')
    || path.startsWith('packages/javascript/tests/');
}

export function requiresNpmValidation(path) {
  return !isLightweightValidationPath(path)
    && !path.startsWith('packages/flutter/')
    && !path.startsWith('verification/flutter/');
}

export function parseNullDelimitedPaths(output) {
  return output.split('\0').filter(Boolean);
}

function isRepositoryPath(path) {
  return path.length > 0 && !isAbsolute(path) && !path.split('/').includes('..');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onlyPackageVersionChanged(before, after) {
  if (!isObject(before) || !isObject(after)
    || before.name !== '@conalog/patch-map' || after.name !== before.name) return false;
  parseVersion(before.version);
  parseVersion(after.version);
  return isDeepStrictEqual({ ...before, version: after.version }, after);
}

// Narrow only metadata whose complete diff is understood. Changes to scripts,
// dependencies, other lock entries or unknown manifest owners keep broad gates.
function releaseMetadataImpact(path, readFile) {
  if (!readFile || !RELEASE_METADATA_PATHS.has(path)) return undefined;
  try {
    const before = JSON.parse(readFile(path, 'base'));
    const after = JSON.parse(readFile(path, 'result'));
    if (!isObject(before) || !isObject(after)) return undefined;
    if (path === '.release-please-manifest.json') {
      if (!Object.hasOwn(before, JS_PATH) || !Object.hasOwn(after, JS_PATH)) return undefined;
      const owners = [...new Set([...Object.keys(before), ...Object.keys(after)])];
      if (owners.some((owner) => owner !== JS_PATH && owner !== DART_PATH)) return undefined;
      for (const owner of owners) {
        if (Object.hasOwn(before, owner)) parseVersion(before[owner]);
        parseVersion(after[owner]);
      }
      return {
        fullValidation: before[JS_PATH] !== after[JS_PATH],
        flutterValidation: before[DART_PATH] !== after[DART_PATH],
        contractValidation: true,
      };
    }
    if (path === 'package-lock.json') {
      if (!isObject(before.packages) || !isObject(after.packages)
        || !onlyPackageVersionChanged(before.packages[JS_PATH], after.packages[JS_PATH])) return undefined;
      before.packages[JS_PATH] = after.packages[JS_PATH];
      if (!isDeepStrictEqual(before, after)) return undefined;
    } else if (!onlyPackageVersionChanged(before, after)) {
      return undefined;
    }
    return { fullValidation: true, flutterValidation: false, contractValidation: true };
  } catch {
    // Added/deleted files, unreadable Git blobs and invalid metadata fail closed.
    return undefined;
  }
}

export function classifyChangedPaths(paths, { readFile } = {}) {
  if (paths.some((path) => !isRepositoryPath(path))) {
    throw new Error('git diff returned an invalid repository path');
  }

  const impacts = paths.map((path) => releaseMetadataImpact(path, readFile) ?? {
    fullValidation: requiresNpmValidation(path),
    contractValidation: requiresContractValidation(path),
    flutterValidation: requiresFlutterValidation(path),
  });
  return {
    fullValidation: paths.length === 0 || impacts.some((impact) => impact.fullValidation),
    contractValidation: paths.length === 0 || impacts.some((impact) => impact.contractValidation),
    flutterValidation: paths.length === 0 || impacts.some((impact) => impact.flutterValidation),
  };
}

function assertSha(value, label) {
  if (!SHA_PATTERN.test(value ?? '')) {
    throw new Error(`${label} must be a full lowercase Git SHA`);
  }
}

export function classifyGitDiff(baseSha, resultSha, { root = process.cwd() } = {}) {
  assertSha(baseSha, 'base SHA');
  assertSha(resultSha, 'result SHA');

  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', baseSha, resultSha, '--'],
    { cwd: root, encoding: 'utf8' },
  );

  return classifyChangedPaths(parseNullDelimitedPaths(output), {
    readFile(path, side) {
      const sha = side === 'base' ? baseSha : resultSha;
      return execFileSync('git', ['show', `${sha}:${path}`], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    },
  });
}

function main() {
  const [baseSha, resultSha] = process.argv.slice(2);
  if (!baseSha || !resultSha) {
    throw new Error('usage: classify-ci-files.mjs <base-sha> <result-sha>');
  }

  const result = classifyGitDiff(baseSha, resultSha);
  process.stdout.write(`full_validation=${result.fullValidation}\n`);
  process.stdout.write(`contract_validation=${result.contractValidation}\n`);
  process.stdout.write(`flutter_validation=${result.flutterValidation}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

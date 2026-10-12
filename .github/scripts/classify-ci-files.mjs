import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseVersion } from './release-metadata.mjs';
import { assetConsumerPaths } from '../../verification/assets/catalog.mjs';
import { dependencyClosure, dependencyGraphChanged } from '../../verification/dependencies/closure.mjs';

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
  if (isLightweightValidationPath(path) || path.startsWith(`${JS_PATH}/`)) return false;
  const consumers = assetConsumerPaths(path);
  if (consumers.length) return consumers.includes(DART_PATH);
  // Shared verification, repository configuration and unknown paths fail closed.
  return true;
}

export function requiresContractValidation(path) {
  return requiresFlutterValidation(path)
    || path.startsWith(`${JS_PATH}/docs/`)
    || path.startsWith(`${JS_PATH}/src/`)
    || path.startsWith(`${JS_PATH}/tests/`)
    || [`${JS_PATH}/package.json`, `${JS_PATH}/tsconfig.json`,
      `${JS_PATH}/tsconfig.build.json`].includes(path);
}

export function requiresNpmValidation(path) {
  if (isLightweightValidationPath(path)
    || path.startsWith(`${DART_PATH}/`) || path.startsWith('verification/flutter/')) return false;
  const consumers = assetConsumerPaths(path);
  return consumers.length ? consumers.includes(JS_PATH) : true;
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
    if (!isObject(before) || !isObject(after)) throw new Error('invalid release metadata');
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
      if (before.packages?.[JS_PATH]?.name !== '@conalog/patch-map'
        || after.packages?.[JS_PATH]?.name !== '@conalog/patch-map') throw new Error('invalid JavaScript lock identity');
      if (!isDeepStrictEqual({ ...before, packages: undefined }, { ...after, packages: undefined })
        || !isDeepStrictEqual(before.packages?.[''], after.packages?.[''])) return undefined;
      const jsChanged = dependencyGraphChanged(before, after, JS_PATH);
      const verifierChanged = dependencyGraphChanged(before, after, 'verification');
      // Do not hide unowned changes behind an understood JS dependency patch.
      const normalized = structuredClone(before);
      for (const owner of [JS_PATH, 'verification']) {
        const paths = new Set([owner, ...dependencyClosure(before, owner).packages.keys(), ...dependencyClosure(after, owner).packages.keys()]);
        for (const record of paths) {
          if (Object.hasOwn(after.packages, record)) normalized.packages[record] = after.packages[record];
          else delete normalized.packages[record];
        }
      }
      if (!isDeepStrictEqual(normalized, after)) return undefined;
      if (verifierChanged) return { fullValidation: true, flutterValidation: true, contractValidation: true };
      if (jsChanged) return { fullValidation: true, flutterValidation: false, contractValidation: true };
      // Preserve the understood release-version exception. Other changes outside
      // both closures (including root lock metadata) remain conservative.
      if (!onlyPackageVersionChanged(before.packages[JS_PATH], after.packages[JS_PATH])) return undefined;
    } else {
      if (before.name !== '@conalog/patch-map' || after.name !== before.name) throw new Error('invalid JavaScript package identity');
      parseVersion(before.version);
      parseVersion(after.version);
    }
    return { fullValidation: true, flutterValidation: false, contractValidation: true };
  } catch {
    // Added/deleted files, unreadable Git blobs and invalid metadata fail closed.
    return { fullValidation: true, flutterValidation: true, contractValidation: true };
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

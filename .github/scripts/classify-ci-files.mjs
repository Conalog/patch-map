import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export function isLightweightValidationPath(path) {
  return path === 'CONTRIBUTING.md'
    || path.startsWith('docs/engineering/');
}

export function requiresFlutterValidation(path) {
  return path.startsWith('packages/flutter/')
    || path.startsWith('packages/javascript/src/')
    || path.startsWith('packages/javascript/tests/')
    || path.startsWith('conformance/')
    || path.startsWith('verification/conformance/')
    || path.startsWith('verification/flutter/')
    || (path.startsWith('docs/') && !path.startsWith('docs/engineering/'))
    || ['package.json', 'package-lock.json', '.nvmrc',
      'verification/package.json', 'verification/tsconfig.json', 'verification/eslint.config.js',
      'packages/javascript/package.json', 'packages/javascript/tsconfig.json',
      'packages/javascript/tsconfig.build.json'].includes(path)
    || path === '.github/workflows/ci.yaml'
    || path.startsWith('.github/scripts/classify-ci-files.');
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

export function classifyChangedPaths(paths) {
  if (paths.some((path) => !isRepositoryPath(path))) {
    throw new Error('git diff returned an invalid repository path');
  }

  return {
    fullValidation:
      paths.length === 0 || paths.some(requiresNpmValidation),
    flutterValidation:
      paths.length === 0 || paths.some(requiresFlutterValidation),
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

  return classifyChangedPaths(parseNullDelimitedPaths(output));
}

function main() {
  const [baseSha, resultSha] = process.argv.slice(2);
  if (!baseSha || !resultSha) {
    throw new Error('usage: classify-ci-files.mjs <base-sha> <result-sha>');
  }

  const result = classifyGitDiff(baseSha, resultSha);
  process.stdout.write(`full_validation=${result.fullValidation}\n`);
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

import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const root = lock.packages?.[''];

if (manifest.name !== '@conalog/patch-map') {
  throw new Error('unexpected package name');
}

if (
  lock.name !== manifest.name ||
  lock.version !== manifest.version ||
  root?.name !== manifest.name ||
  root?.version !== manifest.version
) {
  throw new Error('package manifest and lockfile must match');
}

const requiredScripts = [
  'typecheck',
  'lint',
  'unit',
  'build',
  'verify:docs',
  'performance:smoke',
  'verify:package',
  'verify:memory',
];
const missingScripts = requiredScripts.filter(
  (name) => typeof manifest.scripts?.[name] !== 'string',
);

if (missingScripts.length > 0) {
  throw new Error(`missing release scripts: ${missingScripts.join(', ')}`);
}

process.stdout.write('true');

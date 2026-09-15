import { readFileSync } from 'node:fs';

const workspace = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('packages/javascript/package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const root = lock.packages?.[''];
const npm = lock.packages?.['packages/javascript'];
const release = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8'));

if (workspace.private !== true || workspace.workspaces?.length !== 1 ||
  workspace.workspaces[0] !== 'packages/javascript' || manifest.name !== '@conalog/patch-map') {
  throw new Error('unexpected workspace or npm package identity');
}
if (lock.name !== workspace.name || root?.name !== workspace.name ||
  npm?.name !== manifest.name || npm?.version !== manifest.version ||
  release['packages/javascript'] !== manifest.version) {
  throw new Error('workspace, package, lockfile and release versions must match');
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
  (name) => typeof workspace.scripts?.[name] !== 'string',
);

if (missingScripts.length > 0) {
  throw new Error(`missing release scripts: ${missingScripts.join(', ')}`);
}

process.stdout.write('true');

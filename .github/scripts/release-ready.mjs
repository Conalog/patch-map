import { readFileSync } from 'node:fs';
import { pubspecField, parseVersion } from './release-metadata.mjs';

const workspace = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('packages/javascript/package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const verification = JSON.parse(readFileSync('verification/package.json', 'utf8'));
const root = lock.packages?.[''];
const verificationLock = lock.packages?.['verification'];
const npm = lock.packages?.['packages/javascript'];
const release = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8'));

if (workspace.private !== true || workspace.workspaces?.length !== 2 ||
  !workspace.workspaces.includes('packages/javascript') || !workspace.workspaces.includes('verification') ||
  verification.private !== true || verification.name !== '@patch-map/verification' ||
  manifest.name !== '@conalog/patch-map') {
  throw new Error('unexpected workspace or npm package identity');
}
if (lock.name !== workspace.name || root?.name !== workspace.name ||
  npm?.name !== manifest.name || npm?.version !== manifest.version ||
  verificationLock?.name !== verification.name ||
  JSON.stringify(verificationLock.devDependencies) !== JSON.stringify(verification.devDependencies) ||
  release['packages/javascript'] !== manifest.version) {
  throw new Error('workspace, package, lockfile and release versions must match');
}

const config = JSON.parse(readFileSync('release-please-config.json', 'utf8'));
const dartPath = 'packages/flutter';
const pubspec = readFileSync(`${dartPath}/pubspec.yaml`, 'utf8');
const dartVersion = pubspecField(pubspec, 'version');
parseVersion(dartVersion);
parseVersion(manifest.version);
if (pubspecField(pubspec, 'name') !== 'conalog_patch_map' || /^publish_to:/mu.test(pubspec) ||
  (release[dartPath] ?? config.packages[dartPath]['initial-version']) !== dartVersion) {
  throw new Error('Dart package and release versions must match (initial version before first release)');
}
if (config['separate-pull-requests'] !== true ||
  config.plugins?.length !== 1 || config.plugins[0].type !== 'node-workspace' || config.plugins[0].merge !== false ||
  config.packages['packages/javascript']['release-type'] !== 'node' ||
  config.packages['packages/javascript'].component !== 'npm' ||
  config.packages['packages/javascript']['include-component-in-tag'] !== false ||
  config.packages[dartPath]['release-type'] !== 'dart' || config.packages[dartPath].component !== 'dart' ||
  config.packages[dartPath]['include-component-in-tag'] !== true) {
  throw new Error('independent npm/Dart release ownership configuration is required');
}

const requiredScripts = [
  'flutter:analyze',
  'flutter:test',
  'js:typecheck',
  'js:lint',
  'js:unit',
  'js:build',
  'verify:typecheck',
  'verify:lint',
  'verify:docs',
  'js:performance:smoke',
  'js:verify:package',
  'js:verify:memory',
];
const missingScripts = requiredScripts.filter(
  (name) => typeof workspace.scripts?.[name] !== 'string',
);

if (missingScripts.length > 0) {
  throw new Error(`missing release scripts: ${missingScripts.join(', ')}`);
}

process.stdout.write('true');

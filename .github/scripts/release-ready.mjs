import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pubspecField, parseVersion } from './release-metadata.mjs';

const scopes = ['repository', 'js', 'dart', 'all'];

// Every scope retains repository policy, while runtime metadata is read only
// when that runtime is selected. Independent release jobs need this isolation.
export function releaseReadiness(scope = 'all', directory = process.cwd()) {
  if (!scopes.includes(scope)) throw new Error('scope must be repository, js, dart or all');
  const read = (path) => readFileSync(resolve(directory, path), 'utf8');
  const json = (path) => JSON.parse(read(path));
  const workspace = json('package.json');
  const lock = json('package-lock.json');
  const verification = json('verification/package.json');
  const root = lock.packages?.[''];
  const verificationLock = lock.packages?.['verification'];
  const config = json('release-please-config.json');
  const dartPath = 'packages/flutter';
  const jsPath = 'packages/javascript';

  if (workspace.private !== true || workspace.workspaces?.length !== 2 ||
    !workspace.workspaces.includes(jsPath) || !workspace.workspaces.includes('verification') ||
    verification.private !== true || verification.name !== '@patch-map/verification') {
    throw new Error('unexpected workspace or npm package identity');
  }
  if (lock.name !== workspace.name || root?.name !== workspace.name ||
    verificationLock?.name !== verification.name ||
    JSON.stringify(verificationLock.devDependencies) !== JSON.stringify(verification.devDependencies)) {
    throw new Error('workspace, package, lockfile and release versions must match');
  }
  if (config['separate-pull-requests'] !== true ||
    config.plugins?.length !== 1 || config.plugins[0].type !== 'node-workspace' || config.plugins[0].merge !== false ||
    config.packages?.[jsPath]?.['release-type'] !== 'node' ||
    config.packages[jsPath].component !== 'js' ||
    config.packages[jsPath]['include-component-in-tag'] !== true ||
    config.packages?.[dartPath]?.['release-type'] !== 'dart' || config.packages[dartPath].component !== 'dart' ||
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

  if (scope !== 'repository') {
    const release = json('.release-please-manifest.json');
    if (scope === 'js' || scope === 'all') {
      const manifest = json(`${jsPath}/package.json`);
      const npm = lock.packages?.[jsPath];
      if (manifest.name !== '@conalog/patch-map') {
        throw new Error('unexpected workspace or npm package identity');
      }
      if (npm?.name !== manifest.name || npm?.version !== manifest.version ||
        release[jsPath] !== manifest.version) {
        throw new Error('workspace, package, lockfile and release versions must match');
      }
      parseVersion(manifest.version);
    }
    if (scope === 'dart' || scope === 'all') {
      const pubspec = read(`${dartPath}/pubspec.yaml`);
      const dartVersion = pubspecField(pubspec, 'version');
      const contract = json('conformance/manifest.json');
      const foundation = contract.implementationStatus === 'foundation';
      const publishing = /^publish_to:/mu.test(pubspec) ? pubspecField(pubspec, 'publish_to') : undefined;
      if (foundation ? publishing !== 'none' : publishing !== undefined) {
        throw new Error('foundation must remain private; qualified Dart packages use the public registry');
      }
      parseVersion(dartVersion);
      if (pubspecField(pubspec, 'name') !== 'conalog_patch_map' ||
        (release[dartPath] ?? config.packages[dartPath]['initial-version']) !== dartVersion) {
        throw new Error('Dart package and release versions must match (initial version before first release)');
      }
    }
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--scope')) {
    throw new Error('usage: release-ready.mjs [--scope repository|js|dart|all]');
  }
  process.stdout.write(String(releaseReadiness(args[1] ?? 'all')));
}

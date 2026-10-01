import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_CATALOG, ASSET_PACKAGES, ASSET_SOURCE } from './catalog.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = ASSET_SOURCE;
const assetNames = ASSET_CATALOG.map((asset) => asset.name).sort();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function directories(root, path) {
  let current = resolve(root);
  for (const segment of relative(root, path).split('/').filter(Boolean)) {
    current = join(current, segment);
    const stat = lstatSyncOrNull(current);
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Asset directory must not be a symlink: ${current}`);
    }
  }
}
function lstatSyncOrNull(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function filesIn(root, path) {
  directories(root, path);
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(relative(path, child));
      else throw new Error(`Asset must be a regular file: ${child}`);
    }
  }
  if (existsSync(path)) visit(path);
  return files.sort();
}

export function readSharedAssets(root = repositoryRoot) {
  const source = resolve(root, sourcePath);
  if (JSON.stringify(filesIn(root, source)) !== JSON.stringify(assetNames)) throw new Error('Shared asset inventory mismatch');
  const assets = new Map(assetNames.map((name) => [name, readFileSync(join(source, name))]));
  const provenance = JSON.parse(assets.get('fonts/provenance.json').toString());
  const native = assets.get('fonts/FiraCode-VF.ttf');
  if (provenance.source !== `${sourcePath}/fonts/FiraCode-VF.woff2`
    || provenance.native !== `${sourcePath}/fonts/FiraCode-VF.ttf`
    || provenance.license !== `${sourcePath}/fonts/LICENSE.txt`
    || provenance.sourceSha256 !== digest(assets.get('fonts/FiraCode-VF.woff2'))
    || provenance.nativeSha256 !== digest(native) || native.length < 4 || native.readUInt32BE(0) !== 0x00010000) {
    throw new Error('Shared native font provenance drift');
  }
  return assets;
}

function writeChanged(root, path, bytes) {
  directories(root, dirname(path));
  const stat = lstatSyncOrNull(path);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error(`Asset must be a regular file: ${path}`);
  if (stat && readFileSync(path).equals(bytes)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

export function prepareAssets({ root = repositoryRoot, packageName = 'all' } = {}) {
  if (!['all', 'javascript', 'flutter'].includes(packageName)) throw new Error('usage: prepare.mjs [all|javascript|flutter]');
  const assets = readSharedAssets(root);
  if (packageName !== 'flutter') {
    for (const asset of ASSET_CATALOG) {
      const target = asset.targets.javascript;
      if (typeof target === 'string') writeChanged(root, resolve(root, target), assets.get(asset.name));
    }
  }
  if (packageName !== 'javascript') {
    // This ignored directory is wholly generated. Reject links before writing or
    // deleting anything, and remove files left by a previous asset inventory.
    const target = resolve(root, ASSET_PACKAGES.flutter, 'assets');
    const previous = filesIn(root, target);
    const expected = [];
    for (const asset of ASSET_CATALOG) {
      const path = resolve(root, asset.targets.flutter);
      expected.push(relative(target, path));
      writeChanged(root, path, assets.get(asset.name));
    }
    for (const name of previous) if (!expected.includes(name)) rmSync(join(target, name));
  }
  return { source: sourcePath, packageName, assets: assets.size };
}

export function verifyPreparedFlutterAssets(root = repositoryRoot) {
  const assets = readSharedAssets(root);
  const target = resolve(root, ASSET_PACKAGES.flutter, 'assets');
  const expected = ASSET_CATALOG.map((asset) => relative(target, resolve(root, asset.targets.flutter))).sort();
  if (JSON.stringify(filesIn(root, target)) !== JSON.stringify(expected)) throw new Error('Prepared Flutter asset inventory mismatch; run npm run assets:prepare');
  for (const asset of ASSET_CATALOG) {
    if (!readFileSync(resolve(root, asset.targets.flutter)).equals(assets.get(asset.name))) throw new Error(`Prepared asset drift: ${asset.name}`);
  }
  return assets.size;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(prepareAssets({ packageName: process.argv[2] ?? 'all' })));
}

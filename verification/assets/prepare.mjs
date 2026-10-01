import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_CATALOG, ASSET_PACKAGES, ASSET_SOURCE } from './catalog.mjs';

/** @typedef {import('./catalog.mjs').AssetPackage | 'all'} PreparationPackage */
/** @typedef {{ source: string, native: string, license: string, sourceSha256: string, nativeSha256: string }} FontProvenance */

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = ASSET_SOURCE;
const assetNames = ASSET_CATALOG.map((asset) => asset.name).sort();
/** @param {Uint8Array} bytes */
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** @param {string} root @param {string} path */
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
/** @param {string} path */
function lstatSyncOrNull(path) {
  try { return lstatSync(path); } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}
/** @param {string} root @param {string} path */
function filesIn(root, path) {
  directories(root, path);
  /** @type {string[]} */
  const files = [];
  /** @param {string} directory */
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
  /** @type {FontProvenance} */
  const provenance = JSON.parse(assetBytes(assets, 'fonts/provenance.json').toString());
  const native = assetBytes(assets, 'fonts/FiraCode-VF.ttf');
  if (provenance.source !== `${sourcePath}/fonts/FiraCode-VF.woff2`
    || provenance.native !== `${sourcePath}/fonts/FiraCode-VF.ttf`
    || provenance.license !== `${sourcePath}/fonts/LICENSE.txt`
    || provenance.sourceSha256 !== digest(assetBytes(assets, 'fonts/FiraCode-VF.woff2'))
    || provenance.nativeSha256 !== digest(native) || native.length < 4 || native.readUInt32BE(0) !== 0x00010000) {
    throw new Error('Shared native font provenance drift');
  }
  return assets;
}

/** @param {Map<string, Buffer>} assets @param {string} name */
function assetBytes(assets, name) {
  const bytes = assets.get(name);
  if (bytes === undefined) throw new Error(`Missing canonical asset: ${name}`);
  return bytes;
}

/** @param {string} root @param {string} path @param {Uint8Array} bytes */
function writeChanged(root, path, bytes) {
  directories(root, dirname(path));
  const stat = lstatSyncOrNull(path);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error(`Asset must be a regular file: ${path}`);
  if (stat && readFileSync(path).equals(bytes)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

/** @param {string} name @returns {PreparationPackage} */
function preparationPackage(name) {
  if (name !== 'all' && name !== 'javascript' && name !== 'flutter') throw new Error('usage: prepare.mjs [all|javascript|flutter]');
  return name;
}

/** @param {{ root?: string, packageName?: PreparationPackage }} [options] */
export function prepareAssets({ root = repositoryRoot, packageName = 'all' } = {}) {
  packageName = preparationPackage(packageName);
  const assets = readSharedAssets(root);
  if (packageName !== 'flutter') {
    for (const asset of ASSET_CATALOG) {
      const target = asset.targets.javascript;
      if (typeof target === 'string') writeChanged(root, resolve(root, target), assetBytes(assets, asset.name));
    }
  }
  if (packageName !== 'javascript') {
    // This ignored directory is wholly generated. Reject links before writing or
    // deleting anything, and remove files left by a previous asset inventory.
    const target = resolve(root, ASSET_PACKAGES.flutter, 'assets');
    const previous = filesIn(root, target);
    /** @type {string[]} */
    const expected = [];
    for (const asset of ASSET_CATALOG) {
      const path = resolve(root, asset.targets.flutter);
      expected.push(relative(target, path));
      writeChanged(root, path, assetBytes(assets, asset.name));
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
    if (!readFileSync(resolve(root, asset.targets.flutter)).equals(assetBytes(assets, asset.name))) throw new Error(`Prepared asset drift: ${asset.name}`);
  }
  return assets.size;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packageName = preparationPackage(process.argv[2] ?? 'all');
  console.log(JSON.stringify(prepareAssets({ packageName })));
}

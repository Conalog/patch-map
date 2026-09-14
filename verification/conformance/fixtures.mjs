import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const CONTRACT_REVISION = 'patch-map-conformance/1';
export const COMMANDS = new Set([
  'update', 'updateBatch', 'transaction', 'data.replace', 'data.replaceAsync',
  'history.undo', 'history.redo', 'history.clear', 'editor.execute',
  'selection.set', 'selection.clear', 'callbacks.probe', 'presentation.clear', 'viewport.fit',
  'data.serialize', 'presentation.set', 'rotation.cancel', 'rotation.finished', 'rotation.reset', 'rotation.rotateBy', 'rotation.set', 'rotation.start', 'targets.get', 'targets.query', 'transform.beginSession', 'transform.cancel', 'transform.edgePan', 'transform.commit', 'transform.moveBy', 'transform.preview', 'transform.resizeBy', 'transform.rotateBy', 'viewport.panBy', 'viewport.resize', 'viewport.restore', 'viewport.zoomBy',
]);

export function validateFixture(value, label = 'fixture') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected object`);
  if (value.schemaRevision !== CONTRACT_REVISION) throw new Error(`${label}: unsupported revision`);
  if (typeof value.id !== 'string' || !/^[a-z0-9-]+$/u.test(value.id)) throw new Error(`${label}: invalid id`);
  if (!Array.isArray(value.dataset) || !Array.isArray(value.commands)) throw new Error(`${label}: dataset/commands required`);
  const surface = value.surface;
  if (!surface || !['width', 'height', 'pixelRatio'].every((field) =>
    Number.isFinite(surface[field]) && surface[field] > 0)) throw new Error(`${label}: invalid surface`);
  if (!value.expected || !['rootIds', 'elementTypes', 'componentTypes'].every((field) =>
    Array.isArray(value.expected[field]) && value.expected[field].every((entry) => typeof entry === 'string'))) {
    throw new Error(`${label}: expected inventory required`);
  }
  if (value.assets !== undefined) {
    if (!Array.isArray(value.assets)) throw new Error(`${label}: assets must be registrations`);
    const aliases = new Set();
    for (const asset of value.assets) {
      if (!asset || typeof asset.alias !== 'string' || !asset.alias.trim() || aliases.has(asset.alias) ||
        !['image', 'font'].includes(asset.kind ?? 'image') ||
        !(typeof asset.descriptor === 'string' || asset.descriptor && typeof asset.descriptor.src === 'string')) {
        throw new Error(`${label}: invalid or duplicate asset registration`);
      }
      aliases.add(asset.alias);
    }
    if (!Array.isArray(value.requiredAssets) || new Set(value.requiredAssets).size !== value.requiredAssets.length ||
      value.requiredAssets.some((alias) => !aliases.has(alias))) throw new Error(`${label}: requiredAssets must name registered assets exactly once`);
  } else if (value.requiredAssets !== undefined) throw new Error(`${label}: requiredAssets needs registrations`);
  const ids = new Set();
  for (const command of value.commands) {
    if (!command || typeof command.id !== 'string' || ids.has(command.id) || !COMMANDS.has(command.op)) {
      throw new Error(`${label}: invalid, duplicate or unsupported command`);
    }
    ids.add(command.id);
  }
  assertJson(value, label);
  return value;
}

function assertJson(value, label) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) return value.forEach((entry) => assertJson(entry, label));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value).forEach((entry) => assertJson(entry, label));
  }
  throw new Error(`${label}: only finite JSON values are allowed`);
}

export async function readFixtures(root = process.cwd()) {
  const directory = resolve(root, 'conformance/fixtures');
  const paths = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  if (paths.length === 0) throw new Error('No conformance fixtures');
  const fixtures = await Promise.all(paths.map(async (name) =>
    validateFixture(JSON.parse(await readFile(resolve(directory, name), 'utf8')), name)));
  if (new Set(fixtures.map((fixture) => fixture.id)).size !== fixtures.length) throw new Error('Duplicate fixture ids');
  return fixtures;
}

import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT_REVISION } from './fixtures.mjs';

/** Exact JSON semantics; raster and field-specific numeric tolerances belong to named cases. */
export function compareObservations(left, right, path = '$') {
  if (typeof left === 'number' && !Number.isFinite(left) || typeof right === 'number' && !Number.isFinite(right)) {
    throw new Error(`${path}: non-finite observation`);
  }
  if (left === right) return;
  // This named rotation fixture uses trigonometry. Only calculated viewport
  // and fit bounds admit round-off; IDs, dataset, counts and hashes stay exact.
  if (typeof left === 'number' && typeof right === 'number' &&
      /^\$\.alpha-parity\.steps\[\d+\]\.(?:(?:observation|result)\.viewport\.(?:centerWorld\[[01]\]|scale)|result\.(?:worldBounds\[[0-3]\]|contributors\[\d+\]\.worldBounds\[[0-3]\]))$/u.test(path) &&
      Math.abs(left - right) <= 1e-9) return;
  if (left === null || right === null || typeof left !== typeof right) throw new Error(`${path}: values differ`);
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) throw new Error(`${path}: array shape differs`);
    left.forEach((value, index) => compareObservations(value, right[index], `${path}[${index}]`));
    return;
  }
  if (typeof left === 'object') {
    const keys = Object.keys(left).sort();
    if (JSON.stringify(keys) !== JSON.stringify(Object.keys(right).sort())) throw new Error(`${path}: object keys differ`);
    keys.forEach((key) => compareObservations(left[key], right[key], `${path}.${key}`));
    return;
  }
  throw new Error(`${path}: values differ`);
}

export function compareRuns(left, right, fixtureIds) {
  const index = (run) => {
    if (run?.schemaRevision !== CONTRACT_REVISION || !Array.isArray(run.observations)) throw new Error('Invalid observation envelope');
    const result = new Map();
    for (const observation of run.observations) {
      if (!observation || typeof observation.fixtureId !== 'string' || result.has(observation.fixtureId)) throw new Error('Missing or duplicate fixture observation');
      if (Object.keys(observation).length < 2) throw new Error('Empty fixture observation');
      result.set(observation.fixtureId, observation);
    }
    compareObservations([...result.keys()].sort(), [...fixtureIds].sort(), '$.fixtureIds');
    return result;
  };
  const a = index(left);
  const b = index(right);
  for (const id of fixtureIds) compareObservations(a.get(id), b.get(id), `$.${id}`);
  return { comparedFixtures: fixtureIds.length };
}

export async function contractFingerprint(root = process.cwd()) {
  const hash = createHash('sha256');
  async function include(directory) {
    for (const entry of (await readdir(resolve(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await include(path);
      else if (entry.isFile()) hash.update(path).update('\0').update(await readFile(resolve(root, path))).update('\0');
    }
  }
  await include('conformance');
  return hash.digest('hex');
}

/** A successful small trace must never qualify an incomplete SDK. */
export function qualify(manifest, inventory, evidence, fingerprint) {
  if (manifest?.schemaRevision !== CONTRACT_REVISION || !Array.isArray(manifest.requirements) || !Array.isArray(inventory)) {
    throw new Error('Invalid contract manifest/inventory');
  }
  if (!evidence || evidence.schemaRevision !== CONTRACT_REVISION || evidence.contractFingerprint !== fingerprint) {
    throw new Error('Missing or stale qualification provenance');
  }
  const required = [...manifest.requirements.map((item) => item.id), ...inventory.map((item) => item.id)];
  if (required.length === 0 || new Set(required).size !== required.length) throw new Error('Invalid required inventory');
  const failures = [];
  if (manifest.requirements.some((item) => item.required !== true)) failures.push('Semantic requirement was made optional');
  for (const requirement of manifest.requirements) {
    if (!Array.isArray(requirement.cases) || requirement.cases.length === 0) failures.push(`${requirement.id}: executable cases missing`);
  }
  for (const runtime of ['npm', 'dart']) {
    const run = evidence.runtimes?.[runtime];
    if (!run || typeof run.artifactSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(run.artifactSha256) || run.installedConsumer !== true) {
      failures.push(`${runtime}: installed artifact evidence missing`);
    }
    const witnesses = new Map();
    for (const witness of run?.witnesses ?? []) {
      if (!required.includes(witness.id) || witnesses.has(witness.id)) throw new Error(`${runtime}: unknown or duplicate witness`);
      witnesses.set(witness.id, witness);
    }
    for (const id of required) {
      const witness = witnesses.get(id);
      if (witness?.outcome !== 'passed' || !Array.isArray(witness.assertions) || witness.assertions.length === 0 ||
        witness.assertions.some((assertion) => typeof assertion !== 'string' || assertion.length === 0)) failures.push(`${runtime}/${id}: passing assertion witness missing`);
    }
  }
  for (const platform of manifest.requiredPlatforms ?? []) {
    const result = evidence.platforms?.[platform];
    if (result?.outcome !== 'passed' || result?.rendering !== true || result?.input !== true || result?.lifecycle !== true ||
      result?.assets !== true || result?.accessibility !== true || result?.capture !== true) failures.push(`${platform}: platform qualification incomplete`);
  }
  return { qualified: failures.length === 0, requiredCount: required.length, failures };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [leftPath, rightPath] = process.argv.slice(2);
  if (!leftPath || !rightPath) throw new Error('usage: node verification/conformance/compare.mjs npm.json dart.json');
  const manifest = JSON.parse(await readFile(resolve('conformance/manifest.json'), 'utf8'));
  const [left, right] = await Promise.all([leftPath, rightPath].map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
  console.log(JSON.stringify(compareRuns(left, right, manifest.fixtures)));
}

import { createHash } from 'node:crypto';

export const SEMANTIC_OBSERVATION_REVISION = 'patch-map-semantic-observation/1';

const OBSERVATION_DOMAINS = Object.freeze([
  'case',
  'provenance',
  'environment',
  'revisions',
  'scene',
  'geometry',
  'text',
  'paint',
  'interaction',
  'events',
  'history',
  'accessibility',
  'outcome',
  'resources',
]);

const TOP_LEVEL_FIELDS = new Set(['$schema', ...OBSERVATION_DOMAINS, 'extensions']);
const SEMANTIC_DIGEST_FIELDS = Object.freeze([
  '$schema',
  ...OBSERVATION_DOMAINS.filter((domain) => domain !== 'provenance' && domain !== 'environment'),
]);
const VERSIONED_SCHEMA = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9._-]+)*\/[1-9]\d*$/;

/**
 * Validate and detach an actual-only PatchMap semantic observation.
 *
 * This module intentionally has no expected-evidence input. Volatile-field policy is
 * applied only by the post-run comparator.
 */
export function createSemanticObservation({ observation }) {
  assert(isPlainObject(observation), 'observation must be a plain object');
  validateJsonValue(observation, '$', new WeakSet());
  validateObservationShape(observation);

  const canonical = canonicalize(observation);
  const semantic = Object.fromEntries(
    SEMANTIC_DIGEST_FIELDS.map((field) => [field, canonical[field]]),
  );

  return deepFreeze({
    observation: canonical,
    actualSemanticSha256: canonicalSha256(semantic),
    actualObservationSha256: canonicalSha256(canonical),
  });
}

function validateObservationShape(observation) {
  assert(
    observation.$schema === SEMANTIC_OBSERVATION_REVISION,
    `schema must be ${SEMANTIC_OBSERVATION_REVISION}`,
  );

  for (const key of Object.keys(observation)) {
    assert(TOP_LEVEL_FIELDS.has(key), `unknown top-level key ${JSON.stringify(key)}`);
  }
  for (const domain of OBSERVATION_DOMAINS) {
    assert(Object.hasOwn(observation, domain), `required domain ${domain}`);
    assert(isPlainObject(observation[domain]), `domain ${domain} must be a plain object`);
  }

  if (!Object.hasOwn(observation, 'extensions')) return;
  assert(isPlainObject(observation.extensions), 'extensions must be a plain object');

  const schemas = new Set();
  for (const [name, extension] of Object.entries(observation.extensions)) {
    assert(name.length > 0, 'extension name must not be empty');
    assert(!TOP_LEVEL_FIELDS.has(name), `extension name collides with observation field ${name}`);
    assert(isPlainObject(extension), `extension ${name} must be a plain object`);
    assert(
      typeof extension.$schema === 'string' && VERSIONED_SCHEMA.test(extension.$schema),
      `extension ${name} must declare a versioned $schema`,
    );
    assert(
      extension.$schema !== SEMANTIC_OBSERVATION_REVISION,
      `extension ${name} schema collides with the semantic observation schema`,
    );
    assert(!schemas.has(extension.$schema), `duplicate extension schema ${extension.$schema}`);
    schemas.add(extension.$schema);
  }
}

function validateJsonValue(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} must contain only finite numbers`);
    return;
  }
  assert(typeof value === 'object', `${path} contains a non-JSON ${typeof value} value`);
  assert(!ancestors.has(value), `${path} contains a cycle`);
  assert(Array.isArray(value) || isPlainObject(value), `${path} contains a non-plain object`);
  assert(Object.getOwnPropertySymbols(value).length === 0, `${path} contains symbol keys`);
  if (Array.isArray(value)) {
    const expectedKeys = Array.from({ length: value.length }, (_, index) => String(index));
    assert(
      Object.keys(value).length === expectedKeys.length &&
        expectedKeys.every((key) => Object.hasOwn(value, key)),
      `${path} must be a dense JSON array without named properties`,
    );
  }

  ancestors.add(value);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert(descriptor?.get === undefined && descriptor?.set === undefined, `${path} contains accessor ${key}`);
    assert(descriptor?.enumerable === true, `${path} contains a non-enumerable key ${key}`);
    validateJsonValue(descriptor.value, `${path}/${escapePointer(key)}`, ancestors);
  }
  ancestors.delete(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalSha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function escapePointer(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap semantic observation invalid: ${message}`);
}

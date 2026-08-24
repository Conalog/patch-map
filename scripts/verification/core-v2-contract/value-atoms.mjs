export function clone(value) {
  return structuredClone(value);
}

export function cloneOptional(value) {
  return value === undefined ? undefined : clone(value);
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function createTypeSuffixValueAtoms(assert) {
  function recordValue(value, label) {
    assert(
      value !== null && typeof value === 'object' && !Array.isArray(value),
      `${label} object`,
    );
    return value;
  }

  function arrayValue(value, label) {
    assert(Array.isArray(value), `${label} array`);
    return value;
  }

  function stringValue(value, label) {
    assert(typeof value === 'string' && value.length > 0, `${label} string`);
    return value;
  }

  function booleanValue(value, label) {
    assert(typeof value === 'boolean', `${label} boolean`);
    return value;
  }

  function finiteNumber(value, label) {
    assert(typeof value === 'number' && Number.isFinite(value), `${label} finite`);
    return value;
  }

  return {
    recordValue,
    arrayValue,
    stringValue,
    booleanValue,
    finiteNumber,
  };
}

export function createOrderedExactKeyAssertion(assert) {
  return function assertExactKeys(value, keys, label) {
    const allowed = new Set(keys);
    for (const key of Object.keys(value)) {
      assert(allowed.has(key), `${label} unknown key ${key}`);
    }
    for (const key of keys) {
      assert(Object.hasOwn(value, key), `${label} missing key ${key}`);
    }
  };
}

function _isSame(a, b, visited) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    return false;
  }

  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  if (visited.has(a)) return visited.get(a) === b;
  visited.set(a, b);

  if (a instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof RegExp) {
    return a.toString() === b.toString();
  }

  if (a instanceof Map) {
    if (a.size !== b.size) return false;
    const entriesA = Array.from(a.entries());
    const entriesB = Array.from(b.entries());
    return _isSame(entriesA, entriesB, visited);
  }

  if (a instanceof Set) {
    if (a.size !== b.size) return false;
    const valuesA = Array.from(a.values());
    const valuesB = Array.from(b.values());
    return _isSame(valuesA, valuesB, visited);
  }

  if (ArrayBuffer.isView(a) && !(a instanceof DataView)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!_isSame(a[i], b[i], visited)) return false;
    }
    return true;
  }

  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.hasOwn(b, key) || !_isSame(a[key], b[key], visited)) {
      return false;
    }
  }

  return true;
}

export const isSame = (value1, value2) => {
  return _isSame(value1, value2, new WeakMap());
};

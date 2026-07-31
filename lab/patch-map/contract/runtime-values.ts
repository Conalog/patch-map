export function deepFreezePatchMapLabValue<T>(
  value: T,
  seen = new WeakSet<object>(),
): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) {
    deepFreezePatchMapLabValue(nested, seen);
  }
  return Object.freeze(value);
}

export function detachPatchMapLabValue<T>(value: T): T {
  return deepFreezePatchMapLabValue(structuredClone(value));
}

export function isPatchMapLabRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

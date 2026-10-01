/** Strict JSON-style record check shared by input and cloning boundaries. */
export function isPlainRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

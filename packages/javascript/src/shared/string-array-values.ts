/** Compare ordered string identities without allocating an intermediate key. */
export function sameStringArray(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export function sameNullableStringArray(
  left: readonly string[] | null,
  right: readonly string[] | null,
): boolean {
  return left === null || right === null
    ? left === right
    : sameStringArray(left, right);
}

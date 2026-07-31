/**
 * Deterministic FNV-1a 64-bit hash used for internal asset and parser
 * identities. This is deliberately not a cryptographic digest.
 */
export function stableHash64Hex(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

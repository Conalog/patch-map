export const PATCH_MAP_FIRA_CODE_FAMILY = 'FiraCode';

/** Preserve the authored family; only the exact canonical name selects the bundled font. */
export function canonicalPatchMapTextFontFamily(value: string): string {
  return value;
}

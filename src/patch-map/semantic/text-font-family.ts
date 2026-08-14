export const PATCH_MAP_FIRA_CODE_FAMILY = 'Fira Code';

/** Preserve the v0.10 `FiraCode` spelling while using one browser family. */
export function canonicalPatchMapTextFontFamily(value: string): string {
  return value === 'FiraCode' ? PATCH_MAP_FIRA_CODE_FAMILY : value;
}

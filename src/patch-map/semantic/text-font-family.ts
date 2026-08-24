export const PATCH_MAP_FIRA_CODE_FAMILY = 'FiraCode';

/** Preserve both accepted spellings while using one quote-stable browser family. */
export function canonicalPatchMapTextFontFamily(value: string): string {
  return value === 'FiraCode' || value === 'Fira Code'
    ? PATCH_MAP_FIRA_CODE_FAMILY
    : value;
}

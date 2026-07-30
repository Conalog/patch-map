export const PATCH_MAP_NATIVE_RELEASE_SCHEMA =
  'core-v2-native-release-evidence/1';

export const REQUIRED_BROWSER_CELLS = Object.freeze(
  ['Windows 10', 'Windows 11'].flatMap((osName) =>
    ['Chrome', 'Edge'].flatMap((browserName) =>
      ['latest-1', 'latest'].map((releaseRank) => Object.freeze({
        id: `${slug(osName)}-${browserName.toLowerCase()}-${releaseRank}`,
        osName,
        browserName,
        releaseRank,
      })))),
);

export const MANDATORY_INPUTS = Object.freeze([
  'mouse',
  'precision-trackpad',
  'keyboard',
  'browser-zoom',
  'host-css-transform',
  'scroll',
  'DPR-change',
]);

export const CAPABILITY_DEPENDENT_INPUTS = Object.freeze([
  'touch',
  'pen',
  'multi-pointer',
]);

export const GLOBAL_NATIVE_ARTIFACT_ROLES = Object.freeze([
  'actual-host',
  'security',
  'migration',
  'review',
]);

export function cellArtifactRole(cellId, kind) {
  return `${cellId}:${kind}`;
}

export function requiredNativeArtifactRoles() {
  return Object.freeze([
    ...REQUIRED_BROWSER_CELLS.flatMap(({ id }) => [
      cellArtifactRole(id, 'functional'),
      cellArtifactRole(id, 'nvda'),
      cellArtifactRole(id, 'inputs'),
      cellArtifactRole(id, 'performance'),
      cellArtifactRole(id, 'lifecycle'),
    ]),
    ...GLOBAL_NATIVE_ARTIFACT_ROLES,
  ]);
}

function slug(value) {
  return value.toLowerCase().replaceAll(' ', '-');
}

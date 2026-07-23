export const CORE_V2_UPDATE_CONFLICT_ACTUALS_REVISION =
  'core-v2-update-conflict-actuals/1';

const ACTUALS_BY_CASE = Object.freeze({
  'UPD-003': Object.freeze([
    Object.freeze({ path: '/outcome/invalidCrossScope/code', value: 'INVALID_RECORD_KIND' }),
  ]),
  'UPD-007': Object.freeze([
    Object.freeze({ path: '/outcome/valid/queryRevision', value: 2 }),
    Object.freeze({ path: '/outcome/valid/eventRevision', value: 2 }),
  ]),
});

/**
 * Pin the product-side value of known immutable expected conflicts. Comparison
 * path/code fingerprints alone cannot distinguish the accepted diagnostic from
 * an arbitrary new mismatch.
 */
export function inspectCoreV2UpdateConflictActuals(caseId, actualObservation) {
  const records = ACTUALS_BY_CASE[caseId] ?? [];
  return Object.freeze(records.flatMap((record) => {
    const resolved = readJsonPointer(actualObservation, record.path);
    return resolved.found && sameJson(resolved.value, record.value)
      ? []
      : [Object.freeze({
          path: record.path,
          expectedActual: record.value,
          observedActual: resolved.found ? resolved.value : null,
          status: resolved.found ? 'value-mismatch' : 'unresolved',
        })];
  }));
}

function readJsonPointer(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    return { found: false, value: null };
  }
  let value = root;
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) {
      return { found: false, value: null };
    }
    value = value[key];
  }
  return { found: true, value };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

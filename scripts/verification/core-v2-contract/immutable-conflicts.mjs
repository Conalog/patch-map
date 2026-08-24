function conflict(path) {
  return Object.freeze({
    path,
    code: 'VALUE_MISMATCH',
    failurePath: path,
  });
}

/**
 * Approved expected evidence is immutable. These consumer-journey mismatches
 * are the single executable ledger for the already-reviewed conflicts; package
 * verification accepts no other CSM comparison failure.
 */
export const PATCH_MAP_CSM_DECLARED_IMMUTABLE_CONFLICTS = Object.freeze({
  'CSM-022': Object.freeze([
    conflict('/geometry/targets/item-a/worldBounds/x'),
    conflict('/geometry/targets/rect-b/worldBounds/x'),
    conflict('/outcome/hostEngineSeam/failureRollback/conflictCode'),
  ]),
  'CSM-024': Object.freeze([
    conflict('/interaction/hitTarget'),
    conflict('/outcome/hostEngineSeam/engineReturns/transformedHitTarget'),
  ]),
  'CSM-028': Object.freeze([
    conflict('/outcome/hostEngineSeam/engineReturns/firstDistributionHash'),
    conflict('/outcome/hostEngineSeam/engineReturns/secondDistributionHash'),
  ]),
  'CSM-030': Object.freeze([
    conflict('/outcome/hostEngineSeam/engineReturns/movedTarget'),
    conflict('/outcome/hostEngineSeam/engineReturns/parentId'),
    conflict('/outcome/hostEngineSeam/finalState/parentById/rect-b'),
    conflict('/scene/targets/rect-b/parentId'),
  ]),
});

export function patchMapDeclaredCsmConflicts(caseId) {
  return PATCH_MAP_CSM_DECLARED_IMMUTABLE_CONFLICTS[caseId] ?? Object.freeze([]);
}

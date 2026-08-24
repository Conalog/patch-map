import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
  type PatchMapMutationOperation,
  type PatchMapMutationTransactionRequest,
} from '../semantic/transaction';
import {
  PATCH_MAP_AUTHORING_REVISION,
  type PatchMapAuthoringAction,
  type PatchMapAuthoringDiagnostic,
  type PatchMapAuthoringFacts,
  type PatchMapAuthoringPlan,
} from './contracts';
import { fail, isJsonRecord } from './normalization';

const EMPTY_FACTS: PatchMapAuthoringFacts = Object.freeze({});

export function plannedPlan(
  action: PatchMapAuthoringAction,
  operations: readonly PatchMapMutationOperation[],
  selectedIds: readonly string[],
  planFacts: PatchMapAuthoringFacts,
): PatchMapAuthoringPlan {
  if (operations.length === 0) return unchangedPlan(action, planFacts);
  const transaction: PatchMapMutationTransactionRequest = Object.freeze({
    operations: Object.freeze([...operations]),
    strict: true,
    actionId: action.actionId,
    conflictPolicy: 'reject',
    recordHistory: true,
    history: Object.freeze({
      selectedIds: Object.freeze([...selectedIds]),
      mode: 'select',
    }),
  });
  return Object.freeze({
    schemaRevision: PATCH_MAP_AUTHORING_REVISION,
    actionType: action.type,
    action,
    facts: planFacts,
    status: 'planned',
    changed: true,
    transaction,
  });
}

export function unchangedPlan(
  action: PatchMapAuthoringAction,
  planFacts: PatchMapAuthoringFacts,
): PatchMapAuthoringPlan {
  return Object.freeze({
    schemaRevision: PATCH_MAP_AUTHORING_REVISION,
    actionType: action.type,
    action,
    facts: planFacts,
    status: 'unchanged',
    changed: false,
    transaction: null,
  });
}

export function rejectedPlan(
  action: PatchMapAuthoringAction | null,
  planDiagnostic: PatchMapAuthoringDiagnostic,
): PatchMapAuthoringPlan {
  return Object.freeze({
    schemaRevision: PATCH_MAP_AUTHORING_REVISION,
    actionType: action?.type ?? null,
    action,
    facts: EMPTY_FACTS,
    status: 'rejected',
    changed: false,
    transaction: null,
    diagnostic: planDiagnostic,
  });
}

export function facts(
  value: Readonly<Record<string, PatchMapMutationJsonValue>>,
): PatchMapAuthoringFacts {
  const detached = detachPatchMapMutationJsonValue(value, '$.facts');
  if (!isJsonRecord(detached)) throw new Error('Authoring facts lost record shape');
  return detached;
}

export function elementTarget(id: string): Readonly<{ readonly kind: 'element'; readonly id: string }> {
  return Object.freeze({ kind: 'element', id });
}

export function uniqueTargetIds(
  ids: readonly string[],
  minimum: number,
): readonly string[] {
  if (ids.length < minimum) {
    fail(
      'INVALID_VALUE',
      ['targets'],
      `Authoring action requires at least ${minimum} unique targets`,
    );
  }
  if (new Set(ids).size !== ids.length) {
    fail('INVALID_VALUE', ['targets'], 'Authoring targets must be unique');
  }
  return ids;
}

export function pathChangeIfDifferent(
  current: unknown,
  next: PatchMapMutationJsonValue,
  path: readonly (string | number)[],
): Readonly<{ readonly path: readonly (string | number)[]; readonly value: PatchMapMutationJsonValue }> | null {
  return jsonEqual(current, next) ? null : Object.freeze({ path: Object.freeze([...path]), value: next });
}

export function isPathChange<T>(value: T | null): value is T {
  return value !== null;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function authoringFingerprint(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

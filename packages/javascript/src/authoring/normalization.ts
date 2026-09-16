import {
  PATCH_MAP_ELEMENT_TYPES,
  type PatchMapElementType,
} from '../semantic/dataset';
import type { PatchMapPointTuple } from '../semantic/geometry';
import { isPlainRecord } from '../shared/plain-record';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
} from '../semantic/transaction';
import type {
  PatchMapAuthoringAction,
  PatchMapAuthoringAlignmentAxis,
  PatchMapAuthoringDiagnostic,
  PatchMapAuthoringDiagnosticCode,
  PatchMapAuthoringDistributionAxis,
  PatchMapAuthoringPlanningContext,
} from './contracts';

const CREATE_FIELDS = new Set([
  'type',
  'kind',
  'id',
  'positionWorld',
  'parentId',
  'actionId',
]);
const POSITION_FIELDS = new Set([
  'type',
  'target',
  'x',
  'y',
  'angleDegrees',
  'actionId',
]);
const ALIGN_FIELDS = new Set(['type', 'targets', 'axis', 'actionId']);
const DISTRIBUTE_FIELDS = new Set(['type', 'targets', 'axis', 'basis', 'actionId']);
const STYLE_FIELDS = new Set(['type', 'target', 'changes', 'strict', 'actionId']);
const MOVE_FIELDS = new Set(['type', 'target', 'parentId', 'index', 'actionId']);
const REORDER_FIELDS = new Set([
  'type',
  'targets',
  'placement',
  'preserveRelativeOrder',
  'actionId',
]);
const GROUP_FIELDS = new Set(['type', 'targets', 'groupId', 'actionId']);
const DUPLICATE_FIELDS = new Set([
  'type',
  'target',
  'rootId',
  'offsetWorld',
  'rewriteInternalReferences',
  'preserveExternalReferences',
  'actionId',
]);
const UNGROUP_FIELDS = new Set(['type', 'target', 'actionId']);

const ELEMENT_TYPE_SET = new Set<string>(PATCH_MAP_ELEMENT_TYPES);
const ALIGNMENT_AXIS_SET = new Set<PatchMapAuthoringAlignmentAxis>([
  'left',
  'right',
  'top',
  'bottom',
  'center-x',
  'center-y',
]);
const DISTRIBUTION_AXIS_SET = new Set<PatchMapAuthoringDistributionAxis>([
  'horizontal',
  'vertical',
]);

export function normalizeAction(value: unknown): PatchMapAuthoringAction {
  const record = strictRecord(value, []);
  const type = nonEmptyString(record.type, ['type']);
  switch (type) {
    case 'create-element': {
      rejectUnknown(record, CREATE_FIELDS);
      const kindValue = nonEmptyString(record.kind, ['kind']);
      if (!ELEMENT_TYPE_SET.has(kindValue)) {
        fail('INVALID_VALUE', ['kind'], `Unsupported element kind ${kindValue}`);
      }
      return Object.freeze({
        type,
        kind: kindValue as PatchMapElementType,
        id: nonEmptyString(record.id, ['id']),
        positionWorld: point(record.positionWorld, ['positionWorld']),
        parentId: nullableId(record.parentId, ['parentId']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'edit-position-angle':
      rejectUnknown(record, POSITION_FIELDS);
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        x: finiteNumber(record.x, ['x']),
        y: finiteNumber(record.y, ['y']),
        angleDegrees: finiteNumber(record.angleDegrees, ['angleDegrees']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    case 'align-targets': {
      rejectUnknown(record, ALIGN_FIELDS);
      const axis = nonEmptyString(record.axis, ['axis']);
      if (!ALIGNMENT_AXIS_SET.has(axis as PatchMapAuthoringAlignmentAxis)) {
        fail('INVALID_VALUE', ['axis'], `Unsupported alignment axis ${axis}`);
      }
      return Object.freeze({
        type,
        targets: stringArray(record.targets, ['targets']),
        axis: axis as PatchMapAuthoringAlignmentAxis,
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'distribute-targets': {
      rejectUnknown(record, DISTRIBUTE_FIELDS);
      const axis = nonEmptyString(record.axis, ['axis']);
      if (!DISTRIBUTION_AXIS_SET.has(axis as PatchMapAuthoringDistributionAxis)) {
        fail('INVALID_VALUE', ['axis'], `Unsupported distribution axis ${axis}`);
      }
      if (record.basis !== 'bounds') {
        fail('INVALID_VALUE', ['basis'], 'Pinned distribution basis must be bounds');
      }
      return Object.freeze({
        type,
        targets: stringArray(record.targets, ['targets']),
        axis: axis as PatchMapAuthoringDistributionAxis,
        basis: 'bounds',
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'apply-style': {
      rejectUnknown(record, STYLE_FIELDS);
      if (record.strict !== true) {
        fail('INVALID_VALUE', ['strict'], 'Authoring style transactions must be strict');
      }
      const changes = detachPatchMapMutationJsonValue(record.changes, '$.changes');
      if (!isJsonRecord(changes)) {
        fail('INVALID_VALUE', ['changes'], 'Style changes must be a strict JSON record');
      }
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        changes,
        strict: true,
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'move-hierarchy':
      rejectUnknown(record, MOVE_FIELDS);
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        parentId: nullableId(record.parentId, ['parentId']),
        index: nonNegativeInteger(record.index, ['index']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    case 'reorder-z': {
      rejectUnknown(record, REORDER_FIELDS);
      if (record.placement !== 'front' && record.placement !== 'back') {
        fail('INVALID_VALUE', ['placement'], 'Z-order placement must be front or back');
      }
      if (record.preserveRelativeOrder !== true) {
        fail(
          'INVALID_VALUE',
          ['preserveRelativeOrder'],
          'Z-order changes must preserve relative order',
        );
      }
      return Object.freeze({
        type,
        targets: stringArray(record.targets, ['targets']),
        placement: record.placement,
        preserveRelativeOrder: true,
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    }
    case 'group-targets':
      rejectUnknown(record, GROUP_FIELDS);
      return Object.freeze({
        type,
        targets: stringArray(record.targets, ['targets']),
        groupId: nonEmptyString(record.groupId, ['groupId']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    case 'duplicate-tree':
    case 'copy-paste-tree':
      rejectUnknown(record, DUPLICATE_FIELDS);
      if (record.rewriteInternalReferences !== true) {
        fail(
          'INVALID_VALUE',
          ['rewriteInternalReferences'],
          'Internal duplicate references must be rewritten',
        );
      }
      if (record.preserveExternalReferences !== true) {
        fail(
          'INVALID_VALUE',
          ['preserveExternalReferences'],
          'External duplicate references must be preserved',
        );
      }
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        rootId: nonEmptyString(record.rootId, ['rootId']),
        offsetWorld: point(record.offsetWorld, ['offsetWorld']),
        rewriteInternalReferences: true,
        preserveExternalReferences: true,
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    case 'ungroup-target':
      rejectUnknown(record, UNGROUP_FIELDS);
      return Object.freeze({
        type,
        target: nonEmptyString(record.target, ['target']),
        actionId: nonEmptyString(record.actionId, ['actionId']),
      });
    default:
      fail('INVALID_VALUE', ['type'], `Unsupported authoring action ${type}`);
  }
}

export function normalizeContext(value: unknown): PatchMapAuthoringPlanningContext {
  const record = strictRecord(value, ['context']);
  rejectUnknown(record, new Set(['selectionIds']), ['context']);
  return Object.freeze({
    selectionIds: stringArray(record.selectionIds, ['context', 'selectionIds']),
  });
}

function strictRecord(
  value: unknown,
  path: readonly (string | number)[],
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) {
    fail('INVALID_VALUE', path, 'Expected a strict plain record');
  }
  return value;
}

function rejectUnknown(
  record: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  path: readonly (string | number)[] = [],
): void {
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    fail('INVALID_VALUE', [...path, unknown], `Unknown authoring field ${unknown}`);
  }
}

function nonEmptyString(
  value: unknown,
  path: readonly (string | number)[],
): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail('INVALID_VALUE', path, 'Expected a non-empty string');
  }
  return value;
}

function nullableId(
  value: unknown,
  path: readonly (string | number)[],
): string | null {
  return value === null ? null : nonEmptyString(value, path);
}

function finiteNumber(
  value: unknown,
  path: readonly (string | number)[],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_VALUE', path, 'Expected a finite number');
  }
  return value;
}

function nonNegativeInteger(
  value: unknown,
  path: readonly (string | number)[],
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail('INVALID_VALUE', path, 'Expected a non-negative safe integer');
  }
  return Number(value);
}

function point(
  value: unknown,
  path: readonly (string | number)[],
): PatchMapPointTuple {
  if (!Array.isArray(value) || value.length !== 2) {
    fail('INVALID_VALUE', path, 'Expected a two-value point');
  }
  return Object.freeze([
    finiteNumber(value[0], [...path, 0]),
    finiteNumber(value[1], [...path, 1]),
  ]);
}

function stringArray(
  value: unknown,
  path: readonly (string | number)[],
): readonly string[] {
  if (!Array.isArray(value)) fail('INVALID_VALUE', path, 'Expected an array of strings');
  return Object.freeze(value.map((entry, index) =>
    nonEmptyString(entry, [...path, index])));
}

export function isJsonRecord(
  value: PatchMapMutationJsonValue | undefined,
): value is Readonly<Record<string, PatchMapMutationJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function fail(
  code: PatchMapAuthoringDiagnosticCode,
  path: readonly (string | number)[],
  message: string,
): never {
  throw new AuthoringValidationFailure(Object.freeze({
    code,
    path: Object.freeze([...path]),
    message,
  }));
}

export class AuthoringValidationFailure extends Error {
  public readonly diagnostic: PatchMapAuthoringDiagnostic;

  public constructor(diagnostic: PatchMapAuthoringDiagnostic) {
    super(diagnostic.message);
    this.name = 'AuthoringValidationFailure';
    this.diagnostic = diagnostic;
  }
}

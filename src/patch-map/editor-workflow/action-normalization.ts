import type { PatchMapEditorWorkflowAction } from './contracts';
import { isPlainRecord } from './dataset-atoms';

export function normalizeAction(value: PatchMapEditorWorkflowAction): PatchMapEditorWorkflowAction {
  if (!isPlainRecord(value) || typeof value.type !== 'string') {
    throw new TypeError('editor workflow action must be an object');
  }
  switch (value.type) {
    case 'select-targets':
      return Object.freeze({
        type: value.type,
        targets: stringArray(value.targets, 'selection targets'),
        mode: exact(value.mode, 'replace', 'selection mode'),
      });
    case 'enter-grid-edit':
      return Object.freeze({
        type: value.type,
        target: nonempty(value.target, 'grid target'),
        ...(value.linkedCellIds === undefined
          ? {}
          : { linkedCellIds: stringArray(value.linkedCellIds, 'linked cells') }),
      });
    case 'reveal-inactive-cells':
    case 'exit-grid-edit':
    case 'enter-relation-edit':
    case 'cancel-text-edit':
      return Object.freeze({
        type: value.type,
        target: nonempty(value.target, `${value.type} target`),
      }) as PatchMapEditorWorkflowAction;
    case 'resize-grid':
      return Object.freeze({
        type: value.type,
        target: nonempty(value.target, 'grid target'),
        rows: positiveInteger(value.rows, 'grid rows'),
        columns: positiveInteger(value.columns, 'grid columns'),
        gapX: nonnegativeFinite(value.gapX, 'grid gapX'),
        gapY: nonnegativeFinite(value.gapY, 'grid gapY'),
        actionId: nonempty(value.actionId, 'grid actionId'),
      });
    case 'set-grid-cell-active':
      return Object.freeze({
        type: value.type,
        target: nonempty(value.target, 'grid cell target'),
        active: booleanValue(value.active, 'grid active'),
        actionId: nonempty(value.actionId, 'grid actionId'),
      });
    case 'add-relation-link':
    case 'remove-relation-link':
      return Object.freeze({
        type: value.type,
        relationId: nonempty(value.relationId, 'relation ID'),
        source: nonempty(value.source, 'relation source'),
        target: nonempty(value.target, 'relation target'),
        actionId: nonempty(value.actionId, 'relation actionId'),
      });
    case 'exit-relation-edit':
      return Object.freeze({
        type: value.type,
        relationId: nonempty(value.relationId, 'relation ID'),
      });
    case 'open-text-editor':
      return Object.freeze({
        type: value.type,
        target: nonempty(value.target, 'text target'),
        hostOverlay: exact(value.hostOverlay, true, 'host overlay'),
      });
    case 'resolve-editor-target-by-id':
      return Object.freeze({
        type: value.type,
        target: nonempty(value.target, 'text target'),
      });
    case 'commit-text-edit':
      return Object.freeze({
        type: value.type,
        target: nonempty(value.target, 'text target'),
        text: stringValue(value.text, 'text source'),
        ...(value.preserveStyle === undefined
          ? {}
          : { preserveStyle: booleanValue(value.preserveStyle, 'preserveStyle') }),
        actionId: nonempty(value.actionId, 'text actionId'),
      });
    case 'request-delete-plan':
      return Object.freeze({
        type: value.type,
        targets: stringArray(value.targets, 'delete targets'),
      });
    case 'apply-host-cascade-confirmation':
      return Object.freeze({
        type: value.type,
        confirmed: booleanValue(value.confirmed, 'delete confirmation'),
        cascadeTargets: stringArray(value.cascadeTargets, 'cascade targets'),
        ...(value.registryLoading === undefined
          ? {}
          : { registryLoading: booleanValue(value.registryLoading, 'registry loading') }),
      });
    case 'delete-transaction':
      return Object.freeze({
        type: value.type,
        targets: stringArray(value.targets, 'delete targets'),
        actionId: nonempty(value.actionId, 'delete actionId'),
      });
    default:
      throw new TypeError('editor workflow action type is unsupported');
  }
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new TypeError(`${label} must be an array of non-empty strings`);
  }
  return Object.freeze(value.map((entry: unknown) => entry as string));
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`);
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function nonnegativeFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be finite and non-negative`);
  }
  return value;
}

function exact<T>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new TypeError(`${label} is invalid`);
  return expected;
}


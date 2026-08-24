import type {
  PatchMapElementType,
  NormalizedPatchMapElement,
} from '../semantic/dataset';
import {
  PATCH_MAP_IDENTITY_AFFINE,
  applyPatchMapAffine,
  invertPatchMapAffine,
  type PatchMapAffineMatrix,
  type PatchMapPointTuple,
} from '../semantic/geometry';
import type {
  PatchMapMutationJsonValue,
  PatchMapMutationOperation,
} from '../semantic/transaction';
import type {
  PatchMapAuthoringAction,
  PatchMapAuthoringPlan,
} from './contracts';
import { fail, isJsonRecord } from './normalization';
import {
  elementTarget,
  facts,
  isPathChange,
  pathChangeIfDifferent,
  plannedPlan,
  unchangedPlan,
} from './plan-results';
import {
  assertUnlocked,
  requireLocation,
  roundSix,
  type AuthoringElementLocation,
} from './scene-context';

const STYLE_CHANGE_FIELDS = new Set([
  'alpha',
  'fill',
  'stroke',
  'strokeWidth',
  'cornerRadius',
  'fontSize',
  'letterSpacing',
  'lineHeight',
]);

export function planCreate(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'create-element' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
  dataset: readonly NormalizedPatchMapElement[],
): PatchMapAuthoringPlan {
  if (index.has(action.id)) {
    fail('DUPLICATE_ID', ['id'], `Element ID ${action.id} already exists`);
  }
  const destination = destinationForParent(action.parentId, index, dataset);
  const parentPoint = applyPatchMapAffine(
    invertPatchMapAffine(destination.parentAffine),
    action.positionWorld,
  );
  const element = createElementRecord(action.kind, action.id, parentPoint);
  const operation: PatchMapMutationOperation = Object.freeze({
    op: 'add',
    parent: action.parentId === null
      ? null
      : Object.freeze({ kind: 'element' as const, id: action.parentId }),
    collection: 'children',
    index: destination.childCount,
    value: element,
  });
  return plannedPlan(
    action,
    [operation],
    [action.id],
    facts({
      createdId: action.id,
      kind: action.kind,
      componentIds: componentIds(element),
      positionWorld: action.positionWorld,
    }),
  );
}

export function planStyle(
  action: Extract<PatchMapAuthoringAction, { readonly type: 'apply-style' }>,
  index: ReadonlyMap<string, AuthoringElementLocation>,
): PatchMapAuthoringPlan {
  const location = requireLocation(index, action.target, ['target']);
  assertUnlocked(location, ['target']);
  if (location.element.type !== 'text') {
    fail('INVALID_MUTATION', ['target'], 'Pinned advanced style editing requires a text element');
  }
  validateStyleChanges(action.changes);
  const style = location.element.style;
  const changes = Object.entries(action.changes)
    .map(([key, value]) => pathChangeIfDifferent(style[key], value, ['style', key]))
    .filter(isPathChange);
  const resultFacts = facts({
    target: action.target,
    changedFields: Object.keys(action.changes),
  });
  if (changes.length === 0) return unchangedPlan(action, resultFacts);
  return plannedPlan(
    action,
    [Object.freeze({
      op: 'merge',
      target: elementTarget(action.target),
      changes: Object.freeze(changes),
    })],
    [action.target],
    resultFacts,
  );
}

function createElementRecord(
  kind: PatchMapElementType,
  id: string,
  position: PatchMapPointTuple,
): Readonly<Record<string, PatchMapMutationJsonValue>> {
  const [width, height] = defaultElementSize(kind);
  const attrs = Object.freeze({
    x: roundSix(position[0] - width / 2),
    y: roundSix(position[1] - height / 2),
  });
  switch (kind) {
    case 'item':
      return Object.freeze({
        type: 'item',
        id,
        size: Object.freeze({ width, height }),
        padding: 4,
        components: Object.freeze([
          Object.freeze({
            type: 'background',
            id: `${id}.background`,
            source: Object.freeze({ type: 'rect', fill: '#dbeafe' }),
          }),
          Object.freeze({
            type: 'bar',
            id: `${id}.bar`,
            source: Object.freeze({ type: 'rect', fill: '#2563eb' }),
            size: Object.freeze({ width: 56, height: 8 }),
            placement: 'bottom',
            animation: true,
            animationDuration: 200,
          }),
          Object.freeze({
            type: 'icon',
            id: `${id}.icon`,
            source: 'object',
            size: Object.freeze({ width: 16, height: 16 }),
            placement: 'left-top',
            tint: '#1e3a8a',
          }),
          Object.freeze({
            type: 'text',
            id: `${id}.text`,
            text: 'Item',
            placement: 'center',
            style: Object.freeze({
              fontFamily: 'Fira Code',
              fontSize: 14,
              fill: '#111827',
            }),
          }),
        ]),
        attrs,
      });
    case 'rect':
      return Object.freeze({
        type: 'rect',
        id,
        size: Object.freeze({ width, height }),
        fill: '#3b82f6',
        radius: 4,
        attrs,
      });
    case 'image':
      return Object.freeze({
        type: 'image',
        id,
        source: 'object',
        size: Object.freeze({ width, height }),
        attrs,
      });
    case 'text':
      return Object.freeze({
        type: 'text',
        id,
        text: 'Text',
        style: Object.freeze({
          fontFamily: 'Fira Code',
          fontSize: 16,
          fill: '#111827',
        }),
        size: Object.freeze({ width, height }),
        attrs,
      });
    case 'group':
      return Object.freeze({
        type: 'group',
        id,
        children: Object.freeze([]),
        attrs,
      });
    case 'grid':
      return Object.freeze({
        type: 'grid',
        id,
        cells: Object.freeze([Object.freeze([1])]),
        inactiveCellStrategy: 'hide',
        gap: Object.freeze({ x: 8, y: 8 }),
        item: Object.freeze({
          size: Object.freeze({ width, height }),
          padding: 4,
          components: Object.freeze([
            Object.freeze({
              type: 'background',
              id: `${id}.cell-background`,
              source: Object.freeze({ type: 'rect', fill: '#e0f2fe' }),
            }),
          ]),
        }),
        attrs,
      });
    case 'relations':
      return Object.freeze({
        type: 'relations',
        id,
        links: Object.freeze([]),
        style: Object.freeze({ color: '#334155', width: 2 }),
        attrs,
      });
  }
}

function defaultElementSize(kind: PatchMapElementType): PatchMapPointTuple {
  switch (kind) {
    case 'item':
      return Object.freeze([100, 80]);
    case 'rect':
      return Object.freeze([80, 60]);
    case 'image':
      return Object.freeze([80, 48]);
    case 'text':
      return Object.freeze([96, 24]);
    case 'grid':
      return Object.freeze([48, 48]);
    case 'group':
    case 'relations':
      return Object.freeze([0, 0]);
  }
}

function destinationForParent(
  parentId: string | null,
  index: ReadonlyMap<string, AuthoringElementLocation>,
  dataset: readonly NormalizedPatchMapElement[],
): Readonly<{ readonly parentAffine: PatchMapAffineMatrix; readonly childCount: number }> {
  if (parentId === null) {
    return Object.freeze({
      parentAffine: PATCH_MAP_IDENTITY_AFFINE,
      childCount: dataset.length,
    });
  }
  const parent = requireLocation(index, parentId, ['parentId']);
  assertUnlocked(parent, ['parentId']);
  if (parent.element.type !== 'group') {
    fail(
      'INVALID_MUTATION',
      ['parentId'],
      'PATCH MAP v0.10 hierarchy parents must be group elements',
    );
  }
  return Object.freeze({
    parentAffine: parent.worldAffine,
    childCount: parent.element.children.length,
  });
}

function validateStyleChanges(
  changes: Readonly<Record<string, PatchMapMutationJsonValue>>,
): void {
  const keys = Object.keys(changes);
  if (keys.length === 0) {
    fail('INVALID_VALUE', ['changes'], 'Style changes must not be empty');
  }
  const unknown = keys.find((key) => !STYLE_CHANGE_FIELDS.has(key));
  if (unknown !== undefined) {
    fail('INVALID_VALUE', ['changes', unknown], `Unsupported pinned style field ${unknown}`);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'fill' || key === 'stroke') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail('INVALID_VALUE', [key], `${key} must be a finite number`);
    }
    if (key === 'alpha' && (value < 0 || value > 1)) {
      fail('INVALID_VALUE', [key], 'alpha must be within [0, 1]');
    }
    if (
      key !== 'alpha' &&
      key !== 'letterSpacing' &&
      value < 0
    ) {
      fail('INVALID_VALUE', [key], `${key} must be non-negative`);
    }
    if ((key === 'fontSize' || key === 'lineHeight') && value === 0) {
      fail('INVALID_VALUE', [key], `${key} must be greater than zero`);
    }
  }
}

function componentIds(
  element: Readonly<Record<string, PatchMapMutationJsonValue>>,
): readonly string[] {
  const source = element.type === 'item'
    ? element.components
    : element.type === 'grid' && isJsonRecord(element.item)
      ? element.item.components
      : null;
  if (!Array.isArray(source)) return Object.freeze([]);
  const components = source as readonly PatchMapMutationJsonValue[];
  return Object.freeze(components.flatMap((component) =>
    isJsonRecord(component) && typeof component.id === 'string' ? [component.id] : []));
}

import type {
  CoreOperation,
  EntityInput,
  EntityPatch,
} from '../../dense/contracts';
import type { CanonicalEntity } from '../../dense/validation';
import {
  detachedValue,
  fieldEqual,
  freezeOperation,
} from './result-values';

export function entityDelta(
  current: CanonicalEntity,
  candidate: CanonicalEntity,
): readonly CoreOperation[] {
  const changes: Record<string, unknown> = {};
  for (const field of patchFields(candidate.kind)) {
    if (!fieldEqual(current[field], candidate[field])) changes[field] = detachedValue(candidate[field]);
  }

  const operations: CoreOperation[] = [];
  if (Object.keys(changes).length > 0) {
    operations.push(freezeOperation({
      type: 'patch',
      target: candidate.id,
      changes: Object.freeze(changes) as EntityPatch,
    }));
  }
  if (current.visible !== candidate.visible) {
    operations.push(freezeOperation({
      type: 'visibility',
      target: candidate.id,
      visible: candidate.visible,
    }));
  }
  return Object.freeze(operations);
}

type CanonicalPatchField = Exclude<keyof EntityPatch, 'visible'>;

const COMMON_PATCH_FIELDS = Object.freeze([
  'opacity',
  'interactive',
  'zIndex',
  'tags',
] as const satisfies readonly CanonicalPatchField[]);

const GEOMETRY_PATCH_FIELDS = Object.freeze([
  'x',
  'y',
  'width',
  'height',
  'rotation',
] as const satisfies readonly CanonicalPatchField[]);

function patchFields(kind: CanonicalEntity['kind']): readonly CanonicalPatchField[] {
  switch (kind) {
    case 'rect':
      return [...GEOMETRY_PATCH_FIELDS, ...COMMON_PATCH_FIELDS, 'fill', 'stroke', 'strokeWidth', 'radius'];
    case 'text':
      return [
        ...GEOMETRY_PATCH_FIELDS,
        ...COMMON_PATCH_FIELDS,
        'text',
        'color',
        'fontSize',
        'fontFamily',
        'fontWeight',
        'align',
        'maxLines',
      ];
    case 'image':
      return [...GEOMETRY_PATCH_FIELDS, ...COMMON_PATCH_FIELDS, 'source', 'tint', 'fit'];
    case 'bar':
      return [
        ...GEOMETRY_PATCH_FIELDS,
        ...COMMON_PATCH_FIELDS,
        'value',
        'min',
        'max',
        'fill',
        'trackFill',
        'radius',
      ];
    case 'relation':
      return [...COMMON_PATCH_FIELDS, 'from', 'to', 'color', 'lineWidth'];
  }
}

export function canonicalToInput(entity: CanonicalEntity): EntityInput {
  const tags = Object.freeze([...entity.tags]);
  const common = {
    id: entity.id,
    opacity: entity.opacity,
    visible: entity.visible,
    interactive: entity.interactive,
    zIndex: entity.zIndex,
    tags,
  };
  const geometry = {
    ...common,
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
    rotation: entity.rotation,
  };

  switch (entity.kind) {
    case 'rect':
      return Object.freeze({
        ...geometry,
        kind: entity.kind,
        fill: entity.fill,
        stroke: entity.stroke,
        strokeWidth: entity.strokeWidth,
        radius: entity.radius,
      });
    case 'text':
      return Object.freeze({
        ...geometry,
        kind: entity.kind,
        text: entity.text,
        color: entity.color,
        fontSize: entity.fontSize,
        fontFamily: entity.fontFamily,
        fontWeight: entity.fontWeight,
        align: entity.align,
        maxLines: entity.maxLines,
      });
    case 'image':
      return Object.freeze({
        ...geometry,
        kind: entity.kind,
        source: entity.source,
        tint: entity.tint,
        fit: entity.fit,
      });
    case 'bar':
      return Object.freeze({
        ...geometry,
        kind: entity.kind,
        value: entity.value,
        min: entity.min,
        max: entity.max,
        fill: entity.fill,
        trackFill: entity.trackFill,
        radius: entity.radius,
      });
    case 'relation':
      return Object.freeze({
        ...common,
        kind: entity.kind,
        from: entity.from,
        to: entity.to,
        color: entity.color,
        lineWidth: entity.lineWidth,
      });
  }
}

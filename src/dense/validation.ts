import type {
  AlignSetting,
  EntityInput,
  EntityKind,
  EntityPatch,
  FitSetting,
  Rgba,
  SceneDocument,
} from './contracts';
import { CoreValidationError } from './errors';

export const enum KindCode {
  Rect = 1,
  Text = 2,
  Image = 3,
  Bar = 4,
  Relation = 5,
}

export interface CanonicalEntity {
  readonly id: string;
  readonly kind: EntityKind;
  readonly kindCode: KindCode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly opacity: number;
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly zIndex: number;
  readonly tags: readonly string[];
  readonly fill: Rgba;
  readonly stroke: Rgba;
  readonly strokeWidth: number;
  readonly radius: number;
  readonly text: string;
  readonly color: Rgba;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly align: AlignSetting;
  readonly maxLines: number;
  readonly source: string;
  readonly tint: Rgba;
  readonly fit: FitSetting;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly trackFill: Rgba;
  readonly from: string;
  readonly to: string;
  readonly lineWidth: number;
}

const TRANSPARENT = 0x00000000;
const WHITE = 0xffffffff;
const BLACK = 0x000000ff;

function fail(path: string, message: string): never {
  throw new CoreValidationError(path, message);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, 'expected a finite number');
  }
  return value;
}

function nonNegative(value: unknown, path: string): number {
  const result = finite(value, path);
  if (result < 0) fail(path, 'expected a non-negative number');
  return result;
}

function opacity(value: unknown, path: string): number {
  const result = finite(value, path);
  if (result < 0 || result > 1) fail(path, 'expected a number between 0 and 1');
  return result;
}

function rgba(value: unknown, path: string): Rgba {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 0xffffffff
  ) {
    fail(path, 'expected a packed 0xRRGGBBAA integer');
  }
  return value >>> 0;
}

function optionalBoolean(value: unknown, path: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value;
}

function integer(value: unknown, path: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail(path, 'expected a safe integer');
  }
  return value;
}

function identifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(path, 'expected a non-empty string');
  }
  return value;
}

function tags(value: unknown, path: string): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) fail(path, 'expected an array of strings');
  const result = value.map((tag, index) => identifier(tag, `${path}[${index}]`));
  return Object.freeze(result);
}

function kindCode(kind: EntityKind): KindCode {
  switch (kind) {
    case 'rect':
      return KindCode.Rect;
    case 'text':
      return KindCode.Text;
    case 'image':
      return KindCode.Image;
    case 'bar':
      return KindCode.Bar;
    case 'relation':
      return KindCode.Relation;
  }
}

export function kindFromCode(code: KindCode): EntityKind {
  switch (code) {
    case KindCode.Rect:
      return 'rect';
    case KindCode.Text:
      return 'text';
    case KindCode.Image:
      return 'image';
    case KindCode.Bar:
      return 'bar';
    case KindCode.Relation:
      return 'relation';
  }
}

export function normalizeEntity(entity: EntityInput, path: string): CanonicalEntity {
  if (typeof entity !== 'object' || entity === null) fail(path, 'expected an entity object');

  const id = identifier(entity.id, `${path}.id`);
  const kind = entity.kind;
  if (!['rect', 'text', 'image', 'bar', 'relation'].includes(kind)) {
    fail(`${path}.kind`, 'expected rect, text, image, bar, or relation');
  }

  const isRelation = kind === 'relation';
  const geometry = isRelation
    ? { x: 0, y: 0, width: 0, height: 0, rotation: 0 }
    : {
        x: finite(entity.x, `${path}.x`),
        y: finite(entity.y, `${path}.y`),
        width: nonNegative(entity.width, `${path}.width`),
        height: nonNegative(entity.height, `${path}.height`),
        rotation: finite(entity.rotation ?? 0, `${path}.rotation`),
      };

  const base = {
    id,
    kind,
    kindCode: kindCode(kind),
    ...geometry,
    opacity: opacity(entity.opacity ?? 1, `${path}.opacity`),
    visible: optionalBoolean(entity.visible, `${path}.visible`, true),
    interactive: optionalBoolean(entity.interactive, `${path}.interactive`, true),
    zIndex: integer(entity.zIndex, `${path}.zIndex`, 0),
    tags: tags(entity.tags, `${path}.tags`),
    fill: TRANSPARENT,
    stroke: TRANSPARENT,
    strokeWidth: 0,
    radius: 0,
    text: '',
    color: BLACK,
    fontSize: 0,
    fontFamily: 'sans-serif',
    fontWeight: 400,
    align: 'left' as const,
    maxLines: 0,
    source: '',
    tint: WHITE,
    fit: 'contain' as const,
    value: 0,
    min: 0,
    max: 1,
    trackFill: TRANSPARENT,
    from: '',
    to: '',
    lineWidth: 0,
  };

  switch (entity.kind) {
    case 'rect':
      return {
        ...base,
        fill: rgba(entity.fill, `${path}.fill`),
        stroke: rgba(entity.stroke ?? TRANSPARENT, `${path}.stroke`),
        strokeWidth: nonNegative(entity.strokeWidth ?? 0, `${path}.strokeWidth`),
        radius: nonNegative(entity.radius ?? 0, `${path}.radius`),
      };
    case 'text': {
      if (typeof entity.text !== 'string') fail(`${path}.text`, 'expected a string');
      const fontFamily = entity.fontFamily ?? 'sans-serif';
      if (typeof fontFamily !== 'string' || fontFamily.length === 0) {
        fail(`${path}.fontFamily`, 'expected a non-empty string');
      }
      const align = entity.align ?? 'left';
      if (!['left', 'center', 'right', 'justify'].includes(align)) {
        fail(`${path}.align`, 'expected left, center, right, or justify');
      }
      return {
        ...base,
        text: entity.text,
        color: rgba(entity.color, `${path}.color`),
        fontSize: nonNegative(entity.fontSize, `${path}.fontSize`),
        fontFamily,
        fontWeight: integer(entity.fontWeight, `${path}.fontWeight`, 400),
        align,
        maxLines: integer(entity.maxLines, `${path}.maxLines`, 0),
      };
    }
    case 'image': {
      const fit = entity.fit ?? 'contain';
      if (!['contain', 'cover', 'stretch'].includes(fit)) {
        fail(`${path}.fit`, 'expected contain, cover, or stretch');
      }
      return {
        ...base,
        source: identifier(entity.source, `${path}.source`),
        tint: rgba(entity.tint ?? WHITE, `${path}.tint`),
        fit,
      };
    }
    case 'bar': {
      const min = finite(entity.min ?? 0, `${path}.min`);
      const max = finite(entity.max ?? 1, `${path}.max`);
      if (max <= min) fail(`${path}.max`, 'expected max to be greater than min');
      const value = finite(entity.value, `${path}.value`);
      return {
        ...base,
        value,
        min,
        max,
        fill: rgba(entity.fill, `${path}.fill`),
        trackFill: rgba(entity.trackFill ?? TRANSPARENT, `${path}.trackFill`),
        radius: nonNegative(entity.radius ?? 0, `${path}.radius`),
      };
    }
    case 'relation':
      return {
        ...base,
        from: identifier(entity.from, `${path}.from`),
        to: identifier(entity.to, `${path}.to`),
        color: rgba(entity.color, `${path}.color`),
        lineWidth: nonNegative(entity.lineWidth ?? 1, `${path}.lineWidth`),
      };
  }
}

export function normalizeDocument(document: SceneDocument): readonly CanonicalEntity[] {
  if (typeof document !== 'object' || document === null) {
    fail('$', 'expected a scene document object');
  }
  if (document.version !== 1) fail('$.version', 'expected version 1');
  const rawEntities = (document as unknown as { entities?: unknown }).entities;
  if (!Array.isArray(rawEntities)) fail('$.entities', 'expected an entity array');
  const entities: readonly EntityInput[] = document.entities;

  const ids = new Set<string>();
  const normalized = entities.map((entity, index) => {
    const result = normalizeEntity(entity, `$.entities[${index}]`);
    if (ids.has(result.id)) fail(`$.entities[${index}].id`, `duplicate ID ${result.id}`);
    ids.add(result.id);
    return result;
  });

  for (let index = 0; index < normalized.length; index += 1) {
    const entity = normalized[index];
    if (entity?.kind !== 'relation') continue;
    if (!ids.has(entity.from)) fail(`$.entities[${index}].from`, `unknown ID ${entity.from}`);
    if (!ids.has(entity.to)) fail(`$.entities[${index}].to`, `unknown ID ${entity.to}`);
  }

  return normalized;
}

export function validatePatch(patch: EntityPatch, kind: EntityKind, path: string): void {
  if (typeof patch !== 'object' || patch === null) fail(path, 'expected a patch object');
  if (
    kind === 'relation' &&
    (patch.x !== undefined ||
      patch.y !== undefined ||
      patch.width !== undefined ||
      patch.height !== undefined ||
      patch.rotation !== undefined)
  ) {
    fail(path, 'relations derive geometry from their endpoints');
  }
  if (patch.x !== undefined) finite(patch.x, `${path}.x`);
  if (patch.y !== undefined) finite(patch.y, `${path}.y`);
  if (patch.width !== undefined) nonNegative(patch.width, `${path}.width`);
  if (patch.height !== undefined) nonNegative(patch.height, `${path}.height`);
  if (patch.rotation !== undefined) finite(patch.rotation, `${path}.rotation`);
  if (patch.opacity !== undefined) opacity(patch.opacity, `${path}.opacity`);
  if (patch.visible !== undefined) optionalBoolean(patch.visible, `${path}.visible`, true);
  if (patch.interactive !== undefined) optionalBoolean(patch.interactive, `${path}.interactive`, true);
  if (patch.zIndex !== undefined) integer(patch.zIndex, `${path}.zIndex`, 0);
  if (patch.tags !== undefined) tags(patch.tags, `${path}.tags`);

  const allowed = PATCH_FIELDS[kind];
  for (const key of Object.keys(patch)) {
    if (!BASE_PATCH_FIELDS.has(key) && !allowed.has(key)) {
      fail(`${path}.${key}`, `field is not valid for ${kind}`);
    }
  }

  if (patch.fill !== undefined) rgba(patch.fill, `${path}.fill`);
  if (patch.stroke !== undefined) rgba(patch.stroke, `${path}.stroke`);
  if (patch.strokeWidth !== undefined) nonNegative(patch.strokeWidth, `${path}.strokeWidth`);
  if (patch.radius !== undefined) nonNegative(patch.radius, `${path}.radius`);
  if (patch.text !== undefined && typeof patch.text !== 'string') fail(`${path}.text`, 'expected a string');
  if (patch.color !== undefined) rgba(patch.color, `${path}.color`);
  if (patch.fontSize !== undefined) nonNegative(patch.fontSize, `${path}.fontSize`);
  if (patch.fontFamily !== undefined) identifier(patch.fontFamily, `${path}.fontFamily`);
  if (patch.fontWeight !== undefined) integer(patch.fontWeight, `${path}.fontWeight`, 400);
  if (patch.align !== undefined && !['left', 'center', 'right', 'justify'].includes(patch.align)) {
    fail(`${path}.align`, 'expected left, center, right, or justify');
  }
  if (patch.maxLines !== undefined) integer(patch.maxLines, `${path}.maxLines`, 0);
  if (patch.source !== undefined) identifier(patch.source, `${path}.source`);
  if (patch.tint !== undefined) rgba(patch.tint, `${path}.tint`);
  if (patch.fit !== undefined && !['contain', 'cover', 'stretch'].includes(patch.fit)) {
    fail(`${path}.fit`, 'expected contain, cover, or stretch');
  }
  if (patch.value !== undefined) finite(patch.value, `${path}.value`);
  if (patch.min !== undefined) finite(patch.min, `${path}.min`);
  if (patch.max !== undefined) finite(patch.max, `${path}.max`);
  if (patch.trackFill !== undefined) rgba(patch.trackFill, `${path}.trackFill`);
  if (patch.from !== undefined) identifier(patch.from, `${path}.from`);
  if (patch.to !== undefined) identifier(patch.to, `${path}.to`);
  if (patch.lineWidth !== undefined) nonNegative(patch.lineWidth, `${path}.lineWidth`);
}

const BASE_PATCH_FIELDS = new Set([
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'opacity',
  'visible',
  'interactive',
  'zIndex',
  'tags',
]);

const PATCH_FIELDS: Record<EntityKind, ReadonlySet<string>> = {
  rect: new Set(['fill', 'stroke', 'strokeWidth', 'radius']),
  text: new Set(['text', 'color', 'fontSize', 'fontFamily', 'fontWeight', 'align', 'maxLines']),
  image: new Set(['source', 'tint', 'fit']),
  bar: new Set(['value', 'min', 'max', 'fill', 'trackFill', 'radius']),
  relation: new Set(['color', 'from', 'to', 'lineWidth']),
};

import { Color } from 'pixi.js';

import { PATCH_MAP_FIRA_CODE_FAMILY } from '../text-font-family';
import {
  PatchMapDatasetError,
  type PatchMapAssetDescriptor,
  type PatchMapAssetSource,
  type PatchMapBackgroundSource,
  type PatchMapRelationStyle,
  type PatchMapRectTexture,
  type PatchMapStrokeStyle,
  type PatchMapTextStyle,
} from './contracts';
import {
  assertKnownFields,
  booleanValue,
  cloneJsonArray,
  cloneJsonRecord,
  cloneJsonValue,
  defineDataProperty,
  enumValue,
  finiteNumber,
  invalidValue,
  isRecord,
  nonnegativeFiniteNumber,
  normalizeRadius,
  positiveFiniteNumber,
  rangedNumber,
  recordValue,
  requiredField,
  stringValue,
} from './value-normalization';

const ASSET_DESCRIPTOR_FIELDS = new Set(['src', 'data', 'format', 'parser']);
const RECT_TEXTURE_FIELDS = new Set(['type', 'fill', 'borderWidth', 'borderColor', 'radius']);
const RELATION_STYLE_FIELDS = new Set(['color', 'alpha', 'width']);
const STROKE_FIELDS = new Set([
  'color',
  'alpha',
  'width',
  'cap',
  'join',
  'miterLimit',
  'alignment',
  'pixelLine',
  'textureSpace',
  'fill',
  'texture',
  'matrix',
]);
const TEXT_STYLE_FIELDS = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'fill',
  'stroke',
  'strokeWidth',
  'alpha',
  'cornerRadius',
  'dropShadow',
  'align',
  'textBaseline',
  'wordWrap',
  'breakWords',
  'trim',
  'wordWrapWidth',
  'whiteSpace',
  'lineHeight',
  'leading',
  'letterSpacing',
  'padding',
  'tagStyles',
  'filters',
]);
const ITEM_TEXT_STYLE_FIELDS = new Set([...TEXT_STYLE_FIELDS, 'autoFont', 'overflow']);
const DROP_SHADOW_FIELDS = new Set(['color', 'alpha', 'angle', 'blur', 'distance']);
const AUTO_FONT_FIELDS = new Set(['min', 'max']);
const THEME_COLOR_PATH = /^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)+$/u;
const BLACK = '#1a1a1aff';
const TRANSPARENT = '#00000000';

export function normalizeAssetSource(value: unknown, path: string): PatchMapAssetSource {
  if (typeof value === 'string') return value;
  return normalizeAssetDescriptor(value, path);
}

export function normalizeBackgroundSource(value: unknown, path: string): PatchMapBackgroundSource {
  if (typeof value === 'string') return value;
  const record = recordValue(value, path, 'background source must be a string or source object');
  return Object.hasOwn(record, 'src')
    ? normalizeAssetDescriptor(record, path)
    : normalizeRectTexture(record, path);
}

function normalizeAssetDescriptor(value: unknown, path: string): PatchMapAssetDescriptor {
  const record = recordValue(value, path, 'asset descriptor must be an object');
  assertKnownFields(record, ASSET_DESCRIPTOR_FIELDS, path);
  return Object.freeze({
    src: stringValue(requiredField(record, 'src', path), `${path}.src`),
    ...(Object.hasOwn(record, 'data')
      ? {
          data: cloneJsonRecord(
            recordValue(record.data, `${path}.data`, 'data must be an object'),
            `${path}.data`,
          ),
        }
      : {}),
    ...(Object.hasOwn(record, 'format')
      ? { format: stringValue(record.format, `${path}.format`) }
      : {}),
    ...(Object.hasOwn(record, 'parser')
      ? { parser: stringValue(record.parser, `${path}.parser`) }
      : {}),
  });
}

export function normalizeRectTexture(value: unknown, path: string): PatchMapRectTexture {
  const record = recordValue(value, path, 'rectangular texture source must be an object');
  assertKnownFields(record, RECT_TEXTURE_FIELDS, path);
  if (requiredField(record, 'type', path) !== 'rect') {
    throw new PatchMapDatasetError(
      'INVALID_RECORD_KIND',
      `${path}.type`,
      "rectangular texture discriminator must be 'rect'",
    );
  }
  return Object.freeze({
    type: 'rect',
    fill: Object.hasOwn(record, 'fill') ? normalizeColorLike(record.fill, `${path}.fill`) : TRANSPARENT,
    borderWidth: Object.hasOwn(record, 'borderWidth')
      ? nonnegativeFiniteNumber(record.borderWidth, `${path}.borderWidth`)
      : 0,
    borderColor: Object.hasOwn(record, 'borderColor')
      ? normalizeColorLike(record.borderColor, `${path}.borderColor`)
      : BLACK,
    radius: normalizeRadius(Object.hasOwn(record, 'radius') ? record.radius : undefined, `${path}.radius`),
  });
}

export function normalizeStrokeStyle(
  value: unknown,
  path: string,
): PatchMapStrokeStyle {
  if (value === undefined) return defaultStrokeStyle();
  const record = recordValue(value, path, 'stroke style must be an object');
  assertKnownFields(record, STROKE_FIELDS, path);
  return Object.freeze({
    color: Object.hasOwn(record, 'color') ? normalizeColorLike(record.color, `${path}.color`) : BLACK,
    alpha: Object.hasOwn(record, 'alpha')
      ? rangedNumber(record.alpha, `${path}.alpha`, 0, 1)
      : 1,
    width: Object.hasOwn(record, 'width')
      ? nonnegativeFiniteNumber(record.width, `${path}.width`)
      : 1,
    cap: Object.hasOwn(record, 'cap')
      ? enumValue(record.cap, `${path}.cap`, new Set(['butt', 'round', 'square']))
      : 'butt',
    join: Object.hasOwn(record, 'join')
      ? enumValue(record.join, `${path}.join`, new Set(['miter', 'round', 'bevel']))
      : 'miter',
    miterLimit: Object.hasOwn(record, 'miterLimit')
      ? nonnegativeFiniteNumber(record.miterLimit, `${path}.miterLimit`)
      : 10,
    alignment: Object.hasOwn(record, 'alignment')
      ? rangedNumber(record.alignment, `${path}.alignment`, 0, 1)
      : 0.5,
    pixelLine: Object.hasOwn(record, 'pixelLine')
      ? booleanValue(record.pixelLine, `${path}.pixelLine`)
      : false,
    ...(Object.hasOwn(record, 'textureSpace')
      ? {
          textureSpace: enumValue(
            record.textureSpace,
            `${path}.textureSpace`,
            new Set(['local', 'global']),
          ),
        }
      : {}),
    ...(Object.hasOwn(record, 'fill') ? { fill: cloneJsonValue(record.fill, `${path}.fill`) } : {}),
    ...(Object.hasOwn(record, 'texture')
      ? { texture: cloneJsonValue(record.texture, `${path}.texture`) }
      : {}),
    ...(Object.hasOwn(record, 'matrix')
      ? { matrix: cloneJsonValue(record.matrix, `${path}.matrix`) }
      : {}),
  });
}

export function normalizeRelationStyle(
  value: unknown,
  path: string,
): PatchMapRelationStyle {
  if (value === undefined) return defaultRelationStyle();
  const record = recordValue(value, path, 'relation style must be an object');
  assertKnownFields(record, RELATION_STYLE_FIELDS, path);
  return Object.freeze({
    color: Object.hasOwn(record, 'color') ? normalizeColorLike(record.color, `${path}.color`) : BLACK,
    alpha: Object.hasOwn(record, 'alpha')
      ? rangedNumber(record.alpha, `${path}.alpha`, 0, 1)
      : 1,
    width: Object.hasOwn(record, 'width')
      ? nonnegativeFiniteNumber(record.width, `${path}.width`)
      : 1,
  });
}

function defaultRelationStyle(): PatchMapRelationStyle {
  return Object.freeze({ color: BLACK, alpha: 1, width: 1 });
}

function defaultStrokeStyle(): PatchMapStrokeStyle {
  return Object.freeze({
    color: BLACK,
    alpha: 1,
    width: 1,
    cap: 'butt',
    join: 'miter',
    miterLimit: 10,
    alignment: 0.5,
    pixelLine: false,
  });
}

export function normalizeTextStyle(
  value: unknown,
  path: string,
  itemStyle: boolean,
  applyDefaults: boolean,
): PatchMapTextStyle {
  const record = value === undefined
    ? ({} as Readonly<Record<string, unknown>>)
    : recordValue(value, path, 'text style must be an object');
  assertKnownFields(record, itemStyle ? ITEM_TEXT_STYLE_FIELDS : TEXT_STYLE_FIELDS, path);
  const style: Record<string, unknown> = applyDefaults
    ? { fontFamily: PATCH_MAP_FIRA_CODE_FAMILY, fontSize: 16, fontWeight: 400, fill: BLACK }
    : {};

  for (const [key, fieldValue] of Object.entries(record)) {
    const fieldPath = `${path}.${key}`;
    switch (key) {
      case 'fontFamily':
        style[key] = normalizeFontFamily(fieldValue, fieldPath);
        break;
      case 'fontSize':
        style[key] = normalizeFontSize(fieldValue, fieldPath, itemStyle);
        break;
      case 'fontWeight':
        style[key] = normalizeFontWeight(fieldValue, fieldPath);
        break;
      case 'fontStyle':
        style[key] = enumValue(fieldValue, fieldPath, new Set(['normal', 'italic', 'oblique']));
        break;
      case 'fontVariant':
        style[key] = enumValue(fieldValue, fieldPath, new Set(['normal', 'small-caps']));
        break;
      case 'fill':
        style[key] = normalizeColorLike(fieldValue, fieldPath);
        break;
      case 'stroke':
        style[key] = isRecord(fieldValue)
          ? normalizeStrokeStyle(fieldValue, fieldPath)
          : normalizeColorLike(fieldValue, fieldPath);
        break;
      case 'strokeWidth':
      case 'cornerRadius':
        style[key] = nonnegativeFiniteNumber(fieldValue, fieldPath);
        break;
      case 'alpha':
        style[key] = rangedNumber(fieldValue, fieldPath, 0, 1);
        break;
      case 'dropShadow':
        style[key] = normalizeDropShadow(fieldValue, fieldPath);
        break;
      case 'align':
        style[key] = enumValue(
          fieldValue,
          fieldPath,
          new Set(['left', 'center', 'right', 'justify']),
        );
        break;
      case 'textBaseline':
        style[key] = enumValue(
          fieldValue,
          fieldPath,
          new Set(['alphabetic', 'top', 'hanging', 'middle', 'ideographic', 'bottom']),
        );
        break;
      case 'wordWrap':
      case 'breakWords':
      case 'trim':
        style[key] = booleanValue(fieldValue, fieldPath);
        break;
      case 'wordWrapWidth':
        style[key] = itemStyle && fieldValue === 'auto'
          ? 'auto'
          : nonnegativeFiniteNumber(fieldValue, fieldPath);
        break;
      case 'whiteSpace':
        style[key] = enumValue(fieldValue, fieldPath, new Set(['normal', 'pre', 'pre-line']));
        break;
      case 'lineHeight':
      case 'leading':
      case 'letterSpacing':
        style[key] = finiteNumber(fieldValue, fieldPath);
        break;
      case 'padding':
        style[key] = nonnegativeFiniteNumber(fieldValue, fieldPath);
        break;
      case 'tagStyles':
        style[key] = normalizeTagStyles(fieldValue, fieldPath, itemStyle);
        break;
      case 'filters':
        style[key] = cloneJsonArray(fieldValue, fieldPath);
        break;
      case 'autoFont':
        style[key] = normalizeAutoFont(fieldValue, fieldPath);
        break;
      case 'overflow':
        style[key] = enumValue(
          fieldValue,
          fieldPath,
          new Set(['visible', 'hidden', 'ellipsis']),
        );
        break;
    }
  }

  return Object.freeze(style);
}

function normalizeFontFamily(value: unknown, path: string): string | readonly string[] {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) invalidValue(path, 'fontFamily must be a string or string array');
  return Object.freeze(value.map((entry, index) => stringValue(entry, `${path}[${index}]`)));
}

function normalizeFontSize(value: unknown, path: string, itemStyle: boolean): number | string {
  if (typeof value === 'number') return nonnegativeFiniteNumber(value, path);
  if (
    !itemStyle ||
    typeof value !== 'string' ||
    value.length === 0 ||
    /^[-+]?\d+(?:\.\d+)?$/.test(value)
  ) {
    invalidValue(path, 'fontSize must use an accepted numeric or item CSS-size branch');
  }
  return value;
}

function normalizeFontWeight(value: unknown, path: string): string | number {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 100 && value <= 900) return value;
    invalidValue(path, 'numeric fontWeight must be an integer from 100 through 900');
  }
  if (typeof value !== 'string') invalidValue(path, 'fontWeight must be a supported string or number');
  if (new Set(['normal', 'bold', 'bolder', 'lighter']).has(value)) return value;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 100 && numeric <= 900) return value;
  invalidValue(path, 'fontWeight must be normal/bold/bolder/lighter or 100 through 900');
}

function normalizeDropShadow(
  value: unknown,
  path: string,
): boolean | Readonly<Record<string, unknown>> {
  if (typeof value === 'boolean') return value;
  const record = recordValue(value, path, 'dropShadow must be a boolean or object');
  assertKnownFields(record, DROP_SHADOW_FIELDS, path);
  return Object.freeze({
    ...(Object.hasOwn(record, 'color')
      ? { color: normalizeColorLike(record.color, `${path}.color`) }
      : {}),
    ...(Object.hasOwn(record, 'alpha')
      ? { alpha: rangedNumber(record.alpha, `${path}.alpha`, 0, 1) }
      : {}),
    ...(Object.hasOwn(record, 'angle') ? { angle: finiteNumber(record.angle, `${path}.angle`) } : {}),
    ...(Object.hasOwn(record, 'blur') ? { blur: finiteNumber(record.blur, `${path}.blur`) } : {}),
    ...(Object.hasOwn(record, 'distance')
      ? { distance: finiteNumber(record.distance, `${path}.distance`) }
      : {}),
  });
}

function normalizeTagStyles(
  value: unknown,
  path: string,
  itemStyle: boolean,
): Readonly<Record<string, unknown>> {
  const record = recordValue(value, path, 'tagStyles must be a string-keyed object');
  const result: Record<string, PatchMapTextStyle> = {};
  for (const key of Object.keys(record).sort()) {
    defineDataProperty(
      result,
      key,
      normalizeTextStyle(record[key], `${path}.${key}`, itemStyle, false),
    );
  }
  return Object.freeze(result);
}

function normalizeAutoFont(value: unknown, path: string): Readonly<Record<string, number>> {
  const record = recordValue(value, path, 'autoFont must be an object');
  assertKnownFields(record, AUTO_FONT_FIELDS, path);
  const min = Object.hasOwn(record, 'min') ? positiveFiniteNumber(record.min, `${path}.min`) : undefined;
  const max = Object.hasOwn(record, 'max') ? positiveFiniteNumber(record.max, `${path}.max`) : undefined;
  if (min !== undefined && max !== undefined && min > max) {
    invalidValue(path, 'autoFont min must be less than or equal to max');
  }
  return Object.freeze({
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  });
}

export function normalizeColorLike(value: unknown, path: string): unknown {
  if (typeof value === 'string') {
    if (value.trim().length === 0) invalidValue(path, 'color string must not be empty');
    if (!THEME_COLOR_PATH.test(value)) {
      try {
        // PixiJS Color is the public production conversion boundary. Construct
        // an instance instead of touching its mutable shared singleton.
        new Color(value);
      } catch {
        invalidValue(path, 'color string must be a PixiJS color or a dotted theme path');
      }
    }
    return value;
  }
  if (typeof value === 'number') return finiteNumber(value, path);
  if (Array.isArray(value) || isRecord(value)) return cloneJsonValue(value, path);
  invalidValue(path, 'color/fill value must use a supported JSON color source');
}

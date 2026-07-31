import {
  type PatchMapComponent,
  type PatchMapComponentType,
  type PatchMapElement,
  type PatchMapElementType,
  type PatchMapRectTexture,
  type PatchMapTextStyle,
  type MaterializedPatchMapDataset,
} from '../dataset';
import {
  PATCH_MAP_DEFAULT_COLOR_THEME,
  createPatchMapColorResolver,
} from '../color';
import type {
  PatchMapElementTarget,
  PatchMapPaintIntentProbe,
  PatchMapPaintRole,
  PatchMapSemanticNodeProbe,
} from './contracts';

const DEFAULT_PAINT_RESOLVER = createPatchMapColorResolver(
  PATCH_MAP_DEFAULT_COLOR_THEME,
);

interface ProbeAccumulator {
  readonly nodes: PatchMapSemanticNodeProbe[];
  readonly elementCounts: Map<PatchMapElementType, number>;
  readonly componentCounts: Map<PatchMapComponentType, number>;
  readonly paintIntents: PatchMapPaintIntentProbe[];
  elementCount: number;
  componentCount: number;
  hiddenLogicalComponentCount: number;
  maxDepth: number;
  finiteGeometryValueCount: number;
  nonFiniteGeometryValueCount: number;
  textSourceCount: number;
  textCodeUnitCount: number;
  textSourcesWithUnpairedSurrogate: number;
  unpairedSurrogateCount: number;
}

export function collectPatchMapSemanticDatasetObservation(
  materialized: MaterializedPatchMapDataset | null,
): Readonly<ProbeAccumulator> {
  const accumulator = createAccumulator();

  if (materialized) {
    materialized.dataset.forEach((element, index) => {
      visitElement(element, `$[${index}]`, null, 0, true, false, accumulator);
    });
  }

  return accumulator;
}

function createAccumulator(): ProbeAccumulator {
  return {
    nodes: [],
    elementCounts: new Map(),
    componentCounts: new Map(),
    paintIntents: [],
    elementCount: 0,
    componentCount: 0,
    hiddenLogicalComponentCount: 0,
    maxDepth: 0,
    finiteGeometryValueCount: 0,
    nonFiniteGeometryValueCount: 0,
    textSourceCount: 0,
    textCodeUnitCount: 0,
    textSourcesWithUnpairedSurrogate: 0,
    unpairedSurrogateCount: 0,
  };
}

function visitElement(
  element: PatchMapElement,
  path: string,
  parent: PatchMapElementTarget | null,
  depth: number,
  ancestorVisible: boolean,
  ancestorLocked: boolean,
  accumulator: ProbeAccumulator,
): void {
  const target: PatchMapElementTarget = { kind: 'element', id: element.id };
  const visible = ancestorVisible && element.show;
  const locked = ancestorLocked || element.locked;
  accumulator.nodes.push({
    order: accumulator.nodes.length,
    target,
    parent,
    type: element.type,
    depth,
    authoredShow: element.show,
    visible,
    locked,
  });
  accumulator.elementCount += 1;
  accumulator.elementCounts.set(element.type, (accumulator.elementCounts.get(element.type) ?? 0) + 1);
  accumulator.maxDepth = Math.max(accumulator.maxDepth, depth);
  collectAttrsGeometry(element.attrs, accumulator);

  switch (element.type) {
    case 'group':
      element.children.forEach((child, index) => {
        visitElement(
          child,
          `${path}.children[${index}]`,
          target,
          depth + 1,
          visible,
          locked,
          accumulator,
        );
      });
      break;
    case 'grid':
      collectGeometryValue(element.gap, accumulator);
      collectGeometryValue(element.item.size, accumulator);
      collectGeometryValue(element.item.padding, accumulator);
      element.item.components.forEach((component, index) => {
        visitComponent(
          component,
          `${path}.item.components[${index}]`,
          element.id,
          target,
          depth + 1,
          visible,
          locked,
          accumulator,
        );
      });
      break;
    case 'item':
      collectGeometryValue(element.size, accumulator);
      collectGeometryValue(element.padding, accumulator);
      element.components.forEach((component, index) => {
        visitComponent(
          component,
          `${path}.components[${index}]`,
          element.id,
          target,
          depth + 1,
          visible,
          locked,
          accumulator,
        );
      });
      break;
    case 'relations':
      collectStrokeStyle(element.style, `${path}.style`, accumulator);
      break;
    case 'image':
      if (element.size) collectGeometryValue(element.size, accumulator);
      break;
    case 'text':
      collectText(element.text, accumulator);
      collectTextStyle(element.style, `${path}.style`, accumulator);
      if (element.size) collectGeometryValue(element.size, accumulator);
      break;
    case 'rect':
      collectGeometryValue(element.size, accumulator);
      collectGeometryValue(element.radius, accumulator);
      if (element.fill !== undefined) collectPaint(element.fill, `${path}.fill`, 'fill', accumulator);
      if (element.stroke) collectStrokeStyle(element.stroke, `${path}.stroke`, accumulator);
      break;
  }
}

function visitComponent(
  component: PatchMapComponent,
  path: string,
  ownerId: string,
  parent: PatchMapElementTarget,
  depth: number,
  ownerVisible: boolean,
  ownerLocked: boolean,
  accumulator: ProbeAccumulator,
): void {
  const visible = ownerVisible && component.show;
  accumulator.nodes.push({
    order: accumulator.nodes.length,
    target: { kind: 'component', ownerId, id: component.id },
    parent,
    type: component.type,
    depth,
    authoredShow: component.show,
    visible,
    locked: ownerLocked,
  });
  accumulator.componentCount += 1;
  accumulator.componentCounts.set(
    component.type,
    (accumulator.componentCounts.get(component.type) ?? 0) + 1,
  );
  accumulator.maxDepth = Math.max(accumulator.maxDepth, depth);
  if (!visible) accumulator.hiddenLogicalComponentCount += 1;
  collectAttrsGeometry(component.attrs, accumulator);

  switch (component.type) {
    case 'background':
      collectPaint(component.tint, `${path}.tint`, 'tint', accumulator);
      if (isRectTexture(component.source)) {
        collectRectTexture(component.source, `${path}.source`, accumulator);
      }
      if (component.size !== undefined) collectGeometryValue(component.size, accumulator);
      break;
    case 'bar':
      collectRectTexture(component.source, `${path}.source`, accumulator);
      collectGeometryValue(component.size, accumulator);
      collectGeometryValue(component.margin, accumulator);
      collectPaint(component.tint, `${path}.tint`, 'tint', accumulator);
      break;
    case 'icon':
      collectGeometryValue(component.size, accumulator);
      collectGeometryValue(component.margin, accumulator);
      collectPaint(component.tint, `${path}.tint`, 'tint', accumulator);
      break;
    case 'text':
      collectText(component.text, accumulator);
      collectGeometryValue(component.margin, accumulator);
      collectPaint(component.tint, `${path}.tint`, 'tint', accumulator);
      collectTextStyle(component.style, `${path}.style`, accumulator);
      break;
  }
}

function collectRectTexture(
  texture: PatchMapRectTexture,
  path: string,
  accumulator: ProbeAccumulator,
): void {
  collectPaint(texture.fill, `${path}.fill`, 'fill', accumulator);
  collectGeometryValue(texture.borderWidth, accumulator);
  collectPaint(texture.borderColor, `${path}.borderColor`, 'border', accumulator);
  collectGeometryValue(texture.radius, accumulator);
}

function collectStrokeStyle(
  style: Readonly<Record<string, unknown>>,
  path: string,
  accumulator: ProbeAccumulator,
): void {
  if ('color' in style) collectPaint(style.color, `${path}.color`, 'stroke', accumulator);
  for (const field of ['width', 'miterLimit', 'alignment', 'matrix'] as const) {
    if (field in style) collectGeometryValue(style[field], accumulator);
  }
}

function collectTextStyle(
  style: PatchMapTextStyle,
  path: string,
  accumulator: ProbeAccumulator,
): void {
  if ('fill' in style) collectPaint(style.fill, `${path}.fill`, 'fill', accumulator);
  if ('stroke' in style) {
    const stroke = style.stroke;
    if (isRecord(stroke)) collectStrokeStyle(stroke, `${path}.stroke`, accumulator);
    else collectPaint(stroke, `${path}.stroke`, 'stroke', accumulator);
  }
  if (isRecord(style.dropShadow) && 'color' in style.dropShadow) {
    collectPaint(style.dropShadow.color, `${path}.dropShadow.color`, 'shadow', accumulator);
  }
  for (const field of [
    'fontSize',
    'wordWrapWidth',
    'lineHeight',
    'leading',
    'letterSpacing',
    'padding',
    'autoFont',
  ] as const) {
    if (field in style) collectGeometryValue(style[field], accumulator);
  }
  if (isRecord(style.dropShadow)) {
    for (const field of ['angle', 'blur', 'distance'] as const) {
      if (field in style.dropShadow) collectGeometryValue(style.dropShadow[field], accumulator);
    }
  }
  if (isRecord(style.tagStyles)) {
    for (const tag of Object.keys(style.tagStyles).sort()) {
      const tagStyle = style.tagStyles[tag];
      if (isRecord(tagStyle)) collectTextStyle(tagStyle, `${path}.tagStyles.${tag}`, accumulator);
    }
  }
}

function collectAttrsGeometry(
  attrs: Readonly<Record<string, unknown>> | undefined,
  accumulator: ProbeAccumulator,
): void {
  if (!attrs) return;
  for (const field of [
    'x',
    'y',
    'angle',
    'rotation',
    'scale',
    'scaleX',
    'scaleY',
    'skew',
    'pivot',
  ] as const) {
    if (field in attrs) collectGeometryValue(attrs[field], accumulator);
  }
}

function collectGeometryValue(value: unknown, accumulator: ProbeAccumulator): void {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) accumulator.finiteGeometryValueCount += 1;
    else accumulator.nonFiniteGeometryValueCount += 1;
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectGeometryValue(entry, accumulator));
    return;
  }
  if (isRecord(value)) {
    Object.keys(value).sort().forEach((key) => collectGeometryValue(value[key], accumulator));
  }
}

function collectText(text: string, accumulator: ProbeAccumulator): void {
  const unpairedCount = countUnpairedSurrogates(text);
  accumulator.textSourceCount += 1;
  accumulator.textCodeUnitCount += text.length;
  accumulator.unpairedSurrogateCount += unpairedCount;
  if (unpairedCount > 0) accumulator.textSourcesWithUnpairedSurrogate += 1;
}

function countUnpairedSurrogates(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index += 1;
      else count += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      count += 1;
    }
  }
  return count;
}

function collectPaint(
  value: unknown,
  path: string,
  role: PatchMapPaintRole,
  accumulator: ProbeAccumulator,
): void {
  const rgba = resolvePaint(value, path);
  accumulator.paintIntents.push({
    path,
    role,
    resolved: rgba !== null,
    ...(rgba === null ? {} : { rgba }),
  });
}

function resolvePaint(
  value: unknown,
  path: string,
): readonly [number, number, number, number] | null {
  try {
    return DEFAULT_PAINT_RESOLVER.resolve(value, path).byteRgba;
  } catch {
    return null;
  }
}

function isRectTexture(value: unknown): value is PatchMapRectTexture {
  return isRecord(value) && value.type === 'rect';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

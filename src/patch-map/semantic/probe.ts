import {
  PATCH_MAP_COMPONENT_TYPES,
  PATCH_MAP_ELEMENT_TYPES,
  type PatchMapComponent,
  type PatchMapComponentType,
  type PatchMapElement,
  type PatchMapElementType,
  type PatchMapRectTexture,
  type PatchMapTextStyle,
  type MaterializedPatchMapDataset,
} from './dataset';
import {
  PATCH_MAP_DEFAULT_COLOR_THEME,
  createPatchMapColorResolver,
} from './color';

export const PATCH_MAP_SEMANTIC_PROBE_REVISION = 'core-v2-semantic-probe/1' as const;

const DEFAULT_PAINT_RESOLVER = createPatchMapColorResolver(
  PATCH_MAP_DEFAULT_COLOR_THEME,
);

export type PatchMapSemanticProbeLifecycle =
  | 'new'
  | 'initializing'
  | 'ready-empty'
  | 'scene-ready'
  | 'destroying'
  | 'destroyed';

export type PatchMapSemanticProbeDatasetState =
  | 'absent'
  | 'empty'
  | 'loaded'
  | 'destroying'
  | 'destroyed';

export interface PatchMapElementTarget {
  readonly kind: 'element';
  readonly id: string;
}

export interface PatchMapComponentTarget {
  readonly kind: 'component';
  readonly ownerId: string;
  readonly id: string;
}

export type PatchMapSemanticTarget = PatchMapElementTarget | PatchMapComponentTarget;

export interface PatchMapSemanticNodeProbe {
  readonly order: number;
  readonly target: PatchMapSemanticTarget;
  readonly parent: PatchMapElementTarget | null;
  readonly type: PatchMapElementType | PatchMapComponentType;
  readonly depth: number;
  readonly authoredShow: boolean;
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface PatchMapSemanticTypeCount<T extends string> {
  readonly type: T;
  readonly count: number;
}

export type PatchMapPaintRole = 'fill' | 'stroke' | 'tint' | 'border' | 'shadow';

export interface PatchMapPaintIntentProbe {
  readonly path: string;
  readonly role: PatchMapPaintRole;
  readonly resolved: boolean;
  readonly rgba?: readonly [number, number, number, number];
}

export interface PatchMapSemanticProbeContext {
  readonly lifecycle: PatchMapSemanticProbeLifecycle;
  readonly datasetRef?: string | null;
  readonly interactionMode?:
    | 'select'
    | 'pan'
    | 'transform'
    | 'relation-paint'
    | 'text-edit';
  readonly selectionIds?: readonly string[];
  readonly activeAnimationCount?: number;
  readonly activeGestureCount?: number;
  readonly historyDepth?: number;
  readonly historyCorruptCount?: number;
}

export interface PatchMapSemanticProductProbe {
  readonly revision: typeof PATCH_MAP_SEMANTIC_PROBE_REVISION;
  readonly lifecycle: PatchMapSemanticProbeLifecycle;
  readonly dataset: Readonly<{
    state: PatchMapSemanticProbeDatasetState;
    ref: string | null;
    semanticHash: string | null;
    rootIds: readonly string[];
    graphDeepFrozen: boolean;
  }>;
  readonly scene: Readonly<{
    nodes: readonly PatchMapSemanticNodeProbe[];
    elementTypes: readonly PatchMapElementType[];
    componentTypes: readonly PatchMapComponentType[];
    elementTypeCounts: readonly PatchMapSemanticTypeCount<PatchMapElementType>[];
    componentTypeCounts: readonly PatchMapSemanticTypeCount<PatchMapComponentType>[];
    counts: Readonly<{
      rootElements: number;
      elements: number;
      components: number;
      hierarchyEdges: number;
      maxDepth: number;
      hiddenLogicalComponents: number;
    }>;
  }>;
  readonly geometry: Readonly<{
    finiteValueCount: number;
    nonFiniteValueCount: number;
    allFinite: boolean;
  }>;
  readonly text: Readonly<{
    sourceCount: number;
    codeUnitCount: number;
    sourcesWithUnpairedSurrogate: number;
    unpairedSurrogateCount: number;
  }>;
  readonly paint: Readonly<{
    intentCount: number;
    resolvedCount: number;
    unresolvedCount: number;
    intents: readonly PatchMapPaintIntentProbe[];
  }>;
  readonly interaction: Readonly<{
    mode?:
      | 'select'
      | 'pan'
      | 'transform'
      | 'relation-paint'
      | 'text-edit';
    selectionIds: readonly string[];
    activeAnimationCount?: number;
    activeGestureCount?: number;
  }>;
  readonly history: Readonly<{
    depth?: number;
    corruptCount?: number;
  }>;
}

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

/**
 * Build an implementation-owned semantic observation without consulting a scenario,
 * case ID, expected record, renderer object graph, or event trace.
 */
export function createPatchMapSemanticProbe(
  materialized: MaterializedPatchMapDataset | null,
  context: PatchMapSemanticProbeContext,
): PatchMapSemanticProductProbe {
  validateContext(context);
  const accumulator = createAccumulator();

  if (materialized) {
    materialized.dataset.forEach((element, index) => {
      visitElement(element, `$[${index}]`, null, 0, true, false, accumulator);
    });
  }

  const elementTypes = PATCH_MAP_ELEMENT_TYPES.filter(
    (type) => (accumulator.elementCounts.get(type) ?? 0) > 0,
  );
  const componentTypes = PATCH_MAP_COMPONENT_TYPES.filter(
    (type) => (accumulator.componentCounts.get(type) ?? 0) > 0,
  );
  const resolvedPaintCount = accumulator.paintIntents.reduce(
    (count, intent) => count + Number(intent.resolved),
    0,
  );
  const rootCount = materialized?.dataset.length ?? 0;

  return deepFreeze({
    revision: PATCH_MAP_SEMANTIC_PROBE_REVISION,
    lifecycle: context.lifecycle,
    dataset: {
      state: datasetState(materialized, context.lifecycle),
      ref: context.datasetRef ?? null,
      semanticHash: materialized?.semanticHash ?? null,
      rootIds: materialized?.rootIds ?? [],
      graphDeepFrozen: materialized ? isDeepFrozen(materialized) : true,
    },
    scene: {
      nodes: accumulator.nodes,
      elementTypes,
      componentTypes,
      elementTypeCounts: PATCH_MAP_ELEMENT_TYPES.map((type) => ({
        type,
        count: accumulator.elementCounts.get(type) ?? 0,
      })),
      componentTypeCounts: PATCH_MAP_COMPONENT_TYPES.map((type) => ({
        type,
        count: accumulator.componentCounts.get(type) ?? 0,
      })),
      counts: {
        rootElements: rootCount,
        elements: accumulator.elementCount,
        components: accumulator.componentCount,
        hierarchyEdges: accumulator.elementCount + accumulator.componentCount - rootCount,
        maxDepth: accumulator.maxDepth,
        hiddenLogicalComponents: accumulator.hiddenLogicalComponentCount,
      },
    },
    geometry: {
      finiteValueCount: accumulator.finiteGeometryValueCount,
      nonFiniteValueCount: accumulator.nonFiniteGeometryValueCount,
      allFinite: accumulator.nonFiniteGeometryValueCount === 0,
    },
    text: {
      sourceCount: accumulator.textSourceCount,
      codeUnitCount: accumulator.textCodeUnitCount,
      sourcesWithUnpairedSurrogate: accumulator.textSourcesWithUnpairedSurrogate,
      unpairedSurrogateCount: accumulator.unpairedSurrogateCount,
    },
    paint: {
      intentCount: accumulator.paintIntents.length,
      resolvedCount: resolvedPaintCount,
      unresolvedCount: accumulator.paintIntents.length - resolvedPaintCount,
      intents: accumulator.paintIntents,
    },
    interaction: {
      ...(context.interactionMode === undefined ? {} : { mode: context.interactionMode }),
      selectionIds: context.selectionIds ? [...context.selectionIds] : [],
      ...(context.activeAnimationCount === undefined
        ? {}
        : { activeAnimationCount: context.activeAnimationCount }),
      ...(context.activeGestureCount === undefined
        ? {}
        : { activeGestureCount: context.activeGestureCount }),
    },
    history: {
      ...(context.historyDepth === undefined ? {} : { depth: context.historyDepth }),
      ...(context.historyCorruptCount === undefined
        ? {}
        : { corruptCount: context.historyCorruptCount }),
    },
  });
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

function datasetState(
  materialized: MaterializedPatchMapDataset | null,
  lifecycle: PatchMapSemanticProbeLifecycle,
): PatchMapSemanticProbeDatasetState {
  if (lifecycle === 'destroyed') return 'destroyed';
  if (lifecycle === 'destroying') return 'destroying';
  if (!materialized) return 'absent';
  return materialized.dataset.length === 0 ? 'empty' : 'loaded';
}

function validateContext(context: PatchMapSemanticProbeContext): void {
  for (const [name, value] of [
    ['activeAnimationCount', context.activeAnimationCount],
    ['activeGestureCount', context.activeGestureCount],
    ['historyDepth', context.historyDepth],
    ['historyCorruptCount', context.historyCorruptCount],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError(`${name} must be a nonnegative safe integer when observed`);
    }
  }
  for (const id of context.selectionIds ?? []) {
    if (typeof id !== 'string') throw new TypeError('selectionIds must contain strings');
  }
}

function isRectTexture(value: unknown): value is PatchMapRectTexture {
  return isRecord(value) && value.type === 'rect';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDeepFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Reflect.ownKeys(value).every((key) => isDeepFrozen(Reflect.get(value, key), seen));
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key), seen);
  return Object.freeze(value);
}

import type {
  AlignSetting,
  EntityInput,
  ImageEntityInput,
  Rgba,
} from '../dense/contracts';
import type {
  PatchMapComponentRenderRole,
  PatchMapContentOrientation,
  PatchMapImageDimensionMode,
  PatchMapImageIntrinsicTransform,
  PatchMapImageProjection,
} from '../contracts';
import type {
  PatchMapComponentSize,
  PatchMapComponentType,
  PatchMapEdges,
  PatchMapPlacement,
} from '../semantic/dataset';
import {
  layoutPatchMapText,
  relocatePatchMapTextLayout,
  type PatchMapTextLayout,
  type PatchMapTextLayoutOptions,
} from '../semantic/text-layout';
import { resolvePatchMapPlacementBounds } from '../semantic/placement';
import { multiplyPatchMapRgba } from './color';
import { normalizePatchMapImageSource } from './image-source';
import {
  addEntity,
  componentIdentity,
  pathToken,
  sourceIdentifier,
} from './lowering-state';
import {
  clonePatchMapParserJson as cloneJson,
  deepFreezePatchMapParserValue as deepFreeze,
  warnPatchMapParse as warn,
  warnPatchMapParseOnce as warnOnce,
  type PatchMapParseState as ParseState,
  type PatchMapParserEntityOwner as EntityOwner,
} from './parse-state';
import {
  projectPatchMapParserTopLeft,
  type PatchMapParserSize as Size,
  type PatchMapParserTransform as Transform,
} from './transform-projection';
import {
  PATCH_MAP_PLACEMENTS as TEXT_PLACEMENTS,
  attributeAlpha,
  barAnimation,
  barAnimationDuration,
  barPlacement,
  boxSpacing,
  clamp01,
  componentTransform,
  finiteNumber,
  fontWeight,
  inspectAttributes,
  isParserRecord as isRecord,
  nonNegative,
  placeBox,
  resolveColor,
  resolveComponentSize,
  type PatchMapParserBox as Box,
  type PatchMapParserRecord as JsonRecord,
} from './value-normalization';

const AVAILABLE_TEXT_FONTS = Object.freeze(['Fira Code', 'Unifont']);
const BASIC_TEXT_STYLE_KEYS = new Set([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fill',
  'align',
  'wordWrap',
  'wordWrapWidth',
  'breakWords',
  'lineHeight',
  'letterSpacing',
  'autoFont',
  'overflow',
]);

export function parseComponent(
  value: unknown,
  path: string,
  instanceId: string,
  sourceElementId: string,
  itemTransform: Transform,
  itemSize: Size,
  content: Box,
  contentOrientation: PatchMapContentOrientation,
  visible: boolean,
  owner: EntityOwner,
  state: ParseState,
): void {
  if (!isRecord(value)) {
    warn(state, path, 'unsupported-component', 'Non-object component was not rendered', sourceElementId);
    return;
  }
  const type = typeof value.type === 'string' ? value.type : 'unknown';
  if (
    type !== 'bar' &&
    (value.animation !== undefined || value.animationDuration !== undefined)
  ) {
    warnOnce(
      state,
      `component-animation:${type}`,
      path,
      'component-animation-unsupported',
      'animation/animationDuration are unsupported on non-bar components',
      sourceElementId,
    );
  }
  const componentId = sourceIdentifier(value.id, `@component:${pathToken(path)}`, path, state);
  const component = componentIdentity(value, componentId, path, type, sourceElementId, state);
  const entityId = `${instanceId}::${type}:${componentId}`;
  const componentVisible = visible && value.show !== false;
  const attrs = isRecord(value.attrs) ? value.attrs : undefined;
  inspectAttributes(attrs, `${path}.attrs`, type, state);
  const opacity = owner.opacity * attributeAlpha(attrs, `${path}.attrs.alpha`, state);

  if (type === 'background') {
    const source = value.source;
    const sourceRecord = isRecord(source) ? source : undefined;
    // Approved v0.10 compatibility semantics preserve authored background size
    // in the semantic dataset, but always paint the complete item frame.
    const local: Box = { x: 0, y: 0, width: itemSize.width, height: itemSize.height };
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    if (sourceRecord?.type === 'rect') {
      const sourceFill = resolveColor(sourceRecord.fill, 0xffffffff, `${path}.source.fill`, state);
      const borderWidth = projectedBackgroundBorderWidth(
        sourceRecord.borderWidth,
        `${path}.source.borderWidth`,
        state,
      );
      const borderColor = resolveColor(
        sourceRecord.borderColor,
        0x000000ff,
        `${path}.source.borderColor`,
        state,
      );
      const radius = projectedBackgroundRadius(sourceRecord.radius, `${path}.source.radius`, state);
      const tint = resolveColor(value.tint, 0xffffffff, `${path}.tint`, state);
      const fill = multiplyPatchMapRgba(sourceFill, tint);
      addComponentVisualProjection(
        entityId,
        instanceId,
        componentId,
        type,
        'background-geometry',
        value.size,
        state,
      );
      state.backgroundPaintProjectionByEntityId[entityId] = Object.freeze({
        entityId,
        sourceKind: 'rect',
        fill: sourceFill,
        borderWidth,
        borderColor,
        radius,
        tint,
      });
      const denseTransform = projectPatchMapParserTopLeft(transform, local, 'follow-item');
      addEntity(
        {
          kind: 'rect',
          id: entityId,
          x: denseTransform.x,
          y: denseTransform.y,
          width: denseTransform.width,
          height: denseTransform.height,
          rotation: transform.rotation,
          fill,
          ...(opacity === 1 ? {} : { opacity }),
          ...(sourceRecord.borderColor !== undefined || borderWidth > 0
            ? { stroke: borderColor }
            : {}),
          ...(sourceRecord.borderWidth !== undefined
            ? { strokeWidth: borderWidth }
            : {}),
          ...(finiteNumber(sourceRecord.radius) !== undefined
            ? { radius: Math.max(0, finiteNumber(sourceRecord.radius) as number) }
            : {}),
          visible: componentVisible,
          interactive: false,
          zIndex: -10,
          tags: ['background', `parent:${instanceId}`, `component:${componentId}`],
        },
        { ...owner, component },
        state,
        denseTransform,
      );
      return;
    }
    const tint = resolveColor(value.tint, 0xffffffff, `${path}.tint`, state);
    addComponentVisualProjection(
      entityId,
      instanceId,
      componentId,
      type,
      'background-asset',
      value.size,
      state,
    );
    state.backgroundPaintProjectionByEntityId[entityId] = Object.freeze({
      entityId,
      sourceKind: 'asset',
      fill: 0x00000000,
      borderWidth: 0,
      borderColor: 0x000000ff,
      radius: Object.freeze([0, 0, 0, 0] as const),
      tint,
    });
    const asset = imageSourceProjection(
      entityId,
      source,
      `${path}.source`,
      'layout',
      value.size !== undefined,
      state,
    );
    addEntity(
      withEntityOpacity(imageEntity(
        entityId,
        transform,
        local,
        asset,
        value.tint === undefined ? undefined : tint,
        componentVisible,
        -10,
        path,
        state,
      ), opacity),
      { ...owner, component },
      state,
      projectPatchMapParserTopLeft(transform, local, 'follow-item'),
    );
    return;
  }

  if (type === 'bar') {
    const componentSize = resolveComponentSize(value.size, content, `${path}.size`, state);
    const placement = barPlacement(value.placement, `${path}.placement`, state);
    const margin = boxSpacing(value.margin, `${path}.margin`, state);
    const local = resolvePatchMapPlacementBounds(content, componentSize, placement, margin, path);
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    const denseTransform = projectPatchMapParserTopLeft(transform, local, contentOrientation);
    const animation = barAnimation(value.animation, `${path}.animation`, sourceElementId, state);
    const animationDuration = barAnimationDuration(
      value.animationDuration,
      `${path}.animationDuration`,
      sourceElementId,
      state,
    );
    const source = isRecord(value.source) ? value.source : undefined;
    if (value.source !== undefined && source?.type !== 'rect') {
      warn(state, `${path}.source`, 'bar-source-degraded', 'Non-rect bar source is rendered as a tinted aggregate bar', sourceElementId);
    }
    const trackFill = resolveColor(source?.fill, 0x00000000, `${path}.source.fill`, state);
    const fill = value.tint === undefined
      ? trackFill
      : multiplyPatchMapRgba(
          trackFill === 0 ? 0xffffffff : trackFill,
          resolveColor(value.tint, 0xffffffff, `${path}.tint`, state),
        );
    state.barProjectionByEntityId[entityId] = Object.freeze({
      entityId,
      ownerId: instanceId,
      componentId,
      placement,
      margin: Object.freeze(margin),
      contentOrientation,
      animation,
      animationDuration,
      destinationHeight: local.height,
      percentageReferenceHeight: content.height,
    });
    addEntity(
      {
        kind: 'bar',
        id: entityId,
        x: denseTransform.x,
        y: denseTransform.y,
        width: denseTransform.width,
        height: denseTransform.height,
        rotation: transform.rotation,
        value: 1,
        min: 0,
        max: 1,
        fill,
        trackFill,
        ...(opacity === 1 ? {} : { opacity }),
        ...(finiteNumber(source?.radius) !== undefined
          ? { radius: Math.max(0, finiteNumber(source?.radius) as number) }
          : {}),
        visible: componentVisible,
        interactive: false,
        zIndex: 10,
        tags: ['bar', `parent:${instanceId}`, `component:${componentId}`],
      },
      { ...owner, component },
      state,
      denseTransform,
    );
    return;
  }

  if (type === 'icon') {
    const componentSize = resolveComponentSize(value.size, content, `${path}.size`, state);
    const local = placeBox(content, componentSize, value.placement ?? 'center', value.margin, path, state);
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    addComponentVisualProjection(
      entityId,
      instanceId,
      componentId,
      type,
      'content-asset',
      value.size,
      state,
    );
    addEntity(
      withEntityOpacity(imageEntity(
        entityId,
        transform,
        local,
        imageSourceProjection(
          entityId,
          value.source,
          `${path}.source`,
          'layout',
          value.size !== undefined,
          state,
        ),
        value.tint,
        componentVisible,
        20,
        path,
        state,
      ), opacity),
      { ...owner, component },
      state,
      projectPatchMapParserTopLeft(transform, local, contentOrientation),
    );
    return;
  }

  if (type === 'text') {
    const style = isRecord(value.style) ? value.style : {};
    const margins = boxSpacing(value.margin, `${path}.margin`, state);
    const available: Box = {
      x: content.x + margins.left,
      y: content.y + margins.top,
      width: Math.max(0, content.width - margins.left - margins.right),
      height: Math.max(0, content.height - margins.top - margins.bottom),
    };
    const source = typeof value.text === 'string' ? value.text : '';
    const split = textSplit(value.split, `${path}.split`, state);
    const placement = textPlacement(value.placement, `${path}.placement`, state);
    const initialLayout = semanticTextLayout(
      source,
      style,
      { width: available.width, height: available.height },
      style.overflow,
      split,
      undefined,
      path,
      state,
    );
    const local = placeBox(
      content,
      {
        width: initialLayout.layoutBounds.width,
        height: initialLayout.layoutBounds.height,
      },
      placement,
      margins,
      path,
      state,
    );
    const layout = relocatePatchMapTextLayout(initialLayout, { x: local.x, y: local.y });
    const transform = componentTransform(itemTransform, local, attrs, path, state);
    const color = resolveColor(value.tint ?? style.fill, 0x000000ff, `${path}.style.fill`, state);
    addTextProjection({
      entityId,
      targetKind: 'component',
      ownerId: instanceId,
      componentId,
      authoredStyle: style,
      color,
      placement,
      margin: margins,
      contentOrientation,
      layout,
    }, state);
    addEntity(
      withEntityOpacity(textEntity(
        entityId,
        transform,
        local,
        layout,
        style,
        color,
        componentVisible,
        false,
        30,
        path,
        state,
      ), opacity),
      { ...owner, component },
      state,
      projectPatchMapParserTopLeft(transform, local, contentOrientation),
    );
    return;
  }

  warn(
    state,
    `${path}.type`,
    'unsupported-component',
    `Unsupported component type ${JSON.stringify(type)} was preserved in the identity index but not rendered`,
    sourceElementId,
  );
}

function addComponentVisualProjection(
  entityId: string,
  ownerId: string,
  componentId: string,
  componentType: PatchMapComponentType,
  renderRole: PatchMapComponentRenderRole,
  authoredSize: unknown,
  state: ParseState,
): void {
  state.componentVisualProjectionByEntityId[entityId] = Object.freeze({
    entityId,
    ownerId,
    componentId,
    componentType,
    // The stable dense entity ID is the product identity token. Physical Pixi
    // objects may be replaced without changing this semantic identity.
    logicalIdentity: entityId,
    renderRole,
    ...(authoredSize === undefined
      ? {}
      : {
          authoredSize: deepFreeze(cloneJson(authoredSize)) as PatchMapComponentSize,
        }),
  });
}

function projectedBackgroundBorderWidth(
  value: unknown,
  path: string,
  state: ParseState,
): number {
  if (value === undefined) return 0;
  const width = finiteNumber(value);
  if (width !== undefined) return nonNegative(width, path, state);
  warn(state, path, 'invalid-border-width', 'Invalid background border width fell back to zero');
  return 0;
}

function projectedBackgroundRadius(
  value: unknown,
  path: string,
  state: ParseState,
): readonly [number, number, number, number] {
  const scalar = finiteNumber(value);
  if (scalar !== undefined) {
    const radius = nonNegative(scalar, path, state);
    return Object.freeze([radius, radius, radius, radius] as const);
  }
  if (value === undefined) return Object.freeze([0, 0, 0, 0] as const);
  if (Array.isArray(value)) {
    if (value.length !== 4) {
      warn(state, path, 'invalid-radius', 'Background corner radius array must contain four entries');
      return Object.freeze([0, 0, 0, 0] as const);
    }
    return Object.freeze([
      projectedBackgroundRadiusCorner(value[0], `${path}[0]`, state),
      projectedBackgroundRadiusCorner(value[1], `${path}[1]`, state),
      projectedBackgroundRadiusCorner(value[2], `${path}[2]`, state),
      projectedBackgroundRadiusCorner(value[3], `${path}[3]`, state),
    ] as const);
  }
  if (isRecord(value)) {
    return Object.freeze([
      projectedBackgroundRadiusCorner(value.topLeft, `${path}.topLeft`, state),
      projectedBackgroundRadiusCorner(value.topRight, `${path}.topRight`, state),
      projectedBackgroundRadiusCorner(value.bottomRight, `${path}.bottomRight`, state),
      projectedBackgroundRadiusCorner(value.bottomLeft, `${path}.bottomLeft`, state),
    ] as const);
  }
  warn(state, path, 'invalid-radius', 'Invalid background radius fell back to zero');
  return Object.freeze([0, 0, 0, 0] as const);
}

function projectedBackgroundRadiusCorner(
  value: unknown,
  path: string,
  state: ParseState,
): number {
  if (value === undefined) return 0;
  const radius = finiteNumber(value);
  if (radius !== undefined) return nonNegative(radius, path, state);
  warn(state, path, 'invalid-radius', 'Invalid background corner radius fell back to zero');
  return 0;
}

export function imageEntity(
  id: string,
  transform: Transform,
  box: Box,
  source: PatchMapImageProjection,
  tint: unknown,
  visible: boolean,
  layer: number,
  path: string,
  state: ParseState,
): ImageEntityInput {
  const denseTransform = projectPatchMapParserTopLeft(transform, box);
  return {
    kind: 'image',
    id,
    x: denseTransform.x,
    y: denseTransform.y,
    width: denseTransform.width,
    height: denseTransform.height,
    rotation: transform.rotation,
    // Preserve the inherited dense transport column for existing consumers.
    // Reconciliation/resource identity comes from the lossless sidecar key.
    source: typeof source.authoredSource === 'string'
      ? source.authoredSource
      : source.authoredSource.src,
    ...(tint !== undefined ? { tint: resolveColor(tint, 0xffffffff, `${path}.tint`, state) } : {}),
    visible,
    interactive: false,
    zIndex: layer,
    tags: ['image'],
  };
}

export function withEntityOpacity(entity: EntityInput, opacity: number): EntityInput {
  const combined = opacity * (entity.opacity ?? 1);
  if (combined === (entity.opacity ?? 1)) return entity;
  return {
    ...entity,
    opacity: combined,
  };
}

export function textEntity(
  id: string,
  transform: Transform,
  box: Box,
  layout: PatchMapTextLayout,
  style: JsonRecord,
  color: Rgba,
  visible: boolean,
  interactive: boolean,
  layer: number,
  path: string,
  state: ParseState,
): EntityInput {
  const alignValue = style.align;
  const align: AlignSetting = alignValue === 'center' || alignValue === 'right' ? alignValue : 'left';
  if (alignValue !== undefined && alignValue !== 'left' && alignValue !== 'center' && alignValue !== 'right') {
    warn(state, `${path}.style.align`, 'text-align-degraded', 'Unsupported text alignment fell back to left');
  }
  const denseTransform = projectPatchMapParserTopLeft(transform, box);
  return {
    kind: 'text',
    id,
    x: denseTransform.x,
    y: denseTransform.y,
    width: denseTransform.width,
    height: denseTransform.height,
    rotation: transform.rotation,
    text: layout.visibleText,
    color,
    fontSize: layout.fontSizePx,
    ...(finiteNumber(style.alpha) === undefined
      ? {}
      : { opacity: clamp01(finiteNumber(style.alpha) as number) }),
    ...(typeof style.fontFamily === 'string' ? { fontFamily: style.fontFamily } : {}),
    ...(fontWeight(style.fontWeight) !== undefined ? { fontWeight: fontWeight(style.fontWeight) as number } : {}),
    align,
    visible,
    interactive,
    zIndex: layer,
    tags: ['text'],
  };
}

export function semanticTextLayout(
  source: string,
  style: JsonRecord,
  contentFrame: Size | undefined,
  overflowValue: unknown,
  split: number,
  origin: Readonly<{ x: number; y: number }> | undefined,
  path: string,
  state: ParseState,
): PatchMapTextLayout {
  const fontSizePx = positiveTextMetric(style.fontSize, `${path}.style.fontSize`, state);
  const lineHeightPx = positiveTextMetric(style.lineHeight, `${path}.style.lineHeight`, state);
  const letterSpacingPx = textLetterSpacing(
    style.letterSpacing,
    `${path}.style.letterSpacing`,
    state,
  );
  const overflow = textOverflow(overflowValue, `${path}.overflow`, state);
  const wordWrapWidth = textWrapWidth(style, contentFrame, path, state);
  // Match the PATCH MAP v0.10 text-style default even when callers use the
  // lower-level parser directly instead of passing through the materializer.
  const requestedFontValue = requestedFont(style.fontFamily) ?? 'Fira Code';
  const autoFont = textAutoFont(style.autoFont, `${path}.style.autoFont`, state);
  const options: PatchMapTextLayoutOptions = {
    source,
    ...(fontSizePx === undefined ? {} : { fontSizePx }),
    ...(lineHeightPx === undefined ? {} : { lineHeightPx }),
    ...(letterSpacingPx === undefined ? {} : { letterSpacingPx }),
    requestedFont: requestedFontValue,
    availableRequestedFonts: AVAILABLE_TEXT_FONTS,
    split,
    wordWrapWidthPx: wordWrapWidth,
    breakWords: style.breakWords === true,
    ...(contentFrame === undefined
      ? {}
      : { contentFrame: { width: contentFrame.width, height: contentFrame.height } }),
    overflow,
    ...(autoFont === undefined ? {} : { autoFont }),
    ...(origin === undefined ? {} : { origin }),
    advancedStyle: hasAdvancedTextStyle(style),
  };
  const layout = layoutPatchMapText(options);
  for (const diagnostic of layout.diagnostics) {
    warnOnce(
      state,
      `text-layout:${path}:${diagnostic.code}:${diagnostic.sourceIndex ?? -1}`,
      diagnostic.sourceIndex === undefined
        ? `${path}.text`
        : `${path}.text[${diagnostic.sourceIndex}]`,
      'text-layout-unsupported',
      `${diagnostic.code}: ${diagnostic.detail}`,
    );
  }
  return layout;
}

export function addTextProjection(
  input: Readonly<{
    entityId: string;
    targetKind: 'element' | 'component';
    ownerId?: string;
    componentId?: string;
    authoredStyle: JsonRecord;
    color: number;
    placement: PatchMapPlacement | null;
    margin: PatchMapEdges;
    contentOrientation: PatchMapContentOrientation;
    layout: PatchMapTextLayout;
  }>,
  state: ParseState,
): void {
  state.textProjectionByEntityId[input.entityId] = Object.freeze({
    ...input.layout,
    entityId: input.entityId,
    targetKind: input.targetKind,
    ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
    ...(input.componentId === undefined ? {} : { componentId: input.componentId }),
    authoredStyle: deepFreeze(cloneJson(input.authoredStyle)),
    color: input.color >>> 0,
    placement: input.placement,
    margin: Object.freeze({ ...input.margin }),
    contentOrientation: input.contentOrientation,
  });
}

function positiveTextMetric(
  value: unknown,
  path: string,
  state: ParseState,
): number | undefined {
  if (value === undefined) return undefined;
  const metric = finiteNumber(value);
  if (metric !== undefined && metric > 0) return metric;
  warn(state, path, 'invalid-text-metric', 'Invalid text metric used the deterministic profile default');
  return undefined;
}

function textLetterSpacing(
  value: unknown,
  path: string,
  state: ParseState,
): number | undefined {
  if (value === undefined) return undefined;
  const spacing = finiteNumber(value);
  if (spacing !== undefined) return spacing;
  warn(state, path, 'invalid-text-metric', 'Invalid letterSpacing used the deterministic profile default');
  return undefined;
}

export function textSplit(value: unknown, path: string, state: ParseState): number {
  if (value === undefined) return 0;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  warn(state, path, 'invalid-text-split', 'Invalid split fell back to zero');
  return 0;
}

export function textPlacement(
  value: unknown,
  path: string,
  state: ParseState,
): PatchMapPlacement {
  if (value === undefined) return 'center';
  if (typeof value === 'string' && TEXT_PLACEMENTS.has(value as PatchMapPlacement)) {
    return value as PatchMapPlacement;
  }
  warn(state, path, 'invalid-placement', 'Invalid placement fell back to center');
  return 'center';
}

function textOverflow(
  value: unknown,
  path: string,
  state: ParseState,
): 'visible' | 'hidden' | 'ellipsis' {
  if (value === undefined || value === 'visible') return 'visible';
  if (value === 'hidden' || value === 'ellipsis') return value;
  warn(state, path, 'invalid-text-overflow', 'Invalid overflow fell back to visible');
  return 'visible';
}

function textWrapWidth(
  style: JsonRecord,
  contentFrame: Size | undefined,
  path: string,
  state: ParseState,
): number | null {
  if (style.wordWrap !== true) return null;
  if (style.wordWrapWidth === undefined) return contentFrame?.width ?? null;
  const width = finiteNumber(style.wordWrapWidth);
  if (width !== undefined && width >= 0) return width;
  warn(
    state,
    `${path}.style.wordWrapWidth`,
    'invalid-text-wrap-width',
    'Invalid wordWrapWidth fell back to the available frame width',
  );
  return contentFrame?.width ?? null;
}

function textAutoFont(
  value: unknown,
  path: string,
  state: ParseState,
): Readonly<{ minPx: number; maxPx: number }> | undefined {
  if (value === undefined) return undefined;
  if (isRecord(value)) {
    const min = finiteNumber(value.min);
    const max = finiteNumber(value.max);
    if (
      min !== undefined &&
      max !== undefined &&
      Number.isSafeInteger(min) &&
      Number.isSafeInteger(max) &&
      min > 0 &&
      max >= min
    ) {
      return Object.freeze({ minPx: min, maxPx: max });
    }
  }
  warn(state, path, 'invalid-text-auto-font', 'Invalid autoFont bounds were ignored');
  return undefined;
}

function requestedFont(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value)) {
    return value.find((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  return undefined;
}

function hasAdvancedTextStyle(style: JsonRecord): boolean {
  return Object.keys(style).some((key) => !BASIC_TEXT_STYLE_KEYS.has(key));
}

export function imageSourceProjection(
  entityId: string,
  value: unknown,
  path: string,
  dimensionMode: PatchMapImageDimensionMode,
  authoredSize: boolean,
  state: ParseState,
  intrinsicTransform?: PatchMapImageIntrinsicTransform,
): PatchMapImageProjection {
  const normalized = normalizeImageSource(value, path, state);
  const projection = Object.freeze({
    entityId,
    authoredSource: normalized.authoredSource,
    bindingKey: normalized.bindingKey,
    cacheIdentity: normalized.cacheIdentity,
    sourceKind: normalized.sourceKind,
    authoredSize,
    dimensionMode,
    ...(intrinsicTransform === undefined
      ? {}
      : {
          intrinsicTransform: Object.freeze({
            parentAffine: intrinsicTransform.parentAffine,
            localTranslationAffine: intrinsicTransform.localTranslationAffine,
            localRotationScaleAffine: intrinsicTransform.localRotationScaleAffine,
            localPivotScaleAffine: intrinsicTransform.localPivotScaleAffine,
          }),
        }),
  } satisfies PatchMapImageProjection);
  state.imageProjectionByEntityId[entityId] = projection;
  return projection;
}

function normalizeImageSource(
  value: unknown,
  path: string,
  state: ParseState,
): ReturnType<typeof normalizePatchMapImageSource> {
  if (typeof value === 'string' && value.length > 0) {
    return normalizePatchMapImageSource(value);
  }
  if (isRecord(value) && typeof value.src === 'string' && value.src.length > 0) {
    const authoredSource = deepFreeze(
      cloneJson(value),
    ) as unknown as PatchMapImageProjection['authoredSource'];
    return normalizePatchMapImageSource(authoredSource);
  }
  warn(state, path, 'invalid-asset-source', 'Invalid asset source uses a deterministic missing-asset alias');
  const authoredSource = `@missing-asset:${pathToken(path)}`;
  return normalizePatchMapImageSource(authoredSource);
}

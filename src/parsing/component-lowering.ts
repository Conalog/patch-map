import type {
  PatchMapComponentRenderRole,
  PatchMapContentOrientation,
} from './contracts';
import type {
  PatchMapComponentSize,
  PatchMapComponentType,
  PatchMapPlacement,
} from '../semantic/dataset';
import { relocatePatchMapTextLayout } from '../semantic/text-layout';
import { resolvePatchMapPlacementBounds } from '../semantic/placement';
import { multiplyPatchMapRgba } from './color';
import {
  imageEntity,
  imageSourceProjection,
  withEntityOpacity,
} from './image-lowering';
import {
  addTextProjection,
  semanticTextLayout,
  textEntity,
} from './text-lowering';
import {
  addEntity,
  componentIdentity,
  pathToken,
  sourceIdentifier,
} from './lowering-state';
import {
  clonePatchMapParserJson as cloneJson,
  deepFreezePatchMapParserValue as deepFreeze,
  fatalPatchMapParse as fatal,
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
  componentTransform,
  finiteNumber,
  inspectAttributes,
  isParserRecord as isRecord,
  nonNegative,
  placeBox,
  resolveColor,
  resolveComponentSize,
  type PatchMapParserBox as Box,
} from './value-normalization';

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
    if (value.size !== undefined) {
      fatal(
        state,
        `${path}.size`,
        'unknown-component-field',
        'Background component contains unknown field "size"',
        sourceElementId,
      );
    }
    const source = value.source;
    const sourceRecord = isRecord(source) ? source : undefined;
    if (
      sourceRecord !== undefined &&
      !Object.hasOwn(sourceRecord, 'src') &&
      sourceRecord.type !== 'rect'
    ) {
      fatal(
        state,
        `${path}.source.type`,
        'invalid-rect-texture',
        "Rect texture source must declare type 'rect'",
        sourceElementId,
      );
    }
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
        undefined,
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
          zIndex: 0,
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
      undefined,
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
      false,
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
        0,
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
    if (source?.type !== 'rect') {
      fatal(
        state,
        `${path}.source.type`,
        'invalid-rect-texture',
        "Rect texture source must declare type 'rect'",
        sourceElementId,
      );
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
        zIndex: 0,
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
        0,
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
    const split = textSplit(value.split, `${path}.split`, sourceElementId, state);
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
        0,
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

function textSplit(
  value: unknown,
  path: string,
  sourceId: string,
  state: ParseState,
): number {
  if (value === undefined) return 0;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  fatal(
    state,
    path,
    'invalid-text-split',
    'Text split must be a nonnegative safe integer',
    sourceId,
  );
}

function textPlacement(
  value: unknown,
  path: string,
  state: ParseState,
): PatchMapPlacement {
  if (value === undefined) return 'center';
  if (typeof value === 'string' && TEXT_PLACEMENTS.has(value as PatchMapPlacement)) {
    return value as PatchMapPlacement;
  }
  fatal(
    state,
    path,
    'invalid-placement',
    'Placement must be a supported PatchMap placement',
  );
}

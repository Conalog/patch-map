import type {
  EntityInput,
  ImageEntityInput,
} from '../dense/contracts';
import type {
  PatchMapImageDimensionMode,
  PatchMapImageIntrinsicTransform,
  PatchMapImageProjection,
} from './contracts';
import { normalizePatchMapImageSource } from './image-source';
import { pathToken } from './lowering-state';
import {
  clonePatchMapParserJson as cloneJson,
  deepFreezePatchMapParserValue as deepFreeze,
  warnPatchMapParse as warn,
  type PatchMapParseState as ParseState,
} from './parse-state';
import {
  projectPatchMapParserTopLeft,
  type PatchMapParserTransform as Transform,
} from './transform-projection';
import {
  isParserRecord as isRecord,
  resolveColor,
  type PatchMapParserBox as Box,
} from './value-normalization';

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

import type {
  PatchMapEntityProjection,
  PatchMapProjectionIndex,
} from '../parsing/contracts';
import { projectPatchMapIntrinsicImageAffine } from '../parsing';
import type { PatchMapSceneImageController } from '../scene-images';
import {
  freezePatchMapBounds,
  patchMapAffineBasis,
  patchMapAffineCenter,
} from '../semantic/geometry';
import {
  freezeProjectionReplacements,
  jsonEquivalent,
} from './projection-records';

export interface PatchMapIntrinsicImageGeometry {
  readonly entityId: string;
  readonly bindingKey: string;
  readonly generation: number | null;
  readonly naturalSize: readonly [number, number];
}

export function projectionWithResolvedIntrinsicSizes(
  base: PatchMapProjectionIndex,
  sceneImages: PatchMapSceneImageController,
): PatchMapProjectionIndex {
  const update = intrinsicImageProjectionUpdate(
    base,
    base,
    resolvedIntrinsicImageSizes(base, sceneImages),
    sceneImages,
  );
  return update.projection;
}

export function intrinsicImageProjectionUpdate(
  base: PatchMapProjectionIndex,
  currentIndex: PatchMapProjectionIndex,
  resolutions: readonly PatchMapIntrinsicImageGeometry[],
  sceneImages: PatchMapSceneImageController,
): Readonly<{
  projection: PatchMapProjectionIndex;
  changedIds: readonly string[];
}> {
  const replacements: Record<string, PatchMapEntityProjection> = Object.create(null) as Record<
    string,
    PatchMapEntityProjection
  >;

  for (const resolution of resolutions) {
    const image = base.imagesByEntityId[resolution.entityId];
    if (
      !image ||
      image.dimensionMode !== 'intrinsic' ||
      image.intrinsicTransform === undefined ||
      image.bindingKey !== resolution.bindingKey
    ) {
      continue;
    }
    if (resolution.generation !== null) {
      const current = sceneImages.imageProbe(resolution.entityId);
      if (
        current?.generation !== resolution.generation ||
        current.bindingKey !== resolution.bindingKey ||
        current.attachmentState !== 'current'
      ) {
        continue;
      }
    }
    const sourceProjection = base.byEntityId[resolution.entityId];
    if (!sourceProjection) continue;
    const [width, height] = resolution.naturalSize;
    if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
      continue;
    }
    const affine = projectPatchMapIntrinsicImageAffine(image.intrinsicTransform, width, height);
    const localBounds = freezePatchMapBounds(0, 0, width, height);
    const projection = Object.freeze({
      ...sourceProjection,
      affine,
      localBounds,
      worldBasis: patchMapAffineBasis(affine),
      visibleCenter: patchMapAffineCenter(affine, localBounds),
    } satisfies PatchMapEntityProjection);
    if (jsonEquivalent(currentIndex.byEntityId[resolution.entityId], projection)) continue;
    replacements[resolution.entityId] = projection;
  }

  const changedIds = Object.keys(replacements).sort();
  return Object.freeze({
    projection: changedIds.length === 0
      ? currentIndex
      : freezeProjectionReplacements(currentIndex, replacements),
    changedIds: Object.freeze(changedIds),
  });
}

export function resolvedIntrinsicImageSizes(
  projection: PatchMapProjectionIndex,
  sceneImages: PatchMapSceneImageController,
): readonly PatchMapIntrinsicImageGeometry[] {
  const images = projection.imagesByEntityId;
  const resolutions: PatchMapIntrinsicImageGeometry[] = [];
  for (const entityId of Object.keys(images).sort()) {
    const image = images[entityId];
    if (image?.dimensionMode !== 'intrinsic') continue;
    const probe = sceneImages.imageProbe(entityId);
    if (probe?.naturalSize && probe.attachmentState === 'current') {
      resolutions.push({
        entityId,
        bindingKey: probe.bindingKey,
        generation: probe.generation,
        naturalSize: probe.naturalSize,
      });
      continue;
    }
    const naturalSize = sceneImages.resolvedBindingNaturalSize(image.bindingKey);
    if (naturalSize === null) continue;
    resolutions.push({
      entityId,
      bindingKey: image.bindingKey,
      generation: null,
      naturalSize,
    });
  }
  return Object.freeze(resolutions);
}

import type {
  CommitResult,
  CoreView,
  EntityPatch,
  TransactionBatch,
} from '../dense/contracts';
import type { ParsePatchMapResult } from '../parsing/contracts';
import type { PatchMapSceneImageController } from '../scene-images';
import type { PatchMapBarPresentationAuthority } from './bar-presentation-authority';
import type { PatchMapFramePublicationAuthority } from './frame-publication-authority';
import type { PatchMapInstancePresentationCoordinator } from './instance-presentation-coordinator';
import type { PatchMapPublishedSceneAuthority } from './published-scene-state';
import type { PatchMapRuntimeRendererPort } from './runtime-renderer-port';
import type { PatchMapScene } from './scene';
import type { PatchMapSpatialHitAuthority } from './spatial-hit-authority';

export type PatchMapDenseCommitRendererDomain = 'bar-only' | 'text-only';
export type PatchMapDenseCommitPublicationMode = 'ordinary' | 'semantic-reconcile';

interface PatchMapDenseCommitPort {
  assertAlive(): void;
  readScene(): PatchMapScene;
  readParseResult(): ParsePatchMapResult | null;
  readSpatialHit(): PatchMapSpatialHitAuthority;
  setCurrentView(view: CoreView): void;
  markTerminalMutationFailure(cause: unknown): void;
  reapplyResolvedIntrinsicSizes(): void;
}

/** Publishes one accepted dense transaction through all renderer-side owners. */
export class PatchMapDenseCommitCoordinator {
  public constructor(
    private readonly publishedScene: PatchMapPublishedSceneAuthority,
    private readonly renderer: PatchMapRuntimeRendererPort,
    private readonly barPresentation: PatchMapBarPresentationAuthority,
    private readonly framePublication: PatchMapFramePublicationAuthority,
    private readonly sceneImages: PatchMapSceneImageController,
    private readonly instancePresentation: PatchMapInstancePresentationCoordinator,
    private readonly port: PatchMapDenseCommitPort,
  ) {}

  public commit(
    batch: TransactionBatch,
    rendererDomain?: PatchMapDenseCommitRendererDomain,
    publicationMode: PatchMapDenseCommitPublicationMode = 'ordinary',
  ): CommitResult {
    this.port.assertAlive();
    const scene = this.port.readScene();
    if (publicationMode === 'ordinary') {
      assertDirectImageProjectionMutationSafe(batch, scene);
    }
    const directImageVisibilityIds = publicationMode === 'semantic-reconcile'
      ? new Set<string>()
      : directImageVisibilityIdsFor(batch, scene);
    const spatialHit = this.port.readSpatialHit();
    const hitImpact = spatialHit.planCommit(
      batch,
      scene,
      this.barPresentation.clockMs,
    );
    const result = scene.commit(batch);
    try {
      this.publish(
        batch,
        result,
        directImageVisibilityIds,
        rendererDomain,
        publicationMode,
        scene,
        spatialHit,
        hitImpact,
      );
    } catch (error) {
      this.port.markTerminalMutationFailure(error);
      throw error;
    }
    return result;
  }

  private publish(
    batch: TransactionBatch,
    result: CommitResult,
    directImageVisibilityIds: ReadonlySet<string>,
    rendererDomain: PatchMapDenseCommitRendererDomain | undefined,
    publicationMode: PatchMapDenseCommitPublicationMode,
    scene: PatchMapScene,
    spatialHit: PatchMapSpatialHitAuthority,
    hitImpact: ReturnType<PatchMapSpatialHitAuthority['planCommit']>,
  ): void {
    if (
      publicationMode === 'ordinary'
      && batch.operations.some((operation) =>
        operation.type !== 'view' && operation.type !== 'selection')
    ) {
      this.publishedScene.update({
        ownedInputDataset: null,
        ownedParseOptionsKey: null,
      });
    }
    if (directImageVisibilityIds.size > 0) {
      this.synchronizeParsedImageVisibility(directImageVisibilityIds, scene);
    }
    const hasGeometryChange = batch.operations.some(
      (operation) => operation.type !== 'view' && operation.type !== 'selection',
    );
    if (hasGeometryChange) this.barPresentation.recordGeometryMutation();
    const hasSelection = batch.operations.some((operation) => operation.type === 'selection');
    const lastView = [...batch.operations].reverse().find((operation) => operation.type === 'view');
    if (lastView?.type === 'view') this.port.setCurrentView(Object.freeze({ ...lastView.view }));
    this.renderer.markChanges(
      hasGeometryChange ? result.changedRanges : [],
      'commit',
      rendererDomain === undefined ? {} : { domain: rendererDomain },
    );
    if (hasSelection) this.renderer.markOverlayChanges(result.changedRanges, 'selection');
    spatialHit.invalidateFromCommit(
      hitImpact,
      rendererDomain === 'bar-only' && this.barPresentation.activeCount > 0,
    );
    const projectionStalenessChanged = spatialHit.applyCommitProjectionStaleness(
      hitImpact,
      scene,
    );
    if (projectionStalenessChanged) {
      const projection = this.barPresentation.visibleProjection;
      if (projection !== null) {
        this.renderer.setProjection(
          projection,
          result.changedRanges,
          spatialHit.staleProjectionIds,
          rendererDomain === 'text-only'
            ? 'text'
            : rendererDomain === 'bar-only'
              ? 'bar-presentation'
              : undefined,
        );
      }
    }
    spatialHit.retainCommitAnimations(hitImpact);
    if (directImageVisibilityIds.size > 0) {
      const projection = this.port.readParseResult()?.projection;
      if (projection) {
        this.sceneImages.reconcile(projection, {
          activeEntityIds: this.instancePresentation.activeSceneImageIds(),
        });
        this.port.reapplyResolvedIntrinsicSizes();
      }
    }
    this.framePublication.invalidate(scene.activeAnimations > 0 ? 'animation' : 'commit');
    const entityCountDelta = result.added - result.removed;
    if (entityCountDelta !== 0) {
      this.publishedScene.update({
        entityCount: this.publishedScene.current().entityCount + entityCountDelta,
      });
    }
  }

  private synchronizeParsedImageVisibility(
    entityIds: ReadonlySet<string>,
    scene: PatchMapScene,
  ): void {
    const parse = this.port.readParseResult();
    if (!parse || entityIds.size === 0) return;
    let changed = false;
    const entities = parse.document.entities.map((entity) => {
      if (entity.kind !== 'image' || !entityIds.has(entity.id)) return entity;
      const current = scene.get(entity.id);
      if (!current || current.visible === (entity.visible ?? true)) return entity;
      changed = true;
      return Object.freeze({ ...entity, visible: current.visible });
    });
    if (!changed) return;
    const document = Object.freeze({
      ...parse.document,
      entities: Object.freeze(entities),
    });
    this.publishedScene.update({
      parse: Object.freeze({ ...parse, document }),
    });
  }
}

function assertDirectImageProjectionMutationSafe(
  batch: TransactionBatch,
  scene: PatchMapScene,
): void {
  for (const [index, operation] of batch.operations.entries()) {
    if (operation.type === 'add' && operation.entity.kind === 'image') {
      throw unsupportedDirectImageMutation(index, 'add');
    }
    if (operation.type === 'remove' && scene.get(operation.target)?.kind === 'image') {
      throw unsupportedDirectImageMutation(index, 'remove');
    }
    if (
      operation.type === 'patch'
      && scene.get(operation.target)?.kind === 'image'
      && IMAGE_PROJECTION_PATCH_FIELDS.some((field) => operation.changes[field] !== undefined)
    ) {
      throw unsupportedDirectImageMutation(index, 'projection patch');
    }
    if (
      operation.type === 'animate'
      && scene.get(operation.target)?.kind === 'image'
      && IMAGE_PROJECTION_ANIMATION_FIELDS.has(operation.property)
    ) {
      throw unsupportedDirectImageMutation(index, 'projection animation');
    }
  }
}

function directImageVisibilityIdsFor(
  batch: TransactionBatch,
  scene: PatchMapScene,
): Set<string> {
  const ids = new Set<string>();
  for (const operation of batch.operations) {
    if (operation.type === 'visibility') {
      const entity = scene.get(operation.target);
      if (entity?.kind === 'image') ids.add(entity.id);
      continue;
    }
    if (
      operation.type === 'patch'
      && operation.changes.visible !== undefined
      && scene.get(operation.target)?.kind === 'image'
    ) {
      const entity = scene.get(operation.target);
      if (entity) ids.add(entity.id);
    }
  }
  return ids;
}

const IMAGE_PROJECTION_PATCH_FIELDS = Object.freeze([
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'source',
] as const satisfies readonly (keyof EntityPatch)[]);

const IMAGE_PROJECTION_ANIMATION_FIELDS: ReadonlySet<string> = new Set([
  'x',
  'y',
  'width',
  'height',
  'rotation',
]);

function unsupportedDirectImageMutation(index: number, operation: string): TypeError {
  return new TypeError(
    `PatchMapRuntime.commit operation ${index} (${operation}) cannot update the image projection sidecar; `
    + 'submit PATCH MAP JSON through PatchMapRuntime.reconcile instead',
  );
}

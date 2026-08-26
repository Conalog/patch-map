import { describe, expect, it } from 'vitest';

import { parsePatchMap } from '../../src/parsing';
import {
  PatchMapSceneImageController,
  type PatchMapSceneImageIntrinsicSize,
} from '../../src/scene-images';
import type { PatchMapSceneImageRendererBridge } from '../../src/scene-images/contracts';
import { PatchMapScene } from '../../src/core/scene';
import { NoopRenderer } from '../../src/dense/noop-renderer';
import { PatchMapBarPresentationAuthority } from '../../src/core/bar-presentation-authority';
import { PatchMapLoadAuthority } from '../../src/core/load-authority';
import type { PatchMapRuntimeRendererPort } from '../../src/core/runtime-renderer-port';
import {
  PatchMapPublishedSceneAuthority,
  type PatchMapPublishedSceneState,
} from '../../src/core/published-scene-state';
import { PatchMapSpatialHitAuthority } from '../../src/core/spatial-hit-authority';
import { PatchMapPresentationLayerAuthority } from '../../src/core/presentation-layers';

describe('PatchMap load authority', () => {
  it('owns cooperative freshness and the balanced publication-side-effect guard', async () => {
    const fixture = authorityFixture();
    const first = fixture.authority.beginLoad();

    expect(() => fixture.authority.assertCurrent(first, 0, 0)).not.toThrow();
    fixture.authority.beginLoad();
    expect(() => fixture.authority.assertCurrent(first, 0, 0)).toThrow(
      'PatchMapRuntime cooperative load was superseded',
    );

    expect(fixture.authority.publicationSideEffectsInProgress).toBe(false);
    fixture.authority.beginPublicationSideEffects();
    expect(fixture.authority.publicationSideEffectsInProgress).toBe(true);
    fixture.authority.endPublicationSideEffects();
    expect(fixture.authority.publicationSideEffectsInProgress).toBe(false);

    await fixture.destroy();
  });

  it('prepares a complete load candidate and rollback checkpoint without publishing', async () => {
    const fixture = authorityFixture();
    const input = [{
      type: 'rect',
      id: 'box',
      size: { width: 20, height: 10 },
      fill: '#336699',
    }];
    const parse = parsePatchMap(input);
    const candidateScene = scene();
    candidateScene.seedReplacementFrom(fixture.initial.scene);
    const store = candidateScene.load(parse.document);
    const candidate = fixture.authority.prepareCandidate({
      scene: candidateScene,
      parse,
      projection: parse.projection,
      ownedInputDataset: null,
      ownedParseOptionsKey: null,
      entityCount: store.entityCount,
    });
    const currentSpatialHit = new PatchMapSpatialHitAuthority();
    const currentPendingSizes = new Map<string, PatchMapSceneImageIntrinsicSize>();

    const prepared = fixture.authority.preparePublication({
      candidate,
      sourceProjection: parse.projection,
      view: parse.document.view,
      activeImageEntityIds: new Set(),
      currentRuntime: {
        spatialHit: currentSpatialHit,
        currentView: Object.freeze({ x: 7, y: 8, scale: 2, rotation: 9 }),
        pendingIntrinsicImageSizes: currentPendingSizes,
        automaticAnimationFramesActive: true,
      },
    });

    expect(fixture.publishedScene.current()).toBe(fixture.initial);
    expect(candidate.state.scene).toBe(candidateScene);
    expect(candidate.state.parse).toBe(parse);
    expect(candidate.state.entityCount).toBe(1);
    expect(prepared.previousRuntime.spatialHit).toBe(currentSpatialHit);
    expect(prepared.previousRuntime.pendingIntrinsicImageSizes).toBe(currentPendingSizes);
    expect(prepared.nextRuntime.spatialHit).not.toBe(currentSpatialHit);
    expect(prepared.nextRuntime.currentView).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
    expect(prepared.rendererCheckpoint.state).toEqual({ opaqueState: 'initial' });

    fixture.authority.disposeRuntimeState(prepared.nextRuntime);
    currentSpatialHit.destroy();
    candidateScene.destroy();
    await fixture.destroy();
  });
});

function authorityFixture(): Readonly<{
  authority: PatchMapLoadAuthority;
  publishedScene: PatchMapPublishedSceneAuthority;
  initial: PatchMapPublishedSceneState;
  destroy(): Promise<void>;
}> {
  const initial = emptyState(scene());
  const publishedScene = new PatchMapPublishedSceneAuthority(initial);
  const barPresentation = new PatchMapBarPresentationAuthority();
  const sceneImages = new PatchMapSceneImageController(
    {} as PatchMapSceneImageRendererBridge,
  );
  const rendererCheckpoint = Object.freeze({ opaqueState: 'initial' });
  const authority = new PatchMapLoadAuthority(
    publishedScene,
    barPresentation,
    sceneImages,
    {
      publicationCheckpoint: {
        capture: () => rendererCheckpoint,
        restore: () => undefined,
      },
    } as unknown as PatchMapRuntimeRendererPort,
    new PatchMapPresentationLayerAuthority(),
    {
      installRuntimeFields: () => undefined,
      applyPresentationPolicyToRenderer: () => undefined,
      clearInstancePresentationState: () => undefined,
      markTerminalLoadFailure: () => undefined,
      resetAdaptiveFrameBudget: () => undefined,
      invalidateLoadFrame: () => undefined,
    },
    {
      assertAlive: () => undefined,
      createScene: () => scene(),
      readScene: () => initial.scene,
      readEntityCount: () => 0,
      readCurrentRuntime: () => ({
        spatialHit: new PatchMapSpatialHitAuthority(),
        currentView: Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 }),
        pendingIntrinsicImageSizes: new Map(),
        automaticAnimationFramesActive: false,
      }),
      activeImageEntityIds: () => new Set(),
    },
  );
  return {
    authority,
    publishedScene,
    initial,
    async destroy(): Promise<void> {
      barPresentation.destroy();
      await sceneImages.destroy();
      initial.scene.destroy();
    },
  };
}

function scene(): PatchMapScene {
  return new PatchMapScene({ renderer: new NoopRenderer() });
}

function emptyState(sceneValue: PatchMapScene): PatchMapPublishedSceneState {
  return Object.freeze({
    scene: sceneValue,
    parse: null,
    projection: null,
    ownedInputDataset: null,
    ownedParseOptionsKey: null,
    transientIncrementalParse: null,
    componentTargets: new Map(),
    textTargets: new Map(),
    entityCount: 0,
  });
}

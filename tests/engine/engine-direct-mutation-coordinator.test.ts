import { describe, expect, it } from 'vitest';

import { materializePatchMapDataset } from '../../src/patch-map/semantic/dataset';
import { PatchMapSemanticHistory } from '../../src/patch-map/history';
import type {
  PatchMapEngineSurface,
  PatchMapSurfaceReconcileOptions,
} from '../../src/patch-map/engine/contracts';
import { PatchMapDirectMutationCoordinator } from '../../src/patch-map/engine/direct-mutation-coordinator';
import {
  createPatchMapEngineHistorySnapshot,
  type PatchMapEngineHistoryCompanion,
} from '../../src/patch-map/engine/history-planning';
import { PatchMapPublicationAuthority } from '../../src/patch-map/engine/publication-authority';
import { PatchMapSceneStateAuthority } from '../../src/patch-map/engine/scene-state-authority';
import type {
  PatchMapLifecycle,
} from '../../src/patch-map/engine/contracts/lifecycle';

describe('PatchMapDirectMutationCoordinator', () => {
  it('commits a patch through canonical scene, history, and publication authorities', () => {
    const fixture = createFixture();

    const result = fixture.coordinator.patch(
      { kind: 'element', id: 'rect-a' },
      { attrs: { x: 48 } },
    );

    expect(result).toMatchObject({
      status: 'committed',
      previousRevisions: { sceneRevision: 1 },
      revisions: { sceneRevision: 2 },
      denseOperationCount: 1,
    });
    expect(fixture.events).toEqual(['cancel-transformer', 'reconcile', 'lifecycle:scene-ready', 'change']);
    expect(fixture.sceneState.findElement('rect-a')).toMatchObject({ attrs: { x: 48 } });
    expect(fixture.history.state()).toMatchObject({ undoDepth: 1, redoDepth: 0 });
    expect(fixture.publication.sceneRevision).toBe(2);
    expect(fixture.viewportInvalidations).toEqual([1]);
  });

  it('removes stale selection and publishes interaction before targetDestroyed', () => {
    const fixture = createFixture(['rect-a']);

    const result = fixture.coordinator.destroyTarget({ kind: 'element', id: 'rect-a' });

    expect(result).toMatchObject({
      status: 'committed',
      revisions: { sceneRevision: 2, interactionRevision: 2 },
      applied: [{ kind: 'element', id: 'rect-a' }],
    });
    expect(fixture.lastReconcileOptions).toEqual({
      animateBarChanges: false,
      structuralSharing: true,
      selectionIds: [],
    });
    expect(fixture.sceneState.materialized?.dataset).toEqual([]);
    expect(fixture.sceneState.selectionIds).toEqual([]);
    expect(fixture.events).toEqual([
      'cancel-transformer',
      'reconcile',
      'lifecycle:ready-empty',
      'targetDestroyed',
    ]);
  });

  it('leaves every canonical authority unchanged when dense reconcile refuses', () => {
    const fixture = createFixture();
    const sceneBefore = fixture.sceneState.materialized;
    fixture.refuseNextReconcile();

    const result = fixture.coordinator.patch(
      { kind: 'element', id: 'rect-a' },
      { attrs: { x: 96 } },
    );

    expect(result).toMatchObject({
      status: 'refused',
      changed: false,
      revisions: { sceneRevision: 1 },
      diagnostic: { code: 'CONFLICT' },
    });
    expect(fixture.sceneState.materialized).toBe(sceneBefore);
    expect(fixture.history.state()).toMatchObject({ undoDepth: 0, redoDepth: 0 });
    expect(fixture.publication.sceneRevision).toBe(1);
    expect(fixture.viewportInvalidations).toEqual([]);
    expect(fixture.events).toEqual(['cancel-transformer', 'reconcile', 'diagnostic']);
  });
});

function createFixture(selectionIds: readonly string[] = Object.freeze([])) {
  const empty = materializePatchMapDataset([]);
  const materialized = materializePatchMapDataset([{
    type: 'rect',
    id: 'rect-a',
    size: { width: 20, height: 20 },
    fill: '#336699',
    attrs: { x: 4, y: 8 },
  }]);
  const sceneState = new PatchMapSceneStateAuthority(empty);
  sceneState.commit(sceneState.prepareReplacement({
    materialized,
    componentSemantics: new Map(),
    textSemantics: new Map(),
    datasetRef: 'direct-mutation-fixture',
  }));
  sceneState.replaceSelection(selectionIds);
  const history = new PatchMapSemanticHistory({ capacity: 20 });
  const publication = new PatchMapPublicationAuthority();
  publication.advanceScene();
  if (selectionIds.length > 0) publication.advanceInteraction();
  const events: string[] = [];
  const viewportInvalidations: number[] = [];
  let lastReconcileOptions: PatchMapSurfaceReconcileOptions | null = null;
  let reconcileStatus: 'committed' | 'refused' = 'committed';
  const surface = {
    reconcile: (_dataset: unknown, options: PatchMapSurfaceReconcileOptions) => {
      events.push('reconcile');
      lastReconcileOptions = options;
      return {
        status: reconcileStatus,
        operationCount: reconcileStatus === 'committed' ? 1 : 0,
        denseChanged: reconcileStatus === 'committed',
        diagnostics: Object.freeze([]),
      };
    },
  } as unknown as PatchMapEngineSurface;
  const companion = (ids: readonly string[]): PatchMapEngineHistoryCompanion => Object.freeze({
    selectionIds: Object.freeze([...ids]),
    mode: 'select',
    hostCompanion: null,
  });
  let lifecycle: PatchMapLifecycle = 'scene-ready';
  const coordinator = new PatchMapDirectMutationCoordinator(
    sceneState,
    history,
    publication,
    empty,
    {
      requireSurface: () => surface,
      reducedMotion: () => false,
      terminalSurfaceFailure: () => null,
      historySnapshot: () => createPatchMapEngineHistorySnapshot(
        sceneState.materialized?.dataset ?? empty.dataset,
        companion(sceneState.selectionIds),
      ),
      historyCompanionForSelection: companion,
      cancelActiveTransformer: () => {
        events.push('cancel-transformer');
      },
      isSurfaceSceneCurrent: () => true,
      isSurfaceMutationCurrent: () => true,
      restoreAuthoritativeSurfaceScene: () => {
        events.push('restore');
      },
      invalidateViewportContributors: () => {
        viewportInvalidations.push(viewportInvalidations.length + 1);
      },
      commitLifecycle: (nextLifecycle) => {
        lifecycle = nextLifecycle;
        events.push(`lifecycle:${nextLifecycle}`);
      },
      emitDiagnostic: () => {
        events.push('diagnostic');
      },
      emitChange: () => {
        events.push('change');
      },
      emitTargetDestroyed: () => {
        events.push('targetDestroyed');
      },
    },
  );

  return {
    coordinator,
    sceneState,
    history,
    publication,
    events,
    viewportInvalidations,
    get lifecycle() {
      return lifecycle;
    },
    get lastReconcileOptions() {
      return lastReconcileOptions;
    },
    refuseNextReconcile() {
      reconcileStatus = 'refused';
    },
  };
}

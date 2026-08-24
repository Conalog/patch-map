import type { PatchMapAccessibilityAuthority } from '../accessibility';
import type { PatchMapEditorWorkflowAuthority } from '../editor-workflow';
import type { PatchMapHostInteractionAuthority } from '../host-interaction';
import {
  PatchMapDatasetError,
  materializePatchMapDataset,
  validatePatchMapDatasetReferences,
  type MaterializedPatchMapDataset,
} from '../semantic/dataset';
import type {
  PatchMapEngineSurface,
} from './contracts';
import { normalizeOptionalSourceRevision } from './input-contracts';
import type {
  PatchMapDatasetSubmission,
  PatchMapDatasetSubmissionResult,
  PatchMapEngineDiagnostic,
  PatchMapEngineLoadResult,
  PatchMapLifecycle,
  PatchMapLoadOptions,
} from './public-contracts';
import type { PatchMapPublicationAuthority } from './publication-authority';
import type {
  PatchMapSceneStateAuthority,
  PatchMapSceneStatePlan,
} from './scene-state-authority';
import {
  indexComponentSemantics,
  indexTextSemantics,
} from './semantic-index';
import type { PatchMapTransformerSessionCoordinator } from './transformer-session-coordinator';

interface PreparedPatchMapEngineLoad {
  readonly materialized: MaterializedPatchMapDataset;
  readonly scenePlan: PatchMapSceneStatePlan;
}

interface PatchMapDatasetReplacementPort {
  readonly lifecycle: () => PatchMapLifecycle;
  readonly setLifecycle: (
    lifecycle: Extract<PatchMapLifecycle, 'scene-ready' | 'ready-empty'>,
  ) => void;
  readonly liveSurface: () => PatchMapEngineSurface | null;
  readonly requireSurface: (operation: string) => PatchMapEngineSurface;
  readonly adjustPendingWork: (delta: 1 | -1) => void;
  readonly resetHistoryHostCompanion: () => void;
  readonly interruptPointerReplacement: () => void;
  readonly resetPointerProjectionState: () => void;
  readonly syncSelectionVisualPolicy: () => void;
  readonly invalidateViewportContributors: () => void;
  readonly clearHistoryForReplacement: () => void;
  readonly resetLiveOverlay: () => void;
  readonly restoreAuthoritativeSurfaceScene: (
    surface: PatchMapEngineSurface,
    operation: string,
  ) => void;
  readonly operationError: (
    code: 'DESTROYED' | 'SUPERSEDED',
    operation: string,
    recoverable: boolean,
  ) => Error;
  readonly operationDiagnostic: (
    code: 'NOT_READY' | 'SUPERSEDED',
    operation: string,
    recoverable: boolean,
  ) => PatchMapEngineDiagnostic;
  readonly diagnosticFrom: (
    error: unknown,
    operation: string,
  ) => PatchMapEngineDiagnostic;
  readonly emitDiagnostic: (diagnostic: PatchMapEngineDiagnostic) => void;
  readonly emitSceneCommitted: (result: PatchMapEngineLoadResult) => void;
  readonly emitDrawComplete: (event: Readonly<{
    requestId: string;
    sourceRevision?: number;
    sceneRevision: number;
    semanticHash: string;
    datasetRef: string | null;
  }>) => void;
}

/**
 * Owns Engine-level dataset replacement freshness and publication ordering.
 * Core surface publication and Engine scene/publication authorities remain the
 * only writers of their respective state.
 */
export class PatchMapDatasetReplacementCoordinator {
  private sequence = 0;
  private activeAsyncSurfaceSequence: number | null = null;

  public constructor(
    private readonly sceneState: PatchMapSceneStateAuthority,
    private readonly publication: PatchMapPublicationAuthority,
    private readonly hostInteractions: PatchMapHostInteractionAuthority,
    private readonly accessibility: PatchMapAccessibilityAuthority,
    private readonly editorWorkflows: PatchMapEditorWorkflowAuthority,
    private readonly transformerSessions: PatchMapTransformerSessionCoordinator,
    private readonly port: PatchMapDatasetReplacementPort,
  ) {}

  public invalidate(): void {
    this.sequence += 1;
  }

  public load(
    input: unknown,
    options: PatchMapLoadOptions = {},
  ): PatchMapEngineLoadResult {
    const surface = this.port.requireSurface('loadDataset');
    const prepared = this.prepare(input, options);
    return this.publish(surface, prepared, 'loadDataset');
  }

  public async loadAsync(
    input: unknown,
    options: PatchMapLoadOptions = {},
  ): Promise<PatchMapEngineLoadResult> {
    const surface = this.port.requireSurface('loadDatasetAsync');
    const materialized = materializePatchMapDataset(input);
    this.validateStrict(materialized, options);
    const sequence = ++this.sequence;
    const lifecycleGeneration = this.publication.lifecycleGeneration;
    const sceneRevision = this.publication.sceneRevision;
    this.port.adjustPendingWork(1);
    try {
      await yieldPatchMapEngineTask();
      this.assertCurrent(surface, sequence, lifecycleGeneration, sceneRevision);
      const componentSemantics = indexComponentSemantics(materialized.dataset);
      await yieldPatchMapEngineTask();
      this.assertCurrent(surface, sequence, lifecycleGeneration, sceneRevision);
      const textSemantics = indexTextSemantics(materialized.dataset);
      const prepared = Object.freeze({
        materialized,
        scenePlan: this.sceneState.prepareReplacement({
          materialized,
          componentSemantics,
          textSemantics,
          datasetRef: options.datasetRef ?? null,
        }),
      });
      await yieldPatchMapEngineTask();
      this.assertCurrent(surface, sequence, lifecycleGeneration, sceneRevision);
      const assertCurrent = (): void => {
        this.assertCurrent(surface, sequence, lifecycleGeneration, sceneRevision);
      };
      try {
        this.transformerSessions.cancelActive('replace', true);
        if (surface.loadAsync) {
          this.activeAsyncSurfaceSequence = sequence;
          await surface.loadAsync(materialized.dataset, assertCurrent);
        } else {
          surface.load(materialized.dataset);
        }
        assertCurrent();
      } catch (error) {
        if (
          this.activeAsyncSurfaceSequence === null ||
          this.activeAsyncSurfaceSequence === sequence
        ) {
          this.port.restoreAuthoritativeSurfaceScene(surface, 'loadDatasetAsync');
        }
        throw error;
      } finally {
        if (this.activeAsyncSurfaceSequence === sequence) {
          this.activeAsyncSurfaceSequence = null;
        }
      }
      this.afterSurfaceAcceptance();
      return this.commit(prepared);
    } finally {
      this.port.adjustPendingWork(-1);
    }
  }

  public async submit(
    submission: PatchMapDatasetSubmission,
  ): Promise<PatchMapDatasetSubmissionResult> {
    let sourceFields: Readonly<{ readonly sourceRevision?: number }> = Object.freeze({});
    let sequence = 0;
    let inputResolved = false;
    let outcome: PatchMapDatasetSubmissionResult | null = null;
    this.port.adjustPendingWork(1);
    try {
      const sourceRevision = normalizeOptionalSourceRevision(submission.sourceRevision);
      sourceFields = sourceRevision === undefined
        ? Object.freeze({})
        : Object.freeze({ sourceRevision });
      if (this.port.liveSurface() === null) {
        outcome = Object.freeze({
          status: 'rejected',
          requestId: submission.requestId,
          ...sourceFields,
          diagnostic: this.port.operationDiagnostic('NOT_READY', 'loadDataset', true),
        } satisfies PatchMapDatasetSubmissionResult);
        return outcome;
      }
      sequence = ++this.sequence;
      const input = await submission.input;
      inputResolved = true;
      const prepared = this.prepare(input, {
        ...(submission.datasetRef ? { datasetRef: submission.datasetRef } : {}),
      });
      if (sequence !== this.sequence || this.isDestroyingOrDestroyed()) {
        outcome = this.supersededSubmission(submission.requestId, sourceFields);
        return outcome;
      }
      const surface = this.port.requireSurface('loadDataset');
      const result = this.publish(surface, prepared, 'loadDataset');
      this.port.emitDrawComplete(Object.freeze({
        requestId: submission.requestId,
        ...sourceFields,
        sceneRevision: result.sceneRevision,
        semanticHash: result.semanticHash,
        datasetRef: submission.datasetRef ?? null,
      }));
      outcome = Object.freeze({
        status: 'committed',
        requestId: submission.requestId,
        ...sourceFields,
        sceneRevision: result.sceneRevision,
        semanticHash: result.semanticHash,
      } satisfies PatchMapDatasetSubmissionResult);
      return outcome;
    } catch (error) {
      if (
        !inputResolved &&
        sequence !== 0 &&
        (sequence !== this.sequence || this.isDestroyingOrDestroyed())
      ) {
        outcome = this.supersededSubmission(submission.requestId, sourceFields);
        return outcome;
      }
      const diagnostic = this.port.diagnosticFrom(error, 'loadDataset');
      if (!this.isDestroyingOrDestroyed()) this.port.emitDiagnostic(diagnostic);
      outcome = Object.freeze({
        status: 'rejected',
        requestId: submission.requestId,
        ...sourceFields,
        diagnostic,
      } satisfies PatchMapDatasetSubmissionResult);
      return outcome;
    } finally {
      try {
        if (outcome !== null) await submission.release?.(outcome);
      } finally {
        this.port.adjustPendingWork(-1);
      }
    }
  }

  private publish(
    surface: PatchMapEngineSurface,
    prepared: PreparedPatchMapEngineLoad,
    operation: 'loadDataset',
  ): PatchMapEngineLoadResult {
    this.transformerSessions.cancelActive('replace', true);
    const sequence = ++this.sequence;
    this.activeAsyncSurfaceSequence = null;
    const lifecycleGeneration = this.publication.lifecycleGeneration;
    const sceneRevision = this.publication.sceneRevision;
    surface.load(prepared.materialized.dataset);
    try {
      this.assertCurrent(
        surface,
        sequence,
        lifecycleGeneration,
        sceneRevision,
        operation,
      );
    } catch (error) {
      this.port.restoreAuthoritativeSurfaceScene(surface, operation);
      throw error;
    }
    this.afterSurfaceAcceptance();
    return this.commit(prepared);
  }

  private prepare(
    input: unknown,
    options: PatchMapLoadOptions,
  ): PreparedPatchMapEngineLoad {
    const materialized = materializePatchMapDataset(input);
    this.validateStrict(materialized, options);
    const componentSemantics = indexComponentSemantics(materialized.dataset);
    const textSemantics = indexTextSemantics(materialized.dataset);
    return Object.freeze({
      materialized,
      scenePlan: this.sceneState.prepareReplacement({
        materialized,
        componentSemantics,
        textSemantics,
        datasetRef: options.datasetRef ?? null,
      }),
    });
  }

  private validateStrict(
    materialized: MaterializedPatchMapDataset,
    options: PatchMapLoadOptions,
  ): void {
    if (options.strict !== undefined && typeof options.strict !== 'boolean') {
      throw new PatchMapDatasetError(
        'INVALID_VALUE',
        '$.options.strict',
        'strict must be a boolean',
      );
    }
    if (options.strict === true) {
      validatePatchMapDatasetReferences(materialized.dataset);
    }
  }

  private commit(prepared: PreparedPatchMapEngineLoad): PatchMapEngineLoadResult {
    const { materialized, scenePlan } = prepared;
    const selectionBefore = this.sceneState.selectionIds;
    const modeBefore = this.hostInteractions.modeProbe().activeState;
    this.port.resetHistoryHostCompanion();
    if (modeBefore !== 'select') {
      this.hostInteractions.applyModeOperation({ op: 'replace', state: 'select' });
    }
    if (selectionBefore.length > 0 || modeBefore !== 'select') {
      this.publication.advanceInteraction();
    }
    this.hostInteractions.clearTooltip('redraw');
    this.hostInteractions.clearLogicalBindings();
    this.accessibility.replaceScene();
    this.sceneState.commit(scenePlan);
    this.port.syncSelectionVisualPolicy();
    this.port.invalidateViewportContributors();
    this.port.clearHistoryForReplacement();
    this.port.resetLiveOverlay();
    this.publication.advanceScene();
    const lifecycle = materialized.rootIds.length > 0 ? 'scene-ready' : 'ready-empty';
    this.port.setLifecycle(lifecycle);
    this.editorWorkflows.onSceneReplaced();
    const result: PatchMapEngineLoadResult = Object.freeze({
      lifecycle,
      sceneRevision: this.publication.sceneRevision,
      semanticHash: materialized.semanticHash,
      rootIds: materialized.rootIds,
    });
    this.port.emitSceneCommitted(result);
    return result;
  }

  private afterSurfaceAcceptance(): void {
    this.port.interruptPointerReplacement();
    this.port.resetPointerProjectionState();
    this.transformerSessions.interruptGestures();
  }

  private assertCurrent(
    surface: PatchMapEngineSurface,
    sequence: number,
    lifecycleGeneration: number,
    sceneRevision: number,
    operation = 'loadDatasetAsync',
  ): void {
    if (this.isDestroyingOrDestroyed()) {
      throw this.port.operationError('DESTROYED', operation, false);
    }
    if (
      this.port.liveSurface() !== surface ||
      this.sequence !== sequence ||
      this.publication.lifecycleGeneration !== lifecycleGeneration ||
      this.publication.sceneRevision !== sceneRevision
    ) {
      throw this.port.operationError('SUPERSEDED', operation, true);
    }
  }

  private isDestroyingOrDestroyed(): boolean {
    const lifecycle = this.port.lifecycle();
    return lifecycle === 'destroying' || lifecycle === 'destroyed';
  }

  private supersededSubmission(
    requestId: string,
    sourceFields: Readonly<{ readonly sourceRevision?: number }>,
  ): PatchMapDatasetSubmissionResult {
    return Object.freeze({
      status: 'superseded',
      requestId,
      ...sourceFields,
      diagnostic: this.port.operationDiagnostic('SUPERSEDED', 'loadDataset', true),
    } satisfies PatchMapDatasetSubmissionResult);
  }
}

function yieldPatchMapEngineTask(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}


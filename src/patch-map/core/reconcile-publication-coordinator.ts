import type { CommitResult, TransactionBatch } from '../dense/contracts';
import type { ParsePatchMapOptions } from '../contracts';
import {
  rollbackPatchMapProjectionStableRecords,
} from './projection-records';
import {
  freezeReconcileResult,
  reconcileFacts,
  reconcileFactStamp,
  retainedOwnedInputDataset,
} from './reconcile-planning';
import { preparePatchMapReconcileCandidate } from './reconcile-candidate';
import {
  indexPatchMapComponentProbeTargets,
  indexPatchMapTextProbeTargets,
} from './product-probe-reader';
import type { PatchMapPublishedSceneAuthority } from './published-scene-state';
import type { PatchMapStableRecordStrategy } from '../semantic/stable-record-overlay';
import type { PatchMapReconcileOptions, PatchMapReconcileResult } from './contracts';
import type { PatchMapInstancePresentationCoordinator } from './instance-presentation-coordinator';

type PatchMapReconcileRendererDomain = 'bar-only' | 'text-only' | undefined;

export interface PatchMapReconcilePublicationPort {
  readonly assertAlive: () => void;
  readonly commitDenseBatch: (
    batch: TransactionBatch,
    rendererDomain: PatchMapReconcileRendererDomain,
  ) => CommitResult;
  readonly markTerminalMutationFailure: (cause: unknown) => void;
}

/**
 * Owns the ordered semantic-reconcile state machine from candidate preparation
 * through dense commit and terminal publication. The coordinator retains only
 * stable authorities; load-replaceable runtime state is read through its port.
 */
export class PatchMapReconcilePublicationCoordinator {
  public constructor(
    private readonly publishedScene: PatchMapPublishedSceneAuthority,
    private readonly instancePresentation: PatchMapInstancePresentationCoordinator,
    private readonly parseOptions: ParsePatchMapOptions,
    private readonly stableRecordStrategy: PatchMapStableRecordStrategy,
    private readonly port: PatchMapReconcilePublicationPort,
  ) {}

  public reconcile(
    input: unknown,
    options: PatchMapReconcileOptions = {},
  ): PatchMapReconcileResult {
    this.port.assertAlive();
    const published = this.publishedScene.current();
    const currentParse = published.parse;
    if (currentParse === null) {
      throw new Error('PatchMapRuntime.reconcile requires a loaded PATCH MAP dataset');
    }

    const totalStarted = now();
    const before = reconcileFactStamp(published.scene);
    const candidate = preparePatchMapReconcileCandidate(
      input,
      options,
      this.parseOptions,
      currentParse,
      published,
      published.scene,
      this.stableRecordStrategy,
    );
    const {
      parse,
      plan,
      path,
      semanticChanged,
      parseMs,
      planMs,
    } = candidate;

    if (!plan.safeToCommit) {
      if (this.stableRecordStrategy === 'internal-overlay') {
        rollbackPatchMapProjectionStableRecords(
          parse.projection,
          currentParse.projection,
        );
      }
      const after = reconcileFactStamp(this.publishedScene.current().scene);
      return freezeReconcileResult({
        status: 'refused',
        parse,
        plan,
        commit: null,
        timings: {
          parseMs,
          planMs,
          commitMs: 0,
          totalMs: now() - totalStarted,
        },
        facts: reconcileFacts(plan, semanticChanged, before, after),
      });
    }

    const commitStarted = now();
    let commit: CommitResult;
    try {
      commit = this.port.commitDenseBatch(
        plan.batch,
        path === 'direct-text'
          ? 'text-only'
          : path === 'direct-bar'
            ? 'bar-only'
            : undefined,
      );
    } catch (error) {
      if (this.stableRecordStrategy === 'internal-overlay') {
        rollbackPatchMapProjectionStableRecords(
          parse.projection,
          currentParse.projection,
        );
      }
      throw error;
    }
    const commitMs = now() - commitStarted;
    try {
      this.publishCandidate(input, options, candidate, commit);
    } catch (error) {
      // Dense identity has committed and cannot be reconstructed exactly.
      // Seal the runtime instead of exposing a partially published scene.
      this.port.markTerminalMutationFailure(error);
      throw error;
    }
    const after = reconcileFactStamp(this.publishedScene.current().scene);
    return freezeReconcileResult({
      status: 'committed',
      parse,
      plan,
      commit,
      timings: {
        parseMs,
        planMs,
        commitMs,
        totalMs: now() - totalStarted,
      },
      facts: reconcileFacts(plan, semanticChanged, before, after),
    });
  }

  private publishCandidate(
    input: unknown,
    options: PatchMapReconcileOptions,
    candidate: ReturnType<typeof preparePatchMapReconcileCandidate>,
    commit: CommitResult,
  ): void {
    const {
      parse,
      path,
      incrementalEntityIds,
      hierarchyOnlyTargetMapping,
      structuralPresentationEntityIds,
      parseOptions,
    } = candidate;
    const published = this.publishedScene.current();
    const previousProjection = published.projection;
    const mappingReusable =
      path === 'direct-bar' ||
      path === 'direct-text' ||
      path === 'direct-angle' ||
      hierarchyOnlyTargetMapping;
    const candidateComponentTargets = mappingReusable
      ? published.componentTargets
      : indexPatchMapComponentProbeTargets(parse);
    const retainedInput = retainedOwnedInputDataset(input, parseOptions);
    const basePresentationEntityIds = incrementalEntityIds ??
      (hierarchyOnlyTargetMapping
        ? Object.freeze([])
        : structuralPresentationEntityIds);
    const updateTargetMappings = path !== 'direct-bar' &&
      path !== 'direct-text' &&
      path !== 'direct-angle' &&
      path !== 'incremental' &&
      !hierarchyOnlyTargetMapping;
    this.instancePresentation.replayAfterReconcile({
      parse,
      previousProjection,
      componentTargets: candidateComponentTargets,
      textTargets: updateTargetMappings
        ? indexPatchMapTextProbeTargets(parse)
        : null,
      retainedInputDataset: retainedInput.dataset,
      retainedParseOptionsKey: retainedInput.optionsKey,
      basePresentationEntityIds,
      commitChangedRanges: commit.changedRanges,
      path,
      animateBarChanges: options.animateBarChanges !== false,
      animatedBarTargets: options.animatedBarTargets,
      reprojectPresentationLayers: !mappingReusable,
    });
  }
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

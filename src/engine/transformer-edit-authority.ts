import type { PatchMapTransformerHandle } from '../selection-transformer';
import {
  PATCH_MAP_TRANSFORMER_EDIT_REVISION,
  type PatchMapTransformerEditKind,
  type PatchMapTransformerEditPlan,
} from '../selection-transformer/edit';
import type { MaterializedPatchMapDataset } from '../semantic/dataset';
import type { PatchMapMutationTransactionPlan } from '../semantic/transaction';
import type { PatchMapEngineTransformerSessionProbe } from './contracts/history-transformer';

export interface PatchMapTransformerEditSession {
  readonly pointerId: number;
  readonly actionId: string;
  readonly kind: PatchMapTransformerEditKind;
  readonly handle: PatchMapTransformerHandle;
  readonly selectionIds: readonly string[];
  readonly startMaterialized: MaterializedPatchMapDataset;
  readonly startSelectionIds: readonly string[];
  readonly historyDepthBefore: number;
  readonly latestPlan: PatchMapTransformerEditPlan | null;
  readonly latestMutationPlan: PatchMapMutationTransactionPlan | null;
  readonly previewMaterialized: MaterializedPatchMapDataset | null;
  readonly transientPreview: boolean;
}

export interface PatchMapTransformerEditSessionBegin {
  readonly pointerId: number;
  readonly actionId: string;
  readonly kind: PatchMapTransformerEditKind;
  readonly handle: PatchMapTransformerHandle;
  readonly selectionIds: readonly string[];
  readonly startMaterialized: MaterializedPatchMapDataset;
  readonly startSelectionIds: readonly string[];
  readonly historyDepthBefore: number;
}

export interface PatchMapTransformerEditPreviewEffect {
  readonly latestPlan: PatchMapTransformerEditPlan;
  readonly latestMutationPlan: PatchMapMutationTransactionPlan | null;
  readonly previewMaterialized: MaterializedPatchMapDataset;
  readonly transientPreview: boolean;
}

export type PatchMapTransformerEditCompletionEffect =
  | Readonly<{
      readonly status: 'stale';
      readonly session: null;
    }>
  | Readonly<{
      readonly status: 'unchanged' | 'planned';
      readonly session: PatchMapTransformerEditSession;
    }>;

export type PatchMapTransformerEditSettlement =
  | 'unchanged'
  | 'committed'
  | 'cancelled';

/**
 * Owns transformer edit session identity and counters without owning any
 * surface, gesture, transaction, history, listener, or scheduler side effect.
 */
export class PatchMapTransformerEditAuthority {
  private activeSession: PatchMapTransformerEditSession | null = null;
  private previewCount = 0;
  private committedMutationCount = 0;
  private cancelledSessionCount = 0;
  private staleCompletionCount = 0;

  public assertIdle(): void {
    if (this.activeSession !== null) {
      throw new Error('PatchMap transformer edit session is already active');
    }
  }

  public begin(
    input: PatchMapTransformerEditSessionBegin,
  ): PatchMapTransformerEditSession {
    this.assertIdle();
    const session = Object.freeze({
      ...input,
      selectionIds: Object.freeze([...input.selectionIds]),
      startSelectionIds: Object.freeze([...input.startSelectionIds]),
      latestPlan: null,
      latestMutationPlan: null,
      previewMaterialized: null,
      transientPreview: false,
    } satisfies PatchMapTransformerEditSession);
    this.activeSession = session;
    return session;
  }

  public current(): PatchMapTransformerEditSession | null {
    return this.activeSession;
  }

  public require(
    pointerId: number,
    operation: string,
  ): PatchMapTransformerEditSession {
    const active = this.activeSession;
    if (active === null || active.pointerId !== pointerId) {
      throw new Error(`${operation} requires the active transformer pointer`);
    }
    return active;
  }

  public recordPreview(
    session: PatchMapTransformerEditSession,
    effect: PatchMapTransformerEditPreviewEffect,
  ): PatchMapTransformerEditSession {
    this.assertCurrent(session);
    const next = Object.freeze({
      ...session,
      ...effect,
    } satisfies PatchMapTransformerEditSession);
    this.activeSession = next;
    this.previewCount += 1;
    return next;
  }

  public prepareCompletion(
    pointerId: number,
  ): PatchMapTransformerEditCompletionEffect {
    const session = this.activeSession;
    if (session === null || session.pointerId !== pointerId) {
      this.staleCompletionCount += 1;
      return Object.freeze({ status: 'stale', session: null });
    }
    return Object.freeze({
      status: session.latestPlan?.status === 'planned' ? 'planned' : 'unchanged',
      session,
    });
  }

  public settle(
    session: PatchMapTransformerEditSession,
    outcome: PatchMapTransformerEditSettlement,
  ): void {
    this.assertCurrent(session);
    this.activeSession = null;
    if (outcome === 'committed') this.committedMutationCount += 1;
    if (outcome === 'cancelled') this.cancelledSessionCount += 1;
  }

  public probe(): PatchMapEngineTransformerSessionProbe {
    const active = this.activeSession;
    return Object.freeze({
      schemaRevision: PATCH_MAP_TRANSFORMER_EDIT_REVISION,
      activeSessionCount: active === null ? 0 : 1,
      activePointerId: active?.pointerId ?? null,
      activeKind: active?.kind ?? null,
      activeActionId: active?.actionId ?? null,
      previewCount: this.previewCount,
      committedMutationCount: this.committedMutationCount,
      cancelledSessionCount: this.cancelledSessionCount,
      staleCompletionCount: this.staleCompletionCount,
      previewOverlayCount: active?.previewMaterialized === null || active === null ? 0 : 1,
      edgePanActiveCount: 0,
    });
  }

  private assertCurrent(session: PatchMapTransformerEditSession): void {
    if (this.activeSession !== session) {
      throw new Error('transformer edit session effect is stale');
    }
  }
}

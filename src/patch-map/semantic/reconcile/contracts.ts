import type { TransactionBatch } from '../../dense/contracts';

export type PatchMapReconcileDiagnosticSeverity = 'warning' | 'error';

export type PatchMapReconcileDiagnosticCode =
  | 'BACKGROUND_CHANGE_UNSUPPORTED'
  | 'ENTITY_ORDER_CHANGE_UNSUPPORTED'
  | 'UNPROJECTED_SEMANTIC_DELTA'
  | 'DENSE_PROJECTION_DIAGNOSTIC';

export interface PatchMapReconcileDiagnostic {
  readonly severity: PatchMapReconcileDiagnosticSeverity;
  readonly code: PatchMapReconcileDiagnosticCode;
  readonly message: string;
  readonly path?: string;
  readonly sourceCode?: string;
  readonly scope?: 'current' | 'candidate';
}

export interface PatchMapReconcileSummary {
  readonly operationCount: number;
  readonly added: number;
  readonly patched: number;
  readonly visibilityChanged: number;
  readonly removed: number;
  readonly replaced: number;
  readonly unchanged: number;
  readonly viewChanged: boolean;
  readonly unsupported: number;
}

export interface PatchMapDenseReconcilePlan {
  /** One atomic transaction for the inherited dense-store commit seam. */
  readonly batch: TransactionBatch;
  /** False means applying the batch would leave an unsupported observable delta. */
  readonly safeToCommit: boolean;
  readonly diagnostics: readonly PatchMapReconcileDiagnostic[];
  readonly summary: PatchMapReconcileSummary;
}

export interface PatchMapReconcileOptions {
  readonly id?: string;
  readonly recordHistory?: boolean;
  /** Optional logical selection replacement committed in the same dense batch. */
  readonly selectionIds?: readonly string[];
  /**
   * Stable dense IDs whose same-z authored order may change without rebuilding
   * their rows. Every ID participating in an order inversion must be present.
   */
  readonly allowedRetainedOrderIds?: readonly string[];
}

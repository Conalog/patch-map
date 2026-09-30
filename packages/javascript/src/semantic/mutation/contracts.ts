import type {
  PatchMapDatasetError,
  MaterializedPatchMapDataset,
} from '../dataset';
import type { PatchMapSemanticTarget } from '../probe';

export type PatchMapSemanticMutationDiagnosticReason =
  | 'ambiguous-target'
  | 'invalid-candidate'
  | 'invalid-target'
  | 'invalid-value'
  | 'missing-target'
  | 'unsupported-structure';

export interface PatchMapSemanticMutationDiagnostic {
  readonly reason: PatchMapSemanticMutationDiagnosticReason;
  readonly path: string;
  readonly message: string;
  readonly datasetCode?: PatchMapDatasetError['code'];
}

export type PatchMapSemanticMutationResult =
  | Readonly<{
      status: 'changed';
      changed: true;
      target: PatchMapSemanticTarget;
      candidate: MaterializedPatchMapDataset;
    }>
  | Readonly<{
      status: 'unchanged';
      changed: false;
      target: PatchMapSemanticTarget;
      candidate: MaterializedPatchMapDataset;
    }>
  | Readonly<{
      status: 'rejected';
      changed: false;
      target: PatchMapSemanticTarget | null;
      candidate: null;
      diagnostic: PatchMapSemanticMutationDiagnostic;
    }>;

export type PatchMapSemanticRemovalResult =
  | Readonly<{
      status: 'changed';
      changed: true;
      target: Extract<PatchMapSemanticTarget, { readonly kind: 'element' }>;
      candidate: MaterializedPatchMapDataset;
    }>
  | Readonly<{
      status: 'rejected';
      changed: false;
      target: PatchMapSemanticTarget | null;
      candidate: null;
      diagnostic: PatchMapSemanticMutationDiagnostic;
    }>;

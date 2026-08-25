import {
  PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
  type PatchMapHostAssetIngestionAuthority,
  type PatchMapHostAssetIngestionInput,
  type PatchMapHostAssetIngestionProbe,
} from '../assets/host-ingestion';
import {
  PATCH_MAP_AUTHORING_REVISION,
  planPatchMapAuthoringAction,
} from '../authoring';
import {
  PATCH_MAP_EDITOR_WORKFLOW_REVISION,
  type PatchMapEditorWorkflowAuthority,
  type PatchMapEditorWorkflowAction,
  type PatchMapEditorWorkflowProbe,
} from '../editor-workflow';
import type { PatchMapHistoryState } from '../history';
import type { MaterializedPatchMapDataset } from '../semantic/dataset';
import type {
  PatchMapMutationJsonValue,
  PatchMapMutationTransactionRequest,
} from '../semantic/transaction';
import type {
  PatchMapEngineAuthoringResult,
  PatchMapEngineEditorMutationMatrixInput,
  PatchMapEngineEditorMutationMatrixResult,
  PatchMapEngineEditorWorkflowResult,
  PatchMapEngineHostAssetIngestionResult,
} from './contracts/editor';
import type { PatchMapEngineTransactionResult } from './contracts/mutation';
import { runPatchMapEditorMutationMatrix } from './editor-mutation-matrix';

interface PatchMapEditorOperationsPort {
  readonly requireReady: (operation: string) => void;
  readonly materialized: () => MaterializedPatchMapDataset | null;
  readonly materializedOrEmpty: () => MaterializedPatchMapDataset;
  readonly selectionIds: () => readonly string[];
  readonly historyState: () => PatchMapHistoryState;
  readonly transact: (
    request: PatchMapMutationTransactionRequest,
  ) => PatchMapEngineTransactionResult;
  readonly select: (ids: readonly string[]) => readonly string[];
  readonly closeHistoryGroup: () => void;
  readonly setHistoryCompanion: (value: PatchMapMutationJsonValue) => void;
  readonly historyCompanion: () => PatchMapMutationJsonValue | null;
}

/** Owns host/editor action orchestration over the Engine transaction boundary. */
export class PatchMapEditorOperations {
  public constructor(
    private readonly hostAssetIngestion: PatchMapHostAssetIngestionAuthority,
    private readonly editorWorkflows: PatchMapEditorWorkflowAuthority,
    private readonly port: PatchMapEditorOperationsPort,
  ) {}

  public author(action: unknown): PatchMapEngineAuthoringResult {
    this.port.requireReady('author');
    const plan = planPatchMapAuthoringAction(
      this.port.materializedOrEmpty(),
      action,
      { selectionIds: this.port.selectionIds() },
    );
    if (plan.status === 'rejected') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_AUTHORING_REVISION,
        actionType: plan.actionType,
        status: 'rejected',
        changed: false,
        code: plan.diagnostic.code,
        plan,
        facts: plan.facts,
        transaction: null,
        diagnostic: plan.diagnostic,
        history: this.port.historyState(),
      });
    }
    if (plan.status === 'unchanged') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_AUTHORING_REVISION,
        actionType: plan.actionType,
        status: 'unchanged',
        changed: false,
        code: null,
        plan,
        facts: plan.facts,
        transaction: null,
        diagnostic: null,
        history: this.port.historyState(),
      });
    }

    const transaction = this.port.transact(plan.transaction);
    const diagnostic =
      transaction.status === 'rejected' || transaction.status === 'refused'
        ? transaction.diagnostic
        : null;
    return Object.freeze({
      schemaRevision: PATCH_MAP_AUTHORING_REVISION,
      actionType: plan.actionType,
      status: transaction.status,
      changed: transaction.changed,
      code: diagnostic?.code ?? null,
      plan,
      facts: plan.facts,
      transaction,
      diagnostic,
      history: transaction.history.state,
    });
  }

  public ingestHostAsset(
    input: PatchMapHostAssetIngestionInput,
  ): PatchMapEngineHostAssetIngestionResult {
    this.port.requireReady('ingestHostAsset');
    const plan = this.hostAssetIngestion.plan(this.port.materializedOrEmpty(), input);
    if (plan.status === 'ignored') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
        status: 'ignored',
        changed: false,
        code: null,
        createdTextId: null,
        createdImageIds: Object.freeze([]),
        plan,
        transaction: null,
        probe: this.hostAssetIngestion.probe(),
      });
    }
    if (plan.status === 'failed') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
        status: 'failed',
        changed: false,
        code: plan.code,
        createdTextId: null,
        createdImageIds: Object.freeze([]),
        plan,
        transaction: null,
        probe: this.hostAssetIngestion.probe(),
      });
    }
    const transaction = this.port.transact(plan.transaction);
    if (transaction.status === 'committed') this.hostAssetIngestion.commit(plan);
    const code =
      transaction.status === 'rejected' || transaction.status === 'refused'
        ? transaction.diagnostic.code
        : null;
    return Object.freeze({
      schemaRevision: PATCH_MAP_HOST_ASSET_INGESTION_REVISION,
      status: transaction.status,
      changed: transaction.changed,
      code,
      createdTextId: transaction.status === 'committed' ? plan.createdTextId : null,
      createdImageIds: transaction.status === 'committed'
        ? plan.createdImageIds
        : Object.freeze([]),
      plan,
      transaction,
      probe: this.hostAssetIngestion.probe(),
    });
  }

  public hostAssetIngestionProbe(): PatchMapHostAssetIngestionProbe {
    this.port.requireReady('hostAssetIngestionProbe');
    return this.hostAssetIngestion.probe();
  }

  public editorWorkflow(
    action: PatchMapEditorWorkflowAction,
  ): PatchMapEngineEditorWorkflowResult {
    this.port.requireReady('editorWorkflow');
    const plan = this.editorWorkflows.plan(this.port.materializedOrEmpty(), action);
    if (plan.status === 'rejected') {
      return Object.freeze({
        schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
        actionType: plan.actionType,
        status: 'rejected',
        changed: false,
        code: plan.diagnostic.code,
        plan,
        facts: plan.facts,
        transaction: null,
        diagnostic: plan.diagnostic,
        history: this.port.historyState(),
        selectionIds: Object.freeze([...this.port.selectionIds()]),
        probe: this.editorWorkflows.probe(),
      });
    }

    if (plan.transaction === null) {
      if (plan.selectionIds !== undefined) this.port.select(plan.selectionIds);
      this.editorWorkflows.commit(plan);
      if (plan.closeHistoryGroup) this.port.closeHistoryGroup();
      return Object.freeze({
        schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
        actionType: plan.actionType,
        status: plan.status === 'unchanged' ? 'unchanged' : 'committed',
        changed: plan.changed,
        code: null,
        plan,
        facts: plan.facts,
        transaction: null,
        diagnostic: null,
        history: this.port.historyState(),
        selectionIds: Object.freeze([...this.port.selectionIds()]),
        probe: this.editorWorkflows.probe(),
      });
    }

    const transaction = this.port.transact(plan.transaction);
    const accepted = transaction.status === 'committed' || transaction.status === 'unchanged';
    if (accepted) {
      if (plan.selectionIds !== undefined) this.port.select(plan.selectionIds);
      this.editorWorkflows.commit(plan);
      if (plan.closeHistoryGroup) this.port.closeHistoryGroup();
    } else {
      this.editorWorkflows.discard(plan);
    }
    const diagnostic =
      transaction.status === 'rejected' || transaction.status === 'refused'
        ? transaction.diagnostic
        : null;
    return Object.freeze({
      schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
      actionType: plan.actionType,
      status: transaction.status,
      changed: transaction.changed,
      code: diagnostic?.code ?? null,
      plan,
      facts: plan.facts,
      transaction,
      diagnostic,
      history: transaction.history.state,
      selectionIds: Object.freeze([...this.port.selectionIds()]),
      probe: this.editorWorkflows.probe(),
    });
  }

  public editorWorkflowProbe(): PatchMapEditorWorkflowProbe {
    this.port.requireReady('editorWorkflowProbe');
    return this.editorWorkflows.probe();
  }

  public runEditorMutationMatrix(
    input: PatchMapEngineEditorMutationMatrixInput,
  ): PatchMapEngineEditorMutationMatrixResult {
    this.port.requireReady('runEditorMutationMatrix');
    return runPatchMapEditorMutationMatrix(this.port, input);
  }
}

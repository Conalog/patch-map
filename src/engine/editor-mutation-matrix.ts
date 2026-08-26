import {
  PATCH_MAP_EDITOR_MUTATION_KINDS,
  PATCH_MAP_EDITOR_WORKFLOW_REVISION,
  planPatchMapEditorMatrixMutation,
  type PatchMapEditorMutationKind,
} from '../editor-workflow';
import type { PatchMapHistoryState } from '../history';
import type { MaterializedPatchMapDataset } from '../semantic/dataset';
import {
  detachPatchMapMutationJsonValue,
  type PatchMapMutationJsonValue,
  type PatchMapMutationTransactionRequest,
} from '../semantic/transaction';
import type {
  PatchMapEngineEditorMutationMatrixInput,
  PatchMapEngineEditorMutationMatrixResult,
} from './contracts/editor';
import type { PatchMapEngineTransactionResult } from './contracts/mutation';

interface PatchMapEditorMutationMatrixPort {
  readonly materialized: () => MaterializedPatchMapDataset | null;
  readonly transact: (request: PatchMapMutationTransactionRequest) =>
    PatchMapEngineTransactionResult;
  readonly historyState: () => PatchMapHistoryState;
  readonly closeHistoryGroup: () => void;
  readonly setHistoryCompanion: (value: PatchMapMutationJsonValue) => void;
  readonly historyCompanion: () => PatchMapMutationJsonValue | null;
}

/** Execute the fixed editor mutation taxonomy through the Engine transaction port. */
export function runPatchMapEditorMutationMatrix(
  port: PatchMapEditorMutationMatrixPort,
  input: PatchMapEngineEditorMutationMatrixInput,
): PatchMapEngineEditorMutationMatrixResult {
  const requested: readonly PatchMapEditorMutationKind[] = Object.freeze(
    input.mutationKinds.map((kind) => kind),
  );
  const valid =
    input.oneActionEach === true &&
    requested.length === PATCH_MAP_EDITOR_MUTATION_KINDS.length &&
    requested.every((kind, index) => kind === PATCH_MAP_EDITOR_MUTATION_KINDS[index]);
  if (!valid) {
    return rejected('INVALID_VALUE', requested.length, [], port.historyState());
  }
  const companion = detachPatchMapMutationJsonValue(
    input.companion,
    '$.editorMutationMatrix.companion',
  );
  port.setHistoryCompanion(companion);
  const transactions: PatchMapEngineTransactionResult[] = [];
  for (const kind of requested) {
    const materialized = port.materialized();
    if (materialized === null) {
      return rejected('INVALID_MUTATION', requested.length, transactions, port.historyState());
    }
    let request: PatchMapMutationTransactionRequest;
    try {
      request = planPatchMapEditorMatrixMutation(materialized, kind, companion);
    } catch {
      return rejected('INVALID_MUTATION', requested.length, transactions, port.historyState());
    }
    const result = port.transact(request);
    transactions.push(result);
    if (result.status !== 'committed') {
      const code = result.status === 'rejected' || result.status === 'refused'
        ? result.diagnostic.code
        : 'INVALID_MUTATION';
      return Object.freeze({
        schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
        status: result.status === 'refused' ? 'refused' : 'rejected',
        changed: transactions.some((entry) => entry.changed),
        code,
        requestedCount: requested.length,
        executedCount: transactions.filter((entry) => entry.status === 'committed').length,
        transactions: Object.freeze([...transactions]),
        history: port.historyState(),
        companionRestored: false,
      });
    }
  }
  port.closeHistoryGroup();
  return Object.freeze({
    schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
    status: 'committed',
    changed: true,
    code: null,
    requestedCount: requested.length,
    executedCount: transactions.length,
    transactions: Object.freeze([...transactions]),
    history: port.historyState(),
    companionRestored:
      JSON.stringify(port.historyCompanion()) === JSON.stringify(companion),
  });
}

function rejected(
  code: 'INVALID_VALUE' | 'INVALID_MUTATION',
  requestedCount: number,
  transactions: readonly PatchMapEngineTransactionResult[],
  history: PatchMapHistoryState,
): PatchMapEngineEditorMutationMatrixResult {
  return Object.freeze({
    schemaRevision: PATCH_MAP_EDITOR_WORKFLOW_REVISION,
    status: 'rejected',
    changed: transactions.length > 0,
    code,
    requestedCount,
    executedCount: transactions.length,
    transactions: Object.freeze([...transactions]),
    history,
    companionRestored: false,
  });
}

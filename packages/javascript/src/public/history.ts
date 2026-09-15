import type { PatchMapHistoryState } from '../history';
import type { PatchMapMutationJsonValue } from '../semantic/transaction';
import type { PatchMapApi } from './contracts';
import type {
  PatchMapHostHistoryClearResult,
  PatchMapHostHistoryResult,
} from './host-contracts';

export interface PatchMapHistoryHost {
  historyState(): PatchMapHistoryState;
  onHistoryChange(listener: (state: PatchMapHistoryState) => void): () => void;
  undo(): PatchMapHostHistoryResult;
  redo(): PatchMapHostHistoryResult;
  clearHistory(): PatchMapHostHistoryClearResult;
}

export function createPatchMapHistoryApi(host: PatchMapHistoryHost): PatchMapApi['history'] {
  const project = (result: PatchMapHostHistoryResult) => Object.freeze({
    status: result.status,
    changed: result.changed,
    direction: result.direction,
    previousRevisions: result.previousRevisions,
    revisions: result.revisions,
    sceneRevision: result.sceneRevision,
    semanticHash: result.semanticHash,
    history: result.history,
    companion: historyCompanion(result.hostCompanion),
  });
  return Object.freeze({
    get state(): PatchMapHistoryState {
      return host.historyState();
    },
    undo: () => project(host.undo()),
    redo: () => project(host.redo()),
    clear: () => host.clearHistory(),
    onChange(listener: (state: PatchMapHistoryState) => void): () => void {
      if (typeof listener !== 'function') {
        throw new TypeError('history change listener must be a function');
      }
      return host.onHistoryChange(listener);
    },
  });
}

function historyCompanion(value: PatchMapMutationJsonValue | null): PatchMapMutationJsonValue | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, PatchMapMutationJsonValue>>;
  return Object.hasOwn(record, 'companion') ? record.companion ?? null : null;
}

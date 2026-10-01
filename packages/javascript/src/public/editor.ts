import type {
  PatchMapEditorWorkflowAction,
  PatchMapEditorWorkflowProbe,
} from '../editor-workflow';
import type { PatchMapApi } from './contracts';
import type { PatchMapHostEditorWorkflowResult } from './host-contracts';

export interface PatchMapEditorHost {
  editorWorkflow(action: PatchMapEditorWorkflowAction): PatchMapHostEditorWorkflowResult;
  editorWorkflowProbe(): PatchMapEditorWorkflowProbe;
}

export function createPatchMapEditorApi(host: PatchMapEditorHost): PatchMapApi['editor'] {
  return Object.freeze({
    execute(action: PatchMapEditorWorkflowAction) {
      const result = host.editorWorkflow(action);
      return Object.freeze({
        status: result.status,
        changed: result.changed,
        code: result.code,
        facts: result.facts,
        selectionIds: result.selectionIds,
        state: editorState(result.probe),
      });
    },
    get state() {
      return editorState(host.editorWorkflowProbe());
    },
  });
}

function editorState(probe: PatchMapEditorWorkflowProbe): PatchMapApi['editor']['state'] {
  return Object.freeze({
    mode: probe.mode,
    activeTargetId: probe.activeTargetId,
    inactiveCellsVisible: probe.inactiveCellsVisible,
    pendingDeleteCount: probe.pendingDeleteCount,
  });
}

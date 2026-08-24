import type { MaterializedPatchMapDataset } from './semantic/dataset';
import {
  PATCH_MAP_AUTHORING_REVISION,
  type PatchMapAuthoringAction,
  type PatchMapAuthoringActionType,
  type PatchMapAuthoringAlignmentAxis,
  type PatchMapAuthoringDistributionAxis,
  type PatchMapAuthoringDiagnosticCode,
  type PatchMapAuthoringDiagnostic,
  type PatchMapAuthoringPlanningContext,
  type PatchMapAuthoringFacts,
  type PatchMapAuthoringPlan,
} from './authoring/contracts';
import { planCreate, planStyle } from './authoring/element-planning';
import {
  planAlignment,
  planDistribution,
  planPositionEdit,
} from './authoring/geometry-planning';
import {
  planDuplicate,
  planGroup,
  planHierarchyMove,
  planReorder,
  planUngroup,
} from './authoring/hierarchy-planning';
import {
  AuthoringValidationFailure,
  normalizeAction,
  normalizeContext,
} from './authoring/normalization';
import { rejectedPlan } from './authoring/plan-results';
import { indexAuthoringElements } from './authoring/scene-context';

/**
 * Build one expected-blind editor action against immutable semantic authority.
 * A plan never publishes state; Engine owns transaction/history/surface commit.
 */
export function planPatchMapAuthoringAction(
  current: MaterializedPatchMapDataset,
  actionInput: unknown,
  contextInput: PatchMapAuthoringPlanningContext,
): PatchMapAuthoringPlan {
  let action: PatchMapAuthoringAction;
  let context: PatchMapAuthoringPlanningContext;
  try {
    action = normalizeAction(actionInput);
    context = normalizeContext(contextInput);
  } catch (error) {
    if (!(error instanceof AuthoringValidationFailure)) throw error;
    return rejectedPlan(null, error.diagnostic);
  }

  const index = indexAuthoringElements(current.dataset);
  try {
    switch (action.type) {
      case 'create-element':
        return planCreate(action, index, current.dataset);
      case 'edit-position-angle':
        return planPositionEdit(action, index);
      case 'align-targets':
        return planAlignment(action, index);
      case 'distribute-targets':
        return planDistribution(action, index);
      case 'apply-style':
        return planStyle(action, index);
      case 'move-hierarchy':
        return planHierarchyMove(action, index, context);
      case 'reorder-z':
        return planReorder(action, index);
      case 'group-targets':
        return planGroup(action);
      case 'duplicate-tree':
      case 'copy-paste-tree':
        return planDuplicate(action, index);
      case 'ungroup-target':
        return planUngroup(action, index, context);
    }
  } catch (error) {
    if (!(error instanceof AuthoringValidationFailure)) throw error;
    return rejectedPlan(action, error.diagnostic);
  }
}

export { PATCH_MAP_AUTHORING_REVISION };
export type {
  PatchMapAuthoringAction,
  PatchMapAuthoringActionType,
  PatchMapAuthoringAlignmentAxis,
  PatchMapAuthoringDistributionAxis,
  PatchMapAuthoringDiagnosticCode,
  PatchMapAuthoringDiagnostic,
  PatchMapAuthoringPlanningContext,
  PatchMapAuthoringFacts,
  PatchMapAuthoringPlan,
};

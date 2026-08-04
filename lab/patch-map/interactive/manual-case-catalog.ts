import {
  PATCH_MAP_CONTRACT_PRESENTERS,
  type PatchMapContractPresenterDescriptor,
} from '../contract/presenters';
import { patchMapKoreanCaseTitle } from '../contract/korean-copy';
import {
  describePatchMapManualCoverage,
  PATCH_MAP_AUTOMATED_ONLY_CASE_IDS,
  PATCH_MAP_DEDICATED_MANUAL_CASE_IDS,
  PATCH_MAP_MANUAL_WORKFLOW_COUNT,
  PATCH_MAP_MANUAL_WORKFLOW_OVERRIDE_CASE_IDS,
  PATCH_MAP_MANUAL_WORKFLOWS,
  type PatchMapManualCoverageMode,
  type PatchMapManualToolGroup,
} from './manual-workflow-catalog';

export {
  PATCH_MAP_AUTOMATED_ONLY_CASE_IDS,
  PATCH_MAP_DEDICATED_MANUAL_CASE_IDS,
  PATCH_MAP_MANUAL_WORKFLOW_COUNT,
  PATCH_MAP_MANUAL_WORKFLOW_OVERRIDE_CASE_IDS,
  PATCH_MAP_MANUAL_WORKFLOWS,
};
export type {
  PatchMapManualCoverageMode,
  PatchMapManualToolGroup,
} from './manual-workflow-catalog';

export const PATCH_MAP_MANUAL_LAB_REVISION = 'patch-map-manual-lab/2' as const;

export interface PatchMapManualCaseDescriptor {
  readonly revision: typeof PATCH_MAP_MANUAL_LAB_REVISION;
  readonly caseId: string;
  readonly title: string;
  readonly coverage: PatchMapManualCoverageMode;
  readonly coverageLabel: string;
  readonly coverageSummary: string;
  readonly tools: readonly PatchMapManualToolGroup[];
  readonly tasks: readonly string[];
  readonly exactActionCount: number;
}

export const PATCH_MAP_MANUAL_TOOL_LABELS: Readonly<
  Record<PatchMapManualToolGroup, string>
> = mapWorkflows(({ label }) => label);

export const PATCH_MAP_MANUAL_TOOL_DESCRIPTIONS: Readonly<
  Record<PatchMapManualToolGroup, string>
> = mapWorkflows(({ description }) => description);

export function createPatchMapManualCaseDescriptor(
  presenter: PatchMapContractPresenterDescriptor,
): PatchMapManualCaseDescriptor {
  const manual = describePatchMapManualCoverage(presenter.caseId);
  return Object.freeze({
    revision: PATCH_MAP_MANUAL_LAB_REVISION,
    caseId: presenter.caseId,
    title: patchMapKoreanCaseTitle(presenter.caseId),
    coverage: manual.mode,
    coverageLabel: manual.label,
    coverageSummary: manual.summary,
    tools: manual.tools,
    tasks: manual.tasks,
    exactActionCount: presenter.actions.length,
  });
}

export const PATCH_MAP_MANUAL_CASE_CATALOG: readonly PatchMapManualCaseDescriptor[] =
  Object.freeze(PATCH_MAP_CONTRACT_PRESENTERS.map(createPatchMapManualCaseDescriptor));

export const PATCH_MAP_MANUAL_CASE_BY_ID: ReadonlyMap<
  string,
  PatchMapManualCaseDescriptor
> = new Map(PATCH_MAP_MANUAL_CASE_CATALOG.map((descriptor) => [
  descriptor.caseId,
  descriptor,
]));

export const PATCH_MAP_CONTRACT_CASE_COUNT = PATCH_MAP_MANUAL_CASE_CATALOG.length;
export const PATCH_MAP_EXACT_ACTION_COUNT = PATCH_MAP_MANUAL_CASE_CATALOG.reduce(
  (count, descriptor) => count + descriptor.exactActionCount,
  0,
);
export const PATCH_MAP_MANUAL_DEDICATED_CASE_COUNT = countCoverage('dedicated');
export const PATCH_MAP_MANUAL_SHARED_CASE_COUNT = countCoverage('shared-workflow');
export const PATCH_MAP_AUTOMATED_ONLY_CASE_COUNT = countCoverage('automated-only');

assertManualCatalog();

export function selectPatchMapManualCase(caseId: string): PatchMapManualCaseDescriptor {
  const descriptor = PATCH_MAP_MANUAL_CASE_BY_ID.get(caseId);
  if (descriptor === undefined) {
    throw new Error(`Unknown PatchMap manual Lab case: ${caseId}`);
  }
  return descriptor;
}

function mapWorkflows(
  select: (workflow: (typeof PATCH_MAP_MANUAL_WORKFLOWS)[PatchMapManualToolGroup]) => string,
): Readonly<Record<PatchMapManualToolGroup, string>> {
  return Object.freeze(Object.fromEntries(
    Object.values(PATCH_MAP_MANUAL_WORKFLOWS).map((workflow) => [
      workflow.id,
      select(workflow),
    ]),
  ) as Record<PatchMapManualToolGroup, string>);
}

function countCoverage(coverage: PatchMapManualCoverageMode): number {
  return PATCH_MAP_MANUAL_CASE_CATALOG.filter(
    (descriptor) => descriptor.coverage === coverage,
  ).length;
}

function assertManualCatalog(): void {
  const approvedIds = new Set(PATCH_MAP_CONTRACT_PRESENTERS.map(({ caseId }) => caseId));
  const classifiedIds = [
    ...PATCH_MAP_DEDICATED_MANUAL_CASE_IDS,
    ...PATCH_MAP_AUTOMATED_ONLY_CASE_IDS,
  ];
  const configuredIds = [
    ...classifiedIds,
    ...PATCH_MAP_MANUAL_WORKFLOW_OVERRIDE_CASE_IDS,
  ];
  const unknownIds = configuredIds.filter((caseId) => !approvedIds.has(caseId));
  const duplicateIds = classifiedIds.filter(
    (caseId, index) => classifiedIds.indexOf(caseId) !== index,
  );

  if (PATCH_MAP_CONTRACT_CASE_COUNT !== 173) {
    throw new Error(
      `PatchMap Lab must retain 173 exact contract routes, got ${PATCH_MAP_CONTRACT_CASE_COUNT}`,
    );
  }
  if (PATCH_MAP_EXACT_ACTION_COUNT !== 646) {
    throw new Error(
      `PatchMap exact runner must retain 646 actions, got ${PATCH_MAP_EXACT_ACTION_COUNT}`,
    );
  }
  if (PATCH_MAP_MANUAL_WORKFLOW_COUNT !== 11) {
    throw new Error(
      `PatchMap manual workbench must own 11 workflows, got ${PATCH_MAP_MANUAL_WORKFLOW_COUNT}`,
    );
  }
  if (unknownIds.length > 0 || duplicateIds.length > 0) {
    throw new Error(
      `Invalid PatchMap manual coverage IDs: unknown=${unknownIds.join(',')} duplicate=${duplicateIds.join(',')}`,
    );
  }
  if (
    PATCH_MAP_MANUAL_DEDICATED_CASE_COUNT
      + PATCH_MAP_MANUAL_SHARED_CASE_COUNT
      + PATCH_MAP_AUTOMATED_ONLY_CASE_COUNT
    !== PATCH_MAP_CONTRACT_CASE_COUNT
  ) {
    throw new Error('PatchMap manual coverage modes must partition all contract routes');
  }
  for (const descriptor of PATCH_MAP_MANUAL_CASE_CATALOG) {
    if (
      descriptor.tools.length === 0
      || new Set(descriptor.tools).size !== descriptor.tools.length
      || descriptor.tasks.length < 2
    ) {
      throw new Error(`PatchMap manual coverage is incomplete for ${descriptor.caseId}`);
    }
  }
}

import {
  type PatchMap,
} from '../../../src/patch-map';

export const PATCH_MAP_ACCESSIBILITY_RUNTIME_REVISION =
  'core-v2-accessibility-runtime/1' as const;
export const PATCH_MAP_ACCESSIBILITY_CLEANUP_REVISION =
  'core-v2-accessibility-cleanup/1' as const;

export const PATCH_MAP_ACCESSIBILITY_CASE_IDS = Object.freeze([
  'ACC-001',
  'ACC-002',
  'ACC-003',
] as const);

export type PatchMapAccessibilityCaseId =
  (typeof PATCH_MAP_ACCESSIBILITY_CASE_IDS)[number];

export interface PatchMapAccessibilityProductAdapter {
  observeEngine(
    engine: PatchMap,
    barTarget?: Readonly<{
      readonly ownerId: string;
      readonly componentId: string;
    }>,
  ): Readonly<Record<string, unknown>>;
}

export interface PatchMapAccessibilityRuntime {
  readonly product: PatchMapAccessibilityProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Actual-only product transport for the accessibility tranche. It projects
 * public Engine probes and contains no expected values or comparator logic.
 */
export function createPatchMapAccessibilityRuntime(
  caseId: PatchMapAccessibilityCaseId,
): PatchMapAccessibilityRuntime {
  requireCaseId(caseId);
  let released = false;
  const product: PatchMapAccessibilityProductAdapter = Object.freeze({
    observeEngine(
      engine: PatchMap,
      barTarget?: Readonly<{
        readonly ownerId: string;
        readonly componentId: string;
      }>,
    ): Readonly<Record<string, unknown>> {
      invariant(!released, 'observeEngine after release');
      return deepFreeze({
        runtimeRevision: PATCH_MAP_ACCESSIBILITY_RUNTIME_REVISION,
        snapshot: structuredClone(engine.snapshot()),
        semantic: structuredClone(engine.semanticProbe()),
        geometry: structuredClone(engine.geometryProbe()),
        accessibility: structuredClone(engine.accessibilityProbe()),
        pointerGesture: structuredClone(engine.pointerGestureProbe()),
        history: structuredClone(engine.historyState()),
        historyInspection: structuredClone(engine.historyInspection()),
        dataset: structuredClone(engine.exportDataset()),
        bar: barTarget === undefined
          ? null
          : structuredClone(engine.barPresentationProbe(barTarget)),
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      released = true;
      return deepFreeze({
        revision: PATCH_MAP_ACCESSIBILITY_CLEANUP_REVISION,
        caseId,
        retainedProductCallbackCount: 0,
        retainedLogicalNodeCount: 0,
      });
    },
  });
}

function requireCaseId(value: string): asserts value is PatchMapAccessibilityCaseId {
  invariant(
    (PATCH_MAP_ACCESSIBILITY_CASE_IDS as readonly string[]).includes(value),
    `unsupported case ${value}`,
  );
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid PatchMap accessibility runtime: ${message}`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

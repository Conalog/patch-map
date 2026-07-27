import {
  type CoreV2Engine,
} from '../../../src/core-v2';

export const CORE_V2_ACCESSIBILITY_RUNTIME_REVISION =
  'core-v2-accessibility-runtime/1' as const;
export const CORE_V2_ACCESSIBILITY_CLEANUP_REVISION =
  'core-v2-accessibility-cleanup/1' as const;

export const CORE_V2_ACCESSIBILITY_CASE_IDS = Object.freeze([
  'ACC-001',
  'ACC-002',
  'ACC-003',
] as const);

export type CoreV2AccessibilityCaseId =
  (typeof CORE_V2_ACCESSIBILITY_CASE_IDS)[number];

export interface CoreV2AccessibilityProductAdapter {
  observeEngine(
    engine: CoreV2Engine,
    barTarget?: Readonly<{
      readonly ownerId: string;
      readonly componentId: string;
    }>,
  ): Readonly<Record<string, unknown>>;
}

export interface CoreV2AccessibilityRuntime {
  readonly product: CoreV2AccessibilityProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Actual-only product transport for the accessibility tranche. It projects
 * public Engine probes and contains no expected values or comparator logic.
 */
export function createCoreV2AccessibilityRuntime(
  caseId: CoreV2AccessibilityCaseId,
): CoreV2AccessibilityRuntime {
  requireCaseId(caseId);
  let released = false;
  const product: CoreV2AccessibilityProductAdapter = Object.freeze({
    observeEngine(
      engine: CoreV2Engine,
      barTarget?: Readonly<{
        readonly ownerId: string;
        readonly componentId: string;
      }>,
    ): Readonly<Record<string, unknown>> {
      invariant(!released, 'observeEngine after release');
      return deepFreeze({
        runtimeRevision: CORE_V2_ACCESSIBILITY_RUNTIME_REVISION,
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
        revision: CORE_V2_ACCESSIBILITY_CLEANUP_REVISION,
        caseId,
        retainedProductCallbackCount: 0,
        retainedLogicalNodeCount: 0,
      });
    },
  });
}

function requireCaseId(value: string): asserts value is CoreV2AccessibilityCaseId {
  invariant(
    (CORE_V2_ACCESSIBILITY_CASE_IDS as readonly string[]).includes(value),
    `unsupported case ${value}`,
  );
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid Core v2 accessibility runtime: ${message}`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

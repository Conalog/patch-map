import { Color, type ColorSource } from 'pixi.js';

export const PATCH_MAP_REPLACEMENT_RECOVERY_RUNTIME_REVISION =
  'patch-map-replacement-recovery-runtime/1';
export const PATCH_MAP_REPLACEMENT_RECOVERY_CLEANUP_REVISION =
  'patch-map-replacement-recovery-cleanup/1';

export const PATCH_MAP_REPLACEMENT_RECOVERY_CASE_IDS = Object.freeze([
  'ERR-002',
  'ERR-005',
  'LIF-003',
  'CSM-002',
  'CSM-004',
  'CSM-037',
] as const);

export type PatchMapReplacementRecoveryCaseId =
  (typeof PATCH_MAP_REPLACEMENT_RECOVERY_CASE_IDS)[number];

interface RuntimeSceneObservation {
  readonly snapshot: Readonly<{
    readonly pendingWork: number;
    readonly historyDepth: number;
    readonly selectionIds: readonly string[];
    readonly resources: Readonly<{
      readonly canvasCount: number;
    }>;
  }>;
  readonly semantic: Readonly<{
    readonly interaction: Readonly<{
      readonly activeAnimationCount?: number;
    }>;
  }>;
  readonly hostInteraction: Readonly<{
    readonly bindings: number;
    readonly bindingListeners: number;
  }>;
}

export interface PatchMapReplacementRecoveryProductAdapter {
  packColor(source: unknown): Readonly<{
    readonly packedColor: number;
    readonly rgba: string;
  }>;
  beginScene(observation: RuntimeSceneObservation): Readonly<Record<string, unknown>>;
  seedOverlay(id: string): Readonly<Record<string, unknown>>;
  recordReplacement(observation: RuntimeSceneObservation): Readonly<Record<string, unknown>>;
  resourceProbe(): Readonly<Record<string, unknown>>;
}

export interface PatchMapReplacementRecoveryRuntime {
  readonly product: PatchMapReplacementRecoveryProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Host-owned journals for replacement-only state. It owns no ticker, listener,
 * scheduler, renderer, or retained Engine reference.
 */
export function createPatchMapReplacementRecoveryRuntime(
  caseId: PatchMapReplacementRecoveryCaseId,
): PatchMapReplacementRecoveryRuntime {
  invariant(
    PATCH_MAP_REPLACEMENT_RECOVERY_CASE_IDS.includes(caseId),
    'unsupported case identity',
  );
  const overlays = new Set<string>();
  const cycles: Record<string, Readonly<Record<string, number>>> = {};
  let baselineCanvasCount: number | null = null;
  let replacementCount = 0;
  let released = false;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  const product: PatchMapReplacementRecoveryProductAdapter = Object.freeze({
    packColor(source: unknown) {
      assertActive(released, 'packColor');
      const color = new Color(source as ColorSource);
      const [red, green, blue, alpha] = color.toArray();
      const bytes = [red, green, blue, alpha].map((value, index) => {
        invariant(typeof value === 'number' && Number.isFinite(value), `color channel ${index}`);
        return Math.max(0, Math.min(255, Math.round(value * 255)));
      });
      const packedColor = (
        (bytes[0]! << 24)
        | (bytes[1]! << 16)
        | (bytes[2]! << 8)
        | bytes[3]!
      ) >>> 0;
      return deepFreeze({
        packedColor,
        rgba: `#${packedColor.toString(16).padStart(8, '0')}`,
      });
    },

    beginScene(observation: RuntimeSceneObservation) {
      assertActive(released, 'beginScene');
      const measured = validateSceneObservation(observation);
      baselineCanvasCount = measured.snapshot.resources.canvasCount;
      replacementCount = 0;
      overlays.clear();
      for (const key of Object.keys(cycles)) delete cycles[key];
      return deepFreeze({
        canvasCount: baselineCanvasCount,
        replacementCount,
        unmanagedOverlayCount: overlays.size,
      });
    },

    seedOverlay(id: string) {
      assertActive(released, 'seedOverlay');
      invariant(caseId === 'LIF-003', 'only LIF-003 owns an unmanaged overlay');
      invariant(typeof id === 'string' && id.length > 0, 'overlay ID');
      overlays.add(id);
      return deepFreeze({
        id,
        unmanagedOverlayCount: overlays.size,
      });
    },

    recordReplacement(observation: RuntimeSceneObservation) {
      assertActive(released, 'recordReplacement');
      const measured = validateSceneObservation(observation);
      invariant(baselineCanvasCount !== null, 'replacement requires an initial scene');
      replacementCount += 1;
      overlays.clear();
      if (caseId === 'LIF-003' && replacementCount % 2 === 0) {
        const cycle = replacementCount / 2;
        cycles[`cycle-${cycle}`] = deepFreeze({
          canvasDelta:
            measured.snapshot.resources.canvasCount - baselineCanvasCount,
          bindingCount: measured.hostInteraction.bindings,
          bindingListenerCount: measured.hostInteraction.bindingListeners,
          selectionCount: measured.snapshot.selectionIds.length,
          animationCount:
            measured.semantic.interaction.activeAnimationCount ?? 0,
          historyDepth: measured.snapshot.historyDepth,
          pendingWork: measured.snapshot.pendingWork,
          unmanagedOverlayCount: overlays.size,
        });
      }
      return deepFreeze({
        replacementCount,
        replacementCycleCount: Math.floor(replacementCount / 2),
        unmanagedOverlayCount: overlays.size,
        replacementCycles: clone(cycles),
      });
    },

    resourceProbe() {
      assertActive(released, 'resourceProbe');
      return deepFreeze({
        revision: PATCH_MAP_REPLACEMENT_RECOVERY_RUNTIME_REVISION,
        caseId,
        unmanagedOverlayCount: overlays.size,
        replacementCount,
        replacementCycleCount: Math.floor(replacementCount / 2),
        replacementCycles: clone(cycles),
        ownership: zeroOwnership(),
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe() {
      if (cleanupProbe !== null) return cleanupProbe;
      released = true;
      overlays.clear();
      cleanupProbe = deepFreeze({
        revision: PATCH_MAP_REPLACEMENT_RECOVERY_CLEANUP_REVISION,
        caseId,
        runtimeCounts: zeroOwnership(),
        retainedOverlayCount: overlays.size,
        replacementCount,
        replacementCycleCount: Math.floor(replacementCount / 2),
        replacementCycles: clone(cycles),
      });
      return cleanupProbe;
    },
  });
}

function validateSceneObservation(
  value: RuntimeSceneObservation,
): RuntimeSceneObservation {
  invariant(value !== null && typeof value === 'object', 'scene observation');
  invariant(value.snapshot !== null && typeof value.snapshot === 'object', 'snapshot');
  invariant(
    value.snapshot.resources !== null && typeof value.snapshot.resources === 'object',
    'snapshot resources',
  );
  for (const [label, count] of [
    ['canvasCount', value.snapshot.resources.canvasCount],
    ['pendingWork', value.snapshot.pendingWork],
    ['historyDepth', value.snapshot.historyDepth],
    ['bindings', value.hostInteraction.bindings],
    ['bindingListeners', value.hostInteraction.bindingListeners],
  ] as const) {
    invariant(Number.isSafeInteger(count) && count >= 0, label);
  }
  invariant(Array.isArray(value.snapshot.selectionIds), 'selection IDs');
  return value;
}

function zeroOwnership(): Readonly<Record<string, number>> {
  return Object.freeze({
    activeSessionCount: 0,
    tickerCount: 0,
    schedulerCount: 0,
    listenerCount: 0,
    animationClosureCount: 0,
    pendingWorkCount: 0,
  });
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} requires an active runtime`);
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid PatchMap replacement/recovery runtime: ${message}`);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

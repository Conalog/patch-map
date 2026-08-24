import { createPatchMapRenderTextSpecimens } from './render-text-fixtures';

export const PATCH_MAP_RENDER_TEXT_RUNTIME_REVISION = 'core-v2-text-runtime-probe/1';
export const PATCH_MAP_RENDER_TEXT_CLEANUP_REVISION = 'core-v2-text-runtime-cleanup/1';

type RenderTextCaseId = 'REN-006' | 'REN-011';

interface RenderTextResourceProbeInput {
  readonly caseId: RenderTextCaseId;
}

export interface PatchMapRenderTextProductAdapter {
  createSupplementalSpecimens(): ReturnType<typeof createPatchMapRenderTextSpecimens>;
  resourceProbe(input: RenderTextResourceProbeInput): Readonly<Record<string, unknown>>;
}

export interface PatchMapRenderTextRuntime {
  readonly product: PatchMapRenderTextProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Creates the expected-blind transport seam used by REN-006 and REN-011.
 *
 * Text content and renderer facts stay inside public PatchMap probes. This
 * adapter owns no font face, bitmap atlas, asset lease, network request, Pixi
 * object, or supplemental WebGL engine. Its only authored input is the small
 * supplemental specimen factory, which deliberately contains no expected
 * observation rows.
 */
export function createPatchMapRenderTextRuntime(
  caseId: RenderTextCaseId,
): PatchMapRenderTextRuntime {
  const journal = new RuntimeJournal();
  let factoryCallCount = 0;
  let specimenCount = 0;
  let resourceProbeCount = 0;
  let released = false;
  let cleanupProbe: Readonly<Record<string, unknown>> | null = null;

  const product: PatchMapRenderTextProductAdapter = Object.freeze({
    createSupplementalSpecimens() {
      invariant(!released, 'supplemental specimens require an active runtime');
      factoryCallCount += 1;
      const specimens = createPatchMapRenderTextSpecimens();
      specimenCount = specimens.length;
      journal.append('supplemental-specimens-created', {
        caseId,
        factoryCallCount,
        specimenCount,
      });
      return specimens;
    },

    resourceProbe(input: RenderTextResourceProbeInput): Readonly<Record<string, unknown>> {
      invariant(!released, 'resource probe requires an active runtime');
      invariant(input.caseId === caseId, 'resource probe case identity');
      resourceProbeCount += 1;
      journal.append('text-runtime-observed', {
        caseId,
        resourceProbeCount,
      });
      return deepFreeze({
        revision: PATCH_MAP_RENDER_TEXT_RUNTIME_REVISION,
        caseId,
        fontRuntime: zeroFontRuntime(),
        transport: zeroTransport(),
        supplemental: {
          factoryCallCount,
          specimenCount,
        },
        journal: journal.snapshot(),
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanupProbe !== null) return cleanupProbe;
      released = true;
      journal.append('text-runtime-released', {
        caseId,
        factoryCallCount,
        resourceProbeCount,
      });
      cleanupProbe = deepFreeze({
        revision: PATCH_MAP_RENDER_TEXT_CLEANUP_REVISION,
        caseId,
        runtimeCounts: {
          activeSessionCount: 0,
          fontFaceCount: 0,
          atlasLeaseCount: 0,
          assetLeaseCount: 0,
          pendingLoadCount: 0,
          pendingWorkCount: 0,
        },
        transport: zeroTransport(),
        supplemental: {
          factoryCallCount,
          specimenCount,
        },
        journal: journal.snapshot(),
      });
      return cleanupProbe;
    },
  });
}

class RuntimeJournal {
  private readonly entries: Readonly<Record<string, unknown>>[] = [];
  private sequence = 0;

  public append(event: string, details: Readonly<Record<string, unknown>>): void {
    this.entries.push(deepFreeze({ sequence: ++this.sequence, event, ...details }));
  }

  public snapshot(): readonly Readonly<Record<string, unknown>>[] {
    return Object.freeze(this.entries.map((entry) => deepFreeze({ ...entry })));
  }
}

function zeroFontRuntime(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    mode: 'semantic-profile-only',
    fontFaceCount: 0,
    atlasLeaseCount: 0,
    assetLeaseCount: 0,
    pendingLoadCount: 0,
  });
}

function zeroTransport(): Readonly<Record<string, number>> {
  return Object.freeze({
    networkRequestCount: 0,
    externalFontRequestCount: 0,
  });
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid PatchMap render-text runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

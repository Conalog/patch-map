/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

interface PackedPatchMapStatic {
  mount(options: Readonly<Record<string, unknown>>): Promise<any>;
}

interface PackedPublicJourneyInput {
  readonly caseId: string;
  readonly PatchMap: PackedPatchMapStatic;
  readonly host: HTMLElement;
  readonly packageDigest: string;
}

interface PackedPublicJourneyDefinition {
  readonly id: string;
  readonly intent: string;
}

/**
 * Canonical CSM intentions at the installed-package boundary. Until a reviewed
 * public observation projection exists, every row fails closed instead of
 * substituting a weaker scenario or an Engine-shaped transcript.
 */
export const PATCH_MAP_PACKED_PUBLIC_JOURNEYS = Object.freeze([
  define('CSM-001', 'publish one complete immutable scene with the full dataset hierarchy'),
  define('CSM-002', 'replace the scene without stale hit, selection, tooltip, relation, or update targets'),
  define('CSM-003', 'distinguish loading, no blueprint, and a safe empty dataset'),
  define('CSM-004', 'recover from base or overlay failure while rejecting stale async completion'),
  define('CSM-005', 'update persisted panel, inverter, ESS, and relation IDs after redraw'),
  define('CSM-006', 'project live and historical state without rebuilding the full scene'),
  define('CSM-007', 'publish only the newest rapid revision and prevent late publication after destroy'),
  define('CSM-008', 'highlight targets or hide relations without mutating persisted data'),
  define('CSM-009', 'auto-fit or restore a valid viewport and safely reject invalid saved state'),
  define('CSM-010', 'pan, zoom, fit, settle, save, and remount without duplicate persistence'),
  define('CSM-011', 'apply click, toggle, related, box, filtered, and blank-space selection'),
  define('CSM-012', 'synchronize external selection with current canvas targets across redraw'),
  define('CSM-013', 'publish, pin, position, and clean host tooltip state'),
  define('CSM-014', 'switch live presentation columns and preserve the result across remount'),
  define('CSM-015', 'isolate map input from editable host UI and preserve unrelated shortcuts'),
  define('CSM-016', 'freeze command targets while presenting host-computed command status'),
  define('CSM-017', 'remove old listeners, animation, gestures, canvas, and hotkey state on navigation'),
  define('CSM-018', 'initialize a complete editor session and render no canvas for blocked plants'),
  define('CSM-019', 'create supported elements with unique IDs, selection, mode, and one history action'),
  define('CSM-020', 'select editable targets and open context menus through canvas interactions'),
  define('CSM-021', 'synchronize layer and wiring sidebar selection rules with the canvas'),
  define('CSM-022', 'move or nudge eligible targets atomically with edge pan and one history step'),
  define('CSM-023', 'preview, resize, rotate, recover interruption, and commit one undoable transform'),
  define('CSM-024', 'navigate the editor while preserving transformed hit testing and temporary policy cleanup'),
  define('CSM-025', 'edit grid structure and cells with validation, exit, and undo'),
  define('CSM-026', 'edit relation endpoints with conflict handling, redraw stability, and undo'),
  define('CSM-027', 'edit multiline text with target recovery, no-change, delete-empty, and cancel semantics'),
  define('CSM-028', 'edit position and angle, align targets, and distribute mixed sizes deterministically'),
  define('CSM-029', 'edit geometry and visual styles while rejecting invalid values atomically'),
  define('CSM-030', 'move hierarchy and z-order without cycles while preserving order and selection'),
  define('CSM-031', 'group, ungroup, duplicate, and paste trees with rewritten internal references'),
  define('CSM-032', 'paste text and images while isolating decode failures and unrelated drops'),
  define('CSM-033', 'confirm and delete linked data atomically and restore it through undo'),
  define('CSM-034', 'undo and redo editor actions with selection, mode, targets, and host companion state'),
  define('CSM-035', 'export deterministic schema-valid state without transient renderer data'),
  define('CSM-036', 'destroy every editor canvas, resource, listener, observer, gesture, and hotkey scope'),
  define('CSM-037', 'replace report data, hide relations, apply colors, and fit the result'),
  define('CSM-038', 'repeat PixiJS extraction and restore the same canvas without stale frames or leaks'),
] satisfies readonly PackedPublicJourneyDefinition[]);

export const PATCH_MAP_PACKED_PUBLIC_JOURNEY_IDS = Object.freeze(
  PATCH_MAP_PACKED_PUBLIC_JOURNEYS.map(({ id }) => id),
);

export async function runPackedPublicJourney(
  input: PackedPublicJourneyInput,
): Promise<Readonly<Record<string, unknown>>> {
  const definition = PATCH_MAP_PACKED_PUBLIC_JOURNEYS.find(({ id }) => id === input.caseId);
  if (definition === undefined) throw new Error(`unknown packed public journey ${input.caseId}`);
  const target = document.createElement('div');
  target.style.width = '800px';
  target.style.height = '600px';
  target.dataset.packedPublicJourney = definition.id;
  input.host.appendChild(target);
  let map: any = null;
  let executionFailure: Readonly<Record<string, unknown>> | null = null;

  try {
    map = await input.PatchMap.mount({
      instanceId: `packed-public-${definition.id.toLowerCase()}`,
      container: target,
      width: 800,
      height: 600,
      backend: 'webgl',
      resizeMode: 'manual',
      fit: false,
    });
    if (target.querySelectorAll('canvas').length !== 1) {
      throw new Error('installed package did not mount exactly one canvas');
    }
  } catch (error) {
    executionFailure = serializeError(error);
  } finally {
    if (map !== null) await map.destroy().catch((error: unknown) => {
      executionFailure ??= serializeError(error);
    });
  }

  const canvasCountAfterDestroy = target.querySelectorAll('canvas').length;
  target.remove();
  return Object.freeze({
    id: definition.id,
    intent: definition.intent,
    status: 'fail',
    failure: executionFailure ?? Object.freeze({
      code: 'PUBLIC_OBSERVATION_MAPPING_REQUIRED',
      message: 'canonical expected assertions are not yet mapped to reviewed public observations',
    }),
    observation: Object.freeze({
      schema: 'patch-map-packed-public-journey/1',
      packageDigest: input.packageDigest,
    }),
    destroyed: true,
    canvasCountAfterDestroy,
    cleanup: Object.freeze({
      status: canvasCountAfterDestroy === 0 ? 'completed' : 'failed',
    }),
  });
}

function define(id: string, intent: string): PackedPublicJourneyDefinition {
  return Object.freeze({ id, intent });
}

function serializeError(error: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze({
    code: 'EXECUTION_FAILED',
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  });
}

import {
  CORE_V2_CONTRACT_PRESENTERS,
  type CoreV2ContractActionPresenter,
  type CoreV2ContractPresenterDescriptor,
} from '../contract/presenters';

export const CORE_V2_MANUAL_LAB_REVISION = 'core-v2-manual-lab/1' as const;

export type CoreV2ManualToolGroup =
  | 'selection'
  | 'transform'
  | 'history'
  | 'view'
  | 'animation'
  | 'data'
  | 'authoring'
  | 'assets'
  | 'lifecycle'
  | 'accessibility'
  | 'diagnostics';

export interface CoreV2ManualActionDescriptor {
  readonly index: number;
  readonly type: string;
  readonly label: string;
  readonly group: CoreV2ManualToolGroup;
  readonly instruction: string;
}

export interface CoreV2ManualCaseDescriptor {
  readonly revision: typeof CORE_V2_MANUAL_LAB_REVISION;
  readonly caseId: string;
  readonly title: string;
  readonly tools: readonly CoreV2ManualToolGroup[];
  readonly tasks: readonly string[];
  readonly actions: readonly CoreV2ManualActionDescriptor[];
}

export const CORE_V2_MANUAL_TOOL_LABELS: Readonly<
  Record<CoreV2ManualToolGroup, string>
> = Object.freeze({
  selection: 'Selection',
  transform: 'Transformer',
  history: 'History',
  view: 'Viewport',
  animation: 'Animation & paint',
  data: 'Dataset & updates',
  authoring: 'Editor actions',
  assets: 'Assets & extract',
  lifecycle: 'Lifecycle',
  accessibility: 'Accessibility',
  diagnostics: 'Diagnostics',
});

const PREFIX_TOOLS: Readonly<Record<string, readonly CoreV2ManualToolGroup[]>> =
  Object.freeze({
    EVT: ['selection', 'transform', 'view', 'history', 'diagnostics'],
    QRY: ['data', 'selection', 'diagnostics'],
    SEL: ['selection', 'transform', 'view', 'diagnostics'],
    HIS: ['history', 'selection', 'transform', 'data'],
    ERR: ['data', 'assets', 'lifecycle', 'diagnostics'],
    DET: ['data', 'animation', 'lifecycle', 'diagnostics'],
    PRF: ['animation', 'view', 'transform', 'lifecycle', 'diagnostics'],
    LIF: ['lifecycle', 'data', 'view', 'selection', 'diagnostics'],
    DAT: ['data', 'authoring', 'diagnostics'],
    PIX: ['lifecycle', 'assets', 'view', 'diagnostics'],
    PKG: ['data', 'lifecycle', 'diagnostics'],
    REN: ['data', 'animation', 'assets', 'view', 'diagnostics'],
    LAY: ['authoring', 'transform', 'history', 'view', 'diagnostics'],
    AST: ['assets', 'lifecycle', 'diagnostics'],
    SEC: ['assets', 'data', 'lifecycle', 'diagnostics'],
    ACC: ['accessibility', 'selection', 'history', 'animation'],
    OPS: ['diagnostics', 'lifecycle', 'data'],
    MIG: ['data', 'authoring', 'lifecycle', 'diagnostics'],
    UPD: ['data', 'authoring', 'history', 'animation', 'diagnostics'],
    ANI: ['animation', 'history', 'lifecycle', 'diagnostics'],
    VIE: ['view', 'selection', 'transform', 'diagnostics'],
    TRN: ['transform', 'selection', 'history', 'view', 'diagnostics'],
    CSM: [
      'selection',
      'transform',
      'history',
      'view',
      'animation',
      'data',
      'authoring',
      'assets',
      'lifecycle',
      'accessibility',
      'diagnostics',
    ],
  });

const CASE_TASKS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'SEL-004': [
    'Click an object, then Shift-click other objects to toggle them in and out.',
    'Use Select first 3, Clear, Box, and Paint to compare every set operation.',
    'Watch selected IDs and the selection event journal update after each gesture.',
  ],
  'SEL-005': [
    'Choose Box and drag across complete and partially intersecting objects.',
    'Hold Shift while releasing the box to add the region to the current selection.',
    'Pan or zoom, then repeat the same box gesture in transformed screen coordinates.',
  ],
  'SEL-006': [
    'Choose Paint and scrub across several objects with one continuous pointer gesture.',
    'Repeat while holding Shift to add painted targets to the current set.',
    'Inspect the segment count and selected IDs after each stroke.',
  ],
  'HIS-001': [
    'Move, resize, rotate, style, or create objects to build real history records.',
    'Use Undo/Redo buttons or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.',
    'Compare the live stack, current geometry, selection, and published revision.',
  ],
  'HIS-002': [
    'Set a small capacity, perform more edits than the capacity, and inspect eviction.',
    'Undo one step, make a different edit, and verify the redo branch disappears.',
    'Clear history and confirm scene state remains while both stacks become empty.',
  ],
  'HIS-004': [
    'Focus the canvas or Lab chrome and use Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, or Ctrl/Cmd+Y.',
    'Use the matching host buttons and compare the same history result.',
    'Focus a text input and verify the Lab does not steal its native editing shortcut.',
  ],
  'REN-009': [
    'Trigger all bars, 10%, or selected bars repeatedly; animations remain visibly interpolated.',
    'Pan and zoom while bars are moving and watch frame/animation counters.',
    'Enable reduced motion and trigger another update to compare the presentation policy.',
  ],
  'ANI-001': [
    'Trigger selected, 10%, and all-bar updates as often as needed.',
    'Use Pause frames to freeze a visible intermediate height, then resume.',
    'Undo or replace the scene during motion and inspect the animation/resource counters.',
  ],
  'PRF-003': [
    'Start all-bar animation and immediately drag-pan and wheel-zoom the live canvas.',
    'Repeat with 10% and selected-only updates while watching FPS and the longest frame gap.',
    'Change dataset size from the route controls to compare the same interaction workload.',
  ],
  'TRN-004': [
    'Select a standalone rectangle and drag each visible corner or edge handle.',
    'Use the Resize tool fallback and the eight direction buttons for repeatable deltas.',
    'Hold Shift during a handle drag to lock the current aspect ratio.',
  ],
  'TRN-006': [
    'Shift-select multiple movable objects, choose Rotate, and drag around the selection center.',
    'Use ±15° buttons for deterministic group rotation.',
    'Undo and redo to confirm the whole selection rotates as one history action.',
  ],
  'TRN-008': [
    'Select an object and drag it with Move; hold Shift for axis lock.',
    'Use arrow keys for one-pixel nudges and Shift+arrow for ten pixels.',
    'Move near a viewport edge, then pan/zoom and continue transforming.',
  ],
  'TRN-009': [
    'Drag a selected object through several previews and release to create one history step.',
    'Press Escape mid-drag to cancel and restore the pre-gesture geometry.',
    'Undo and redo the completed gesture while watching preview and history counters.',
  ],
  'CSM-011': [
    'Click, Shift-toggle, Box, Paint, relation endpoint select, and blank-space clear freely.',
    'Pan/zoom between selections to exercise transformed hit testing.',
    'Inspect canvas-to-host selection publications in the event journal.',
  ],
  'CSM-022': [
    'Select one or several objects, drag to move, and nudge with the keyboard.',
    'Hold Shift during drag for axis lock and use Shift+arrow for ten-pixel steps.',
    'Undo once and confirm the complete gesture—not each preview—is reversed.',
  ],
  'CSM-023': [
    'Resize by any visible handle, then rotate the same or a multi-object selection.',
    'Hold Shift for ratio lock or 15° rotation snapping and press Escape to cancel.',
    'Use Undo/Redo to replay the completed transform as one action.',
  ],
  'CSM-034': [
    'Mix transform, create, style, group, duplicate, and delete operations.',
    'Undo all available records, then redo them while watching selection and interaction mode.',
    'Create a new branch after undo and verify stale redo records are removed.',
  ],
  'CSM-038': [
    'Capture the current published PixiJS scene and inspect the image preview.',
    'Continue selecting, panning, and animating after capture to prove the live canvas remains.',
    'Repeat capture and compare canvas identity, pending work, and resource counts.',
  ],
});

const CASE_PRIMARY_TOOL: Readonly<Record<string, CoreV2ManualToolGroup>> =
  Object.freeze({
    'SEL-004': 'selection',
    'SEL-005': 'selection',
    'SEL-006': 'selection',
    'HIS-001': 'history',
    'HIS-002': 'history',
    'HIS-004': 'history',
    'REN-009': 'animation',
    'ANI-001': 'animation',
    'PRF-003': 'animation',
    'TRN-004': 'transform',
    'TRN-006': 'transform',
    'TRN-008': 'transform',
    'TRN-009': 'transform',
    'CSM-011': 'selection',
    'CSM-022': 'transform',
    'CSM-023': 'transform',
    'CSM-034': 'history',
    'CSM-038': 'assets',
  });

export function createCoreV2ManualCaseDescriptor(
  presenter: CoreV2ContractPresenterDescriptor,
): CoreV2ManualCaseDescriptor {
  const actionDescriptors = presenter.actions.map(manualActionDescriptor);
  const prefix = presenter.caseId.split('-', 1)[0] ?? '';
  const primaryTool = CASE_PRIMARY_TOOL[presenter.caseId];
  const tools = orderTools([
    ...(primaryTool === undefined ? [] : [primaryTool]),
    ...(PREFIX_TOOLS[prefix] ?? ['diagnostics']),
    ...actionDescriptors.map(({ group }) => group),
  ]);
  const tasks = CASE_TASKS[presenter.caseId] ?? defaultTasks(presenter, actionDescriptors);
  return Object.freeze({
    revision: CORE_V2_MANUAL_LAB_REVISION,
    caseId: presenter.caseId,
    title: presenter.title,
    tools,
    tasks: Object.freeze([...tasks]),
    actions: Object.freeze(actionDescriptors),
  });
}

export const CORE_V2_MANUAL_CASE_CATALOG: readonly CoreV2ManualCaseDescriptor[] =
  Object.freeze(CORE_V2_CONTRACT_PRESENTERS.map(createCoreV2ManualCaseDescriptor));

export const CORE_V2_MANUAL_CASE_BY_ID: ReadonlyMap<
  string,
  CoreV2ManualCaseDescriptor
> = new Map(CORE_V2_MANUAL_CASE_CATALOG.map((descriptor) => [
  descriptor.caseId,
  descriptor,
]));

export const CORE_V2_MANUAL_CASE_COUNT = CORE_V2_MANUAL_CASE_CATALOG.length;
export const CORE_V2_MANUAL_ACTION_COUNT = CORE_V2_MANUAL_CASE_CATALOG.reduce(
  (count, descriptor) => count + descriptor.actions.length,
  0,
);

if (CORE_V2_MANUAL_CASE_COUNT !== 173) {
  throw new Error(`Core v2 manual Lab must cover 173 cases, got ${CORE_V2_MANUAL_CASE_COUNT}`);
}
if (CORE_V2_MANUAL_ACTION_COUNT !== 646) {
  throw new Error(`Core v2 manual Lab must map 646 actions, got ${CORE_V2_MANUAL_ACTION_COUNT}`);
}

export function selectCoreV2ManualCase(caseId: string): CoreV2ManualCaseDescriptor {
  const descriptor = CORE_V2_MANUAL_CASE_BY_ID.get(caseId);
  if (descriptor === undefined) {
    throw new Error(`Unknown Core v2 manual Lab case: ${caseId}`);
  }
  return descriptor;
}

function manualActionDescriptor(
  action: CoreV2ContractActionPresenter,
): CoreV2ManualActionDescriptor {
  const group = manualGroupForAction(action.type);
  return Object.freeze({
    index: action.index,
    type: action.type,
    label: action.label,
    group,
    instruction: manualInstructionForAction(action.type, group),
  });
}

function manualGroupForAction(type: string): CoreV2ManualToolGroup {
  const value = type.toLowerCase();
  if (hasAny(value, [
    'undo',
    'redo',
    'history',
    'compound-editor',
    'host-control',
  ])) return 'history';
  if (hasAny(value, [
    'transform',
    'resize',
    'rotate',
    'nudge',
    'move-target',
    'begin-move',
    'end-move',
    'axis-lock',
    'align',
    'distribute',
  ])) return 'transform';
  if (hasAny(value, [
    'select',
    'hit-test',
    'hit-matrix',
    'query',
    'pointer',
    'click',
    'hover',
    'context-menu',
    'gesture',
    'binding',
    'propagat',
    'state-stack',
  ])) return 'selection';
  if (hasAny(value, [
    'pan',
    'zoom',
    'fit',
    'focus-target',
    'view',
    'viewport',
    'world-rotation',
    'world-flip',
    'surface-resize',
    'resize-host',
    'resizehost',
    'convert-screen',
  ])) return 'view';
  if (hasAny(value, [
    'animation',
    'animate',
    'bar',
    'random-text',
    'render-random-text',
    'advance-clock',
    'presentation',
    'highlight',
    'layer-visibility',
    'column',
    'reduced-motion',
  ])) return 'animation';
  if (hasAny(value, [
    'asset',
    'image',
    'descriptor',
    'register',
    'acquire',
    'extract',
    'capture',
    'canvas',
    'source',
  ])) return 'assets';
  if (hasAny(value, [
    'accessibility',
    'keyboard-parity',
    'host-control-action',
    'focus-accessibility',
    'activate-accessibility',
  ])) return 'accessibility';
  if (hasAny(value, [
    'initialize',
    'destroy',
    'lifecycle',
    'mount',
    'remount',
    'suspend',
    'visibility',
    'navigate',
    'renderer-loss',
    'fresh-instance',
    'repeatlifecycle',
  ])) return 'lifecycle';
  if (hasAny(value, [
    'create',
    'author',
    'style',
    'group',
    'ungroup',
    'duplicate',
    'copy-paste',
    'paste',
    'drop',
    'hierarchy',
    'reorder',
    'grid-edit',
    'relation-edit',
    'text-edit',
    'delete',
    'rename',
    'reveal',
    'position-angle',
  ])) return 'authoring';
  if (hasAny(value, [
    'performance',
    'measure',
    'probe',
    'inspect',
    'diagnostic',
    'telemetry',
    'package',
    'build',
    'pack',
    'install',
    'audit',
    'documentation',
    'canary',
    'compare',
  ])) return 'diagnostics';
  return 'data';
}

function manualInstructionForAction(
  type: string,
  group: CoreV2ManualToolGroup,
): string {
  const value = type.toLowerCase();
  if (value.includes('undo')) return 'Build several edits, then press Undo or Ctrl/Cmd+Z.';
  if (value.includes('redo')) return 'Undo first, then press Redo, Ctrl/Cmd+Shift+Z, or Ctrl/Cmd+Y.';
  if (value.includes('box-select') || value.includes('box-selection')) {
    return 'Choose Box and drag a region directly across the live canvas.';
  }
  if (value.includes('paint-select') || value.includes('paint-selection')) {
    return 'Choose Paint and scrub a continuous path across live objects.';
  }
  if (value.includes('animate') || value.includes('bar') || value.includes('advance-clock')) {
    return 'Use Animation & paint controls repeatedly and manipulate the viewport while frames run.';
  }
  if (value.includes('resize')) {
    return 'Select a rectangle, choose Resize, and drag its visible handles or use direction controls.';
  }
  if (value.includes('rotate')) {
    return 'Select one or more objects, choose Rotate, and drag or use deterministic angle buttons.';
  }
  if (value.includes('move') || value.includes('nudge')) {
    return 'Select movable targets, drag with Move, or use the arrow-key nudge controls.';
  }
  if (value.includes('extract') || value.includes('capture')) {
    return 'Publish the current frame, capture it, inspect the preview, and continue using the same canvas.';
  }
  if (value.includes('destroy') || value.includes('remount')) {
    return 'Destroy and re-initialize the live session while watching canvas and resource counters.';
  }
  if (value.includes('load') || value.includes('replace')) {
    return 'Edit or regenerate the PATCH MAP JSON, then load it as a complete authoritative scene.';
  }
  if (value.includes('patch') || value.includes('merge') || value.includes('update')) {
    return 'Select a target and apply a patch, style, text, or advanced JSON operation.';
  }
  return `Use the ${CORE_V2_MANUAL_TOOL_LABELS[group]} panel and inspect the live result and journal.`;
}

function defaultTasks(
  presenter: CoreV2ContractPresenterDescriptor,
  actions: readonly CoreV2ManualActionDescriptor[],
): readonly string[] {
  const unique = [...new Set(actions.map(({ instruction }) => instruction))];
  return Object.freeze([
    presenter.instruction,
    ...(unique.slice(0, 2)),
    'Repeat, vary, undo, and inspect each operation; the manual session remains live until you destroy it.',
  ]);
}

function orderTools(values: readonly CoreV2ManualToolGroup[]): readonly CoreV2ManualToolGroup[] {
  return Object.freeze([...new Set(values)]);
}

function hasAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

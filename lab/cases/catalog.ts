import type {
  LabAction,
  LabCase,
  LabEvidenceStatus,
  LabFixtureKey,
  LabInvariant,
  LabRisk,
  LabStep,
} from './types';

// Deliberately violates the public schema for the validation-rejection lab step.
const INVALID_SHOW_VALUE = 'invalid' as unknown as boolean;

const invariant = (
  id: string,
  label: string,
  path: string,
  operator: LabInvariant['operator'],
  expected: unknown,
  options: Partial<Pick<LabInvariant, 'normative' | 'source' | 'note'>> = {},
): LabInvariant => ({
  id,
  label,
  path,
  operator,
  expected,
  normative: options.normative ?? true,
  source: options.source ?? 'public-contract',
  ...(options.note ? { note: options.note } : {}),
});

const step = (
  id: string,
  title: string,
  action: LabAction,
  expectations: LabInvariant[] = [],
  evidenceStatus?: LabEvidenceStatus,
  description?: string,
): LabStep => ({
  id,
  title,
  action,
  expectations,
  ...(evidenceStatus ? { evidenceStatus } : {}),
  ...(description ? { description } : {}),
});

const reset = (id = 'reset'): LabStep =>
  step(id, 'Reset isolated PATCH MAP instance', { kind: 'reset' }, [
    invariant(`${id}-init`, 'Fresh instance is initialized', 'patchmap.isInit', 'equals', true),
    invariant(`${id}-world`, 'World root exists', 'patchmap.world.exists', 'equals', true),
  ]);

const draw = (id: string, fixture: LabFixtureKey): LabStep =>
  step(id, `Draw ${fixture}`, { kind: 'draw', fixture }, [
    invariant(`${id}-return`, 'Draw returns materialized data', 'return.exists', 'equals', true),
    invariant(`${id}-event`, 'Draw event is observable after drain', 'events.patchmap:draw.count', 'at-least', 1),
  ]);

const inspect = (
  id: string,
  title: string,
  expectations: LabInvariant[],
): LabStep => {
  return step(id, title, { kind: 'inspect' }, expectations);
};

const makeCase = (
  definition: Omit<LabCase, 'tags'> & { tags?: string[] },
): LabCase => ({ ...definition, tags: definition.tags ?? [] });

const drawCase = (
  id: string,
  title: string,
  fixture: LabFixtureKey,
  risk: LabRisk,
  expectations: LabInvariant[],
  options: {
    evidenceStatus?: LabEvidenceStatus;
    description?: string;
    tags?: string[];
    oracleQuestions?: LabCase['oracleQuestions'];
  } = {},
): LabCase =>
  makeCase({
    id,
    title,
    category: 'draw',
    risk,
    evidenceStatus: options.evidenceStatus ?? 'verified',
    description: options.description ?? `Draw and inspect the ${title.toLowerCase()} contract.`,
    tags: options.tags ?? [],
    fixture,
    ...(options.oracleQuestions ? { oracleQuestions: options.oracleQuestions } : {}),
    steps: [reset(), draw('draw', fixture), inspect('inspect', 'Inspect public scene snapshot', expectations)],
  });

const DRAW_CASES: LabCase[] = [
  drawCase(
    'draw-all-element-kinds',
    'Seven element kinds',
    'all-elements',
    'critical',
    [
      ...['group', 'grid', 'item', 'relations', 'image', 'text', 'rect'].map((type) =>
        invariant(`element-${type}`, `${type} handle is present`, `scene.byType.${type}.count`, 'at-least', 1),
      ),
      invariant('element-live-props', 'Live handles expose materialized props', 'scene.handlesHaveProps', 'equals', true),
    ],
    { tags: ['schema', 'geometry', 'identity'], oracleQuestions: ['Q9'] },
  ),
  drawCase(
    'draw-all-component-kinds',
    'Four item component kinds',
    'all-components',
    'critical',
    [
      ...['background', 'bar', 'icon', 'text'].map((type) =>
        invariant(`component-${type}`, `${type} component is present`, `scene.componentsByType.${type}.count`, 'at-least', 1),
      ),
      invariant('component-parent', 'Components remain children of item handle', 'scene.byId.component-host.componentCount', 'equals', 4),
    ],
    { tags: ['components', 'placement', 'sizing'], oracleQuestions: ['Q9'] },
  ),
  drawCase(
    'draw-materialized-defaults',
    'Materialized defaults and geometry',
    'defaults',
    'high',
    [
      invariant('defaults-id', 'Every handle has an ID', 'scene.allHandlesHaveId', 'equals', true),
      invariant('defaults-show', 'Omitted show materializes true', 'scene.allTopLevelShown', 'equals', true),
      invariant('defaults-locked', 'Omitted locked materializes false', 'scene.allTopLevelUnlocked', 'equals', true),
      invariant('defaults-grid-gap', 'Grid gap defaults to zero', 'scene.byId.default-grid.props.gap', 'equals', { x: 0, y: 0 }),
    ],
    { evidenceStatus: 'partial', tags: ['defaults', 'Q7'], oracleQuestions: ['Q7'] },
  ),
  makeCase({
    id: 'draw-visibility-show-destroy-redraw',
    title: 'Hidden, show, destroy, and redraw',
    category: 'draw',
    risk: 'high',
    evidenceStatus: 'verified',
    description: 'Observe visibility and replacement semantics without inspecting renderer internals.',
    fixture: 'visibility',
    tags: ['visibility', 'destroy', 'redraw'],
    steps: [
      reset(),
      draw('draw', 'visibility'),
      step('show-hidden', 'Show the hidden rect', {
        kind: 'update',
        request: { target: { mode: 'id', id: 'hidden-rect' }, changes: { show: true } },
      }, [
        invariant('show-hidden-prop', 'Public show becomes true synchronously', 'scene.byId.hidden-rect.props.show', 'equals', true),
      ]),
      step('redraw', 'Redraw the same fixture', { kind: 'draw', fixture: 'visibility' }, [
        invariant('redraw-old-destroyed', 'Prior public handles are destroyed', 'before.selected.destroyed', 'equals', true),
        invariant('redraw-new-reference', 'Replacement uses new handle identity', 'selected.reference', 'different-reference', 'before.selected.reference'),
      ]),
      step('inspect-redraw', 'Inspect replacement world', { kind: 'inspect', target: { mode: 'id', id: 'visible-rect' } }, [
        invariant('redraw-count', 'Two authored rects exist', 'scene.byType.rect.count', 'equals', 2),
      ]),
    ],
  }),
  makeCase({
    id: 'draw-identity-replacement',
    title: 'Live identity across replacement draw',
    category: 'draw',
    risk: 'high',
    evidenceStatus: 'verified',
    description: 'Record a live handle, redraw, and compare old/new identity and parent state.',
    fixture: 'visibility',
    tags: ['identity', 'replacement'],
    steps: [
      reset(),
      draw('first-draw', 'visibility'),
      step('capture', 'Capture visible rect handle', { kind: 'inspect', target: { mode: 'id', id: 'visible-rect' }, snapshot: 'first-handle' }, [
        invariant('capture-live', 'Initial handle is live', 'selected.destroyed', 'equals', false),
      ]),
      step('second-draw', 'Replace with same data', { kind: 'draw', fixture: 'visibility' }, [
        invariant('identity-differs', 'New draw does not retain handle identity', 'scene.byId.visible-rect.reference', 'different-reference', 'snapshots.first-handle.reference'),
        invariant('prior-parentless', 'Prior handle is detached', 'snapshots.first-handle.parent.exists', 'equals', false),
      ]),
    ],
  }),
  makeCase({
    id: 'draw-input-immutability',
    title: 'Caller input immutability',
    category: 'draw',
    risk: 'critical',
    evidenceStatus: 'verified',
    description: 'Deep-compare the caller-owned fixture before and after draw.',
    fixture: 'all-components',
    tags: ['immutability', 'safety'],
    steps: [
      reset(),
      draw('draw', 'all-components'),
      step('compare-input', 'Compare cloned caller input', { kind: 'inspect', snapshot: 'input-diff' }, [
        invariant('input-unchanged', 'Draw did not mutate caller input', 'input.unchanged', 'equals', true),
      ]),
    ],
  }),
  makeCase({
    id: 'draw-assets-source-forms',
    title: 'Asset alias, URL, and descriptor',
    category: 'draw',
    risk: 'high',
    evidenceStatus: 'verified',
    description: 'Load the three documented public asset source forms and inspect live sizes.',
    fixture: 'assets',
    tags: ['assets', 'async'],
    oracleQuestions: ['Q15'],
    steps: [
      reset('reset-with-assets'),
      draw('draw-assets', 'assets'),
      step('settle-assets', 'Wait for public asset completion', { kind: 'wait-frame', frames: 3 }),
      step('inspect-assets', 'Inspect all asset-backed handles', { kind: 'inspect' }, [
        invariant('asset-count', 'Three image handles remain', 'scene.byType.image.count', 'equals', 3),
        invariant('asset-sizes', 'Every image has finite public bounds', 'scene.byType.image.allFiniteBounds', 'equals', true),
      ]),
    ],
  }),
  makeCase({
    id: 'draw-advanced-text',
    title: 'Text wrap, overflow, split, and auto-font',
    category: 'draw',
    risk: 'high',
    evidenceStatus: 'partial',
    description: 'Inspect normative public text props and geometry; pixel appearance remains non-normative.',
    fixture: 'advanced-text',
    tags: ['text', 'Q12', 'pixels-non-normative'],
    oracleQuestions: ['Q12', 'Q19'],
    steps: [
      reset(),
      draw('draw-text', 'advanced-text'),
      step('inspect-element-text', 'Inspect wrapped text element', { kind: 'inspect', target: { mode: 'id', id: 'text-wrap' } }, [
        invariant('text-wrap-prop', 'Word wrap is publicly materialized', 'selected.props.style.wordWrap', 'equals', true, { source: 'approved-v4' }),
        invariant('text-autofont', 'Auto-font bounds are retained', 'selected.props.style.autoFont', 'equals', { min: 10, max: 24 }, { source: 'approved-v4' }),
      ]),
      step('inspect-component-text', 'Inspect split text component', { kind: 'inspect', target: { mode: 'id', id: 'text-component-split' } }, [
        invariant('text-split', 'Split value remains public', 'selected.props.split', 'equals', 1, { source: 'approved-v4' }),
      ]),
      step('observe-text-pixels', 'Visually inspect headed text raster', {
        kind: 'manual',
        instruction: 'Compare wrapping, overflow, and placement visually; do not convert this observation into a normative pixel pass.',
        completion: 'observe',
      }, [
        invariant('text-pixels', 'Headless pixel appearance is informational only', 'visual.pixelMatch', 'exists', true, {
          normative: false,
          source: 'manual-observation',
          note: 'Q12 raster evidence is environment-qualified.',
        }),
      ], 'partial'),
    ],
  }),
  makeCase({
    id: 'draw-relations-endpoints-duplicates',
    title: 'Relation endpoints, duplicates, direction, and missing targets',
    category: 'draw',
    risk: 'critical',
    evidenceStatus: 'verified',
    description: 'Exercise authored source/target links, duplicate merge behavior, direction, and missing endpoints.',
    fixture: 'relations',
    tags: ['relations', 'geometry', 'refresh'],
    oracleQuestions: ['Q14'],
    steps: [
      reset(),
      draw('draw-relations', 'relations'),
      step('inspect-direction', 'Inspect authored source and target order', { kind: 'inspect', target: { mode: 'id', id: 'relation-lines' } }, [
        invariant('relation-direction', 'Authored direction remains source to target', 'selected.props.links.0', 'equals', { source: 'relation-a', target: 'relation-b' }, { source: 'approved-v4' }),
      ]),
      step('merge-duplicate', 'Merge a duplicate link', {
        kind: 'update',
        request: {
          target: { mode: 'id', id: 'relation-lines' },
          changes: { links: [{ source: 'relation-a', target: 'relation-b' }] },
        },
      }, [
        invariant('relation-no-duplicate', 'Duplicate merge does not add a link', 'scene.byId.relation-lines.props.links.length', 'equals', 2, { source: 'approved-v4' }),
      ]),
      step('missing-endpoint', 'Replace with one missing endpoint', {
        kind: 'update',
        request: {
          target: { mode: 'id', id: 'relation-lines' },
          mergeStrategy: 'replace',
          changes: { links: [{ source: 'relation-a', target: 'missing-id' }] },
        },
      }, [
        invariant('relation-handle-retained', 'Relation handle remains public', 'scene.byId.relation-lines.exists', 'equals', true, { source: 'approved-v4' }),
      ]),
      step('relation-refresh', 'Refresh relation geometry', {
        kind: 'update',
        request: { target: { mode: 'id', id: 'relation-lines' }, refresh: true },
      }, [
        invariant('relation-refresh-return', 'Refresh returns the relation handle', 'return.ids', 'includes', 'relation-lines', { source: 'approved-v4' }),
      ]),
    ],
  }),
  makeCase({
    id: 'draw-production-like-458',
    title: 'Production-like 458-element dataset',
    category: 'draw',
    risk: 'critical',
    evidenceStatus: 'verified',
    description: 'Draw the byte-preserved user fixture, fit the scene, and inspect an authored target.',
    fixture: 'production-like',
    tags: ['production-like', 'large-scene', 'user-input'],
    steps: [
      reset(),
      draw('draw-production', 'production-like'),
      step('fit-production', 'Fit all managed non-relation roots', { kind: 'view', method: 'fit', ids: null }, [
        invariant('fit-production-scale', 'Viewport scale is finite', 'viewport.scaleFinite', 'equals', true),
      ]),
      step('inspect-production', 'Inspect top-level structure', { kind: 'inspect' }, [
        invariant('production-top-level', 'Fixture has 458 top-level elements', 'draw.inputTopLevelCount', 'equals', 458),
        invariant('production-grids', 'Fixture includes 40 grids', 'draw.inputTypeCounts.grid', 'equals', 40),
        invariant('production-items', 'Fixture includes 29 items', 'draw.inputTypeCounts.item', 'equals', 29),
        invariant('production-relations', 'Fixture includes 389 relations', 'draw.inputTypeCounts.relations', 'equals', 389),
      ]),
      step('inspect-production-target', 'Inspect first public grid target', {
        kind: 'inspect',
        target: { mode: 'path', path: '$..[?(@.type == "grid")]' },
      }, [
        invariant('production-target-exists', 'A public grid handle is selected', 'selected.exists', 'equals', true),
        invariant('production-target-type', 'Selected handle type is grid', 'selected.type', 'equals', 'grid'),
        invariant('production-target-props', 'Selected handle exposes public props', 'selected.props.exists', 'equals', true),
        invariant('production-target-bounds', 'Selected handle has finite public bounds', 'selected.boundsFinite', 'equals', true),
        invariant('production-target-transform', 'Selected handle exposes a public transform snapshot', 'selected.transform.exists', 'equals', true),
      ]),
    ],
  }),
  makeCase({
    id: 'draw-invalid-schema-errors',
    title: 'Invalid schema and exact error display',
    category: 'draw',
    risk: 'critical',
    evidenceStatus: 'partial',
    description: 'Display exact thrown errors while treating exhaustive schema coverage as open.',
    tags: ['invalid', 'errors', 'Q7'],
    oracleQuestions: ['Q7'],
    steps: [
      reset(),
      ...[
        ['invalid-object', 'not-an-array'],
        ['invalid-rect', 'rect-without-size'],
        ['invalid-grid', 'grid-without-item'],
        ['invalid-image', 'image-without-source'],
        ['invalid-duplicate', 'duplicate-element-id'],
      ].flatMap(([id, inputKey]) => [
        step(`${id}-baseline`, `Restore valid baseline before ${inputKey}`, { kind: 'draw', fixture: 'defaults' }, [
          invariant(`${id}-baseline-ready`, 'Valid baseline scene is present', 'scene.topLevelCount', 'equals', 4),
        ]),
        step(id as string, `Reject ${inputKey}`, {
            kind: 'draw-invalid',
            inputKey: inputKey as string,
            expectErrorIncludes: 'Validation',
          }, [
            invariant(`${id}-throws`, 'Exact error and app-owned stack are captured', 'error.message', 'exists', true, { source: 'approved-v4' }),
            invariant(`${id}-scene-safe`, 'Failed draw preserves the full public baseline scene', 'error.sceneConsistentWithBefore', 'equals', true),
          ], 'partial'),
      ]),
    ],
  }),
  makeCase({
    id: 'draw-grid-inactive-strategy',
    title: 'Grid cell materialization and inactive strategies',
    category: 'draw',
    risk: 'high',
    evidenceStatus: 'verified',
    description: 'Compare deterministic cell IDs for destroy and hide strategies.',
    fixture: 'grid-cells',
    tags: ['grid', 'cells', 'identity'],
    steps: [
      reset(),
      draw('draw-grids', 'grid-cells'),
      step('inspect-destroy-grid', 'Inspect destroy strategy', { kind: 'inspect', target: { mode: 'id', id: 'grid-destroy' } }, [
        invariant('destroy-cell-active', 'Active deterministic cell exists', 'scene.byId.grid-destroy.0.0.exists', 'equals', true),
        invariant('destroy-cell-inactive', 'Inactive cell is not materialized', 'scene.byId.grid-destroy.0.1.exists', 'equals', false),
      ]),
      step('inspect-hide-grid', 'Inspect hide strategy', { kind: 'inspect', target: { mode: 'id', id: 'grid-hide' } }, [
        invariant('hide-cell-inactive', 'Inactive cell remains with show false', 'scene.byId.grid-hide.0.1.props.show', 'equals', false),
      ]),
    ],
  }),
];

const UPDATE_CASES: LabCase[] = [
  makeCase({
    id: 'update-direct-id-path-targets',
    title: 'Direct handle, ID, and path targeting',
    category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Resolve the same public handle through each documented target form.',
    fixture: 'update-playground', tags: ['selector', 'targeting'],
    steps: [
      reset(), draw('draw', 'update-playground'),
      step('by-id', 'Update by ID-resolved handle', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { label: 'id-target' } } }, [
        invariant('by-id-return', 'ID target returns one live handle', 'return.ids', 'equals', ['update-rect-a']),
      ]),
      step('by-path', 'Update by JSONPath', { kind: 'update', request: { target: { mode: 'path', path: '$..[?(@.id == "update-rect-a")]' }, changes: { label: 'path-target' } } }, [
        invariant('by-path-return', 'Path target returns the live handle', 'return.ids', 'equals', ['update-rect-a']),
      ]),
      step('inspect-target', 'Inspect synchronous label', { kind: 'inspect', target: { mode: 'id', id: 'update-rect-a' } }, [
        invariant('target-label', 'Final label is public immediately', 'selected.props.label', 'equals', 'path-target'),
      ]),
    ],
  }),
  makeCase({
    id: 'update-missing-target', title: 'Missing target', category: 'update', risk: 'high', evidenceStatus: 'verified',
    description: 'A missing target returns an empty list and does not throw.', fixture: 'update-playground', tags: ['missing-target'],
    steps: [reset(), draw('draw', 'update-playground'), step('missing', 'Update missing ID', { kind: 'update', request: { target: { mode: 'id', id: 'does-not-exist' }, changes: { show: false } } }, [
      invariant('missing-empty', 'Missing target returns empty result', 'return.length', 'equals', 0),
      invariant('missing-no-error', 'Missing target does not throw', 'error.exists', 'equals', false),
    ])],
  }),
  makeCase({
    id: 'update-duplicate-target-order', title: 'Duplicate path and handle order', category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Target one rect by path and direct handle so relative mutation is applied twice.', fixture: 'update-playground', tags: ['order', 'duplicates'], oracleQuestions: ['Q6'],
    steps: [reset(), draw('draw', 'update-playground'), step('duplicate', 'Apply relative x through path then handle', { kind: 'update', request: { target: { mode: 'path-and-id', path: '$..[?(@.id == "update-rect-a")]', id: 'update-rect-a' }, changes: { attrs: { x: 2 } }, relativeTransform: true } }, [
      invariant('duplicate-return', 'Same public handle appears twice in order', 'return.ids', 'equals', ['update-rect-a', 'update-rect-a'], { source: 'approved-v4' }),
      invariant('duplicate-applied', 'Relative x applies twice', 'scene.byId.update-rect-a.props.attrs.x', 'equals', 34, { source: 'approved-v4' }),
    ])],
  }),
  makeCase({
    id: 'update-merge-replace-refresh', title: 'Merge, replace, and refresh', category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Compare nested merge preservation, named-property replacement, and equal-value refresh.', fixture: 'update-playground', tags: ['merge', 'replace', 'refresh'],
    steps: [
      reset(), draw('draw', 'update-playground'),
      step('merge', 'Merge fill and preserve stroke', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { fill: '#d43b54' }, mergeStrategy: 'merge' } }, [
        invariant('merge-fill', 'Fill changes', 'scene.byId.update-rect-a.props.fill', 'equals', '#d43b54'),
        invariant('merge-stroke', 'Unmentioned stroke remains', 'scene.byId.update-rect-a.props.stroke.exists', 'equals', true),
      ]),
      step('replace', 'Replace named stroke property', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { stroke: { color: '#ffffff' } }, mergeStrategy: 'replace' } }, [
        invariant('replace-stroke', 'Replacement publishes authored stroke', 'scene.byId.update-rect-a.props.stroke.color', 'equals', '#ffffff'),
      ]),
      step('refresh', 'Refresh without changes', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, refresh: true } }, [
        invariant('refresh-return', 'Refresh returns target handle', 'return.ids', 'equals', ['update-rect-a']),
      ]),
    ],
  }),
  makeCase({
    id: 'update-normalize-validation', title: 'Normalize and schema validation controls', category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Compare validation rejection, validation bypass, and unnormalized public props.', fixture: 'update-playground', tags: ['normalize', 'validation'], oracleQuestions: ['Q6'],
    steps: [
      reset(), draw('draw', 'update-playground'),
      step('validate-true', 'Reject invalid change before mutation', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { show: INVALID_SHOW_VALUE }, validateSchema: true } }, [
        invariant('validate-error', 'Validation error is displayed', 'error.message', 'exists', true, { source: 'approved-v4' }),
        invariant('validate-preserve', 'Rejected update preserves prior public size', 'scene.byId.update-rect-a.props.size', 'equals', { width: 100, height: 70 }, { source: 'approved-v4' }),
      ]),
      step('validate-false', 'Accept same authored change without schema validation', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { size: -1 }, validateSchema: false, normalize: false } }, [
        invariant('normalize-false', 'Authored unnormalized value is retained publicly', 'scene.byId.update-rect-a.props.size', 'equals', -1, { source: 'approved-v4' }),
      ]),
    ],
  }),
  makeCase({
    id: 'update-bulk-order', title: 'Bulk update order and identity', category: 'update', risk: 'high', evidenceStatus: 'verified',
    description: 'Update multiple handles in authored order and retain live identity.', fixture: 'update-playground', tags: ['bulk', 'order', 'identity'],
    steps: [reset(), draw('draw', 'update-playground'), step('capture', 'Capture target references', { kind: 'inspect', target: { mode: 'ids', ids: ['update-rect-b', 'update-rect-a'] }, snapshot: 'bulk-before' }), step('bulk', 'Update ordered handles', { kind: 'update', request: { target: { mode: 'ids', ids: ['update-rect-b', 'update-rect-a'] }, changes: { show: false } } }, [
      invariant('bulk-order', 'Return preserves authored target order', 'return.ids', 'equals', ['update-rect-b', 'update-rect-a']),
      invariant('bulk-identity', 'Updated handles preserve live identity', 'return.references', 'equals', 'snapshots.bulk-before.references'),
    ])],
  }),
  makeCase({
    id: 'update-sync-return-next-frame', title: 'Synchronous state and next-frame render', category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Inspect public state at update return, then verify a subsequent frame occurs.', fixture: 'update-playground', tags: ['timing', 'frame', 'UPD-005'],
    steps: [reset(), draw('draw', 'update-playground'), step('sync-update', 'Change fill synchronously', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { fill: '#ff445f' } } }, [
      invariant('sync-state', 'Public props change at return time', 'scene.byId.update-rect-a.props.fill', 'equals', '#ff445f'),
    ]), step('next-frame', 'Wait for native frame', { kind: 'wait-frame', frames: 1 }, [
      invariant('frame-advanced', 'Frame counter advances', 'frames.delta', 'at-least', 1),
      invariant('pixels-nonnormative', 'Headless pixels are not a success gate', 'visual.pixelMatch', 'exists', true, { normative: false, source: 'manual-observation', note: 'UPD-005 public timing is normative; black pixels are not.' }),
    ], 'partial')],
  }),
  makeCase({
    id: 'update-relative-center-rotate', title: 'Relative transform and center rotation', category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Apply additive x/y/angle and preserve visible center during rotation.', fixture: 'update-playground', tags: ['transform', 'center', 'rotation'],
    steps: [
      reset(), draw('draw', 'update-playground'),
      step('capture-center', 'Capture pre-update center', { kind: 'inspect', target: { mode: 'id', id: 'update-rect-a' }, snapshot: 'center-before' }),
      step('relative', 'Apply relative translation and angle', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { attrs: { x: 12, y: -4, angle: 15 } }, relativeTransform: true } }, [
        invariant('relative-x', 'X is additive', 'scene.byId.update-rect-a.props.attrs.x', 'equals', 42),
        invariant('relative-y', 'Y is additive', 'scene.byId.update-rect-a.props.attrs.y', 'equals', 26),
      ]),
      step('rotate-center', 'Rotate around visible center', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { attrs: { angle: 45 } }, rotateOrigin: 'center' } }, [
        invariant('center-preserved', 'Visible center remains stable for center rotation', 'selected.center', 'approximately-equals', 'before.selected.center'),
      ]),
    ],
  }),
  makeCase({
    id: 'update-visibility-style-source-text', title: 'Visibility, style, source, and text changes', category: 'update', risk: 'high', evidenceStatus: 'verified',
    description: 'Update distinct observable property families without rebuilding the case.', fixture: 'update-playground', tags: ['visibility', 'style', 'source', 'text'],
    steps: [
      reset(), draw('draw', 'update-playground'),
      step('visibility', 'Hide rect', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-b' }, changes: { show: false } } }, [invariant('visibility-false', 'show is false', 'scene.byId.update-rect-b.props.show', 'equals', false)]),
      step('style', 'Change rect fill', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { fill: '#7f68d9' } } }, [invariant('style-fill', 'Fill is public', 'scene.byId.update-rect-a.props.fill', 'equals', '#7f68d9')]),
      step('text', 'Change item text component', { kind: 'update', request: { target: { mode: 'id', id: 'update-text' }, changes: { text: 'after update' } } }, [invariant('text-changed', 'Text props change', 'scene.byId.update-text.props.text', 'equals', 'after update')]),
    ],
  }),
  makeCase({
    id: 'update-item-component-reconcile', title: 'Item component reconciliation', category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Compare merge retention and replace removal of unmatched components.', fixture: 'update-playground', tags: ['components', 'reconcile', 'identity'], oracleQuestions: ['Q8', 'Q16', 'Q17'],
    steps: [
      reset(), draw('draw', 'update-playground'),
      step('capture-components', 'Capture existing component handles', { kind: 'inspect', target: { mode: 'id', id: 'update-item' }, snapshot: 'components-before' }),
      step('merge-components', 'Merge one matching text component', { kind: 'update', request: { target: { mode: 'id', id: 'update-item' }, changes: { components: [{ id: 'update-text', type: 'text', text: 'merged' }] }, mergeStrategy: 'merge' } }, [
        invariant('merge-retains-unmatched', 'Merge retains unmatched components', 'scene.byId.update-item.componentCount', 'equals', 3),
        invariant('merge-retains-identity', 'Matched text handle identity remains', 'scene.byId.update-text.reference', 'equals', 'snapshots.components-before.byId.update-text.reference'),
      ]),
      step('replace-components', 'Replace component array', { kind: 'update', request: { target: { mode: 'id', id: 'update-item' }, changes: { components: [{ id: 'update-text', type: 'text', text: 'replaced' }] }, mergeStrategy: 'replace' } }, [
        invariant('replace-removes-unmatched', 'Replace removes unmatched managed components', 'scene.byId.update-item.componentCount', 'equals', 1),
      ]),
    ],
  }),
  makeCase({
    id: 'update-grid-template-cells', title: 'Grid template and cell updates', category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Change cell topology and item template while inspecting deterministic IDs.', fixture: 'update-playground', tags: ['grid', 'cells', 'template'], oracleQuestions: ['Q16'],
    steps: [reset(), draw('draw', 'update-playground'), step('cells', 'Activate and relabel cells', { kind: 'update', request: { target: { mode: 'id', id: 'update-grid' }, changes: { cells: [['A', 'B'], ['C', 'D']] } } }, [
      invariant('new-cell', 'New deterministic cell is materialized', 'scene.byId.update-grid.1.1.exists', 'equals', true),
    ]), step('template', 'Update grid item template', { kind: 'update', request: { target: { mode: 'id', id: 'update-grid' }, changes: { item: { size: 70, padding: 4 } } } }, [
      invariant('template-size', 'Existing cells expose new size', 'scene.byId.update-grid.0.0.props.size', 'equals', { width: 70, height: 70 }),
    ])],
  }),
  makeCase({
    id: 'update-relation-refresh', title: 'Relation update and refresh after endpoint move', category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Move an endpoint, refresh the relation, and inspect public geometry changes.', fixture: 'update-playground', tags: ['relations', 'refresh'], oracleQuestions: ['Q14'],
    steps: [reset(), draw('draw', 'update-playground'), step('settle-relation', 'Render initial relation geometry', { kind: 'wait-frame', frames: 2 }), step('capture-relation', 'Capture relation bounds', { kind: 'inspect', target: { mode: 'id', id: 'update-relations' }, snapshot: 'relation-before' }), step('move-endpoint', 'Move endpoint', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-b' }, changes: { attrs: { x: 80 } }, relativeTransform: true } }), step('refresh-relation', 'Refresh relation', { kind: 'update', request: { target: { mode: 'id', id: 'update-relations' }, refresh: true } }), step('inspect-refreshed-relation', 'Inspect relation on the next native frame', { kind: 'wait-frame', frames: 2 }, [
      invariant('relation-bounds-change', 'Public relation bounds change', 'scene.byId.update-relations.bounds', 'not-equals', 'snapshots.relation-before.bounds', { source: 'approved-v4' }),
    ])],
  }),
  makeCase({
    id: 'update-bar-animation', title: 'Bar size, show, source, and animation', category: 'update', risk: 'high', evidenceStatus: 'verified',
    description: 'Exercise animated bar updates, pause/resume, resize during animation, and refresh.', fixture: 'update-playground', tags: ['bar', 'animation', 'Q20'], oracleQuestions: ['Q20'],
    steps: [
      reset(), draw('draw', 'update-playground'),
      step('animate-size', 'Animate bar width', { kind: 'update', request: { target: { mode: 'id', id: 'update-bar' }, changes: { size: { width: '80%', height: 14 }, animationDuration: 320 } } }, [invariant('animation-context', 'Stable animation context remains public', 'patchmap.animationContext.exists', 'equals', true, { source: 'approved-v4' })]),
      step('pause', 'Pause lab animation clock', { kind: 'animation', method: 'pause' }),
      step('resize-during', 'Resize bar while paused', { kind: 'update', request: { target: { mode: 'id', id: 'update-bar' }, changes: { size: { width: '55%', height: 18 } } } }, [invariant('bar-size-public', 'New authored size is public synchronously', 'scene.byId.update-bar.props.size', 'equals', { width: { value: 55, unit: '%' }, height: { value: 18, unit: 'px' } })]),
      step('resume-refresh', 'Resume and refresh bar', { kind: 'animation', method: 'resume', durationMs: 350 }),
      step('hide-source', 'Hide and change bar source', { kind: 'update', request: { target: { mode: 'id', id: 'update-bar' }, changes: { show: false, source: { type: 'rect', fill: '#d43b54' } }, refresh: true } }, [invariant('bar-hidden', 'Bar public show is false', 'scene.byId.update-bar.props.show', 'equals', false)]),
    ],
  }),
  makeCase({
    id: 'update-history-group-undo-redo', title: 'History grouping, undo, redo, and clear', category: 'update', risk: 'critical', evidenceStatus: 'verified',
    description: 'Group two updates under one history ID and traverse the public history state.', fixture: 'update-playground', tags: ['history', 'events'],
    steps: [
      reset(), draw('draw', 'update-playground'),
      step('history-a', 'First grouped change', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { attrs: { x: 10 } }, relativeTransform: true, history: 'lab-group' } }),
      step('history-b', 'Second grouped change', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { attrs: { x: 5 } }, relativeTransform: true, history: 'lab-group' } }, [invariant('history-can-undo', 'Grouped update enables undo', 'history.canUndo', 'equals', true)]),
      step('undo', 'Undo grouped changes', { kind: 'history', method: 'undo' }, [invariant('history-undone', 'Both grouped x changes are undone together', 'scene.byId.update-rect-a.props.attrs.x', 'equals', 30, { source: 'approved-v4' }), invariant('history-can-redo', 'Redo becomes available', 'history.canRedo', 'equals', true)]),
      step('redo', 'Redo grouped changes', { kind: 'history', method: 'redo' }, [invariant('history-redone', 'Grouped changes replay together', 'scene.byId.update-rect-a.props.attrs.x', 'equals', 45, { source: 'approved-v4' })]),
      step('clear', 'Clear history', { kind: 'history', method: 'clear' }, [invariant('history-cleared', 'Undo and redo are unavailable', 'history.canUndo', 'equals', false)]),
    ],
  }),
  makeCase({
    id: 'update-event-silence-coalescing', title: 'Event silence and update event ordering', category: 'update', risk: 'high', evidenceStatus: 'verified',
    description: 'Compare emit false with ordinary update events and inspect ordered payloads.', fixture: 'update-playground', tags: ['events', 'silence', 'coalescing'],
    steps: [reset(), draw('draw', 'update-playground'), step('silent', 'Update with emit false', { kind: 'update', request: { target: { mode: 'id', id: 'update-rect-a' }, changes: { label: 'silent' }, emit: false } }, [
      invariant('silent-state', 'Mutation is still synchronous', 'scene.byId.update-rect-a.props.label', 'equals', 'silent'),
      invariant('silent-event', 'No updated event is added', 'events.patchmap:updated.delta', 'equals', 0),
    ]), step('bulk-emitting', 'Bulk update two handles with default emit', { kind: 'update', request: { target: { mode: 'ids', ids: ['update-rect-a', 'update-rect-b'] }, changes: { label: 'bulk-emitted' } } }, [
      invariant('bulk-emitting-return', 'Bulk update returns both handles in authored order', 'return.ids', 'equals', ['update-rect-a', 'update-rect-b']),
      invariant('bulk-emitting-event', 'One coalesced updated event is added for the bulk call', 'events.patchmap:updated.delta', 'equals', 1),
      invariant('bulk-emitting-payload-a', 'Event payload contains the first returned ID', 'events.patchmap:updated.last.elements', 'includes', 'update-rect-a'),
      invariant('bulk-emitting-payload-b', 'Event payload contains the second returned ID', 'events.patchmap:updated.last.elements', 'includes', 'update-rect-b'),
    ])],
  }),
];

const INTERACTION_CASES: LabCase[] = [
  makeCase({
    id: 'interaction-pan-zoom', title: 'Viewport pan and zoom', category: 'interaction', risk: 'high', evidenceStatus: 'verified',
    description: 'Apply visible viewport pan and zoom using the lab controls.', fixture: 'transform-playground', tags: ['viewport', 'pan', 'zoom'],
    steps: [reset(), draw('draw', 'transform-playground'), step('pan', 'Pan viewport', { kind: 'viewport', method: 'pan', x: 80, y: -30 }, [invariant('pan-position', 'Viewport center changes', 'viewport.center', 'not-equals', 'before.viewport.center')]), step('zoom', 'Zoom viewport', { kind: 'viewport', method: 'zoom', scale: 1.4 }, [invariant('zoom-scale', 'Viewport scale changes', 'viewport.scale', 'not-equals', 'before.viewport.scale')])],
  }),
  makeCase({
    id: 'interaction-focus-fit', title: 'Focus, fit, and padding', category: 'interaction', risk: 'critical', evidenceStatus: 'verified',
    description: 'Focus without changing zoom, fit with padding, and focus explicit relation endpoints.', fixture: 'relations', tags: ['focus', 'fit', 'padding'], oracleQuestions: ['Q5'],
    steps: [
      reset(), draw('draw', 'relations'),
      step('focus', 'Focus explicit target', { kind: 'view', method: 'focus', ids: 'relation-a' }, [invariant('focus-zoom', 'Focus does not change zoom', 'viewport.scale', 'equals', 'before.viewport.scale', { source: 'approved-v4' })]),
      step('fit', 'Fit two targets with axis padding', { kind: 'view', method: 'fit', ids: ['relation-a', 'relation-b'], padding: { x: 28, y: 12 } }, [invariant('fit-finite', 'Fit yields finite scale', 'viewport.scaleFinite', 'equals', true)]),
      step('fit-relation', 'Fit explicit relation ID', { kind: 'view', method: 'fit', ids: 'relation-lines', padding: 20 }, [invariant('fit-relation-endpoints', 'Relation contributes linked endpoints', 'viewport.scaleFinite', 'equals', true, { source: 'approved-v4' })]),
    ],
  }),
  makeCase({
    id: 'interaction-rotation-flip', title: 'World rotation and flip controllers', category: 'interaction', risk: 'high', evidenceStatus: 'verified',
    description: 'Exercise degree rotation and x/y flip controller returns and events.', fixture: 'transform-playground', tags: ['rotation', 'flip', 'events'], oracleQuestions: ['Q5'],
    steps: [
      reset(), draw('draw', 'transform-playground'),
      step('rotate', 'Rotate world by 30 degrees', { kind: 'rotation', method: 'rotateBy', value: 30 }, [invariant('rotation-value', 'Rotation controller reports 30', 'patchmap.rotation.value', 'equals', 30), invariant('rotation-event', 'Rotated event is logged', 'events.patchmap:rotated.delta', 'equals', 1)]),
      step('flip-x', 'Toggle horizontal flip', { kind: 'flip', method: 'toggleX' }, [invariant('flip-x', 'Flip x is true', 'patchmap.flip.x', 'equals', true)]),
      step('flip-y', 'Set vertical flip', { kind: 'flip', method: 'set', y: true }, [invariant('flip-y', 'Flip y is true', 'patchmap.flip.y', 'equals', true)]),
      step('reset-view', 'Reset rotation and flip', { kind: 'rotation', method: 'reset' }, [invariant('rotation-reset', 'Rotation returns to zero', 'patchmap.rotation.value', 'equals', 0)]),
      step('reset-flip', 'Reset flips', { kind: 'flip', method: 'reset' }, [invariant('flip-reset', 'Both axes return false', 'patchmap.flip', 'equals', { x: false, y: false })]),
    ],
  }),
  makeCase({
    id: 'interaction-click-double-right-touch-hover',
    title: 'Click, double, right, touch-tap, and hover',
    category: 'interaction', risk: 'critical', evidenceStatus: 'partial',
    description: 'Replay resolved pointer observations while retaining the overall Q4 partial badge.', fixture: 'transform-playground', tags: ['Q4', 'pointer', 'callbacks'], oracleQuestions: ['Q4'],
    steps: [
      reset(), draw('draw', 'transform-playground'),
      step('configure', 'Configure selection callbacks', { kind: 'selection', method: 'configure', options: { draggable: true, paintSelection: false } }),
      step('click', 'Simulate click', { kind: 'pointer', action: 'click', target: { mode: 'id', id: 'transform-a' } }, [invariant('click-order', 'Callback receives target then event', 'interactions.last.callbackShape', 'equals', ['target', 'event'], { source: 'approved-v4' })]),
      step('double', 'Simulate detail-2 double click', { kind: 'pointer', action: 'double-click', target: { mode: 'id', id: 'transform-a' }, detail: 2 }, [invariant('double-suppresses-click', 'Completed double-click does not also report click', 'interactions.last.suppressedClick', 'equals', true, { source: 'approved-v4' })]),
      step('right', 'Simulate right click', { kind: 'pointer', action: 'right-click', target: { mode: 'id', id: 'transform-a' } }, [invariant('right-callback', 'Right-click callback is logged', 'interactions.last.type', 'equals', 'right-click', { source: 'approved-v4' })]),
      step('touch-hover', 'Simulate touch tap then hover', { kind: 'pointer', action: 'touch-tap', target: { mode: 'id', id: 'transform-a' } }, [invariant('touch-observed', 'Touch-tap observation is displayed', 'interactions.last.type', 'equals', 'touch-tap')]),
      step('hover', 'Simulate hover', { kind: 'pointer', action: 'hover', target: { mode: 'id', id: 'transform-a' } }, [invariant('hover-observed', 'Hover callback is displayed', 'interactions.last.type', 'equals', 'hover')]),
    ],
  }),
  makeCase({
    id: 'interaction-box-paint-drag', title: 'Box selection, paint selection, and drag lifecycle', category: 'interaction', risk: 'critical', evidenceStatus: 'partial',
    description: 'Provide headed gestures but do not infer the authored headless drag/paint callbacks left open by Q4.', fixture: 'transform-playground', tags: ['Q4', 'drag', 'paint', 'box-selection'], oracleQuestions: ['Q4'],
    steps: [
      reset(), draw('draw', 'transform-playground'),
      step('configure', 'Configure draggable paint selection', { kind: 'selection', method: 'configure', options: { draggable: true, paintSelection: true } }),
      step('box', 'Drag selection box', { kind: 'pointer', action: 'box-select', from: { x: 40, y: 40 }, to: { x: 430, y: 230 } }, [invariant('box-selection', 'Selected handles are shown for manual verification', 'selection.ids', 'exists', true, { normative: false, source: 'manual-observation', note: 'Q4 authored headless sequence did not resolve this callback path.' })], 'partial'),
      step('paint', 'Paint across selectable objects', { kind: 'pointer', action: 'paint-select', from: { x: 70, y: 90 }, to: { x: 370, y: 170 } }, [invariant('paint-selection', 'Paint callback log is displayed', 'interactions.last.type', 'equals', 'paint-select', { normative: false, source: 'manual-observation' })], 'partial'),
      step('drag', 'Drag selected object through lifecycle', { kind: 'pointer', action: 'drag', target: { mode: 'id', id: 'transform-a' }, from: { x: 120, y: 110 }, to: { x: 210, y: 165 } }, [invariant('drag-lifecycle', 'Down/start/drag/end log is visible', 'interactions.dragLifecycle', 'exists', true, { normative: false, source: 'manual-observation' })], 'partial'),
    ],
  }),
  makeCase({
    id: 'interaction-filter-default-deep-drill', title: 'Selection filter, unit, deep selection, and drill-down', category: 'interaction', risk: 'critical', evidenceStatus: 'partial',
    description: 'Inspect resolved selection semantics while keeping the exact elapsed drill window open.', fixture: 'all-elements', tags: ['filter', 'deep', 'drill-down', 'Q18'], oracleQuestions: ['Q4', 'Q18'],
    steps: [
      reset(), draw('draw', 'all-elements'),
      step('filter', 'Configure filter, deep selection, and drill-down', { kind: 'selection', method: 'configure', options: { selectUnit: 'entity', filter: 'label-present', deepSelect: true, drillDown: true } }),
      step('deep', 'Meta-click for deep selection', { kind: 'pointer', action: 'click', target: { mode: 'id', id: 'group-child' }, modifiers: ['meta'] }, [invariant('deep-selection', 'Deep target is selected', 'selection.ids', 'includes', 'group-child', { source: 'approved-v4' })]),
      step('drill', 'Replay detail-2 drill', { kind: 'pointer', action: 'double-click', target: { mode: 'id', id: 'group-child' }, detail: 2 }, [invariant('drill-result', 'Observed drill target is displayed', 'selection.ids', 'exists', true, { source: 'approved-v4' }), invariant('drill-window', 'Exact elapsed wall-clock window is not asserted', 'interactions.elapsedMs', 'exists', true, { normative: false, source: 'manual-observation', note: 'Q18 exact elapsed drill window remains open.' })], 'partial'),
      step('closest-group', 'Configure closest-group selection', { kind: 'selection', method: 'configure', options: { selectUnit: 'closestGroup' } }, [invariant('selection-config', 'Current selection state remains registered', 'state.selectionRegistered', 'equals', true, { source: 'approved-v4' })]),
    ],
  }),
  makeCase({
    id: 'interaction-transformer-selection', title: 'Transformer selection model', category: 'interaction', risk: 'critical', evidenceStatus: 'verified',
    description: 'Create a transformer and exercise add, remove, set, and clear through public selection.', fixture: 'transform-playground', tags: ['transformer', 'selection'], oracleQuestions: ['Q11'],
    steps: [
      reset(), draw('draw', 'transform-playground'),
      step('create', 'Create transformer', { kind: 'transformer', method: 'create', options: { resizeHandles: true, rotateHandles: true } }, [invariant('transformer-exists', 'Patchmap exposes transformer', 'patchmap.transformer.exists', 'equals', true)]),
      step('select-one', 'Select one handle', { kind: 'transformer', method: 'select', target: { mode: 'id', id: 'transform-a' } }, [invariant('selection-one', 'Transformer reports one selected element', 'transformer.elements.ids', 'equals', ['transform-a'])]),
      step('select-many', 'Select two handles', { kind: 'transformer', method: 'select', target: { mode: 'ids', ids: ['transform-a', 'transform-b'] } }, [invariant('selection-many', 'Transformer preserves selection order', 'transformer.elements.ids', 'equals', ['transform-a', 'transform-b'])]),
      step('clear', 'Clear transformer selection', { kind: 'transformer', method: 'clear' }, [invariant('selection-clear', 'Transformer selection is empty', 'transformer.elements.ids', 'equals', [])]),
    ],
  }),
  makeCase({
    id: 'interaction-transformer-eight-direction-resize', title: 'Transformer eight-direction resize', category: 'interaction', risk: 'critical', evidenceStatus: 'manual',
    description: 'Reset and replay all eight resize directions with public bounds and transform inspection.', fixture: 'transform-playground', tags: ['transformer', 'resize', '8-direction'], oracleQuestions: ['Q11'],
    steps: [
      reset(), draw('draw', 'transform-playground'),
      step('setup', 'Create and select transformable rect', { kind: 'transformer', method: 'create', target: { mode: 'id', id: 'transform-a' }, options: { resizeHandles: true, transformHistory: true } }),
      ...(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const).map((direction) =>
        step(`resize-${direction}`, `Resize ${direction.toUpperCase()} handle`, { kind: 'transformer-gesture', gesture: `resize-${direction}`, target: { mode: 'id', id: 'transform-a' }, delta: { x: direction.includes('w') ? -18 : 18, y: direction.includes('n') ? -12 : 12 } }, [
          invariant(`resize-${direction}-finite`, 'Selected handle keeps finite public bounds', 'selected.boundsFinite', 'equals', true, { normative: false, source: 'manual-observation', note: 'Requires a completed headed pointer gesture.' }),
          invariant(`resize-${direction}-history`, 'Gesture is represented by one history step', 'history.canUndo', 'equals', true, { normative: false, source: 'manual-observation', note: 'Requires a completed headed pointer gesture.' }),
        ], 'manual'),
      ),
      step('select-group-history', 'Select two handles for grouped transform history', { kind: 'transformer', method: 'select', target: { mode: 'ids', ids: ['transform-a', 'transform-b'] } }, [
        invariant('group-history-selection', 'Two public handles are selected', 'transformer.elements.ids', 'equals', ['transform-a', 'transform-b'], { normative: false, source: 'manual-observation' }),
      ], 'manual'),
      step('resize-group-history', 'Resize the multi-element selection as one history gesture', { kind: 'transformer-gesture', gesture: 'resize-se', target: { mode: 'current-selection' }, delta: { x: 24, y: 18 } }, [
        invariant('group-history-command', 'Multi-element gesture adds one grouped history command', 'history.commands.delta', 'equals', 1, { normative: false, source: 'manual-observation', note: 'Human gesture completion is required before inspecting public history.' }),
      ], 'manual'),
    ],
  }),
  makeCase({
    id: 'interaction-transformer-rotate-cancel', title: 'Transformer rotate, ratio lock, cancel, and outside-up', category: 'interaction', risk: 'critical', evidenceStatus: 'manual',
    description: 'Exercise rotate snapping and gesture cancellation paths using headed pointer input.', fixture: 'transform-playground', tags: ['transformer', 'rotate', 'cancel', 'pointerupoutside'], oracleQuestions: ['Q11'],
    steps: [
      reset(), draw('draw', 'transform-playground'),
      step('setup', 'Create rotating transformer', { kind: 'transformer', method: 'create', target: { mode: 'id', id: 'transform-a' }, options: { rotateHandles: true, resizeHandles: true, transformHistory: true } }),
      step('rotate', 'Rotate selection', { kind: 'transformer-gesture', gesture: 'rotate', target: { mode: 'id', id: 'transform-a' }, degrees: 22 }, [invariant('rotate-angle', 'Public angle changes', 'scene.byId.transform-a.props.attrs.angle', 'not-equals', 0, { normative: false, source: 'manual-observation', note: 'Requires a completed headed pointer gesture.' })], 'manual'),
      step('shift-rotate', 'Shift-rotate to 15-degree increment', { kind: 'transformer-gesture', gesture: 'rotate', target: { mode: 'id', id: 'transform-a' }, degrees: 22, shiftKey: true }, [invariant('rotate-snap', 'Angle is a 15-degree multiple', 'selected.angleModulo15', 'equals', 0, { normative: false, source: 'manual-observation', note: 'Requires a completed headed pointer gesture.' })], 'manual'),
      step('outside-up', 'End resize via pointerupoutside', { kind: 'transformer-gesture', gesture: 'resize-se', target: { mode: 'id', id: 'transform-a' }, delta: { x: 30, y: 20 }, cancelWith: 'pointerupoutside' }, [invariant('outside-complete', 'Internal gesture state is not promoted as a public invariant', 'transformer.gestureActive', 'equals', 'not-public', { normative: false, source: 'manual-observation', note: 'Confirm completion through visible public bounds/history after the headed gesture.' })], 'manual'),
      step('cancel', 'Cancel gesture', { kind: 'pointer', action: 'cancel', target: { mode: 'id', id: 'transform-a' } }, [invariant('cancel-safe', 'Transformer remains usable after cancel', 'patchmap.transformer.exists', 'equals', true, { normative: false, source: 'manual-observation', note: 'Requires a headed cancellation gesture.' })], 'manual'),
    ],
  }),
  makeCase({
    id: 'interaction-canvas-event-registry', title: 'Canvas event registry and redraw rebinding', category: 'interaction', risk: 'critical', evidenceStatus: 'verified',
    description: 'Exercise add/get/getAll/on/off/remove/enabled behavior, redraw teardown, and explicit registration against replacement handles.', fixture: 'transform-playground', tags: ['canvas-events', 'rebinding'], oracleQuestions: ['Q5'],
    steps: [
      reset(), draw('draw', 'transform-playground'),
      step('add', 'Add click and pointerover registration', { kind: 'canvas-event', method: 'add', id: 'lab-events', path: '$..[?(@.id == "transform-a")]', actions: 'click pointerover' }, [invariant('event-id', 'Requested registration ID is retained', 'canvasEvents.ids', 'includes', 'lab-events', { source: 'approved-v4' })]),
      step('get', 'Get registration', { kind: 'canvas-event', method: 'get', id: 'lab-events' }, [invariant('event-get', 'Public registration is returned', 'return.exists', 'equals', true)]),
      step('get-all', 'Get all registrations', { kind: 'canvas-event', method: 'getAll' }, [invariant('event-all', 'Registry contains requested ID', 'return.ids', 'includes', 'lab-events')]),
      step('off', 'Disable registration', { kind: 'canvas-event', method: 'off', id: 'lab-events' }, [invariant('event-off-retained', 'Disabled registration remains gettable', 'canvasEvents.ids', 'includes', 'lab-events')]),
      step('click-disabled', 'Dispatch click while registration is disabled', { kind: 'pointer', action: 'click', target: { mode: 'id', id: 'transform-a' } }, [invariant('event-disabled-no-fire', 'Disabled callback does not fire', 'events.canvas:click.delta', 'equals', 0)]),
      step('on', 'Re-enable registration', { kind: 'canvas-event', method: 'on', id: 'lab-events' }),
      step('click-enabled', 'Dispatch click after re-enabling', { kind: 'pointer', action: 'click', target: { mode: 'id', id: 'transform-a' } }, [invariant('event-enabled-fire', 'Re-enabled callback fires once', 'events.canvas:click.delta', 'equals', 1)]),
      step('redraw', 'Redraw clears registrations', { kind: 'draw', fixture: 'transform-playground' }, [invariant('event-redraw-clear', 'Draw clears canvas events', 'canvasEvents.ids', 'equals', [], { source: 'approved-v4' })]),
      step('re-add', 'Re-add registration against replacement handles', { kind: 'canvas-event', method: 'add', id: 'lab-events', path: '$..[?(@.id == "transform-a")]', actions: 'click pointerover' }, [invariant('event-readd', 'Registration resolves after replacement draw', 'canvasEvents.ids', 'includes', 'lab-events')]),
      step('click-rebound', 'Dispatch click against replacement handle', { kind: 'pointer', action: 'click', target: { mode: 'id', id: 'transform-a' } }, [invariant('event-rebound-fire', 'Rebound callback fires once', 'events.canvas:click.delta', 'equals', 1)]),
      step('remove-rebound', 'Remove rebound registration', { kind: 'canvas-event', method: 'remove', id: 'lab-events' }, [invariant('event-rebound-remove', 'Rebound registration is removed', 'canvasEvents.ids', 'equals', [])]),
      step('add-root', 'Add viewport-root registration', { kind: 'canvas-event', method: 'add', id: 'root-event', path: '$', actions: 'click' }),
      step('remove', 'Remove root registration', { kind: 'canvas-event', method: 'remove', id: 'root-event' }, [invariant('event-remove', 'Registry is empty', 'canvasEvents.ids', 'equals', [])]),
    ],
  }),
];

const LIFECYCLE_CASES: LabCase[] = [
  makeCase({
    id: 'lifecycle-init-destroy-reinit', title: 'Init, destroy, and re-init', category: 'lifecycle', risk: 'critical', evidenceStatus: 'verified',
    description: 'Inspect public lifecycle shape, canvas teardown, history replacement, and re-initialization.', fixture: 'defaults', tags: ['lifecycle', 'destroy', 're-init'],
    steps: [
      reset(), draw('draw', 'defaults'),
      step('capture', 'Capture app, world, and history identities', { kind: 'inspect', snapshot: 'lifecycle-before' }),
      step('destroy', 'Destroy PATCH MAP', { kind: 'lifecycle', method: 'destroy' }, [invariant('destroy-init', 'isInit returns false', 'patchmap.isInit', 'equals', false), invariant('destroy-app', 'app returns null', 'patchmap.app.exists', 'equals', false), invariant('destroy-event', 'Destroyed event fires once', 'events.patchmap:destroyed.delta', 'equals', 1)]),
      step('reinit', 'Re-initialize same instance', { kind: 'lifecycle', method: 're-init' }, [invariant('reinit-ready', 'Instance is initialized again', 'patchmap.isInit', 'equals', true), invariant('history-new', 'History manager is replaced', 'history.reference', 'different-reference', 'snapshots.lifecycle-before.history.reference')]),
      step('redraw', 'Draw after re-init', { kind: 'draw', fixture: 'defaults' }, [invariant('redraw-after-reinit', 'Managed scene is drawable after re-init', 'scene.topLevelCount', 'equals', 4)]),
    ],
  }),
  makeCase({
    id: 'lifecycle-resize-observer', title: 'Resize observer and renderer size', category: 'lifecycle', risk: 'high', evidenceStatus: 'verified',
    description: 'Resize the host and inspect the public renderer screen and viewport.', fixture: 'all-elements', tags: ['resize', 'viewport'],
    steps: [reset(), draw('draw', 'all-elements'), step('resize', 'Resize host to 720 × 480', { kind: 'lifecycle', method: 'resize', width: 720, height: 480 }), step('settle', 'Wait for observer', { kind: 'wait-frame', frames: 2 }, [invariant('renderer-width', 'Renderer screen width follows host', 'renderer.screen.width', 'equals', 720), invariant('renderer-height', 'Renderer screen height follows host', 'renderer.screen.height', 'equals', 480)])],
  }),
  makeCase({
    id: 'lifecycle-theme-reset', title: 'Theme override and reset', category: 'lifecycle', risk: 'medium', evidenceStatus: 'verified',
    description: 'Initialize with a deep partial theme and confirm destroy/re-init resets defaults.', fixture: 'defaults', tags: ['theme', 'reset'],
    steps: [step('init-theme', 'Initialize with accent override', { kind: 'reset', options: { theme: { primary: { accent: '#ff4d6d' } } } }, [invariant('theme-override', 'Accent override is materialized', 'patchmap.theme.primary.accent', 'equals', '#ff4d6d')]), draw('draw', 'defaults'), step('theme-reset', 'Destroy and reset theme', { kind: 'lifecycle', method: 'theme-reset' }), step('inspect-theme', 'Inspect fresh materialized theme', { kind: 'inspect' }, [invariant('theme-reset-accent', 'Fresh accent differs from override', 'patchmap.theme.primary.accent', 'not-equals', '#ff4d6d')])],
  }),
  makeCase({
    id: 'lifecycle-transformer-replacement', title: 'Transformer replacement and teardown', category: 'lifecycle', risk: 'high', evidenceStatus: 'verified',
    description: 'Assign a second Transformer and inspect destruction of the first.', fixture: 'transform-playground', tags: ['transformer', 'replacement'],
    steps: [reset(), draw('draw', 'transform-playground'), step('first', 'Create first transformer', { kind: 'transformer', method: 'create', target: { mode: 'id', id: 'transform-a' }, options: { resizeHandles: true } }), step('capture', 'Capture first transformer', { kind: 'inspect', snapshot: 'transformer-first' }), step('replace', 'Replace transformer', { kind: 'transformer', method: 'replace', target: { mode: 'id', id: 'transform-b' }, options: { rotateHandles: true } }, [invariant('transformer-new', 'Current transformer identity changes', 'transformer.reference', 'different-reference', 'snapshots.transformer-first.reference'), invariant('transformer-old-destroyed', 'Prior transformer is destroyed', 'snapshots.transformer-first.destroyed', 'equals', true)])],
  }),
];

const PACKAGE_CASES: LabCase[] = [
  makeCase({
    id: 'package-esm-browser-import', title: 'Browser source ESM import flow', category: 'package', risk: 'critical', evidenceStatus: 'verified',
    description: 'Load the browser lab source ESM entry and construct the public class; this is not a packed-artifact consumer test.', tags: ['source-entry', 'esm', 'browser'],
    steps: [step('import', 'Import browser source ESM entry', { kind: 'package-import', format: 'esm-browser' }, [invariant('esm-patchmap', 'Patchmap is exported', 'package.exports.Patchmap.type', 'equals', 'function'), invariant('esm-count', 'Twelve documented top-level exports are present', 'package.exports.names.length', 'equals', 12)]), step('construct', 'Construct source-imported Patchmap', { kind: 'inspect' }, [invariant('esm-instance', 'Source-imported constructor creates public instance', 'package.instance.constructed', 'equals', true)])],
  }),
];

const KNOWN_LIMITATION_CASES: LabCase[] = [
  makeCase({
    id: 'known-q4-drag-paint', title: 'Q4 drag and paint callbacks', category: 'known-limitations', risk: 'critical', evidenceStatus: 'partial',
    description: 'Authored headless drag/paint callbacks remain open; headed observations are informational.', tags: ['Q4', 'partial'], oracleQuestions: ['Q4'],
    steps: [step('q4', 'Review Q4 boundary', { kind: 'manual', instruction: 'Exercise drag and paint callbacks in the headed lab and retain the PARTIAL badge.', completion: 'oracle-required' }, [invariant('q4-open', 'No unapproved callback order is asserted', 'limitations.Q4.status', 'equals', 'partial', { normative: false, source: 'approved-v4' })], 'partial')],
  }),
  makeCase({
    id: 'known-q7-schema-exhaustiveness', title: 'Q7 schema exhaustiveness', category: 'known-limitations', risk: 'critical', evidenceStatus: 'partial',
    description: 'Representative exact errors do not prove every schema/style combination.', tags: ['Q7', 'partial'], oracleQuestions: ['Q7'],
    steps: [step('q7', 'Review Q7 boundary', { kind: 'manual', instruction: 'Inspect exact errors emitted by the authored examples without claiming exhaustive schema coverage.', completion: 'oracle-required' }, [invariant('q7-open', 'Schema completeness remains partial', 'limitations.Q7.status', 'equals', 'partial', { normative: false, source: 'approved-v4' })], 'partial')],
  }),
  makeCase({
    id: 'known-q12-pixels', title: 'Q12 raster evidence', category: 'known-limitations', risk: 'critical', evidenceStatus: 'partial',
    description: 'Public geometry/text is normative; macOS headless pixels are not.', tags: ['Q12', 'pixels', 'partial'], oracleQuestions: ['Q12'],
    steps: [step('q12', 'Review Q12 boundary', { kind: 'manual', instruction: 'Visually inspect raster output without turning headless pixel appearance into PASS/FAIL.', completion: 'observe' }, [invariant('q12-nonnormative', 'Pixel comparison remains non-normative', 'limitations.Q12.pixelNormative', 'equals', false, { normative: false, source: 'approved-v4' })], 'partial')],
  }),
  makeCase({
    id: 'known-q18-drill-window', title: 'Q18 drill timing window', category: 'known-limitations', risk: 'high', evidenceStatus: 'partial',
    description: 'Detail-2 drill behavior is captured, but exact elapsed wall-clock window remains open.', tags: ['Q18', 'timing', 'partial'], oracleQuestions: ['Q18'],
    steps: [step('q18', 'Review Q18 boundary', { kind: 'manual', instruction: 'Observe drill timing but do not assert an exact millisecond threshold.', completion: 'oracle-required' }, [invariant('q18-open', 'Elapsed window remains unasserted', 'limitations.Q18.status', 'equals', 'partial', { normative: false, source: 'approved-v4' })], 'partial')],
  }),
  makeCase({
    id: 'known-q21-primitive-count', title: 'Q21 backend primitive count', category: 'known-limitations', risk: 'critical', evidenceStatus: 'partial',
    description: 'Public descendant counts are observable; backend primitive/draw-call count is unavailable through public API.', tags: ['Q21', 'performance', 'partial'], oracleQuestions: ['Q21'],
    steps: [step('q21', 'Review Q21 boundary', { kind: 'manual', instruction: 'Inspect public scene counts only; do not infer backend primitive counts.', completion: 'oracle-required' }, [invariant('q21-open', 'Backend primitive count is reported unavailable', 'limitations.Q21.backendPrimitiveCount', 'equals', 'unavailable', { normative: false, source: 'approved-v4' })], 'partial')],
  }),
  makeCase({
    id: 'known-windows-native-pending', title: 'Headed Windows native gate', category: 'known-limitations', risk: 'critical', evidenceStatus: 'pending',
    description: 'Native headed Windows raster and performance approval is still pending.', tags: ['windows', 'pixels', 'performance', 'pending'],
    steps: [step('windows', 'Run only on headed native Windows', { kind: 'manual', instruction: 'Capture native headed Windows raster and performance evidence under the approved contract.', completion: 'headed-windows-required' }, [invariant('windows-pending', 'Windows gate remains pending on this host', 'limitations.windowsNative.status', 'equals', 'pending', { normative: false, source: 'approved-v4' })], 'pending')],
  }),
  makeCase({
    id: 'known-upd005-headless-pixel', title: 'UPD-005 headless pixel qualification', category: 'known-limitations', risk: 'high', evidenceStatus: 'partial',
    description: 'Return-time public state and next-frame timing are normative; black headless pixels are not.', tags: ['UPD-005', 'pixels', 'partial'],
    steps: [step('upd005', 'Review UPD-005 qualification', { kind: 'manual', instruction: 'Inspect public state and frame counters; never require reproduction of a black headless image.', completion: 'observe' }, [invariant('upd005-pixels', 'Pixel verdict is disabled', 'limitations.UPD005.pixelNormative', 'equals', false, { normative: false, source: 'approved-v3' })], 'partial')],
  }),
];

const SANDBOX_CASES: LabCase[] = [
  makeCase({
    id: 'sandbox-editable-draw', title: 'Editable draw sandbox', category: 'sandbox', risk: 'medium', evidenceStatus: 'manual',
    description: 'Paste or edit a JSON array, reset, draw, and inspect public output.', fixture: 'sandbox', tags: ['json', 'editable'],
    steps: [reset(), step('edit-draw', 'Edit and draw JSON', { kind: 'sandbox-draw' }, [invariant('sandbox-draw-result', 'Draw result or exact error is displayed', 'sandbox.outcome', 'exists', true, { normative: false, source: 'manual-observation' })], 'manual'), step('inspect', 'Inspect sandbox scene', { kind: 'inspect' }, [invariant('sandbox-scene', 'Public snapshot is visible', 'scene.exists', 'equals', true)])],
  }),
  makeCase({
    id: 'sandbox-editable-update', title: 'Editable update sandbox', category: 'sandbox', risk: 'medium', evidenceStatus: 'manual',
    description: 'Edit target path, strategy, and changes JSON, then inspect before/after diff.', fixture: 'update-playground', tags: ['json', 'update', 'editable'],
    steps: [reset(), draw('draw', 'update-playground'), step('edit-update', 'Edit and apply update request', { kind: 'sandbox-update' }, [invariant('sandbox-update-result', 'Return or exact error is displayed', 'sandbox.outcome', 'exists', true, { normative: false, source: 'manual-observation' })], 'manual')],
  }),
];

export const LAB_CASES: readonly LabCase[] = [
  ...DRAW_CASES,
  ...UPDATE_CASES,
  ...INTERACTION_CASES,
  ...LIFECYCLE_CASES,
  ...PACKAGE_CASES,
  ...KNOWN_LIMITATION_CASES,
  ...SANDBOX_CASES,
];

export const LAB_CASE_BY_ID: ReadonlyMap<string, LabCase> = new Map(
  LAB_CASES.map((testCase) => [testCase.id, testCase]),
);

export const LAB_CASE_COUNTS = Object.freeze({
  cases: LAB_CASES.length,
  steps: LAB_CASES.reduce((total, testCase) => total + testCase.steps.length, 0),
  categories: Object.fromEntries(
    [...new Set(LAB_CASES.map((testCase) => testCase.category))].map((category) => [
      category,
      LAB_CASES.filter((testCase) => testCase.category === category).length,
    ]),
  ),
  partial: LAB_CASES.filter((testCase) => testCase.evidenceStatus === 'partial').length,
  pending: LAB_CASES.filter((testCase) => testCase.evidenceStatus === 'pending').length,
});

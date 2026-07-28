import {
  createNotImplementedCoreV2ContractLabBridge,
  type CoreV2ContractLabBridgeV1,
} from './bridge';
import { createCoreV2ExecutableLabBridge } from './executable-bridge';
import { isCoreV2ExecutableCaseId } from './executable-cases';
import { CORE_V2_CONTRACT_PRESENTERS } from './presenters';
import {
  buildCoreV2ContractRoute,
  CORE_V2_CONTRACT_DATASET_SIZES,
  CoreV2ContractRouteError,
  parseCoreV2ContractSeed,
  parseCoreV2ContractRoute,
  type CoreV2ContractRoute,
} from './route';
import {
  mountCoreV2ManualWorkbench,
  renderCoreV2ManualWorkbench,
  type CoreV2ManualLabBridge,
} from '../interactive/manual-workbench';

declare global {
  interface Window {
    __PATCH_MAP_CORE_V2_CONTRACT_LAB__?: CoreV2ContractLabBridgeV1;
  }
}

export interface CoreV2ContractLabMount {
  readonly route: CoreV2ContractRoute | null;
  readonly bridge: CoreV2ContractLabBridgeV1 | null;
  readonly manual: CoreV2ManualLabBridge | null;
  readonly routeError: CoreV2ContractRouteError | null;
  destroy(): Promise<void>;
}

interface CoreV2ContractUiRunMetrics {
  readonly durationMs: number;
  readonly frameCount: number;
  readonly framesPerSecond: number;
  readonly maxFrameGapMs: number;
  readonly longTaskCount: number;
  readonly longTaskTotalMs: number;
}

const REN_005_SPECIMENS = Object.freeze([
  Object.freeze({ id: 'alias', label: 'Alias' }),
  Object.freeze({ id: 'url', label: 'Direct URL' }),
  Object.freeze({ id: 'descriptor', label: 'Descriptor replacement' }),
  Object.freeze({ id: 'data-uri', label: 'Data URI' }),
  Object.freeze({ id: 'transformed', label: 'Transformed shared source' }),
  Object.freeze({ id: 'hidden-image', label: 'Hidden image' }),
  Object.freeze({ id: 'failed-image', label: 'Failed placeholder' }),
]);

interface CoreV2TextInspectorChoice {
  readonly id: string;
  readonly label: string;
}

const REN_006_TEXT_CHOICES: readonly CoreV2TextInspectorChoice[] = Object.freeze([
  Object.freeze({ id: 'initial', label: 'Initial Unicode' }),
  Object.freeze({ id: 'empty', label: 'Empty text' }),
  Object.freeze({ id: 'long', label: 'Long wrapped text' }),
  Object.freeze({ id: 'missing-font', label: 'Missing-font fallback' }),
  Object.freeze({ id: 'rapid', label: 'Rapid final publication' }),
  Object.freeze({ id: 'terminal', label: 'Terminal Arabic text' }),
]);

const REN_011_TEXT_CHOICES: readonly CoreV2TextInspectorChoice[] = Object.freeze([
  Object.freeze({ id: 'placed', label: 'Placed + tinted' }),
  Object.freeze({ id: 'auto', label: 'Auto font' }),
  Object.freeze({ id: 'wrap', label: 'Wrapped' }),
  Object.freeze({ id: 'overflow-visible', label: 'Overflow visible' }),
  Object.freeze({ id: 'overflow-hidden', label: 'Overflow hidden' }),
  Object.freeze({ id: 'overflow-ellipsis', label: 'Overflow ellipsis' }),
  Object.freeze({ id: 'upright', label: 'Upright in rotated item' }),
]);

const REN_006_TEXT_FIELDS = Object.freeze([
  Object.freeze({ suffix: 'phase', label: 'Phase' }),
  Object.freeze({ suffix: 'source', label: 'Source' }),
  Object.freeze({ suffix: 'visible-text', label: 'Visible text' }),
  Object.freeze({ suffix: 'lines', label: 'Lines' }),
  Object.freeze({ suffix: 'font-runs', label: 'Font runs' }),
  Object.freeze({ suffix: 'layout-bounds', label: 'Layout bounds' }),
  Object.freeze({ suffix: 'world-bounds', label: 'World bounds' }),
  Object.freeze({ suffix: 'hit-bounds', label: 'Hit bounds' }),
  Object.freeze({ suffix: 'publication', label: 'Publication' }),
  Object.freeze({ suffix: 'intermediate-publication-count', label: 'Intermediate publications' }),
  Object.freeze({ suffix: 'stale-glyph-count', label: 'Stale glyphs' }),
  Object.freeze({ suffix: 'renderer-route', label: 'Renderer route' }),
  Object.freeze({ suffix: 'style', label: 'Paint style' }),
  Object.freeze({ suffix: 'geometry', label: 'World transform' }),
]);

const REN_011_TEXT_FIELDS = Object.freeze([
  Object.freeze({ suffix: 'specimen', label: 'Specimen' }),
  Object.freeze({ suffix: 'source', label: 'Source' }),
  Object.freeze({ suffix: 'placement', label: 'Placement' }),
  Object.freeze({ suffix: 'margin', label: 'Margin' }),
  Object.freeze({ suffix: 'tint', label: 'Authored tint' }),
  Object.freeze({ suffix: 'rgba', label: 'Projected RGBA' }),
  Object.freeze({ suffix: 'frame', label: 'Frame' }),
  Object.freeze({ suffix: 'auto-font', label: 'Auto font' }),
  Object.freeze({ suffix: 'wrap-width', label: 'Wrap width' }),
  Object.freeze({ suffix: 'overflow', label: 'Overflow' }),
  Object.freeze({ suffix: 'visible-text', label: 'Visible text' }),
  Object.freeze({ suffix: 'lines', label: 'Lines' }),
  Object.freeze({ suffix: 'layout-bounds', label: 'Layout bounds' }),
  Object.freeze({ suffix: 'item-angle', label: 'Item angle' }),
  Object.freeze({ suffix: 'orientation', label: 'Orientation' }),
  Object.freeze({ suffix: 'screen-angle', label: 'Screen angle' }),
  Object.freeze({ suffix: 'local-bounds', label: 'Placed local bounds' }),
  Object.freeze({ suffix: 'paint-tint', label: 'Renderer paint tint' }),
  Object.freeze({ suffix: 'publication', label: 'Publication' }),
  Object.freeze({ suffix: 'all-rows-exact', label: 'All rows semantically exact' }),
]);

interface CoreV2ComponentAssetPhase {
  readonly id: string;
  readonly label: string;
  readonly actionIndex: number;
  readonly productKey: 'product' | 'after';
}

const REN_008_PHASES: readonly CoreV2ComponentAssetPhase[] = Object.freeze([
  Object.freeze({ id: 'initial', label: 'A0 Rect', actionIndex: 0, productKey: 'product' }),
  Object.freeze({ id: 'image', label: 'A1 Image', actionIndex: 1, productKey: 'after' }),
  Object.freeze({ id: 'hidden', label: 'A2 Hidden', actionIndex: 2, productKey: 'after' }),
  Object.freeze({ id: 'shown', label: 'A3 Shown', actionIndex: 3, productKey: 'after' }),
]);

const REN_010_PHASES: readonly CoreV2ComponentAssetPhase[] = Object.freeze([
  Object.freeze({ id: 'initial', label: 'A0 Initial alias', actionIndex: 0, productKey: 'product' }),
  Object.freeze({ id: 'replacement', label: 'A1 Replacement alias', actionIndex: 1, productKey: 'after' }),
  Object.freeze({ id: 'tint', label: 'A2 Tint patch', actionIndex: 2, productKey: 'after' }),
]);

const COMPONENT_ASSET_RESOURCE_FIELDS = Object.freeze([
  Object.freeze({ suffix: 'canvas-count', key: 'canvasCount', label: 'Canvases' }),
  Object.freeze({ suffix: 'subscription-count', key: 'subscriptionCount', label: 'Subscriptions' }),
  Object.freeze({ suffix: 'pending-work-count', key: 'pendingWorkCount', label: 'Pending work' }),
  Object.freeze({ suffix: 'binding-count', key: 'bindingCount', label: 'Bindings' }),
  Object.freeze({ suffix: 'resource-count', key: 'resourceCount', label: 'Resources' }),
  Object.freeze({ suffix: 'lease-count', key: 'leaseCount', label: 'Leases' }),
  Object.freeze({ suffix: 'pending-settlement-count', key: 'pendingSettlementCount', label: 'Pending settlement' }),
  Object.freeze({ suffix: 'pending-release-count', key: 'pendingReleaseCount', label: 'Pending release' }),
  Object.freeze({ suffix: 'stale-attachment-resource-count', key: 'staleAttachmentCount', label: 'Stale attachments' }),
  Object.freeze({ suffix: 'renderer-object-resource-count', key: 'rendererObjectCount', label: 'Renderer objects' }),
  Object.freeze({ suffix: 'cleanup-failure-count', key: 'cleanupFailureCount', label: 'Cleanup failures' }),
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function scenarioList(route: CoreV2ContractRoute): string {
  return CORE_V2_CONTRACT_PRESENTERS.map((presenter) => {
    const href = buildCoreV2ContractRoute(presenter.caseId, route.size, route.seed);
    const selected = presenter.caseId === route.scenario;
    const searchText = `${presenter.caseId} ${presenter.title} ${presenter.priority}`.toLowerCase();
    return `<a class="contract-scenario-link${selected ? ' is-selected' : ''}" href="${href}" data-scenario-index="${escapeHtml(searchText)}"${selected ? ' aria-current="page"' : ''}><span>${presenter.caseId}</span><strong>${escapeHtml(presenter.title)}</strong><small>${presenter.priority}</small></a>`;
  }).join('');
}

function actionControls(route: CoreV2ContractRoute, executable: boolean): string {
  return route.presenter.actions.map((action) => {
    const primary = action.primaryTestId === null
      ? ''
      : ` data-testid="${action.primaryTestId}"`;
    const actionStatus = executable ? 'queued' : 'not-implemented';
    return `<div class="contract-case-action" data-testid="${action.actionTestId}" data-action-index="${action.index}" data-action-status="${actionStatus}"><span>${String(action.index + 1).padStart(2, '0')}</span><button type="button"${primary} disabled aria-disabled="true">${escapeHtml(action.label)}</button><code>${escapeHtml(action.handlerId)}</code><output data-action-result>${actionStatus}</output></div>`;
  }).join('');
}

function renderRen005Inspector(route: CoreV2ContractRoute): string {
  if (route.scenario !== 'REN-005') return '';
  const options = REN_005_SPECIMENS.map(({ id, label }) => (
    `<option value="${id}"${id === 'descriptor' ? ' selected' : ''}>${label}</option>`
  )).join('');
  return `<section class="contract-image-inspector" data-testid="ren-005-image-inspector" data-observation-status="queued" aria-labelledby="ren-005-inspector-title">
    <div class="contract-image-inspector-heading">
      <div><span class="contract-kicker">REN-005 actual observer</span><h3 id="ren-005-inspector-title">Image source and lifecycle facts</h3></div>
      <label>Specimen<select data-testid="ren-005-specimen-select">${options}</select></label>
    </div>
    <p class="contract-image-observer-note">This chooser changes only the displayed actual facts. It never adds, removes, reorders, or repeats the approved four actions.</p>
    <div class="contract-image-facts" data-testid="ren-005-selected-facts">
      <dl>
        <div><dt>Source</dt><dd data-testid="ren-005-selected-source">not observed</dd></div>
        <div><dt>Source kind</dt><dd data-testid="ren-005-selected-source-kind">not observed</dd></div>
        <div><dt>State</dt><dd data-testid="ren-005-selected-state">not observed</dd></div>
        <div><dt>Role</dt><dd data-testid="ren-005-selected-role">not observed</dd></div>
        <div><dt>World bounds</dt><dd data-testid="ren-005-selected-bounds">not observed</dd></div>
        <div><dt>Initial source</dt><dd data-testid="ren-005-selected-initial-source">not observed</dd></div>
        <div><dt>Initial state</dt><dd data-testid="ren-005-selected-initial-state">not observed</dd></div>
        <div><dt>Stale attach</dt><dd data-testid="ren-005-selected-stale-attach">not observed</dd></div>
        <div><dt>Stale completion</dt><dd data-testid="ren-005-selected-stale-completion">not observed</dd></div>
        <div><dt>Diagnostics</dt><dd data-testid="ren-005-selected-diagnostics">not observed</dd></div>
      </dl>
    </div>
    <div class="contract-image-ledger" aria-label="Image asset counters">
      <dl>
        <div><dt>Requests</dt><dd data-testid="ren-005-request-count">not observed</dd></div>
        <div><dt>Backend</dt><dd data-testid="ren-005-backend-counts">not observed</dd></div>
        <div><dt>Resources</dt><dd data-testid="ren-005-resource-count">not observed</dd></div>
        <div><dt>Leases</dt><dd data-testid="ren-005-lease-count">not observed</dd></div>
        <div><dt>Stale</dt><dd data-testid="ren-005-stale-count">not observed</dd></div>
        <div><dt>Pending release</dt><dd data-testid="ren-005-pending-release-count">not observed</dd></div>
      </dl>
      <div class="contract-request-journal">
        <h4>Request journal</h4>
        <ol data-testid="ren-005-request-journal"><li data-testid="ren-005-request-journal-empty">Run the exact case to inspect requests.</li></ol>
      </div>
    </div>
    <div class="contract-run-observer" data-testid="ren-005-run-observation">
      <div><span class="contract-kicker">Per-run main-thread observation</span><p>FPS and frame gaps use requestAnimationFrame; long tasks use the browser Long Tasks API when available.</p></div>
      <dl>
        <div><dt>Run</dt><dd data-testid="ren-005-run-index">not observed</dd></div>
        <div><dt>FPS</dt><dd data-testid="ren-005-run-fps">not observed</dd></div>
        <div><dt>Frames</dt><dd data-testid="ren-005-run-frame-count">not observed</dd></div>
        <div><dt>Max frame gap</dt><dd data-testid="ren-005-run-max-frame-gap">not observed</dd></div>
        <div><dt>Long tasks</dt><dd data-testid="ren-005-run-long-task-count">not observed</dd></div>
        <div><dt>Duration</dt><dd data-testid="ren-005-run-duration">not observed</dd></div>
      </dl>
      <ol class="contract-performance-journal" data-testid="ren-005-performance-journal"></ol>
    </div>
  </section>`;
}

function renderTextInspectorOptions(
  choices: readonly CoreV2TextInspectorChoice[],
  initiallySelectedId: string,
): string {
  return choices.map(({ id, label }) => (
    `<option value="${id}" data-observation-status="queued"${id === initiallySelectedId ? ' selected' : ''} disabled>${label}</option>`
  )).join('');
}

function renderTextInspectorFacts(
  prefix: 'ren-006' | 'ren-011',
  fields: readonly Readonly<{ suffix: string; label: string }>[],
): string {
  const rows = fields.map(({ suffix, label }) => (
    `<div><dt>${label}</dt><dd data-testid="${prefix}-${suffix}" data-text-observation-field>not observed</dd></div>`
  )).join('');
  return `<div class="contract-image-facts contract-text-facts" data-testid="${prefix}-selected-facts"><dl>${rows}</dl></div>`;
}

function seededTextChoiceId(
  choices: readonly CoreV2TextInspectorChoice[],
  seed: number,
): string {
  return choices[seed % choices.length]?.id ?? choices[0]?.id ?? '';
}

function renderTextInspector(route: CoreV2ContractRoute): string {
  const configuration = route.scenario === 'REN-006'
    ? {
        prefix: 'ren-006' as const,
        title: 'Unicode text phases and publication',
        selectorLabel: 'Observed phase',
        choices: REN_006_TEXT_CHOICES,
        fields: REN_006_TEXT_FIELDS,
      }
    : route.scenario === 'REN-011'
      ? {
          prefix: 'ren-011' as const,
          title: 'Item text contract matrix',
          selectorLabel: 'Observed specimen',
          choices: REN_011_TEXT_CHOICES,
          fields: REN_011_TEXT_FIELDS,
        }
      : null;
  if (!configuration) return '';
  const seededChoice = seededTextChoiceId(configuration.choices, route.seed);
  const options = renderTextInspectorOptions(configuration.choices, seededChoice);
  return `<section class="contract-image-inspector contract-text-inspector" data-testid="${configuration.prefix}-text-inspector" data-observation-status="queued" data-observed-choice-count="0" data-seeded-choice="${seededChoice}" aria-labelledby="${configuration.prefix}-inspector-title">
    <div class="contract-image-inspector-heading">
      <div><span class="contract-kicker">${configuration.prefix.toUpperCase()} folded actual observer</span><h3 id="${configuration.prefix}-inspector-title">${configuration.title}</h3></div>
      <label>${configuration.selectorLabel}<select data-testid="${configuration.prefix}-text-choice-select" disabled>${options}</select><output class="contract-phase-observation-count" data-testid="${configuration.prefix}-observed-choice-count">0 / ${configuration.choices.length} observed</output></label>
    </div>
    <p class="contract-image-observer-note" data-testid="${configuration.prefix}-display-only-note">Display-only exploration. This chooser reads completed folded actualObservation only; it never adds, removes, reorders, repeats, or mutates the canonical action trace. The route seed chooses the initial display deterministically.</p>
    ${renderTextInspectorFacts(configuration.prefix, configuration.fields)}
    ${renderRunObserver(configuration.prefix)}
  </section>`;
}

function renderComponentAssetPhaseOptions(
  phases: readonly CoreV2ComponentAssetPhase[],
  initiallySelectedId: string,
): string {
  return phases.map(({ id, label, actionIndex }) => (
    `<option value="${id}" data-action-index="${actionIndex}" data-observation-status="queued"${id === initiallySelectedId ? ' selected' : ''} disabled>${label}</option>`
  )).join('');
}

function renderComponentAssetResourceLedger(prefix: 'ren-008' | 'ren-010'): string {
  const counters = COMPONENT_ASSET_RESOURCE_FIELDS.map(({ suffix, label }) => (
    `<div><dt>${label}</dt><dd data-testid="${prefix}-${suffix}" data-component-asset-field>not observed</dd></div>`
  )).join('');
  return `<div class="contract-image-ledger" aria-label="Observed component resource counters">
    <dl>${counters}</dl>
    <div class="contract-component-resource-journal">
      <h4>Observed resource journal</h4>
      <ol data-testid="${prefix}-resource-journal"><li data-testid="${prefix}-resource-journal-empty">Run the exact case to inspect observed resources.</li></ol>
    </div>
  </div>`;
}

function renderRunObserver(prefix: CoreV2RunObserverPrefix): string {
  return `<div class="contract-run-observer" data-testid="${prefix}-run-observation">
    <div><span class="contract-kicker">Per-run main-thread observation</span><p>FPS and frame gaps use requestAnimationFrame; long tasks use the browser Long Tasks API when available.</p></div>
    <dl>
      <div><dt>Run</dt><dd data-testid="${prefix}-run-index">not observed</dd></div>
      <div><dt>FPS</dt><dd data-testid="${prefix}-run-fps">not observed</dd></div>
      <div><dt>Frames</dt><dd data-testid="${prefix}-run-frame-count">not observed</dd></div>
      <div><dt>Max frame gap</dt><dd data-testid="${prefix}-run-max-frame-gap">not observed</dd></div>
      <div><dt>Long tasks</dt><dd data-testid="${prefix}-run-long-task-count">not observed</dd></div>
      <div><dt>Duration</dt><dd data-testid="${prefix}-run-duration">not observed</dd></div>
    </dl>
    <ol class="contract-performance-journal" data-testid="${prefix}-performance-journal"></ol>
  </div>`;
}

function renderRen008Inspector(route: CoreV2ContractRoute): string {
  if (route.scenario !== 'REN-008') return '';
  const options = renderComponentAssetPhaseOptions(REN_008_PHASES, 'shown');
  return `<section class="contract-image-inspector contract-component-inspector" data-testid="ren-008-background-inspector" data-observation-status="queued" data-observed-phase-count="0" aria-labelledby="ren-008-inspector-title">
    <div class="contract-image-inspector-heading">
      <div><span class="contract-kicker">REN-008 actual observer</span><h3 id="ren-008-inspector-title">Background component phases</h3></div>
      <label>Observed phase<select data-testid="ren-008-phase-select" disabled>${options}</select><output class="contract-phase-observation-count" data-testid="ren-008-observed-phase-count">0 / 4 observed</output></label>
    </div>
    <p class="contract-image-observer-note">This chooser displays only completed action products. It cannot add, remove, reorder, repeat, or mutate the canonical four-action trace.</p>
    <div class="contract-image-facts" data-testid="ren-008-selected-facts">
      <dl>
        <div><dt>Phase</dt><dd data-testid="ren-008-phase" data-component-asset-field>not observed</dd></div>
        <div><dt>Owner ID</dt><dd data-testid="ren-008-owner-id" data-component-asset-field>not observed</dd></div>
        <div><dt>Component ID</dt><dd data-testid="ren-008-component-id" data-component-asset-field>not observed</dd></div>
        <div><dt>Dense entity ID</dt><dd data-testid="ren-008-entity-id" data-component-asset-field>not observed</dd></div>
        <div><dt>Logical identity</dt><dd data-testid="ren-008-logical-identity" data-component-asset-field>not observed</dd></div>
        <div><dt>Authored inert size</dt><dd data-testid="ren-008-authored-size" data-component-asset-field>not observed</dd></div>
        <div><dt>Full item bounds</dt><dd data-testid="ren-008-full-bounds" data-component-asset-field>not observed</dd></div>
        <div><dt>Visible bounds</dt><dd data-testid="ren-008-visible-bounds" data-component-asset-field>not observed</dd></div>
        <div><dt>Source</dt><dd data-testid="ren-008-source" data-component-asset-field>not observed</dd></div>
        <div><dt>Resource state</dt><dd data-testid="ren-008-resource-state" data-component-asset-field>not observed</dd></div>
        <div><dt>Render role</dt><dd data-testid="ren-008-render-role" data-component-asset-field>not observed</dd></div>
        <div><dt>Binding</dt><dd data-testid="ren-008-binding-key" data-component-asset-field>not observed</dd></div>
        <div><dt>Generation</dt><dd data-testid="ren-008-generation" data-component-asset-field>not observed</dd></div>
        <div><dt>Render objects</dt><dd data-testid="ren-008-render-object-count" data-component-asset-field>not observed</dd></div>
        <div><dt>Stale attachments</dt><dd data-testid="ren-008-stale-count" data-component-asset-field>not observed</dd></div>
      </dl>
    </div>
    <div class="contract-component-capture" aria-label="Declared observed capture">
      <h4>Declared capture</h4>
      <dl><div data-testid="ren-008-capture-row"><dt>initial/id</dt><dd data-testid="ren-008-capture-id" data-component-asset-field>not observed</dd></div></dl>
    </div>
    ${renderComponentAssetResourceLedger('ren-008')}
    ${renderRunObserver('ren-008')}
  </section>`;
}

function renderRen010Inspector(route: CoreV2ContractRoute): string {
  if (route.scenario !== 'REN-010') return '';
  const options = renderComponentAssetPhaseOptions(REN_010_PHASES, 'tint');
  return `<section class="contract-image-inspector contract-component-inspector" data-testid="ren-010-icon-inspector" data-observation-status="queued" data-observed-phase-count="0" aria-labelledby="ren-010-inspector-title">
    <div class="contract-image-inspector-heading">
      <div><span class="contract-kicker">REN-010 actual observer</span><h3 id="ren-010-inspector-title">Icon source and tint phases</h3></div>
      <label>Observed phase<select data-testid="ren-010-phase-select" disabled>${options}</select><output class="contract-phase-observation-count" data-testid="ren-010-observed-phase-count">0 / 3 observed</output></label>
    </div>
    <p class="contract-image-observer-note">This chooser displays only completed action products. It cannot add, remove, reorder, repeat, or mutate the canonical three-action trace.</p>
    <div class="contract-image-facts" data-testid="ren-010-selected-facts">
      <dl>
        <div><dt>Phase</dt><dd data-testid="ren-010-phase" data-component-asset-field>not observed</dd></div>
        <div><dt>Owner ID</dt><dd data-testid="ren-010-owner-id" data-component-asset-field>not observed</dd></div>
        <div><dt>Component ID</dt><dd data-testid="ren-010-component-id" data-component-asset-field>not observed</dd></div>
        <div><dt>Dense entity ID</dt><dd data-testid="ren-010-entity-id" data-component-asset-field>not observed</dd></div>
        <div><dt>Logical identity</dt><dd data-testid="ren-010-logical-identity" data-component-asset-field>not observed</dd></div>
        <div><dt>Content box from observed export</dt><dd data-testid="ren-010-content-box" data-component-asset-field>not observed</dd></div>
        <div><dt>Actual icon bounds</dt><dd data-testid="ren-010-icon-bounds" data-component-asset-field>not observed</dd></div>
        <div><dt>Authored percentage size</dt><dd data-testid="ren-010-authored-size" data-component-asset-field>not observed</dd></div>
        <div><dt>Placement</dt><dd data-testid="ren-010-placement" data-component-asset-field>not observed</dd></div>
        <div><dt>Margins</dt><dd data-testid="ren-010-margins" data-component-asset-field>not observed</dd></div>
        <div><dt>Source</dt><dd data-testid="ren-010-source" data-component-asset-field>not observed</dd></div>
        <div><dt>Resource state</dt><dd data-testid="ren-010-resource-state" data-component-asset-field>not observed</dd></div>
        <div><dt>Render role</dt><dd data-testid="ren-010-render-role" data-component-asset-field>not observed</dd></div>
        <div><dt>Binding</dt><dd data-testid="ren-010-binding-key" data-component-asset-field>not observed</dd></div>
        <div><dt>Generation</dt><dd data-testid="ren-010-generation" data-component-asset-field>not observed</dd></div>
        <div><dt>Semantic tint</dt><dd data-testid="ren-010-semantic-tint" data-component-asset-field>not observed</dd></div>
        <div><dt>Renderer tint</dt><dd data-testid="ren-010-renderer-tint" data-component-asset-field>not observed</dd></div>
        <div><dt>Render objects</dt><dd data-testid="ren-010-render-object-count" data-component-asset-field>not observed</dd></div>
        <div><dt>Stale attachments</dt><dd data-testid="ren-010-stale-count" data-component-asset-field>not observed</dd></div>
      </dl>
    </div>
    ${renderComponentAssetResourceLedger('ren-010')}
    ${renderRunObserver('ren-010')}
  </section>`;
}

function renderComponentAssetInspector(route: CoreV2ContractRoute): string {
  return `${renderRen008Inspector(route)}${renderRen010Inspector(route)}`;
}

export function renderCoreV2ContractLab(route: CoreV2ContractRoute): string {
  const presenter = route.presenter;
  const executable = presenter.executionStatus === 'actual-observable';
  const initialStatus = executable ? 'armed' : 'not-implemented';
  const statusLabel = executable ? 'Ready to observe' : 'Not implemented';
  const sizeOptions = CORE_V2_CONTRACT_DATASET_SIZES.map((size) =>
    `<option value="${size}"${size === route.size ? ' selected' : ''}>${size}</option>`,
  ).join('');

  return `<main class="contract-lab-shell" data-testid="${presenter.rootTestId}" data-contract-status="${initialStatus}">
  <header class="contract-lab-header">
    <div><span class="contract-kicker">Core v2 functional contract</span><h1>${presenter.caseId} · ${escapeHtml(presenter.title)}</h1><p>${presenter.caseType} · ${presenter.priority} · selected case only</p></div>
    <strong class="contract-status" data-contract-status-label>${statusLabel}</strong>
  </header>
  <div class="contract-lab-layout">
    <aside class="contract-catalog" aria-label="Approved Core v2 scenarios">
      <label for="core-v2-contract-search">Find scenario</label>
      <input id="core-v2-contract-search" type="search" data-testid="scenario-search" autocomplete="off" placeholder="ID or title">
      <nav data-testid="scenario-list">${scenarioList(route)}</nav>
    </aside>
    <section class="contract-focus">
      <div class="contract-route-controls">
        <label>Dataset size<select data-testid="dataset-size">${sizeOptions}</select></label>
        <label>Seed<input data-testid="seed" inputmode="numeric" value="${route.seed}" pattern="(?:0|[1-9][0-9]*)"></label>
        <button type="button" data-testid="load-dataset"${executable ? '' : ' disabled'}>Run exact case</button>
        <button type="button" data-testid="reset-case" disabled>Reset case</button>
        <button type="button" data-testid="repeat-action" disabled>Repeat action</button>
        <button type="button" data-testid="destroy-case" disabled>Destroy runtime</button>
        <button type="button" data-testid="copy-url">Copy URL</button>
      </div>
      <p class="contract-stub-notice">${executable
        ? 'Actual-only case execution is available on the PixiJS WebGL baseline. The canvas is transient and is removed by executor cleanup; this Lab reports observed or failed facts without an expected comparison.'
        : 'This approved route remains explicitly not implemented. No engine action, semantic observation, or promotion result is produced.'}</p>
      ${renderCoreV2ManualWorkbench(presenter)}
      <section class="contract-case-card" aria-labelledby="contract-case-title">
        <span class="contract-kicker">Independent exact evidence runner</span>
        <h2 id="contract-case-title">${escapeHtml(presenter.title)}</h2>
        <p class="contract-instruction">${escapeHtml(presenter.instruction)}</p>
        <div class="contract-canvas" data-testid="canvas-host">
          <div data-testid="${presenter.gestureSurfaceTestId}" data-contract-surface aria-label="Core v2 contract case surface">
            <p data-canvas-lifetime>${executable
              ? 'PixiJS WebGL canvas mounts only while the exact executor owns a live engine.'
              : 'No canvas is allocated for a not-implemented route.'}</p>
          </div>
        </div>
        <div class="contract-actions" aria-label="Selected case action ownership">${actionControls(route, executable)}</div>
        ${renderRen005Inspector(route)}
        ${renderTextInspector(route)}
        ${renderComponentAssetInspector(route)}
      </section>
      <section class="contract-result-strip" data-testid="${presenter.resultTestId}" aria-live="polite">
        <dl><div><dt>Actions</dt><dd data-result-actions>${executable ? 'queued' : 'not run'}</dd></div><div><dt>Events</dt><dd data-result-events>not observed</dd></div><div><dt>Cleanup</dt><dd data-result-cleanup>not run</dd></div><div><dt>Observation</dt><dd data-result-observation>${initialStatus}</dd></div></dl>
        <p data-testid="${presenter.firstFailureTestId}">${executable
          ? 'Run the exact ordered case to inspect product, event, semantic, and cleanup facts.'
          : 'Action executor is not implemented; no actual observation exists.'}</p>
        <pre data-testid="${presenter.traceTestId}" hidden>${initialStatus}</pre>
      </section>
    </section>
  </div>
</main>`;
}

export function renderCoreV2ContractRouteError(error: CoreV2ContractRouteError): string {
  return `<main class="contract-lab-shell contract-route-error" data-testid="core-v2-contract-route-error" data-contract-status="invalid-route"><span class="contract-kicker">Core v2 functional contract</span><h1>Route cannot run</h1><p><strong>${error.code}</strong>: ${escapeHtml(error.message)}</p><p>This route is non-passing. Provide exactly scenario, size, and canonical uint32 seed parameters.</p></main>`;
}

function bindShell(
  target: HTMLElement,
  route: CoreV2ContractRoute,
  abortController: AbortController,
  bridge: CoreV2ContractLabBridgeV1,
  executable: boolean,
): void {
  const signal = abortController.signal;
  let navigationRequested = false;
  let uiRunSequence = 0;

  async function navigate(href: string): Promise<void> {
    if (navigationRequested) return;
    navigationRequested = true;
    try {
      await bridge.destroyCase();
    } finally {
      window.location.assign(href);
    }
  }

  const search = target.querySelector<HTMLInputElement>('[data-testid="scenario-search"]');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    for (const link of target.querySelectorAll<HTMLElement>('[data-scenario-index]')) {
      link.hidden = query.length > 0 && !(link.dataset.scenarioIndex ?? '').includes(query);
    }
  }, { signal });

  const copyUrl = target.querySelector<HTMLButtonElement>('[data-testid="copy-url"]');
  copyUrl?.addEventListener('click', () => {
    if (navigator.clipboard) {
      void navigator.clipboard
        .writeText(new URL(route.canonicalUrl, window.location.origin).href)
        .catch(() => undefined);
    }
  }, { signal });

  for (const link of target.querySelectorAll<HTMLAnchorElement>('[data-scenario-index]')) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void navigate(link.getAttribute('href') ?? link.href);
    }, { signal });
  }

  const size = target.querySelector<HTMLSelectElement>('[data-testid="dataset-size"]');
  size?.addEventListener('change', () => {
    const next = CORE_V2_CONTRACT_DATASET_SIZES.find((candidate) => candidate === size.value);
    if (next) void navigate(buildCoreV2ContractRoute(route.scenario, next, route.seed));
  }, { signal });

  const seed = target.querySelector<HTMLInputElement>('[data-testid="seed"]');
  seed?.addEventListener('change', () => {
    try {
      const nextSeed = parseCoreV2ContractSeed(seed.value);
      seed.setCustomValidity('');
      void navigate(buildCoreV2ContractRoute(route.scenario, route.size, nextSeed));
    } catch {
      seed.setCustomValidity('Use a canonical uint32 decimal seed.');
      seed.reportValidity();
    }
  }, { signal });

  window.addEventListener('pagehide', () => {
    void bridge.destroyCase().catch(() => undefined);
  }, { signal });

  if (!executable) return;
  const run = target.querySelector<HTMLButtonElement>('[data-testid="load-dataset"]');
  const reset = target.querySelector<HTMLButtonElement>('[data-testid="reset-case"]');
  const repeat = target.querySelector<HTMLButtonElement>('[data-testid="repeat-action"]');
  const destroy = target.querySelector<HTMLButtonElement>('[data-testid="destroy-case"]');

  const imageChooser = target.querySelector<HTMLSelectElement>(
    '[data-testid="ren-005-specimen-select"]',
  );
  imageChooser?.addEventListener('change', () => {
    refreshRen005Inspector(target, bridge.execution());
  }, { signal });

  const textChooser = target.querySelector<HTMLSelectElement>(
    '[data-testid="ren-006-text-choice-select"], [data-testid="ren-011-text-choice-select"]',
  );
  textChooser?.addEventListener('change', () => {
    const status = bridge.state().status;
    if (status !== 'observed' && status !== 'failed' && status !== 'destroyed') return;
    void bridge.actualObservation().then((observation) => {
      if (!signal.aborted) {
        refreshTextInspector(target, route.scenario, observation, route.seed, false);
      }
    }).catch(() => undefined);
  }, { signal });

  const componentAssetChooser = target.querySelector<HTMLSelectElement>(
    '[data-testid="ren-008-phase-select"], [data-testid="ren-010-phase-select"]',
  );
  componentAssetChooser?.addEventListener('change', () => {
    refreshComponentAssetInspector(target, route.scenario, bridge.execution());
  }, { signal });

  async function perform(
    operationKind: 'run' | 'reset' | 'repeat' | 'destroy',
    operation: () => Promise<unknown>,
  ): Promise<void> {
    const performancePrefix = runObserverPrefix(route.scenario);
    const performanceObservation = (
      (operationKind !== 'run' && operationKind !== 'repeat')
      || performancePrefix === null
    )
      ? null
      : startUiRunObservation();
    const pending = operation();
    await refreshBridgeUi(target, route, bridge);
    const operationResult: unknown = await pending.catch(() => null);
    const runMetrics = performanceObservation
      ? await performanceObservation.finish()
      : null;
    if (runMetrics) uiRunSequence += 1;
    if (operationKind === 'reset') {
      uiRunSequence = 0;
      if (performancePrefix) resetRunPerformance(target, performancePrefix);
    }
    await refreshBridgeUi(target, route, bridge, runMetrics
      ? {
          runIndex: uiRunSequence,
          runKind: operationKind === 'repeat' ? 'repeat' : 'run',
          metrics: runMetrics,
          runResult: operationResult,
        }
      : null);
    const root = target.querySelector<HTMLElement>(
      `[data-testid="${route.presenter.rootTestId}"]`,
    );
    if (root && (operationKind === 'run' || operationKind === 'repeat')) {
      dispatchCoreV2ContractRunComplete(root, operationKind, operationResult);
    }
    if (root && operationKind === 'destroy') {
      dispatchCoreV2ContractDestroyComplete(root, operationResult);
    }
  }

  run?.addEventListener('click', () => {
    void perform('run', () => bridge.runCase());
  }, { signal });
  reset?.addEventListener('click', () => {
    void perform('reset', () => bridge.resetCase());
  }, { signal });
  repeat?.addEventListener('click', () => {
    void perform('repeat', () => bridge.repeatCase());
  }, { signal });
  destroy?.addEventListener('click', () => {
    void perform('destroy', () => bridge.destroyCase());
  }, { signal });
  void refreshBridgeUi(target, route, bridge);
}

async function refreshBridgeUi(
  target: HTMLElement,
  route: CoreV2ContractRoute,
  bridge: CoreV2ContractLabBridgeV1,
  runObservation: Readonly<{
    readonly runIndex: number;
    readonly runKind: 'run' | 'repeat';
    readonly metrics: CoreV2ContractUiRunMetrics;
    readonly runResult: unknown;
  }> | null = null,
): Promise<void> {
  const state = bridge.state();
  const root = target.querySelector<HTMLElement>(`[data-testid="${route.presenter.rootTestId}"]`);
  if (!root) return;
  root.dataset.contractStatus = state.status;
  setText(root.querySelector('[data-contract-status-label]'), statusLabel(state.status));

  const run = root.querySelector<HTMLButtonElement>('[data-testid="load-dataset"]');
  const reset = root.querySelector<HTMLButtonElement>('[data-testid="reset-case"]');
  const repeat = root.querySelector<HTMLButtonElement>('[data-testid="repeat-action"]');
  const destroy = root.querySelector<HTMLButtonElement>('[data-testid="destroy-case"]');
  if (run) run.disabled = state.status === 'running' || state.status === 'observed' || state.status === 'destroyed';
  if (reset) reset.disabled = state.status === 'armed' || state.status === 'running' || state.status === 'destroyed';
  if (repeat) {
    repeat.disabled = state.status === 'armed'
      || state.status === 'running'
      || state.status === 'destroyed';
  }
  if (destroy) {
    destroy.disabled = state.status === 'armed'
      || state.status === 'running'
      || state.status === 'destroyed';
  }

  const execution = bridge.execution();
  const results = execution && Array.isArray(execution.actionResults)
    ? execution.actionResults as unknown as readonly unknown[]
    : [];
  for (const row of root.querySelectorAll<HTMLElement>(
    '.contract-case-action[data-action-index]',
  )) {
    const index = Number(row.dataset.actionIndex);
    const result = Number.isInteger(index) ? results[index] : undefined;
    const resultStatus = isRecord(result) && typeof result.status === 'string'
      ? result.status
      : state.status === 'running'
      ? 'executing-in-order'
      : state.status === 'armed'
        ? 'queued'
        : state.status === 'failed'
          ? 'not-run'
        : state.status;
    row.dataset.actionStatus = resultStatus;
    setText(row.querySelector('[data-action-result]'), actionResultLabel(result, resultStatus));
  }

  const eventCount = execution && Array.isArray(execution.eventJournal)
    ? execution.eventJournal.length
    : 0;
  const completedCount = results.filter((result) => isRecord(result) && result.status === 'completed').length;
  const cleanup = bridge.cleanup();
  setText(root.querySelector('[data-result-actions]'), `${completedCount}/${route.presenter.actions.length} completed`);
  setText(root.querySelector('[data-result-events]'), `${eventCount} public events`);
  setText(
    root.querySelector('[data-result-cleanup]'),
    typeof cleanup?.status === 'string' ? cleanup.status : 'not run',
  );
  setText(root.querySelector('[data-result-observation]'), state.status);

  const resultMessage = root.querySelector<HTMLElement>(
    `[data-testid="${route.presenter.firstFailureTestId}"]`,
  );
  setText(resultMessage, resultMessageFor(state.status, execution));

  const lifetime = root.querySelector<HTMLElement>('[data-canvas-lifetime]');
  setText(lifetime, canvasLifetimeFor(state.status));

  const terminal = state.status === 'observed' || state.status === 'failed' || state.status === 'destroyed';
  const observation = terminal ? await bridge.actualObservation() : null;
  const trace = root.querySelector<HTMLPreElement>(`[data-testid="${route.presenter.traceTestId}"]`);
  if (trace) {
    trace.hidden = state.status !== 'failed';
    trace.textContent = terminal
      ? JSON.stringify(compactContractTrace(state, execution, observation, cleanup), null, 2)
      : state.status;
  }

  refreshRen005Inspector(root, execution);
  refreshTextInspector(root, route.scenario, observation, route.seed, runObservation !== null);
  refreshComponentAssetInspector(root, route.scenario, execution);
  const performancePrefix = runObserverPrefix(route.scenario);
  if (runObservation && performancePrefix) {
    appendRunPerformance(root, performancePrefix, runObservation);
  }
}

function compactContractTrace(
  state: ReturnType<CoreV2ContractLabBridgeV1['state']>,
  execution: Readonly<Record<string, unknown>> | null,
  observation: Readonly<Record<string, unknown>> | null,
  cleanup: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> {
  const actionResults = execution && Array.isArray(execution.actionResults)
    ? execution.actionResults
    : [];
  const eventCount = execution && Array.isArray(execution.eventJournal)
    ? execution.eventJournal.length
    : 0;
  const error = execution && isRecord(execution.error) ? execution.error : null;
  return Object.freeze({
    state: Object.freeze({
      caseId: state.caseId,
      status: state.status,
      actionIndex: state.actionIndex,
      repeatIndex: state.repeatIndex,
    }),
    actions: Object.freeze(actionResults.map((result, index) => Object.freeze({
      index,
      status: isRecord(result) && typeof result.status === 'string'
        ? result.status
        : 'not-run',
    }))),
    eventCount,
    observation: observation
      ? Object.freeze({
          schema: typeof observation.$schema === 'string' ? observation.$schema : null,
          status: isRecord(observation.execution)
            && typeof observation.execution.status === 'string'
            ? observation.execution.status
            : state.status,
        })
      : null,
    error: error
      ? Object.freeze({
          name: typeof error.name === 'string' ? error.name : null,
          code: typeof error.code === 'string' ? error.code : null,
          message: typeof error.message === 'string' ? error.message : null,
        })
      : null,
    cleanup: cleanup
      ? Object.freeze({
          status: typeof cleanup.status === 'string' ? cleanup.status : null,
        })
      : null,
  });
}

function refreshRen005Inspector(
  root: HTMLElement,
  execution: Readonly<Record<string, unknown>> | null,
): void {
  const inspector = root.querySelector<HTMLElement>('[data-testid="ren-005-image-inspector"]');
  if (!inspector) return;
  const product = terminalRen005Product(execution);
  if (!product) {
    inspector.dataset.observationStatus = 'queued';
    for (const field of inspector.querySelectorAll<HTMLElement>('dd[data-testid^="ren-005-selected-"]')) {
      field.textContent = 'not observed';
    }
    for (const field of inspector.querySelectorAll<HTMLElement>(
      '[data-testid="ren-005-request-count"], [data-testid="ren-005-backend-counts"], [data-testid="ren-005-resource-count"], [data-testid="ren-005-lease-count"], [data-testid="ren-005-stale-count"], [data-testid="ren-005-pending-release-count"]',
    )) {
      field.textContent = 'not observed';
    }
    renderRen005RequestJournal(inspector, []);
    return;
  }

  const imageProbe = recordAt(product, 'imageProbe');
  const images = imageProbe ? recordAt(imageProbe, 'images') : null;
  const chooser = inspector.querySelector<HTMLSelectElement>(
    '[data-testid="ren-005-specimen-select"]',
  );
  const selectedId = chooser?.value ?? 'descriptor';
  const image = images ? recordAt(images, selectedId) : null;
  const geometry = recordAt(product, 'geometry');
  const bounds = geometry ? ren005WorldBounds(geometry, selectedId) : null;
  const initial = image ? recordAt(image, 'initial') : null;
  const requests = recordAt(product, 'requests');
  const backend = requests ? recordAt(requests, 'backend') : null;
  const snapshot = recordAt(product, 'snapshot');
  const resources = snapshot ? recordAt(snapshot, 'resources') : null;
  const assets = resources ? recordAt(resources, 'assets') : null;

  inspector.dataset.observationStatus = image ? 'observed' : 'missing';
  setText(inspector.querySelector('[data-testid="ren-005-selected-source"]'), sourceLabel(image));
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-source-kind"]'),
    stringField(image, 'sourceKind'),
  );
  setText(inspector.querySelector('[data-testid="ren-005-selected-state"]'), stringField(image, 'state'));
  setText(inspector.querySelector('[data-testid="ren-005-selected-role"]'), stringField(image, 'role'));
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-bounds"]'),
    bounds ? JSON.stringify(bounds) : 'unavailable',
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-initial-source"]'),
    sourceLabel(initial),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-initial-state"]'),
    stringField(initial, 'state'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-stale-attach"]'),
    numberField(image, 'staleAttachCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-stale-completion"]'),
    numberField(image, 'staleCompletionCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-selected-diagnostics"]'),
    numberField(image, 'diagnosticCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-request-count"]'),
    numberField(backend, 'requestCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-backend-counts"]'),
    backendCountsLabel(backend),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-resource-count"]'),
    numberField(imageProbe, 'bindingCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-lease-count"]'),
    numberField(assets, 'leaseCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-stale-count"]'),
    numberField(imageProbe, 'staleCompletionCount'),
  );
  setText(
    inspector.querySelector('[data-testid="ren-005-pending-release-count"]'),
    numberField(imageProbe, 'pendingReleaseCount'),
  );
  renderRen005RequestJournal(
    inspector,
    backend && Array.isArray(backend.journal) ? backend.journal : [],
  );
}

function refreshTextInspector(
  root: HTMLElement,
  scenario: string,
  observation: Readonly<Record<string, unknown>> | null,
  routeSeed: number,
  resetSelection: boolean,
): void {
  const configuration = scenario === 'REN-006'
    ? {
        prefix: 'ren-006' as const,
        inspectorTestId: 'ren-006-text-inspector',
        choices: REN_006_TEXT_CHOICES,
        fields: REN_006_TEXT_FIELDS,
      }
    : scenario === 'REN-011'
      ? {
          prefix: 'ren-011' as const,
          inspectorTestId: 'ren-011-text-inspector',
          choices: REN_011_TEXT_CHOICES,
          fields: REN_011_TEXT_FIELDS,
        }
      : null;
  if (!configuration) return;
  const inspector = root.querySelector<HTMLElement>(
    `[data-testid="${configuration.inspectorTestId}"]`,
  );
  if (!inspector) return;

  const observationCase = observation ? recordAt(observation, 'case') : null;
  const validObservation = observationCase?.id === scenario ? observation : null;
  const factsByChoice = new Map<string, Readonly<Record<string, string>> | null>(
    configuration.choices.map(({ id }) => [
      id,
      validObservation
        ? textChoiceFacts(scenario, validObservation, id)
        : null,
    ]),
  );
  const observedCount = [...factsByChoice.values()].filter((facts) => facts !== null).length;
  inspector.dataset.observedChoiceCount = String(observedCount);
  setText(
    inspector.querySelector(`[data-testid="${configuration.prefix}-observed-choice-count"]`),
    `${observedCount} / ${configuration.choices.length} observed`,
  );

  const chooser = inspector.querySelector<HTMLSelectElement>(
    `[data-testid="${configuration.prefix}-text-choice-select"]`,
  );
  if (chooser) {
    chooser.disabled = observedCount === 0;
    for (const option of chooser.options) {
      const observed = (factsByChoice.get(option.value) ?? null) !== null;
      option.disabled = !observed;
      option.dataset.observationStatus = observed ? 'observed' : 'queued';
    }
  }

  const seededChoice = seededTextChoiceId(configuration.choices, routeSeed);
  let selectedChoice = chooser?.value ?? seededChoice;
  if (resetSelection || !factsByChoice.get(selectedChoice)) {
    selectedChoice = factsByChoice.get(seededChoice)
      ? seededChoice
      : configuration.choices.find(({ id }) => factsByChoice.get(id) !== null)?.id ?? '';
    if (chooser && selectedChoice) chooser.value = selectedChoice;
  }
  const selectedFacts = factsByChoice.get(selectedChoice) ?? null;
  resetTextInspectorFields(inspector);
  if (!selectedFacts) {
    inspector.dataset.observationStatus = 'queued';
    delete inspector.dataset.selectedChoice;
    return;
  }

  inspector.dataset.observationStatus = 'observed';
  inspector.dataset.selectedChoice = selectedChoice;
  for (const [suffix, value] of Object.entries(selectedFacts)) {
    setText(
      inspector.querySelector(`[data-testid="${configuration.prefix}-${suffix}"]`),
      value,
    );
  }
}

function textChoiceFacts(
  scenario: string,
  observation: Readonly<Record<string, unknown>>,
  choiceId: string,
): Readonly<Record<string, string>> | null {
  if (scenario === 'REN-006') return ren006TextChoiceFacts(observation, choiceId);
  if (scenario === 'REN-011') return ren011TextChoiceFacts(observation, choiceId);
  return null;
}

function ren006TextChoiceFacts(
  observation: Readonly<Record<string, unknown>>,
  choiceId: string,
): Readonly<Record<string, string>> | null {
  const text = recordAt(observation, 'text');
  if (!text) return null;
  const scene = recordAt(observation, 'scene');
  const textScene = scene ? recordAt(scene, 'text') : null;
  const geometry = recordAt(observation, 'geometry');
  const textGeometry = geometry ? recordAt(geometry, 'text') : null;
  const paint = recordAt(observation, 'paint');
  const textPaint = paint ? recordAt(paint, 'text') : null;
  const publication = observedValue(textScene?.publication);
  const facts = unavailableTextFacts(REN_006_TEXT_FIELDS);
  facts.phase = choiceId;
  facts.publication = publication;

  if (choiceId === 'initial') {
    const phases = recordAt(text, 'phases');
    const initial = phases ? recordAt(phases, 'initial-text') : null;
    if (!initial) return null;
    facts.source = observedTextLiteral(initial.source);
    facts.lines = observedValue(initial.lines);
    facts['layout-bounds'] = observedValue(initial.layoutBounds);
    return facts;
  }
  if (choiceId === 'empty') {
    const empty = recordAt(text, 'empty');
    if (!empty) return null;
    facts['visible-text'] = observedTextLiteral(empty.visibleText);
    facts['layout-bounds'] = observedValue(empty.layoutBounds);
    return facts;
  }
  if (choiceId === 'long') {
    const long = recordAt(text, 'long');
    if (!long) return null;
    facts.lines = observedValue(long.lines);
    facts['layout-bounds'] = observedValue(long.layoutBounds);
    return facts;
  }
  if (choiceId === 'missing-font') {
    const missingFont = recordAt(text, 'missingFont');
    if (!missingFont) return null;
    facts['font-runs'] = observedValue(missingFont.fontRuns);
    facts['layout-bounds'] = observedValue(missingFont.layoutBounds);
    return facts;
  }
  if (choiceId === 'rapid') {
    const rapid = recordAt(text, 'rapid');
    if (!rapid) return null;
    facts['visible-text'] = observedTextLiteral(rapid.visibleText);
    facts['layout-bounds'] = observedValue(rapid.layoutBounds);
    facts['intermediate-publication-count'] = observedValue(rapid.intermediatePublicationCount);
    facts['stale-glyph-count'] = observedValue(rapid.staleGlyphCount);
    return facts;
  }
  if (choiceId !== 'terminal' || typeof text.content !== 'string') return null;
  facts.source = observedTextLiteral(text.content);
  facts.lines = observedValue(text.lines);
  facts['font-runs'] = observedValue(text.fontRuns);
  facts['layout-bounds'] = observedValue(text.layoutBounds);
  facts['world-bounds'] = observedValue(text.worldBounds);
  facts['hit-bounds'] = observedValue(text.hitBounds);
  facts['stale-glyph-count'] = observedValue(text.staleGlyphCount);
  facts['renderer-route'] = observedValue(textScene?.route);
  facts.style = observedValue(textPaint?.style);
  facts.geometry = observedValue(textGeometry);
  return facts;
}

function ren011TextChoiceFacts(
  observation: Readonly<Record<string, unknown>>,
  choiceId: string,
): Readonly<Record<string, string>> | null {
  const text = recordAt(observation, 'text');
  if (!text || !Array.isArray(text.contractMatrix)) return null;
  const rowValue: unknown = text.contractMatrix.find((entry: unknown) => (
    isRecord(entry) && entry.id === choiceId
  ));
  if (!isRecord(rowValue)) return null;
  const scene = recordAt(observation, 'scene');
  const itemTextScene = scene ? recordAt(scene, 'itemText') : null;
  const geometry = recordAt(observation, 'geometry');
  const geometryTexts = geometry ? recordAt(geometry, 'texts') : null;
  const paint = recordAt(observation, 'paint');
  const paintTexts = paint ? recordAt(paint, 'texts') : null;
  const outcome = recordAt(observation, 'outcome');
  const matrixOutcome = outcome ? recordAt(outcome, 'textContractMatrix') : null;
  const placedGeometry = geometryTexts ? recordAt(geometryTexts, 'placed') : null;
  const uprightGeometry = geometryTexts ? recordAt(geometryTexts, 'upright') : null;
  const placedPaint = paintTexts ? recordAt(paintTexts, 'placed') : null;
  const facts = unavailableTextFacts(REN_011_TEXT_FIELDS);

  facts.specimen = observedValue(rowValue.id);
  facts.source = observedTextLiteral(rowValue.source);
  facts.placement = observedValue(rowValue.placement);
  facts.margin = observedValue(rowValue.margin);
  facts.tint = observedValue(rowValue.tint);
  facts.rgba = observedValue(rowValue.rgba);
  facts.frame = observedValue(rowValue.frame);
  facts['auto-font'] = observedValue(rowValue.autoFont);
  facts['wrap-width'] = observedValue(rowValue.wrapWidth);
  facts.overflow = observedValue(rowValue.overflow);
  facts['visible-text'] = observedTextLiteral(rowValue.visibleText);
  facts.lines = observedValue(rowValue.lines);
  facts['layout-bounds'] = observedValue(rowValue.layoutBounds);
  facts['item-angle'] = observedValue(rowValue.itemAngle);
  facts.orientation = observedValue(rowValue.orientation);
  facts['screen-angle'] = choiceId === 'upright'
    ? observedValue(uprightGeometry?.screenAngle)
    : observedValue(rowValue.screenAngle);
  facts['local-bounds'] = choiceId === 'placed'
    ? observedValue(placedGeometry?.localBounds)
    : observedValue(rowValue.localBounds);
  facts['paint-tint'] = choiceId === 'placed'
    ? observedValue(placedPaint?.tint)
    : 'unavailable';
  facts.publication = observedValue(itemTextScene?.publication);
  facts['all-rows-exact'] = observedValue(matrixOutcome?.allRowsExact);
  return facts;
}

function unavailableTextFacts(
  fields: readonly Readonly<{ suffix: string }>[],
): Record<string, string> {
  return Object.fromEntries(fields.map(({ suffix }) => [suffix, 'unavailable']));
}

function observedTextLiteral(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : observedValue(value);
}

function resetTextInspectorFields(inspector: HTMLElement): void {
  for (const field of inspector.querySelectorAll<HTMLElement>('[data-text-observation-field]')) {
    field.textContent = 'not observed';
  }
}

function refreshComponentAssetInspector(
  root: HTMLElement,
  scenario: string,
  execution: Readonly<Record<string, unknown>> | null,
): void {
  const configuration = scenario === 'REN-008'
    ? {
        prefix: 'ren-008' as const,
        selector: '[data-testid="ren-008-background-inspector"]',
        phases: REN_008_PHASES,
      }
    : scenario === 'REN-010'
      ? {
          prefix: 'ren-010' as const,
          selector: '[data-testid="ren-010-icon-inspector"]',
          phases: REN_010_PHASES,
        }
      : null;
  if (!configuration) return;
  const inspector = root.querySelector<HTMLElement>(configuration.selector);
  if (!inspector) return;

  const products = configuration.phases.map((phase) => (
    componentAssetProductAt(execution, phase)
  ));
  const observedCount = products.filter((product) => product !== null).length;
  inspector.dataset.observedPhaseCount = String(observedCount);
  setText(
    inspector.querySelector(`[data-testid="${configuration.prefix}-observed-phase-count"]`),
    `${observedCount} / ${configuration.phases.length} observed`,
  );

  const chooser = inspector.querySelector<HTMLSelectElement>(
    `[data-testid="${configuration.prefix}-phase-select"]`,
  );
  if (chooser) {
    chooser.disabled = observedCount === 0;
    for (const option of chooser.options) {
      const phaseIndex = configuration.phases.findIndex(({ id }) => id === option.value);
      const observed = phaseIndex >= 0 && products[phaseIndex] !== null;
      option.disabled = !observed;
      option.dataset.observationStatus = observed ? 'observed' : 'queued';
    }
  }

  let selectedIndex = configuration.phases.findIndex(({ id }) => id === chooser?.value);
  if (selectedIndex < 0 || products[selectedIndex] === null) {
    selectedIndex = -1;
    for (let index = products.length - 1; index >= 0; index -= 1) {
      if (products[index] !== null) {
        selectedIndex = index;
        break;
      }
    }
    if (chooser && selectedIndex >= 0) chooser.value = configuration.phases[selectedIndex]!.id;
  }
  const selectedPhase = selectedIndex >= 0 ? configuration.phases[selectedIndex] : null;
  const product = selectedIndex >= 0 ? products[selectedIndex] : null;
  if (!selectedPhase || !product) {
    inspector.dataset.observationStatus = 'queued';
    delete inspector.dataset.selectedPhase;
    resetComponentAssetFields(inspector);
    renderComponentAssetResourceJournal(inspector, configuration.prefix, []);
    return;
  }

  inspector.dataset.observationStatus = 'observed';
  inspector.dataset.selectedPhase = selectedPhase.id;
  const component = recordAt(product, 'component');
  const semantic = component ? recordAt(component, 'semantic') : null;
  const geometry = component ? recordAt(component, 'geometry') : null;
  const sceneImage = component ? recordAt(component, 'sceneImage') : null;
  const rendererPaint = component ? recordAt(component, 'rendererPaint') : null;
  const resources = recordAt(product, 'resources');
  const counts = resources ? recordAt(resources, 'counts') : null;

  setComponentAssetField(inspector, configuration.prefix, 'phase', selectedPhase.label);
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'owner-id',
    stringField(semantic, 'ownerId'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'component-id',
    stringField(semantic, 'componentId'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'entity-id',
    stringField(component, 'entityId'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'logical-identity',
    stringField(component, 'logicalIdentity'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'authored-size',
    observedValue(semantic?.authoredSize),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'source',
    observedValue(semantic?.source),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'resource-state',
    sceneImage ? stringField(sceneImage, 'state') : 'not applicable · aggregate geometry',
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'render-role',
    stringField(component, 'renderRole'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'binding-key',
    sceneImage ? stringField(sceneImage, 'bindingKey') : 'not applicable',
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'generation',
    sceneImage ? numberField(sceneImage, 'generation') : 'not applicable',
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'render-object-count',
    numberField(rendererPaint, 'renderObjectCount'),
  );
  setComponentAssetField(
    inspector,
    configuration.prefix,
    'stale-count',
    sceneImage ? numberField(sceneImage, 'staleAttachCount') : 'not applicable',
  );

  for (const { suffix, key } of COMPONENT_ASSET_RESOURCE_FIELDS) {
    setComponentAssetField(
      inspector,
      configuration.prefix,
      suffix,
      numberField(counts, key),
    );
  }
  const journal = resources && Array.isArray(resources.journal) ? resources.journal : [];
  renderComponentAssetResourceJournal(inspector, configuration.prefix, journal);

  if (configuration.prefix === 'ren-008') {
    setComponentAssetField(
      inspector,
      'ren-008',
      'full-bounds',
      observedValue(geometry?.worldBounds),
    );
    setComponentAssetField(
      inspector,
      'ren-008',
      'visible-bounds',
      observedValue(geometry?.visibleBounds),
    );
    setComponentAssetField(
      inspector,
      'ren-008',
      'capture-id',
      ren008CaptureId(execution),
    );
    return;
  }

  const ownerId = semantic && typeof semantic.ownerId === 'string' ? semantic.ownerId : null;
  const componentId = semantic && typeof semantic.componentId === 'string'
    ? semantic.componentId
    : null;
  const exportedOwner = ownerId ? observedDatasetOwner(product, ownerId) : null;
  const exportedComponent = exportedOwner && componentId
    ? observedDatasetComponent(exportedOwner, componentId)
    : null;
  setComponentAssetField(
    inspector,
    'ren-010',
    'content-box',
    observedValue(observedContentBox(exportedOwner)),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'icon-bounds',
    observedValue(geometry?.worldBounds),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'placement',
    observedValue(exportedComponent?.placement),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'margins',
    observedValue(exportedComponent?.margin),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'semantic-tint',
    observedValue(semantic?.tint),
  );
  setComponentAssetField(
    inspector,
    'ren-010',
    'renderer-tint',
    rendererTintLabel(rendererPaint),
  );
}

function componentAssetProductAt(
  execution: Readonly<Record<string, unknown>> | null,
  phase: CoreV2ComponentAssetPhase,
): Readonly<Record<string, unknown>> | null {
  if (!execution || !Array.isArray(execution.actionResults)) return null;
  const result: unknown = execution.actionResults[phase.actionIndex];
  if (!isRecord(result) || result.status !== 'completed') return null;
  const delta = recordAt(result, 'delta');
  const actual = delta ? recordAt(delta, 'actual') : null;
  return actual ? recordAt(actual, phase.productKey) : null;
}

function resetComponentAssetFields(inspector: HTMLElement): void {
  for (const field of inspector.querySelectorAll<HTMLElement>('[data-component-asset-field]')) {
    field.textContent = 'not observed';
  }
}

function setComponentAssetField(
  inspector: HTMLElement,
  prefix: 'ren-008' | 'ren-010',
  suffix: string,
  value: string,
): void {
  setText(inspector.querySelector(`[data-testid="${prefix}-${suffix}"]`), value);
}

function ren008CaptureId(
  execution: Readonly<Record<string, unknown>> | null,
): string {
  if (!execution || !Array.isArray(execution.captures)) return 'not observed';
  const capture: unknown = execution.captures.find((candidate: unknown) => (
    isRecord(candidate)
    && candidate.id === 'initial'
    && candidate.afterActionIndex === 0
  ));
  const values = isRecord(capture) ? recordAt(capture, 'values') : null;
  return stringField(values, 'id');
}

function observedDatasetOwner(
  product: Readonly<Record<string, unknown>>,
  ownerId: string,
): Readonly<Record<string, unknown>> | null {
  if (!Array.isArray(product.dataset)) return null;
  return findObservedElement(product.dataset, ownerId);
}

function findObservedElement(
  elements: readonly unknown[],
  id: string,
): Readonly<Record<string, unknown>> | null {
  for (const elementValue of elements) {
    if (!isRecord(elementValue)) continue;
    if (elementValue.id === id) return elementValue;
    if (Array.isArray(elementValue.children)) {
      const nested = findObservedElement(elementValue.children, id);
      if (nested) return nested;
    }
  }
  return null;
}

function observedDatasetComponent(
  owner: Readonly<Record<string, unknown>>,
  componentId: string,
): Readonly<Record<string, unknown>> | null {
  if (!Array.isArray(owner.components)) return null;
  const component: unknown = owner.components.find((candidate: unknown) => (
    isRecord(candidate) && candidate.id === componentId
  ));
  return isRecord(component) ? component : null;
}

function observedContentBox(
  owner: Readonly<Record<string, unknown>> | null,
): readonly number[] | null {
  if (!owner) return null;
  const size = observedSize(owner.size);
  const padding = observedEdges(owner.padding);
  if (!size || !padding) return null;
  return [
    padding.left,
    padding.top,
    Math.max(0, size.width - padding.left - padding.right),
    Math.max(0, size.height - padding.top - padding.bottom),
  ];
}

function observedSize(
  value: unknown,
): Readonly<{ width: number; height: number }> | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { width: value, height: value };
  }
  if (Array.isArray(value) && value.length === 2) {
    const width: unknown = value[0];
    const height: unknown = value[1];
    return typeof width === 'number' && Number.isFinite(width)
      && typeof height === 'number' && Number.isFinite(height)
      ? { width, height }
      : null;
  }
  if (!isRecord(value)) return null;
  return typeof value.width === 'number' && Number.isFinite(value.width)
    && typeof value.height === 'number' && Number.isFinite(value.height)
    ? { width: value.width, height: value.height }
    : null;
}

function observedEdges(
  value: unknown,
): Readonly<{ top: number; right: number; bottom: number; left: number }> | null {
  if (value === undefined || value === null) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (!isRecord(value)) return null;
  const top = finiteNumberOrZero(value.top);
  const right = finiteNumberOrZero(value.right);
  const bottom = finiteNumberOrZero(value.bottom);
  const left = finiteNumberOrZero(value.left);
  return top === null || right === null || bottom === null || left === null
    ? null
    : { top, right, bottom, left };
}

function finiteNumberOrZero(value: unknown): number | null {
  if (value === undefined) return 0;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function observedValue(value: unknown): string {
  if (value === undefined) return 'unavailable';
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'unavailable';
  try {
    return JSON.stringify(value);
  } catch {
    return 'unavailable';
  }
}

function rendererTintLabel(value: Readonly<Record<string, unknown>> | null): string {
  if (!value) return 'unavailable';
  const packed = finiteUnsignedInteger(value.packedTint);
  const rgb = finiteUnsignedInteger(value.rgbTint);
  const alpha = typeof value.alpha === 'number' && Number.isFinite(value.alpha)
    ? value.alpha
    : null;
  if (packed === null || rgb === null || alpha === null) return 'unavailable';
  return `packed 0x${packed.toString(16).padStart(8, '0')} · rgb 0x${rgb.toString(16).padStart(6, '0')} · alpha ${alpha.toFixed(3)}`;
}

function finiteUnsignedInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value >>> 0
    : null;
}

function renderComponentAssetResourceJournal(
  inspector: HTMLElement,
  prefix: 'ren-008' | 'ren-010',
  journal: readonly unknown[],
): void {
  const list = inspector.querySelector<HTMLOListElement>(
    `[data-testid="${prefix}-resource-journal"]`,
  );
  if (!list) return;
  if (journal.length === 0) {
    list.innerHTML = `<li data-testid="${prefix}-resource-journal-empty">No observed resource events for this phase.</li>`;
    return;
  }
  list.innerHTML = journal.map((entry) => {
    const record = isRecord(entry) ? entry : null;
    const sequence = numberField(record, 'sequence');
    const event = stringField(record, 'event');
    return `<li data-testid="${prefix}-resource-journal-row" data-resource-sequence="${escapeHtml(sequence)}" data-resource-event="${escapeHtml(event)}"><span>${escapeHtml(sequence)}</span><strong>${escapeHtml(event)}</strong><code>${escapeHtml(observedValue(record))}</code></li>`;
  }).join('');
}

function terminalRen005Product(
  execution: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> | null {
  if (!execution || !Array.isArray(execution.actionResults)) return null;
  const actionResults = execution.actionResults as readonly unknown[];
  for (let index = actionResults.length - 1; index >= 0; index -= 1) {
    const result: unknown = actionResults[index];
    if (!isRecord(result)) continue;
    const delta = recordAt(result, 'delta');
    const actual = delta ? recordAt(delta, 'actual') : null;
    const product = actual ? recordAt(actual, 'product') : null;
    if (product) return product;
  }
  return null;
}

function ren005WorldBounds(
  geometry: Readonly<Record<string, unknown>>,
  entityId: string,
): readonly number[] | null {
  if (!Array.isArray(geometry.entities)) return null;
  const entities = geometry.entities as readonly unknown[];
  const entity: unknown = entities.find((candidate) => (
    isRecord(candidate) && candidate.id === entityId
  ));
  if (!isRecord(entity) || !Array.isArray(entity.worldBounds)) return null;
  const bounds = entity.worldBounds.filter((value): value is number => (
    typeof value === 'number' && Number.isFinite(value)
  ));
  return bounds.length === 4 ? bounds : null;
}

function sourceLabel(value: Readonly<Record<string, unknown>> | null): string {
  if (!value) return 'unavailable';
  if (typeof value.authoredSource === 'string') return value.authoredSource;
  if (isRecord(value.authoredSource)) return JSON.stringify(value.authoredSource);
  if (typeof value.authoredSourceKind === 'string') return `[${value.authoredSourceKind} payload]`;
  return 'unavailable';
}

function stringField(value: Readonly<Record<string, unknown>> | null, key: string): string {
  return value && typeof value[key] === 'string' ? value[key] : 'unavailable';
}

function numberField(value: Readonly<Record<string, unknown>> | null, key: string): string {
  return value && typeof value[key] === 'number' && Number.isFinite(value[key])
    ? String(value[key])
    : 'unavailable';
}

function backendCountsLabel(value: Readonly<Record<string, unknown>> | null): string {
  return ['pending', 'resolved', 'rejected', 'unloaded'].map((label) => (
    `${label} ${numberField(value, `${label}Count`)}`
  )).join(' · ');
}

function renderRen005RequestJournal(
  inspector: HTMLElement,
  journal: readonly unknown[],
): void {
  const list = inspector.querySelector<HTMLOListElement>('[data-testid="ren-005-request-journal"]');
  if (!list) return;
  if (journal.length === 0) {
    list.innerHTML = '<li data-testid="ren-005-request-journal-empty">Run the exact case to inspect requests.</li>';
    return;
  }
  list.innerHTML = journal.map((entry) => {
    const record = isRecord(entry) ? entry : null;
    const sequence = numberField(record, 'sequence');
    const event = stringField(record, 'event');
    const kind = stringField(record, 'kind');
    const state = stringField(record, 'state');
    const token = stringField(record, 'requestToken');
    return `<li data-testid="ren-005-request-journal-row" data-request-event="${escapeHtml(event)}" data-request-kind="${escapeHtml(kind)}"><span>${escapeHtml(sequence)}</span><code>${escapeHtml(token)}</code><strong>${escapeHtml(kind)}</strong><span>${escapeHtml(event)}</span><small>${escapeHtml(state)}</small></li>`;
  }).join('');
}

type CoreV2RunObserverPrefix =
  | 'ren-005'
  | 'ren-006'
  | 'ren-008'
  | 'ren-010'
  | 'ren-011';

function runObserverPrefix(scenario: string): CoreV2RunObserverPrefix | null {
  if (scenario === 'REN-005') return 'ren-005';
  if (scenario === 'REN-006') return 'ren-006';
  if (scenario === 'REN-008') return 'ren-008';
  if (scenario === 'REN-010') return 'ren-010';
  if (scenario === 'REN-011') return 'ren-011';
  return null;
}

function appendRunPerformance(
  root: HTMLElement,
  prefix: CoreV2RunObserverPrefix,
  observation: Readonly<{
    readonly runIndex: number;
    readonly runKind: 'run' | 'repeat';
    readonly metrics: CoreV2ContractUiRunMetrics;
    readonly runResult: unknown;
  }>,
): void {
  const observer = root.querySelector<HTMLElement>(`[data-testid="${prefix}-run-observation"]`);
  if (!observer) return;
  const { metrics } = observation;
  setText(observer.querySelector(`[data-testid="${prefix}-run-index"]`), String(observation.runIndex));
  setText(observer.querySelector(`[data-testid="${prefix}-run-fps"]`), metrics.framesPerSecond.toFixed(1));
  setText(observer.querySelector(`[data-testid="${prefix}-run-frame-count"]`), String(metrics.frameCount));
  setText(
    observer.querySelector(`[data-testid="${prefix}-run-max-frame-gap"]`),
    `${metrics.maxFrameGapMs.toFixed(1)} ms`,
  );
  setText(
    observer.querySelector(`[data-testid="${prefix}-run-long-task-count"]`),
    `${metrics.longTaskCount} / ${metrics.longTaskTotalMs.toFixed(1)} ms`,
  );
  setText(
    observer.querySelector(`[data-testid="${prefix}-run-duration"]`),
    `${metrics.durationMs.toFixed(1)} ms`,
  );
  const journal = observer.querySelector<HTMLOListElement>(
    `[data-testid="${prefix}-performance-journal"]`,
  );
  if (!journal) return;
  const row = document.createElement('li');
  row.dataset.testid = `${prefix}-performance-journal-row`;
  row.dataset.runIndex = String(observation.runIndex);
  row.dataset.runKind = observation.runKind;
  row.dataset.fps = metrics.framesPerSecond.toFixed(3);
  row.dataset.frameCount = String(metrics.frameCount);
  row.dataset.longTaskCount = String(metrics.longTaskCount);
  row.dataset.longTaskTotalMs = metrics.longTaskTotalMs.toFixed(3);
  row.dataset.maxFrameGapMs = metrics.maxFrameGapMs.toFixed(3);
  row.dataset.durationMs = metrics.durationMs.toFixed(3);
  row.textContent = `${observation.runKind} ${observation.runIndex}: ${metrics.framesPerSecond.toFixed(1)} FPS · ${metrics.longTaskCount} long tasks · ${metrics.maxFrameGapMs.toFixed(1)} ms max gap`;
  journal.append(row);
}

function resetRunPerformance(root: HTMLElement, prefix: CoreV2RunObserverPrefix): void {
  const observer = root.querySelector<HTMLElement>(`[data-testid="${prefix}-run-observation"]`);
  if (!observer) return;
  for (const suffix of [
    'run-index',
    'run-fps',
    'run-frame-count',
    'run-max-frame-gap',
    'run-long-task-count',
    'run-duration',
  ]) {
    setText(observer.querySelector(`[data-testid="${prefix}-${suffix}"]`), 'not observed');
  }
  observer.querySelector(`[data-testid="${prefix}-performance-journal"]`)?.replaceChildren();
}

function dispatchCoreV2ContractRunComplete(
  root: HTMLElement,
  runKind: 'run' | 'repeat',
  runResult: unknown,
): void {
  root.dispatchEvent(new CustomEvent('core-v2-contract-run-complete', {
    bubbles: true,
    detail: Object.freeze({
      operation: runKind === 'repeat' ? 'repeatCase' : 'runCase',
      run: runResult,
    }),
  }));
}

function dispatchCoreV2ContractDestroyComplete(
  root: HTMLElement,
  cleanup: unknown,
): void {
  root.dispatchEvent(new CustomEvent('core-v2-contract-destroy-complete', {
    bubbles: true,
    detail: Object.freeze({
      operation: 'destroyCase',
      cleanup,
    }),
  }));
}

function startUiRunObservation(): Readonly<{
  finish(): Promise<CoreV2ContractUiRunMetrics>;
}> {
  const startedAt = performance.now();
  const frameTimes: number[] = [];
  const longTasks: PerformanceEntry[] = [];
  let observer: PerformanceObserver | null = null;
  let active = true;
  let frameRequest = 0;
  let finishPromise: Promise<CoreV2ContractUiRunMetrics> | null = null;
  let finishRun: ((metrics: CoreV2ContractUiRunMetrics) => void) | null = null;

  const sampleFrame = (_time: number): void => {
    frameRequest = 0;
    // Callback arrival, rather than the compositor timestamp argument, captures
    // main-thread stalls that delay requestAnimationFrame delivery.
    frameTimes.push(performance.now());
    if (active) {
      frameRequest = window.requestAnimationFrame(sampleFrame);
      return;
    }
    if (observer) {
      longTasks.push(...observer.takeRecords());
      observer.disconnect();
    }
    const finishedAt = performance.now();
    const durationMs = Math.max(0, finishedAt - startedAt);
    let maxFrameGapMs = 0;
    let previous = startedAt;
    for (const frameTime of frameTimes) {
      maxFrameGapMs = Math.max(maxFrameGapMs, Math.max(0, frameTime - previous));
      previous = frameTime;
    }
    const framesPerSecond = durationMs > 0
      ? frameTimes.length * 1_000 / durationMs
      : 0;
    finishRun?.(Object.freeze({
      durationMs,
      frameCount: frameTimes.length,
      framesPerSecond,
      maxFrameGapMs,
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((total, entry) => total + entry.duration, 0),
    }));
    finishRun = null;
  };
  frameRequest = window.requestAnimationFrame(sampleFrame);
  if (
    typeof PerformanceObserver !== 'undefined'
    && PerformanceObserver.supportedEntryTypes?.includes('longtask')
  ) {
    observer = new PerformanceObserver((entries) => longTasks.push(...entries.getEntries()));
    observer.observe({ entryTypes: ['longtask'] });
  }

  return Object.freeze({
    finish(): Promise<CoreV2ContractUiRunMetrics> {
      finishPromise ??= new Promise((resolve) => {
        finishRun = resolve;
        active = false;
        if (frameRequest === 0) frameRequest = window.requestAnimationFrame(sampleFrame);
      });
      return finishPromise;
    },
  });
}

function actionResultLabel(result: unknown, fallback: string): string {
  if (!isRecord(result)) return fallback;
  const actual = isRecord(result.delta) && isRecord(result.delta.actual)
    ? result.delta.actual
    : null;
  const error = actual && isRecord(actual.error) ? actual.error : null;
  if (typeof error?.code === 'string') return `failed · ${error.code}`;
  return typeof result.status === 'string' ? result.status : fallback;
}

function resultMessageFor(
  status: ReturnType<CoreV2ContractLabBridgeV1['state']>['status'],
  execution: Readonly<Record<string, unknown>> | null,
): string {
  if (status === 'observed') {
    return 'Actual observation captured from product execution. Expected comparison and promotion are intentionally outside this focused Lab run.';
  }
  if (status === 'failed') {
    const error = execution && isRecord(execution.error) ? execution.error : null;
    return `Execution failed and its cleanup trace was retained${typeof error?.message === 'string' ? `: ${error.message}` : '.'}`;
  }
  if (status === 'running') return 'Executing the approved actions in exact order with a transient PixiJS WebGL surface.';
  if (status === 'destroyed') return 'The route bridge is destroyed; the last actual and cleanup trace remain inspectable.';
  return 'Run the exact ordered case to inspect product, event, semantic, and cleanup facts.';
}

function canvasLifetimeFor(status: ReturnType<CoreV2ContractLabBridgeV1['state']>['status']): string {
  if (status === 'running') return 'Transient PixiJS WebGL canvas is owned by the active executor generation.';
  if (status === 'observed') return 'Canvas removed by executor cleanup; semantic, event, and resource facts remain in the trace.';
  if (status === 'failed') return 'Execution failed; the executor cleanup boundary removed every tracked canvas.';
  return 'PixiJS WebGL canvas mounts only while the exact executor owns a live engine.';
}

function statusLabel(status: ReturnType<CoreV2ContractLabBridgeV1['state']>['status']): string {
  const labels = {
    loading: 'Loading',
    ready: 'Ready',
    armed: 'Ready to observe',
    running: 'Running',
    observed: 'Observed',
    'not-implemented': 'Not implemented',
    failed: 'Failed',
    destroyed: 'Destroyed',
  } as const;
  return labels[status];
}

function setText(target: Element | null, value: string): void {
  if (target) target.textContent = value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordAt(
  value: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> | null {
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

export function mountCoreV2ContractLab(
  target: HTMLElement,
  input: string | URL = window.location.href,
): CoreV2ContractLabMount {
  let route: CoreV2ContractRoute;
  try {
    route = parseCoreV2ContractRoute(input);
  } catch (error) {
    const routeError = error instanceof CoreV2ContractRouteError
      ? error
      : new CoreV2ContractRouteError('INVALID_QUERY', String(error));
    target.innerHTML = renderCoreV2ContractRouteError(routeError);
    return Object.freeze({
      route: null,
      bridge: null,
      manual: null,
      routeError,
      destroy(): Promise<void> {
        target.replaceChildren();
        return Promise.resolve();
      },
    });
  }

  target.innerHTML = renderCoreV2ContractLab(route);
  const manual = mountCoreV2ManualWorkbench(target, {
    caseId: route.scenario,
    title: route.presenter.title,
    size: route.size,
    seed: route.seed,
  });
  const surfaceHost = target.querySelector<HTMLElement>('[data-contract-surface]');
  if (!surfaceHost) throw new Error(`Core v2 contract Lab surface is missing: ${route.scenario}`);
  let executable = false;
  let bridge: CoreV2ContractLabBridgeV1;
  if (isCoreV2ExecutableCaseId(route.scenario)) {
    if (route.presenter.executionStatus !== 'actual-observable') {
      throw new Error(`Core v2 contract Lab execution-status drift: ${route.scenario}`);
    }
    executable = true;
    bridge = createCoreV2ExecutableLabBridge({
        caseId: route.scenario,
        rootTestId: route.presenter.rootTestId,
        size: route.size,
        seed: route.seed,
        surfaceHost,
      });
  } else {
    if (route.presenter.executionStatus !== 'not-implemented') {
      throw new Error(`Core v2 contract Lab stub-status drift: ${route.scenario}`);
    }
    bridge = createNotImplementedCoreV2ContractLabBridge({
        caseId: route.scenario,
        rootTestId: route.presenter.rootTestId,
        actionCount: route.presenter.actions.length,
      });
  }
  const abortController = new AbortController();
  bindShell(target, route, abortController, bridge, executable);
  window.__PATCH_MAP_CORE_V2_CONTRACT_LAB__ = bridge;

  return Object.freeze({
    route,
    bridge,
    manual,
    routeError: null,
    async destroy(): Promise<void> {
      abortController.abort();
      await Promise.all([
        bridge.destroyCase(),
        manual.destroy(),
      ]);
      if (window.__PATCH_MAP_CORE_V2_CONTRACT_LAB__ === bridge) {
        delete window.__PATCH_MAP_CORE_V2_CONTRACT_LAB__;
      }
      target.replaceChildren();
    },
  });
}

if (typeof document !== 'undefined') {
  const host = document.querySelector<HTMLElement>('[data-core-v2-contract-lab]');
  if (host) mountCoreV2ContractLab(host);
}

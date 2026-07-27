import productionShapedWorkloadJson from '../../../docs/reference/core-v2-functional-contract/evidence/production-shaped-workload.v1.json';
import {
  resolveCoreV2EditorMount,
  type CoreV2EditorMountDecision,
  type CoreV2Engine,
  type CoreV2HostTooltipPublication,
  type CoreV2HostTooltipState,
  type CoreV2HostTooltipSubscription,
} from '../../../src/core-v2';

export const CORE_V2_INTERACTION_EDITOR_RUNTIME_REVISION =
  'core-v2-interaction-editor-runtime/1' as const;
export const CORE_V2_INTERACTION_EDITOR_CLEANUP_REVISION =
  'core-v2-interaction-editor-cleanup/1' as const;

export const CORE_V2_INTERACTION_EDITOR_CASE_IDS = Object.freeze([
  'CSM-013',
  'CSM-018',
  'CSM-022',
  'CSM-023',
  'CSM-024',
] as const);

export type CoreV2InteractionEditorCaseId =
  (typeof CORE_V2_INTERACTION_EDITOR_CASE_IDS)[number];

export interface CoreV2InteractionEditorProductAdapter {
  productionDataset(input: Readonly<{
    readonly caseId: 'CSM-018';
    readonly generatorRef: 'production-shaped';
  }>): readonly Readonly<Record<string, unknown>>[];
  resolveEditorMount(blockedPlant: boolean): CoreV2EditorMountDecision;
  attachTooltipHost(input: Readonly<{
    readonly caseId: 'CSM-013';
    readonly engine: CoreV2Engine;
  }>): Readonly<Record<string, unknown>>;
  releaseTooltipHost(): Readonly<Record<string, unknown>>;
  tooltipHostProbe(): Readonly<Record<string, unknown>>;
  resourceProbe(input: Readonly<{
    readonly caseId: CoreV2InteractionEditorCaseId;
    readonly engine: CoreV2Engine;
  }>): Readonly<Record<string, unknown>>;
}

export interface CoreV2InteractionEditorRuntime {
  readonly product: CoreV2InteractionEditorProductAdapter;
  postDestroyProductProbe(): Readonly<Record<string, unknown>>;
}

/**
 * Expected-blind transport shared by the five editor/interaction consumer
 * journeys. It owns one optional host-DOM tooltip subscription and no Pixi
 * object, renderer, timer, observer, or authoritative dataset alias.
 */
export function createCoreV2InteractionEditorRuntime(
  caseId: CoreV2InteractionEditorCaseId,
): CoreV2InteractionEditorRuntime {
  requireCaseId(caseId);
  const tooltipHost = new TooltipHostLedger(caseId);
  let datasetBuildCount = 0;
  let resourceProbeCount = 0;
  let released = false;
  let cleanup: Readonly<Record<string, unknown>> | null = null;

  const product: CoreV2InteractionEditorProductAdapter = Object.freeze({
    productionDataset(input: Readonly<{
      readonly caseId: 'CSM-018';
      readonly generatorRef: 'production-shaped';
    }>) {
      assertActive(released, 'production dataset');
      invariant(caseId === 'CSM-018', 'production dataset case identity');
      invariant(input.caseId === caseId, 'production dataset request identity');
      invariant(input.generatorRef === 'production-shaped', 'production dataset generator');
      datasetBuildCount += 1;
      return deepFreeze(structuredClone(
        productionShapedWorkloadJson,
      )) as readonly Readonly<Record<string, unknown>>[];
    },

    resolveEditorMount(blockedPlant: boolean) {
      assertActive(released, 'editor mount');
      return resolveCoreV2EditorMount(blockedPlant);
    },

    attachTooltipHost(input: Readonly<{
      readonly caseId: 'CSM-013';
      readonly engine: CoreV2Engine;
    }>) {
      assertActive(released, 'tooltip host attach');
      invariant(caseId === 'CSM-013', 'tooltip host case identity');
      invariant(input.caseId === caseId, 'tooltip host request identity');
      tooltipHost.attach(input.engine);
      return tooltipHost.probe();
    },

    releaseTooltipHost() {
      tooltipHost.release();
      return tooltipHost.probe();
    },

    tooltipHostProbe() {
      return tooltipHost.probe();
    },

    resourceProbe(input: Readonly<{
      readonly caseId: CoreV2InteractionEditorCaseId;
      readonly engine: CoreV2Engine;
    }>) {
      assertActive(released, 'resource probe');
      invariant(input.caseId === caseId, 'resource probe case identity');
      const snapshot = detach(input.engine.snapshot());
      const alive =
        snapshot.lifecycle !== 'destroyed' && snapshot.lifecycle !== 'destroying';
      resourceProbeCount += 1;
      return deepFreeze({
        revision: CORE_V2_INTERACTION_EDITOR_RUNTIME_REVISION,
        caseId,
        probeCount: resourceProbeCount,
        snapshot,
        semantic: detach(input.engine.semanticProbe()),
        geometry: alive ? detach(input.engine.geometryProbe()) : null,
        history: alive ? detach(input.engine.historyInspection()) : null,
        viewport: alive ? detach(input.engine.viewportProbe()) : null,
        viewportPolicy: detach(input.engine.viewportPolicyProbe()),
        hostInteraction: detach(input.engine.hostInteractionProbe()),
        pointerGesture: detach(input.engine.pointerGestureProbe()),
        transformerEdit: detach(input.engine.transformerEditProbe()),
        transformerGesture: detach(input.engine.transformerGestureProbe()),
        selectionVisual: alive ? detach(input.engine.selectionVisualProbe()) : null,
        tooltipHost: tooltipHost.probe(),
        runtimeCounts: runtimeCounts(tooltipHost),
      });
    },
  });

  return Object.freeze({
    product,
    postDestroyProductProbe(): Readonly<Record<string, unknown>> {
      if (cleanup !== null) return cleanup;
      released = true;
      tooltipHost.release();
      cleanup = deepFreeze({
        revision: CORE_V2_INTERACTION_EDITOR_CLEANUP_REVISION,
        caseId,
        datasetBuildCount,
        resourceProbeCount,
        tooltipHost: tooltipHost.probe(),
        runtimeCounts: runtimeCounts(tooltipHost),
      });
      return cleanup;
    },
  });
}

class TooltipHostLedger {
  private readonly caseId: CoreV2InteractionEditorCaseId;
  private subscription: CoreV2HostTooltipSubscription | null = null;
  private element: HTMLElement | null = null;
  private virtualVisible = false;
  private callbackCount = 0;
  private staleCallbackCount = 0;
  private released = false;
  private latestState: CoreV2HostTooltipState | null = null;

  public constructor(caseId: CoreV2InteractionEditorCaseId) {
    this.caseId = caseId;
  }

  public attach(engine: CoreV2Engine): void {
    invariant(this.subscription === null, 'tooltip host attaches once');
    invariant(!this.released, 'tooltip host is not released');
    this.subscription = engine.bindTooltipHost((publication) => {
      this.consume(publication);
    });
  }

  public release(): void {
    if (this.released) return;
    this.released = true;
    this.subscription?.dispose();
    this.subscription = null;
    this.removeNode();
  }

  public probe(): Readonly<Record<string, unknown>> {
    const domCount = this.element?.isConnected === true
      ? 1
      : this.virtualVisible
        ? 1
        : 0;
    return deepFreeze({
      caseId: this.caseId,
      callbackCount: this.callbackCount,
      staleCallbackCount: this.staleCallbackCount,
      activeSubscriptionCount: this.subscription === null ? 0 : 1,
      hostDomCount: domCount,
      hostDomRemoved: domCount === 0,
      released: this.released,
      latestState: this.latestState === null ? null : detach(this.latestState),
    });
  }

  public activeSubscriptionCount(): 0 | 1 {
    return this.subscription === null ? 0 : 1;
  }

  public hostDomCount(): 0 | 1 {
    return this.element?.isConnected === true || this.virtualVisible ? 1 : 0;
  }

  private consume(publication: CoreV2HostTooltipPublication): void {
    if (this.released) {
      this.staleCallbackCount += 1;
      return;
    }
    this.callbackCount += 1;
    this.latestState = publication.state;
    if (publication.state.targetId === null) {
      this.removeNode();
      return;
    }
    if (typeof document === 'undefined') {
      this.virtualVisible = true;
      return;
    }
    const element = this.element ?? document.createElement('div');
    element.dataset.coreV2TooltipHost = this.caseId;
    element.textContent = publication.state.targetId;
    element.style.position = 'fixed';
    const [x, y, width, height] = publication.state.boundsCss ?? [0, 0, 0, 0];
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    if (!element.isConnected) document.body.append(element);
    this.element = element;
  }

  private removeNode(): void {
    this.element?.remove();
    this.element = null;
    this.virtualVisible = false;
  }
}

function runtimeCounts(tooltipHost: TooltipHostLedger): Readonly<Record<string, number>> {
  return Object.freeze({
    engines: 0,
    renderers: 0,
    listeners: tooltipHost.activeSubscriptionCount(),
    observers: 0,
    timers: 0,
    pendingWork: 0,
    hostDomNodes: tooltipHost.hostDomCount(),
  });
}

function requireCaseId(value: unknown): CoreV2InteractionEditorCaseId {
  invariant(
    typeof value === 'string'
      && CORE_V2_INTERACTION_EDITOR_CASE_IDS.includes(
        value as CoreV2InteractionEditorCaseId,
      ),
    'unsupported case identity',
  );
  return value as CoreV2InteractionEditorCaseId;
}

function assertActive(released: boolean, operation: string): void {
  invariant(!released, `${operation} requires an active runtime`);
}

function detach<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid Core v2 interaction/editor runtime: ${message}`);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

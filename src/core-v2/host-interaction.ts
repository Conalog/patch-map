import type {
  CoreV2LogicalTargetKey,
  CoreV2LogicalTargetSnapshot,
  CoreV2SceneQuery,
} from './query-selection';
import type { CoreV2SemanticPointerEvent } from './pointer-gesture';
import type { CoreV2MutationTarget } from './semantic/transaction';

export const CORE_V2_HOST_INTERACTION_REVISION = 'core-v2-host-interaction/1' as const;
export const CORE_V2_COMMAND_TARGET_REVISION = 'core-v2-command-target/1' as const;
export const CORE_V2_HOST_TOOLTIP_REVISION = 'core-v2-host-tooltip/1' as const;
export const CORE_V2_EDITOR_MOUNT_REVISION = 'core-v2-editor-mount/1' as const;

export type CoreV2CommandTargetStatus = 'pending' | 'active' | 'released';

export interface CoreV2CommandTargetState {
  readonly schemaRevision: typeof CORE_V2_COMMAND_TARGET_REVISION;
  readonly commandId: string;
  readonly targetIds: readonly string[];
  readonly status: CoreV2CommandTargetStatus | null;
  readonly statusTrace: readonly CoreV2CommandTargetStatus[];
}

export type CoreV2TooltipClearReason = 'drag' | 'redraw' | 'destroy' | 'empty-target';

export interface CoreV2HostTooltipInput {
  readonly targetId: string;
  readonly anchorCss: readonly [number, number];
  readonly viewportCssPx: readonly [number, number];
  readonly tooltipSizeCssPx: readonly [number, number];
}

export interface CoreV2HostTooltipState {
  readonly schemaRevision: typeof CORE_V2_HOST_TOOLTIP_REVISION;
  readonly targetId: string | null;
  readonly anchorCss: readonly [number, number] | null;
  readonly boundsCss: readonly [number, number, number, number] | null;
  readonly pinned: boolean;
  readonly revision: number;
  readonly clearTrace: readonly CoreV2TooltipClearReason[];
  readonly destroyed: boolean;
}

export interface CoreV2HostTooltipPublication {
  readonly reason: 'hover' | 'pin' | 'unpin' | CoreV2TooltipClearReason;
  readonly state: CoreV2HostTooltipState;
}

export interface CoreV2HostTooltipSubscription {
  dispose(): 'disposed' | 'already-disposed';
}

export interface CoreV2EditorMountDecision {
  readonly schemaRevision: typeof CORE_V2_EDITOR_MOUNT_REVISION;
  readonly status: 'allowed' | 'blocked';
  readonly blockedPlant: boolean;
  readonly createsEngine: boolean;
  readonly canvasBudget: 0 | 1;
}

export type CoreV2LogicalEventBindingDescriptor =
  | Readonly<{
      readonly id: string;
      readonly event: 'click';
      readonly target: CoreV2MutationTarget | null;
    }>
  | Readonly<{
      readonly id: string;
      readonly event: 'click';
      readonly query: CoreV2SceneQuery;
    }>;

export interface CoreV2LogicalEventDelivery {
  readonly event: 'click';
  readonly targetId: string | null;
  readonly targetKey: CoreV2LogicalTargetKey | 'surface';
  readonly bindingIds: readonly string[];
  readonly pointer: CoreV2SemanticPointerEvent['payload'];
}

export interface CoreV2LogicalEventBindingProbe {
  readonly enabled: boolean;
  readonly disposed: boolean;
  readonly bindingCount: number;
  readonly listenerCount: 0 | 1;
  readonly deliveryCount: number;
}

export interface CoreV2LogicalEventBindingHandle {
  enable(): 'enabled' | 'already-enabled' | 'disposed';
  disable(): 'disabled' | 'already-disabled' | 'disposed';
  dispose(): 'disposed' | 'already-disposed';
  probe(): CoreV2LogicalEventBindingProbe;
}

export interface CoreV2HostObservedEvent {
  readonly family: string;
  readonly type: string;
  readonly revision: number;
  readonly payload: unknown;
}

export interface CoreV2HostEventSubscription {
  dispose(): 'disposed' | 'already-disposed';
}

export type CoreV2InteractionMode =
  | 'select'
  | 'pan'
  | 'transform'
  | 'relation-paint'
  | 'text-edit';

export type CoreV2InteractionModeOperation =
  | Readonly<{ readonly op: 'replace' | 'push'; readonly state: string }>
  | Readonly<{ readonly op: 'pause' | 'resume' | 'pop' | 'blur' }>
  | Readonly<{
      readonly op: 'temporary';
      readonly state: string;
      readonly modifier: string;
    }>
  | Readonly<{ readonly op: 'release-temporary'; readonly modifier: string }>;

export interface CoreV2InteractionModeResult {
  readonly status: 'changed' | 'unchanged' | 'rejected';
  readonly code: 'MISSING_TARGET' | null;
  readonly activeState: CoreV2InteractionMode;
  readonly lifecycleDelta: readonly string[];
}

export interface CoreV2InteractionModeProbe {
  readonly activeState: CoreV2InteractionMode;
  readonly stack: readonly CoreV2InteractionMode[];
  readonly lifecycle: readonly string[];
  readonly temporaryModeCount: 0 | 1;
  readonly temporaryModifiers: readonly string[];
  readonly captureCount: 0;
  readonly activeOwnerCount: 0 | 1;
  readonly paused: boolean;
  readonly destroyed: boolean;
}

export interface CoreV2LogicalPropagationOptions {
  readonly phase?: 'capture' | 'target' | 'bubble';
  readonly mode?: 'none' | 'stop' | 'immediate-stop';
}

export interface CoreV2LogicalPropagationTrace {
  readonly phases: readonly string[];
  readonly currentTargets: readonly string[];
  readonly composedPath: readonly string[];
  readonly target: string;
  readonly targetListenerCount: number;
  readonly sceneRevision: number;
}

export interface CoreV2SelectionHostPublication {
  readonly selectedIds: readonly string[];
  readonly interactionRevision: number;
}

export interface CoreV2HostInteractionProbe {
  readonly bindings: number;
  readonly bindingListeners: number;
  readonly eventSubscriptions: number;
  readonly selectionHostListeners: number;
  readonly tooltipHostListeners: number;
  readonly callbackFailureCount: number;
  readonly tooltip: CoreV2HostTooltipState;
  readonly mode: CoreV2InteractionModeProbe;
  readonly destroyed: boolean;
}

interface BindingGroup {
  readonly descriptors: readonly CoreV2LogicalEventBindingDescriptor[];
  readonly listener: (delivery: CoreV2LogicalEventDelivery) => void;
  enabled: boolean;
  disposed: boolean;
  deliveryCount: number;
}

interface ObservedSubscription {
  readonly family: string;
  readonly type: string | null;
  readonly listener: (event: CoreV2HostObservedEvent) => void;
  disposed: boolean;
}

export interface CoreV2HostInteractionAuthorityOptions {
  readonly queryTargets: (query: CoreV2SceneQuery) => readonly CoreV2LogicalTargetSnapshot[];
  readonly normalMode?: CoreV2InteractionMode;
  readonly modes?: readonly CoreV2InteractionMode[];
}

/**
 * Resolve the host's editor mount decision before an Engine or Pixi canvas is
 * allocated. A blocked plant is a complete preflight result, not a late
 * renderer teardown path.
 */
export function resolveCoreV2EditorMount(
  blockedPlant: boolean,
): CoreV2EditorMountDecision {
  if (typeof blockedPlant !== 'boolean') {
    throw new TypeError('editor blockedPlant must be a boolean');
  }
  return Object.freeze({
    schemaRevision: CORE_V2_EDITOR_MOUNT_REVISION,
    status: blockedPlant ? 'blocked' : 'allowed',
    blockedPlant,
    createsEngine: !blockedPlant,
    canvasBudget: blockedPlant ? 0 : 1,
  });
}

/**
 * Freeze the exact logical selection used to open a host command. The value is
 * detached from later Engine selection changes; hosts may carry it through an
 * asynchronous pending/active/released lifecycle without retaining renderer
 * objects or entity callbacks.
 */
export function createCoreV2CommandTargetState(
  commandId: string,
  targetIdsValue: readonly string[],
): CoreV2CommandTargetState {
  validateNonEmptyString(commandId, 'command target ID');
  if (!Array.isArray(targetIdsValue)) {
    throw new TypeError('command target IDs must be an array');
  }
  const targetIds = [...new Set(targetIdsValue.map((targetId, index) => {
    validateNonEmptyString(targetId, `command target ID ${index}`);
    return targetId;
  }))];
  return Object.freeze({
    schemaRevision: CORE_V2_COMMAND_TARGET_REVISION,
    commandId,
    targetIds: Object.freeze(targetIds),
    status: null,
    statusTrace: Object.freeze([]),
  });
}

/** Return a new immutable command state while preserving its frozen target IDs. */
export function advanceCoreV2CommandTargetState(
  current: CoreV2CommandTargetState,
  status: CoreV2CommandTargetStatus,
): CoreV2CommandTargetState {
  if (
    current === null ||
    typeof current !== 'object' ||
    current.schemaRevision !== CORE_V2_COMMAND_TARGET_REVISION ||
    typeof current.commandId !== 'string' ||
    !Array.isArray(current.targetIds) ||
    !Array.isArray(current.statusTrace)
  ) {
    throw new TypeError('command target state is invalid');
  }
  if (!['pending', 'active', 'released'].includes(status)) {
    throw new TypeError('command target status is unsupported');
  }
  const targetIds: string[] = [];
  for (const [index, targetId] of (current.targetIds as readonly unknown[]).entries()) {
    validateNonEmptyString(targetId, `command target ID ${index}`);
    targetIds.push(targetId);
  }
  const statusTrace: CoreV2CommandTargetStatus[] = [];
  for (const entry of current.statusTrace as readonly unknown[]) {
    if (!['pending', 'active', 'released'].includes(String(entry))) {
      throw new TypeError('command target status trace is invalid');
    }
    statusTrace.push(entry as CoreV2CommandTargetStatus);
  }
  statusTrace.push(status);
  return Object.freeze({
    schemaRevision: CORE_V2_COMMAND_TARGET_REVISION,
    commandId: current.commandId,
    targetIds: Object.freeze(targetIds),
    status,
    statusTrace: Object.freeze(statusTrace),
  });
}

/**
 * Host-facing interaction state. It stores logical descriptors and callbacks
 * only; renderer objects, per-entity listeners, timers, and tickers never enter
 * this authority.
 */
export class CoreV2HostInteractionAuthority {
  private readonly queryTargets: CoreV2HostInteractionAuthorityOptions['queryTargets'];
  private readonly bindingGroups = new Set<BindingGroup>();
  private readonly subscriptions = new Set<ObservedSubscription>();
  private readonly selectionHostListeners = new Set<
    (publication: CoreV2SelectionHostPublication) => void
  >();
  private readonly tooltipHostListeners = new Set<
    (publication: CoreV2HostTooltipPublication) => void
  >();
  private readonly modes: CoreV2InteractionModeAuthority;
  private tooltipState: CoreV2HostTooltipState = emptyTooltipState();
  private tooltipEverActive = false;
  private callbackFailureCount = 0;
  private destroyed = false;

  public constructor(options: CoreV2HostInteractionAuthorityOptions) {
    this.queryTargets = options.queryTargets;
    this.modes = new CoreV2InteractionModeAuthority({
      normal: options.normalMode ?? 'select',
      modes: options.modes ?? ['select', 'pan', 'transform', 'relation-paint', 'text-edit'],
    });
  }

  public bindLogicalEvents(
    descriptorsValue: readonly CoreV2LogicalEventBindingDescriptor[],
    listener: (delivery: CoreV2LogicalEventDelivery) => void,
  ): CoreV2LogicalEventBindingHandle {
    this.assertAlive('bindLogicalEvents');
    const descriptorInputs: readonly CoreV2LogicalEventBindingDescriptor[] =
      descriptorsValue;
    if (!Array.isArray(descriptorsValue) || descriptorsValue.length === 0) {
      throw new TypeError('logical event bindings must be a non-empty array');
    }
    if (typeof listener !== 'function') {
      throw new TypeError('logical event binding listener must be a function');
    }
    const descriptorIds = new Set<string>();
    const descriptors = descriptorInputs.map((descriptor, index) => {
      const normalized = normalizeBindingDescriptor(descriptor, index);
      if (descriptorIds.has(normalized.id)) {
        throw new Error(`duplicate logical event binding ${normalized.id}`);
      }
      descriptorIds.add(normalized.id);
      return normalized;
    });
    const group: BindingGroup = {
      descriptors: Object.freeze(descriptors),
      listener,
      enabled: false,
      disposed: false,
      deliveryCount: 0,
    };
    this.bindingGroups.add(group);
    return Object.freeze({
      enable: () => {
        if (group.disposed) return 'disposed';
        if (group.enabled) return 'already-enabled';
        group.enabled = true;
        return 'enabled';
      },
      disable: () => {
        if (group.disposed) return 'disposed';
        if (!group.enabled) return 'already-disabled';
        group.enabled = false;
        return 'disabled';
      },
      dispose: () => {
        if (group.disposed) return 'already-disposed';
        group.disposed = true;
        group.enabled = false;
        this.bindingGroups.delete(group);
        return 'disposed';
      },
      probe: () => bindingProbe(group),
    });
  }

  public dispatchPointerEvent(
    event: CoreV2SemanticPointerEvent,
  ): readonly CoreV2LogicalEventDelivery[] {
    if (this.destroyed || event.type !== 'click') return Object.freeze([]);
    const deliveries: CoreV2LogicalEventDelivery[] = [];
    for (const group of this.bindingGroups) {
      if (!group.enabled || group.disposed) continue;
      const bindingIds = matchingBindingIds(group.descriptors, event, this.queryTargets);
      if (bindingIds.length === 0) continue;
      const targetId = event.payload.target?.id ?? null;
      const delivery = Object.freeze({
        event: 'click',
        targetId,
        targetKey: targetId === null ? 'surface' : `element:${targetId}`,
        bindingIds,
        pointer: event.payload,
      } satisfies CoreV2LogicalEventDelivery);
      deliveries.push(delivery);
      group.deliveryCount += 1;
      try {
        group.listener(delivery);
      } catch {
        this.callbackFailureCount += 1;
      }
    }
    return Object.freeze(deliveries);
  }

  public redrawBindings(): number {
    if (this.destroyed) return 0;
    return [...this.bindingGroups].filter((group) => !group.disposed).length;
  }

  /**
   * Dispose scene-bound logical bindings without touching host-wide event or
   * selection observers. A replacement scene may reuse the same logical IDs,
   * so revision checks alone cannot prevent an old binding from attaching to
   * the new authority.
   */
  public clearLogicalBindings(): number {
    if (this.destroyed) return 0;
    let disposedCount = 0;
    for (const group of this.bindingGroups) {
      if (group.disposed) continue;
      disposedCount += group.descriptors.length;
      group.enabled = false;
      group.disposed = true;
    }
    this.bindingGroups.clear();
    return disposedCount;
  }

  public subscribe(
    family: string,
    type: string | null,
    listener: (event: CoreV2HostObservedEvent) => void,
  ): CoreV2HostEventSubscription {
    this.assertAlive('subscribe');
    validateNonEmptyString(family, 'event family');
    if (type !== null) validateNonEmptyString(type, 'event type');
    if (typeof listener !== 'function') {
      throw new TypeError('host event listener must be a function');
    }
    const subscription: ObservedSubscription = {
      family,
      type,
      listener,
      disposed: false,
    };
    this.subscriptions.add(subscription);
    return Object.freeze({
      dispose: () => {
        if (subscription.disposed) return 'already-disposed';
        subscription.disposed = true;
        this.subscriptions.delete(subscription);
        return 'disposed';
      },
    });
  }

  public publish(
    family: string,
    type: string,
    payload: unknown,
    revision: number,
  ): readonly CoreV2HostObservedEvent[] {
    if (this.destroyed) return Object.freeze([]);
    validateNonEmptyString(family, 'event family');
    validateNonEmptyString(type, 'event type');
    if (!Number.isFinite(revision)) throw new RangeError('event revision must be finite');
    const specificPayload = freezePayload(payload);
    const familyPayload = isRecord(specificPayload)
      ? Object.freeze({ ...specificPayload, family, type })
      : Object.freeze({ value: specificPayload, family, type });
    const deliveries: CoreV2HostObservedEvent[] = [];
    const deliver = (
      subscription: ObservedSubscription,
      eventPayload: unknown,
    ): void => {
      const event = Object.freeze({ family, type, revision, payload: eventPayload });
      deliveries.push(event);
      try {
        subscription.listener(event);
      } catch {
        this.callbackFailureCount += 1;
      }
    };
    for (const subscription of this.subscriptions) {
      if (!subscription.disposed && subscription.family === family && subscription.type === type) {
        deliver(subscription, specificPayload);
      }
    }
    for (const subscription of this.subscriptions) {
      if (!subscription.disposed && subscription.family === family && subscription.type === null) {
        deliver(subscription, familyPayload);
      }
    }
    return Object.freeze(deliveries);
  }

  public bindSelectionHost(
    listener: (publication: CoreV2SelectionHostPublication) => void,
  ): () => void {
    this.assertAlive('bindSelectionHost');
    if (typeof listener !== 'function') {
      throw new TypeError('selection host listener must be a function');
    }
    this.selectionHostListeners.add(listener);
    return () => {
      this.selectionHostListeners.delete(listener);
    };
  }

  public publishSelectionToHost(
    selectedIds: readonly string[],
    interactionRevision: number,
  ): CoreV2SelectionHostPublication {
    const publication = Object.freeze({
      selectedIds: Object.freeze([...selectedIds]),
      interactionRevision,
    });
    if (this.destroyed) return publication;
    for (const listener of [...this.selectionHostListeners]) {
      try {
        listener(publication);
      } catch {
        this.callbackFailureCount += 1;
      }
    }
    return publication;
  }

  public bindTooltipHost(
    listener: (publication: CoreV2HostTooltipPublication) => void,
  ): CoreV2HostTooltipSubscription {
    this.assertAlive('bindTooltipHost');
    if (typeof listener !== 'function') {
      throw new TypeError('tooltip host listener must be a function');
    }
    let disposed = false;
    this.tooltipHostListeners.add(listener);
    return Object.freeze({
      dispose: () => {
        if (disposed) return 'already-disposed';
        disposed = true;
        this.tooltipHostListeners.delete(listener);
        return 'disposed';
      },
    });
  }

  public hoverTooltip(inputValue: CoreV2HostTooltipInput): CoreV2HostTooltipState {
    this.assertAlive('hoverTooltip');
    const input = normalizeTooltipInput(inputValue);
    if (this.tooltipState.pinned && this.tooltipState.targetId !== input.targetId) {
      return this.tooltipProbe();
    }
    this.tooltipEverActive = true;
    this.tooltipState = tooltipState(
      input,
      false,
      this.tooltipState.revision + 1,
      this.tooltipState.clearTrace,
      false,
    );
    this.publishTooltip('hover');
    return this.tooltipProbe();
  }

  public toggleTooltipPin(
    inputValue: CoreV2HostTooltipInput,
  ): CoreV2HostTooltipState {
    this.assertAlive('toggleTooltipPin');
    const input = normalizeTooltipInput(inputValue);
    this.tooltipEverActive = true;
    const pinned = !(
      this.tooltipState.targetId === input.targetId &&
      this.tooltipState.pinned
    );
    this.tooltipState = tooltipState(
      input,
      pinned,
      this.tooltipState.revision + 1,
      this.tooltipState.clearTrace,
      false,
    );
    this.publishTooltip(pinned ? 'pin' : 'unpin');
    return this.tooltipProbe();
  }

  public clearTooltip(reason: CoreV2TooltipClearReason): CoreV2HostTooltipState {
    if (!isTooltipClearReason(reason)) {
      throw new TypeError('tooltip clear reason is unsupported');
    }
    if (this.destroyed || !this.tooltipEverActive) return this.tooltipProbe();
    this.tooltipState = Object.freeze({
      schemaRevision: CORE_V2_HOST_TOOLTIP_REVISION,
      targetId: null,
      anchorCss: null,
      boundsCss: null,
      pinned: false,
      revision: this.tooltipState.revision + 1,
      clearTrace: Object.freeze([...this.tooltipState.clearTrace, reason]),
      destroyed: false,
    });
    this.publishTooltip(reason);
    return this.tooltipProbe();
  }

  public tooltipProbe(): CoreV2HostTooltipState {
    const anchorCss: readonly [number, number] | null =
      this.tooltipState.anchorCss === null
        ? null
        : Object.freeze([
            this.tooltipState.anchorCss[0],
            this.tooltipState.anchorCss[1],
          ]);
    const boundsCss: readonly [number, number, number, number] | null =
      this.tooltipState.boundsCss === null
        ? null
        : Object.freeze([
            this.tooltipState.boundsCss[0],
            this.tooltipState.boundsCss[1],
            this.tooltipState.boundsCss[2],
            this.tooltipState.boundsCss[3],
          ]);
    return Object.freeze({
      ...this.tooltipState,
      anchorCss,
      boundsCss,
      clearTrace: Object.freeze([...this.tooltipState.clearTrace]),
      destroyed: this.destroyed,
    });
  }

  public applyModeOperation(
    operation: CoreV2InteractionModeOperation,
  ): CoreV2InteractionModeResult {
    this.assertAlive('applyModeOperation');
    return this.modes.apply(operation);
  }

  public modeProbe(): CoreV2InteractionModeProbe {
    return this.modes.probe();
  }

  public inputOwner(state: string, input: string): string | null {
    this.assertAlive('inputOwner');
    return this.modes.inputOwner(state, input);
  }

  public probe(): CoreV2HostInteractionProbe {
    const groups = [...this.bindingGroups].filter((group) => !group.disposed);
    return Object.freeze({
      bindings: groups.reduce((total, group) => total + group.descriptors.length, 0),
      bindingListeners: groups.filter((group) => group.enabled).length,
      eventSubscriptions: [...this.subscriptions].filter(({ disposed }) => !disposed).length,
      selectionHostListeners: this.selectionHostListeners.size,
      tooltipHostListeners: this.tooltipHostListeners.size,
      callbackFailureCount: this.callbackFailureCount,
      tooltip: this.tooltipProbe(),
      mode: this.modes.probe(),
      destroyed: this.destroyed,
    });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.clearTooltip('destroy');
    for (const group of this.bindingGroups) {
      group.enabled = false;
      group.disposed = true;
    }
    for (const subscription of this.subscriptions) subscription.disposed = true;
    this.bindingGroups.clear();
    this.subscriptions.clear();
    this.selectionHostListeners.clear();
    this.tooltipHostListeners.clear();
    this.modes.destroy();
    this.destroyed = true;
  }

  private publishTooltip(
    reason: CoreV2HostTooltipPublication['reason'],
  ): void {
    const publication = Object.freeze({
      reason,
      state: this.tooltipProbe(),
    });
    for (const listener of [...this.tooltipHostListeners]) {
      try {
        listener(publication);
      } catch {
        this.callbackFailureCount += 1;
      }
    }
  }

  private assertAlive(operation: string): void {
    if (this.destroyed) {
      throw new Error(`Core v2 host interaction authority is destroyed: ${operation}`);
    }
  }
}

export class CoreV2InteractionModeAuthority {
  private readonly normal: CoreV2InteractionMode;
  private readonly supported: ReadonlySet<CoreV2InteractionMode>;
  private readonly stack: CoreV2InteractionMode[] = [];
  private readonly lifecycle: string[] = [];
  private temporary: Readonly<{
    readonly state: CoreV2InteractionMode;
    readonly previous: CoreV2InteractionMode;
    readonly modifier: string;
  }> | null = null;
  private paused = false;
  private destroyed = false;

  public constructor(options: Readonly<{
    readonly normal: CoreV2InteractionMode;
    readonly modes: readonly CoreV2InteractionMode[];
  }>) {
    const supported = new Set(options.modes);
    if (!supported.has(options.normal)) {
      throw new Error('normal interaction mode must be supported');
    }
    this.normal = options.normal;
    this.supported = supported;
  }

  public apply(operation: CoreV2InteractionModeOperation): CoreV2InteractionModeResult {
    if (this.destroyed) throw new Error('Core v2 interaction mode authority is destroyed');
    const lifecycleStart = this.lifecycle.length;
    let status: CoreV2InteractionModeResult['status'] = 'unchanged';
    let code: CoreV2InteractionModeResult['code'] = null;
    if (operation.op === 'replace' || operation.op === 'push') {
      const state = this.asSupported(operation.state);
      if (state === null) {
        status = 'rejected';
        code = 'MISSING_TARGET';
      } else if (operation.op === 'replace') {
        status = this.replace(state);
      } else {
        status = this.push(state);
      }
    } else if (operation.op === 'pop') {
      status = this.pop();
    } else if (operation.op === 'pause') {
      if (!this.paused) {
        this.paused = true;
        this.lifecycle.push(`pause:${this.activeState()}`);
        status = 'changed';
      }
    } else if (operation.op === 'resume') {
      if (this.paused) {
        this.paused = false;
        this.lifecycle.push(`resume:${this.activeState()}`);
        status = 'changed';
      }
    } else if (operation.op === 'temporary') {
      const state = this.asSupported(operation.state);
      if (state === null) {
        status = 'rejected';
        code = 'MISSING_TARGET';
      } else {
        status = this.startTemporary(state, operation.modifier);
      }
    } else if (operation.op === 'release-temporary') {
      status = this.releaseTemporary(operation.modifier);
    } else {
      status = this.blur();
    }
    return Object.freeze({
      status,
      code,
      activeState: this.activeState(),
      lifecycleDelta: Object.freeze(this.lifecycle.slice(lifecycleStart)),
    });
  }

  public inputOwner(stateValue: string, input: string): string | null {
    const state = this.asSupported(stateValue);
    if (state === null || typeof input !== 'string' || input.length === 0) return null;
    if (state === 'select' && input !== 'pointer-click') return null;
    if (
      (state === 'pan' || state === 'transform' || state === 'relation-paint') &&
      input !== 'pointer-drag'
    ) {
      return null;
    }
    return state;
  }

  public probe(): CoreV2InteractionModeProbe {
    return Object.freeze({
      activeState: this.activeState(),
      stack: Object.freeze([...this.stack]),
      lifecycle: Object.freeze([...this.lifecycle]),
      temporaryModeCount: this.temporary === null ? 0 : 1,
      temporaryModifiers: Object.freeze(
        this.temporary === null ? [] : [this.temporary.modifier],
      ),
      captureCount: 0,
      activeOwnerCount: this.destroyed ? 0 : 1,
      paused: this.paused,
      destroyed: this.destroyed,
    });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.stack.splice(0);
    this.temporary = null;
    this.paused = false;
    this.destroyed = true;
  }

  private replace(state: CoreV2InteractionMode): 'changed' | 'unchanged' {
    if (this.stack.length === 1 && this.stack[0] === state) return 'unchanged';
    if (this.stack.length > 0) this.lifecycle.push(`exit:${this.activeState()}`);
    this.stack.splice(0, this.stack.length, state);
    this.lifecycle.push(`enter:${state}`);
    this.temporary = null;
    this.paused = false;
    return 'changed';
  }

  private push(state: CoreV2InteractionMode): 'changed' | 'unchanged' {
    if (this.activeState() === state) return 'unchanged';
    if (this.stack.length > 0) this.lifecycle.push(`exit:${this.activeState()}`);
    this.stack.push(state);
    this.lifecycle.push(`enter:${state}`);
    this.temporary = null;
    this.paused = false;
    return 'changed';
  }

  private pop(): 'changed' | 'unchanged' {
    if (this.stack.length <= 1) return 'unchanged';
    this.lifecycle.push(`exit:${this.activeState()}`);
    this.stack.pop();
    this.lifecycle.push(`enter:${this.activeState()}`);
    this.temporary = null;
    this.paused = false;
    return 'changed';
  }

  private startTemporary(
    state: CoreV2InteractionMode,
    modifier: string,
  ): 'changed' | 'unchanged' {
    validateNonEmptyString(modifier, 'temporary mode modifier');
    if (this.temporary !== null) return 'unchanged';
    const previous = this.activeState();
    this.temporary = Object.freeze({ state, previous, modifier });
    if (state === previous) return 'changed';
    this.lifecycle.push(`exit:${previous}`, `enter:${state}`);
    return 'changed';
  }

  private releaseTemporary(modifier: string): 'changed' | 'unchanged' {
    const temporary = this.temporary;
    if (temporary === null || temporary.modifier !== modifier) return 'unchanged';
    this.temporary = null;
    if (temporary.state !== temporary.previous) {
      this.lifecycle.push(`exit:${temporary.state}`, `enter:${temporary.previous}`);
    }
    return 'changed';
  }

  private blur(): 'changed' | 'unchanged' {
    const before = this.activeState();
    const hadTemporary = this.temporary !== null;
    const wasPaused = this.paused;
    this.temporary = null;
    this.paused = false;
    if (before !== this.normal) {
      this.lifecycle.push(`exit:${before}`, `enter:${this.normal}`);
      this.stack.splice(0, this.stack.length, this.normal);
      return 'changed';
    }
    if (this.stack.length === 0) this.stack.push(this.normal);
    else this.stack.splice(0, this.stack.length, this.normal);
    return hadTemporary || wasPaused ? 'changed' : 'unchanged';
  }

  private activeState(): CoreV2InteractionMode {
    return this.temporary?.state ?? this.stack.at(-1) ?? this.normal;
  }

  private asSupported(value: string): CoreV2InteractionMode | null {
    return this.supported.has(value as CoreV2InteractionMode)
      ? value as CoreV2InteractionMode
      : null;
  }
}

function emptyTooltipState(): CoreV2HostTooltipState {
  return Object.freeze({
    schemaRevision: CORE_V2_HOST_TOOLTIP_REVISION,
    targetId: null,
    anchorCss: null,
    boundsCss: null,
    pinned: false,
    revision: 0,
    clearTrace: Object.freeze([]),
    destroyed: false,
  });
}

function tooltipState(
  input: CoreV2HostTooltipInput,
  pinned: boolean,
  revision: number,
  clearTrace: readonly CoreV2TooltipClearReason[],
  destroyed: boolean,
): CoreV2HostTooltipState {
  const [viewportWidth, viewportHeight] = input.viewportCssPx;
  const [tooltipWidth, tooltipHeight] = input.tooltipSizeCssPx;
  const x = Math.min(
    Math.max(0, input.anchorCss[0]),
    Math.max(0, viewportWidth - tooltipWidth),
  );
  const y = Math.min(
    Math.max(0, input.anchorCss[1]),
    Math.max(0, viewportHeight - tooltipHeight),
  );
  const boundsCss: readonly [number, number, number, number] = Object.freeze([
    x,
    y,
    tooltipWidth,
    tooltipHeight,
  ]);
  return Object.freeze({
    schemaRevision: CORE_V2_HOST_TOOLTIP_REVISION,
    targetId: input.targetId,
    anchorCss: input.anchorCss,
    boundsCss,
    pinned,
    revision,
    clearTrace: Object.freeze([...clearTrace]),
    destroyed,
  });
}

function normalizeTooltipInput(
  value: CoreV2HostTooltipInput,
): CoreV2HostTooltipInput {
  if (!isRecord(value)) throw new TypeError('tooltip input must be an object');
  validateNonEmptyString(value.targetId, 'tooltip target ID');
  return Object.freeze({
    targetId: value.targetId,
    anchorCss: finitePair(value.anchorCss, 'tooltip anchorCss', true),
    viewportCssPx: finitePair(value.viewportCssPx, 'tooltip viewportCssPx', false),
    tooltipSizeCssPx: finitePair(value.tooltipSizeCssPx, 'tooltip sizeCssPx', false),
  });
}

function finitePair(
  value: readonly [number, number],
  label: string,
  allowNegative: boolean,
): readonly [number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((entry) =>
      typeof entry !== 'number' ||
      !Number.isFinite(entry) ||
      (!allowNegative && !(entry > 0)))
  ) {
    throw new TypeError(
      `${label} must contain two ${allowNegative ? 'finite' : 'positive finite'} numbers`,
    );
  }
  return Object.freeze([value[0], value[1]]);
}

function isTooltipClearReason(value: string): value is CoreV2TooltipClearReason {
  return ['drag', 'redraw', 'destroy', 'empty-target'].includes(value);
}

export function createCoreV2LogicalPropagationTrace(
  target: CoreV2LogicalTargetSnapshot,
  sceneRevision: number,
  options: CoreV2LogicalPropagationOptions = {},
): CoreV2LogicalPropagationTrace {
  if (!Number.isFinite(sceneRevision)) {
    throw new RangeError('logical propagation scene revision must be finite');
  }
  const mode = options.mode ?? 'none';
  const stopPhase = options.phase ?? 'target';
  const targetName = logicalTargetName(target.key);
  const ancestorNames = target.kind === 'component' && target.ownerId !== null
    ? [logicalTargetName(`element:${target.ownerId}`)]
    : [];
  const composedPath = Object.freeze([targetName, ...ancestorNames, 'surface']);
  const captureNames = Object.freeze(['surface', ...[...ancestorNames].reverse()]);
  const phases: string[] = [];
  const currentTargets: string[] = [];
  const append = (phase: string, name: string): void => {
    phases.push(`${phase}:${name}`);
    currentTargets.push(name);
  };
  for (const name of captureNames) {
    append('capture', name);
    if (mode !== 'none' && stopPhase === 'capture') {
      return propagationTrace(
        phases,
        currentTargets,
        composedPath,
        targetName,
        mode === 'immediate-stop' ? 1 : 2,
        sceneRevision,
      );
    }
  }
  append('target', targetName);
  if (mode === 'none' || stopPhase !== 'target') {
    for (const name of [...ancestorNames, 'surface']) append('bubble', name);
  }
  return propagationTrace(
    phases,
    currentTargets,
    composedPath,
    targetName,
    mode === 'immediate-stop' ? 1 : 2,
    sceneRevision,
  );
}

export function coreV2OwnsKeyboardInput(pathKind: string): boolean {
  validateNonEmptyString(pathKind, 'keyboard input path');
  return pathKind === 'canvas';
}

export function coreV2TransformerHandlePropagationProbe(): Readonly<{
  readonly owner: 'transformer';
  readonly surfaceDeliveryCount: 0;
}> {
  return Object.freeze({ owner: 'transformer', surfaceDeliveryCount: 0 });
}

function normalizeBindingDescriptor(
  descriptor: CoreV2LogicalEventBindingDescriptor,
  index: number,
): CoreV2LogicalEventBindingDescriptor {
  if (!isRecord(descriptor)) {
    throw new TypeError(`logical event binding ${index} must be an object`);
  }
  validateNonEmptyString(descriptor.id, `logical event binding ${index} id`);
  if (descriptor.event !== 'click') {
    throw new TypeError(`logical event binding ${index} event is unsupported`);
  }
  const hasTarget = 'target' in descriptor;
  const hasQuery = 'query' in descriptor;
  if (hasTarget === hasQuery) {
    throw new TypeError(`logical event binding ${index} needs exactly one target or query`);
  }
  if ('query' in descriptor) {
    if (!isRecord(descriptor.query)) {
      throw new TypeError(`logical event binding ${index} query must be an object`);
    }
    return Object.freeze({
      id: descriptor.id,
      event: 'click',
      query: freezeSceneQuery(descriptor.query, index),
    });
  }
  if (!('target' in descriptor)) {
    throw new TypeError(`logical event binding ${index} target is missing`);
  }
  if (descriptor.target !== null) validateMutationTarget(descriptor.target, index);
  return Object.freeze({
    id: descriptor.id,
    event: 'click',
    target: descriptor.target,
  });
}

function freezeSceneQuery(
  query: CoreV2SceneQuery,
  index: number,
): CoreV2SceneQuery {
  if (
    query.recursive !== undefined &&
    typeof query.recursive !== 'boolean'
  ) {
    throw new TypeError(`logical event binding ${index} query recursive must be boolean`);
  }
  if (query.where !== undefined && !isRecord(query.where)) {
    throw new TypeError(`logical event binding ${index} query where must be an object`);
  }
  if (query.predicate !== undefined && typeof query.predicate !== 'function') {
    throw new TypeError(`logical event binding ${index} query predicate must be a function`);
  }
  if (query.root !== undefined && query.root !== null) {
    validateMutationTarget(query.root, index);
  }
  return Object.freeze({
    ...(query.root === undefined
      ? {}
      : {
          root: query.root === null
            ? null
            : Object.freeze({ ...query.root }),
        }),
    ...(query.recursive === undefined ? {} : { recursive: query.recursive }),
    ...(query.where === undefined
      ? {}
      : { where: Object.freeze({ ...query.where }) }),
    ...(query.predicate === undefined ? {} : { predicate: query.predicate }),
  });
}

function matchingBindingIds(
  descriptors: readonly CoreV2LogicalEventBindingDescriptor[],
  event: CoreV2SemanticPointerEvent,
  queryTargets: CoreV2HostInteractionAuthorityOptions['queryTargets'],
): readonly string[] {
  const targetId = event.payload.target?.id ?? null;
  const matches: string[] = [];
  for (const descriptor of descriptors) {
    if (descriptor.event !== event.type) continue;
    if ('target' in descriptor) {
      if (
        (descriptor.target === null && targetId === null) ||
        (descriptor.target?.kind === 'element' && descriptor.target.id === targetId) ||
        (
          descriptor.target?.kind === 'component' &&
          descriptor.target.ownerId === targetId
        )
      ) {
        matches.push(descriptor.id);
      }
      continue;
    }
    if (
      targetId !== null &&
      queryTargets(descriptor.query).some((target) => target.selectionId === targetId)
    ) {
      matches.push(descriptor.id);
    }
  }
  return Object.freeze(matches);
}

function bindingProbe(group: BindingGroup): CoreV2LogicalEventBindingProbe {
  return Object.freeze({
    enabled: group.enabled,
    disposed: group.disposed,
    bindingCount: group.disposed ? 0 : group.descriptors.length,
    listenerCount: group.enabled && !group.disposed ? 1 : 0,
    deliveryCount: group.deliveryCount,
  });
}

function propagationTrace(
  phases: readonly string[],
  currentTargets: readonly string[],
  composedPath: readonly string[],
  target: string,
  targetListenerCount: number,
  sceneRevision: number,
): CoreV2LogicalPropagationTrace {
  return Object.freeze({
    phases: Object.freeze([...phases]),
    currentTargets: Object.freeze([...currentTargets]),
    composedPath,
    target,
    targetListenerCount,
    sceneRevision,
  });
}

function logicalTargetName(key: CoreV2LogicalTargetKey): string {
  return key.startsWith('element:') ? key.slice('element:'.length) : key;
}

function validateMutationTarget(target: CoreV2MutationTarget, index: number): void {
  if (!isRecord(target) || (target.kind !== 'element' && target.kind !== 'component')) {
    throw new TypeError(`logical event binding ${index} target kind is unsupported`);
  }
  validateNonEmptyString(target.id, `logical event binding ${index} target id`);
  if (target.kind === 'component') {
    validateNonEmptyString(target.ownerId, `logical event binding ${index} target ownerId`);
  }
}

function validateNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function freezePayload(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

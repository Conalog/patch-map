import type {
  PatchMapLogicalTargetKey,
  PatchMapLogicalTargetSnapshot,
  PatchMapSceneQuery,
} from './query-selection';
import type { PatchMapSemanticPointerEvent } from './pointer-gesture';
import type { PatchMapMutationTarget } from './semantic/transaction';
import {
  PATCH_MAP_COMMAND_TARGET_REVISION,
  PATCH_MAP_EDITOR_MOUNT_REVISION,
  PATCH_MAP_HOST_TOOLTIP_REVISION,
  type PatchMapCommandTargetState,
  type PatchMapCommandTargetStatus,
  type PatchMapEditorMountDecision,
  type PatchMapHostEventSubscription,
  type PatchMapHostInteractionAuthorityOptions,
  type PatchMapHostInteractionProbe,
  type PatchMapHostObservedEvent,
  type PatchMapHostTooltipInput,
  type PatchMapHostTooltipPublication,
  type PatchMapHostTooltipState,
  type PatchMapHostTooltipSubscription,
  type PatchMapInteractionModeOperation,
  type PatchMapInteractionModeProbe,
  type PatchMapInteractionModeResult,
  type PatchMapLogicalEventBindingDescriptor,
  type PatchMapLogicalEventBindingHandle,
  type PatchMapLogicalEventBindingProbe,
  type PatchMapLogicalEventDelivery,
  type PatchMapLogicalPropagationOptions,
  type PatchMapLogicalPropagationTrace,
  type PatchMapSelectionHostPublication,
  type PatchMapTooltipClearReason,
} from './host-interaction/contracts';
import { PatchMapInteractionModeAuthority } from './host-interaction/mode-authority';

export * from './host-interaction/contracts';
export { PatchMapInteractionModeAuthority } from './host-interaction/mode-authority';

interface BindingGroup {
  readonly descriptors: readonly PatchMapLogicalEventBindingDescriptor[];
  readonly listener: (delivery: PatchMapLogicalEventDelivery) => void;
  enabled: boolean;
  disposed: boolean;
  deliveryCount: number;
}

interface ObservedSubscription {
  readonly family: string;
  readonly type: string | null;
  readonly listener: (event: PatchMapHostObservedEvent) => void;
  disposed: boolean;
}

/**
 * Resolve the host's editor mount decision before an Engine or Pixi canvas is
 * allocated. A blocked plant is a complete preflight result, not a late
 * renderer teardown path.
 */
export function resolvePatchMapEditorMount(
  blockedPlant: boolean,
): PatchMapEditorMountDecision {
  if (typeof blockedPlant !== 'boolean') {
    throw new TypeError('editor blockedPlant must be a boolean');
  }
  return Object.freeze({
    schemaRevision: PATCH_MAP_EDITOR_MOUNT_REVISION,
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
export function createPatchMapCommandTargetState(
  commandId: string,
  targetIdsValue: readonly string[],
): PatchMapCommandTargetState {
  validateNonEmptyString(commandId, 'command target ID');
  if (!Array.isArray(targetIdsValue)) {
    throw new TypeError('command target IDs must be an array');
  }
  const targetIds = [...new Set(targetIdsValue.map((targetId, index) => {
    validateNonEmptyString(targetId, `command target ID ${index}`);
    return targetId;
  }))];
  return Object.freeze({
    schemaRevision: PATCH_MAP_COMMAND_TARGET_REVISION,
    commandId,
    targetIds: Object.freeze(targetIds),
    status: null,
    statusTrace: Object.freeze([]),
  });
}

/** Return a new immutable command state while preserving its frozen target IDs. */
export function advancePatchMapCommandTargetState(
  current: PatchMapCommandTargetState,
  status: PatchMapCommandTargetStatus,
): PatchMapCommandTargetState {
  if (
    current === null ||
    typeof current !== 'object' ||
    current.schemaRevision !== PATCH_MAP_COMMAND_TARGET_REVISION ||
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
  const statusTrace: PatchMapCommandTargetStatus[] = [];
  for (const entry of current.statusTrace as readonly unknown[]) {
    if (!['pending', 'active', 'released'].includes(String(entry))) {
      throw new TypeError('command target status trace is invalid');
    }
    statusTrace.push(entry as PatchMapCommandTargetStatus);
  }
  statusTrace.push(status);
  return Object.freeze({
    schemaRevision: PATCH_MAP_COMMAND_TARGET_REVISION,
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
export class PatchMapHostInteractionAuthority {
  private readonly queryTargets: PatchMapHostInteractionAuthorityOptions['queryTargets'];
  private readonly bindingGroups = new Set<BindingGroup>();
  private readonly subscriptions = new Set<ObservedSubscription>();
  private readonly selectionHostListeners = new Set<
    (publication: PatchMapSelectionHostPublication) => void
  >();
  private readonly tooltipHostListeners = new Set<
    (publication: PatchMapHostTooltipPublication) => void
  >();
  private readonly modes: PatchMapInteractionModeAuthority;
  private tooltipState: PatchMapHostTooltipState = emptyTooltipState();
  private tooltipEverActive = false;
  private callbackFailureCount = 0;
  private destroying = false;
  private destroyed = false;

  public constructor(options: PatchMapHostInteractionAuthorityOptions) {
    this.queryTargets = options.queryTargets;
    this.modes = new PatchMapInteractionModeAuthority({
      normal: options.normalMode ?? 'select',
      modes: options.modes ?? ['select', 'pan', 'transform', 'relation-paint', 'text-edit'],
    });
  }

  public bindLogicalEvents(
    descriptorsValue: readonly PatchMapLogicalEventBindingDescriptor[],
    listener: (delivery: PatchMapLogicalEventDelivery) => void,
  ): PatchMapLogicalEventBindingHandle {
    this.assertAlive('bindLogicalEvents');
    const descriptorInputs: readonly PatchMapLogicalEventBindingDescriptor[] =
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
    event: PatchMapSemanticPointerEvent,
  ): readonly PatchMapLogicalEventDelivery[] {
    if (this.destroyed || event.type !== 'click') return Object.freeze([]);
    const deliveries: PatchMapLogicalEventDelivery[] = [];
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
      } satisfies PatchMapLogicalEventDelivery);
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
    listener: (event: PatchMapHostObservedEvent) => void,
  ): PatchMapHostEventSubscription {
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
  ): readonly PatchMapHostObservedEvent[] {
    if (this.destroyed) return Object.freeze([]);
    validateNonEmptyString(family, 'event family');
    validateNonEmptyString(type, 'event type');
    if (!Number.isFinite(revision)) throw new RangeError('event revision must be finite');
    const specificPayload = freezePayload(payload);
    const familyPayload = isRecord(specificPayload)
      ? Object.freeze({ ...specificPayload, family, type })
      : Object.freeze({ value: specificPayload, family, type });
    const deliveries: PatchMapHostObservedEvent[] = [];
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
    listener: (publication: PatchMapSelectionHostPublication) => void,
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
  ): PatchMapSelectionHostPublication {
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
    listener: (publication: PatchMapHostTooltipPublication) => void,
  ): PatchMapHostTooltipSubscription {
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

  public hoverTooltip(inputValue: PatchMapHostTooltipInput): PatchMapHostTooltipState {
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
    inputValue: PatchMapHostTooltipInput,
  ): PatchMapHostTooltipState {
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

  public clearTooltip(reason: PatchMapTooltipClearReason): PatchMapHostTooltipState {
    if (!isTooltipClearReason(reason)) {
      throw new TypeError('tooltip clear reason is unsupported');
    }
    if (this.destroyed || !this.tooltipEverActive) return this.tooltipProbe();
    this.tooltipState = Object.freeze({
      schemaRevision: PATCH_MAP_HOST_TOOLTIP_REVISION,
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

  public tooltipProbe(): PatchMapHostTooltipState {
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
    operation: PatchMapInteractionModeOperation,
  ): PatchMapInteractionModeResult {
    this.assertAlive('applyModeOperation');
    return this.modes.apply(operation);
  }

  public modeProbe(): PatchMapInteractionModeProbe {
    return this.modes.probe();
  }

  public inputOwner(state: string, input: string): string | null {
    this.assertAlive('inputOwner');
    return this.modes.inputOwner(state, input);
  }

  public probe(): PatchMapHostInteractionProbe {
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
    if (this.destroyed || this.destroying) return;
    this.destroying = true;
    try {
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
    } finally {
      this.destroying = false;
    }
  }

  private publishTooltip(
    reason: PatchMapHostTooltipPublication['reason'],
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
    if (this.destroyed || this.destroying) {
      throw new Error(`PatchMap host interaction authority is destroyed: ${operation}`);
    }
  }
}

function emptyTooltipState(): PatchMapHostTooltipState {
  return Object.freeze({
    schemaRevision: PATCH_MAP_HOST_TOOLTIP_REVISION,
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
  input: PatchMapHostTooltipInput,
  pinned: boolean,
  revision: number,
  clearTrace: readonly PatchMapTooltipClearReason[],
  destroyed: boolean,
): PatchMapHostTooltipState {
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
    schemaRevision: PATCH_MAP_HOST_TOOLTIP_REVISION,
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
  value: PatchMapHostTooltipInput,
): PatchMapHostTooltipInput {
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

function isTooltipClearReason(value: string): value is PatchMapTooltipClearReason {
  return ['drag', 'redraw', 'destroy', 'empty-target'].includes(value);
}

export function createPatchMapLogicalPropagationTrace(
  target: PatchMapLogicalTargetSnapshot,
  sceneRevision: number,
  options: PatchMapLogicalPropagationOptions = {},
): PatchMapLogicalPropagationTrace {
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

export function patchMapOwnsKeyboardInput(pathKind: string): boolean {
  validateNonEmptyString(pathKind, 'keyboard input path');
  return pathKind === 'canvas';
}

export function patchMapTransformerHandlePropagationProbe(): Readonly<{
  readonly owner: 'transformer';
  readonly surfaceDeliveryCount: 0;
}> {
  return Object.freeze({ owner: 'transformer', surfaceDeliveryCount: 0 });
}

function normalizeBindingDescriptor(
  descriptor: PatchMapLogicalEventBindingDescriptor,
  index: number,
): PatchMapLogicalEventBindingDescriptor {
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
  query: PatchMapSceneQuery,
  index: number,
): PatchMapSceneQuery {
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
  descriptors: readonly PatchMapLogicalEventBindingDescriptor[],
  event: PatchMapSemanticPointerEvent,
  queryTargets: PatchMapHostInteractionAuthorityOptions['queryTargets'],
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

function bindingProbe(group: BindingGroup): PatchMapLogicalEventBindingProbe {
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
): PatchMapLogicalPropagationTrace {
  return Object.freeze({
    phases: Object.freeze([...phases]),
    currentTargets: Object.freeze([...currentTargets]),
    composedPath,
    target,
    targetListenerCount,
    sceneRevision,
  });
}

function logicalTargetName(key: PatchMapLogicalTargetKey): string {
  return key.startsWith('element:') ? key.slice('element:'.length) : key;
}

function validateMutationTarget(target: PatchMapMutationTarget, index: number): void {
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

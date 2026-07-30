import type { PatchMapLogicalTargetSnapshot } from './query-selection';
import type { PatchMapSurfaceEntityGeometry } from './engine';

export const PATCH_MAP_ACCESSIBILITY_REVISION =
  'core-v2-accessibility/1' as const;

export type PatchMapAccessibilityAction = 'focus' | 'activate' | 'select';

export type PatchMapAccessibilityActivationSource =
  | 'Enter'
  | 'Space'
  | 'pixi-click-alias'
  | 'host';

export interface PatchMapAccessibilityTargetInput {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly screenBounds: readonly [number, number, number, number];
  readonly sceneOrder: number;
  readonly locked: boolean;
  readonly actions: readonly PatchMapAccessibilityAction[];
}

export interface PatchMapAccessibilityRenderNode {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly text: string;
  readonly type: 'button';
  readonly tabIndex: number;
  readonly screenBounds: readonly [number, number, number, number];
}

export interface PatchMapAccessibilityTargetProbe {
  readonly id: string;
  readonly role: 'button';
  readonly name: string;
  readonly description: string | null;
  readonly disabled: boolean;
  readonly label: string;
  readonly type: string;
  readonly screenBounds: readonly [number, number, number, number];
  readonly focused: boolean;
  readonly focusVisible: boolean;
  readonly selected: boolean;
  /** Backward-readable alias for the actions this node supports. */
  readonly actions: readonly PatchMapAccessibilityAction[];
  readonly supportedActions: readonly PatchMapAccessibilityAction[];
  readonly performedActions: readonly PatchMapAccessibilityAction[];
  readonly children: readonly string[];
}

export interface PatchMapAccessibilitySurfaceProbe {
  readonly active: boolean;
  readonly shadowDomActive: boolean;
  readonly overlayNodeCount: number;
  readonly shadowDomNodeCount: number;
  readonly rootListenerCount: number;
  readonly entityListenerCount: 0;
  readonly focusedId: string | null;
  readonly shadowDomFocusedId: string | null;
  readonly destroyed: boolean;
}

export interface PatchMapAccessibilityProbe {
  readonly schemaRevision: typeof PATCH_MAP_ACCESSIBILITY_REVISION;
  readonly root: 'scene';
  readonly orderedIds: readonly string[];
  readonly children: readonly string[];
  readonly targets: Readonly<Record<string, PatchMapAccessibilityTargetProbe>>;
  readonly focusedId: string | null;
  readonly duplicateActivationCount: 0;
  readonly suppressedAliasCount: number;
  readonly hiddenFocusableCount: number;
  readonly invalidNodeCount: number;
  readonly nonFiniteBoundsCount: number;
  readonly reducedMotion: boolean;
  readonly surface: PatchMapAccessibilitySurfaceProbe | null;
  readonly destroyed: boolean;
}

export interface PatchMapAccessibilityActivationInput {
  readonly source: PatchMapAccessibilityActivationSource;
  /**
   * One physical/assistive activation may arrive through Pixi's click,
   * pointertap, and tap aliases. A shared ID makes that fan-out idempotent.
   */
  readonly activationId: string;
}

export interface PatchMapAccessibilityActivationResult {
  readonly targetId: string;
  readonly source: PatchMapAccessibilityActivationSource;
  readonly activated: boolean;
  readonly selectRequested: boolean;
  readonly duplicateSuppressed: boolean;
  readonly focused: boolean;
}

export interface PatchMapAccessibilityDerivation {
  readonly targets: readonly PatchMapAccessibilityTargetInput[];
  readonly hiddenFocusableCount: number;
  readonly invalidNodeCount: number;
  readonly nonFiniteBoundsCount: number;
}

const ACCESSIBLE_ELEMENT_TYPES = new Set([
  'grid-cell',
  'image',
  'item',
  'rect',
  'text',
]);
const MAX_RETAINED_ACTIVATION_IDS = 256;

const EMPTY_SURFACE_PROBE: PatchMapAccessibilitySurfaceProbe = Object.freeze({
  active: false,
  shadowDomActive: false,
  overlayNodeCount: 0,
  shadowDomNodeCount: 0,
  rootListenerCount: 0,
  entityListenerCount: 0,
  focusedId: null,
  shadowDomFocusedId: null,
  destroyed: false,
});

/**
 * Instance-local logical accessibility authority. It owns focus, activation
 * deduplication, and reduced-motion policy without retaining Pixi or DOM
 * objects. The renderer receives only detached screen-space overlay records.
 */
export class PatchMapAccessibilityAuthority {
  private targetsValue: readonly PatchMapAccessibilityTargetInput[] =
    Object.freeze([]);
  private readonly performedActionsByTarget = new Map<
    string,
    Set<PatchMapAccessibilityAction>
  >();
  private readonly activationIds = new Set<string>();
  private focusedIdValue: string | null = null;
  private focusVisibleValue = false;
  private suppressedAliasCountValue = 0;
  private hiddenFocusableCountValue = 0;
  private invalidNodeCountValue = 0;
  private nonFiniteBoundsCountValue = 0;
  private reducedMotionValue = false;
  private enabledValue = false;
  private destroyedValue = false;

  public get enabled(): boolean {
    return this.enabledValue && !this.destroyedValue;
  }

  public get reducedMotion(): boolean {
    return this.reducedMotionValue;
  }

  public reconcile(derivation: PatchMapAccessibilityDerivation): void {
    this.assertAlive();
    const retainedIds = new Set(derivation.targets.map(({ id }) => id));
    this.targetsValue = Object.freeze(derivation.targets.map(freezeTargetInput));
    this.hiddenFocusableCountValue = nonNegativeInteger(
      derivation.hiddenFocusableCount,
      'hiddenFocusableCount',
    );
    this.invalidNodeCountValue = nonNegativeInteger(
      derivation.invalidNodeCount,
      'invalidNodeCount',
    );
    this.nonFiniteBoundsCountValue = nonNegativeInteger(
      derivation.nonFiniteBoundsCount,
      'nonFiniteBoundsCount',
    );
    for (const id of [...this.performedActionsByTarget.keys()]) {
      if (!retainedIds.has(id)) this.performedActionsByTarget.delete(id);
    }
    if (
      this.focusedIdValue !== null &&
      !retainedIds.has(this.focusedIdValue)
    ) {
      this.focusedIdValue = null;
      this.focusVisibleValue = false;
    }
    this.enabledValue = true;
  }

  public renderNodes(): readonly PatchMapAccessibilityRenderNode[] {
    this.assertAlive();
    return Object.freeze(this.targetsValue.map((target, tabIndex) =>
      Object.freeze({
        id: target.id,
        title: target.label,
        hint: `${target.type} ${target.id}`,
        text: target.label,
        type: 'button' as const,
        tabIndex,
        screenBounds: target.screenBounds,
      })));
  }

  public focus(targetId: string, focusVisible = true): boolean {
    this.assertAlive();
    const target = this.requireTarget(targetId);
    const changed =
      this.focusedIdValue !== target.id ||
      this.focusVisibleValue !== focusVisible;
    this.focusedIdValue = target.id;
    this.focusVisibleValue = focusVisible;
    this.performedActionSet(target.id).add('focus');
    return changed;
  }

  public activate(
    targetId: string,
    input: PatchMapAccessibilityActivationInput,
  ): PatchMapAccessibilityActivationResult {
    this.assertAlive();
    const target = this.requireTarget(targetId);
    validateActivationInput(input);
    this.focus(target.id, true);
    if (this.activationIds.has(input.activationId)) {
      this.suppressedAliasCountValue += 1;
      return Object.freeze({
        targetId: target.id,
        source: input.source,
        activated: false,
        selectRequested: false,
        duplicateSuppressed: true,
        focused: true,
      });
    }
    if (this.activationIds.size >= MAX_RETAINED_ACTIVATION_IDS) {
      const oldest = this.activationIds.values().next().value;
      if (oldest !== undefined) this.activationIds.delete(oldest);
    }
    this.activationIds.add(input.activationId);
    const performedActions = this.performedActionSet(target.id);
    const selectRequested =
      !target.locked && target.actions.includes('select');
    if (target.actions.includes('activate')) performedActions.add('activate');
    if (selectRequested) performedActions.add('select');
    return Object.freeze({
      targetId: target.id,
      source: input.source,
      activated: target.actions.includes('activate'),
      selectRequested,
      duplicateSuppressed: false,
      focused: true,
    });
  }

  public setReducedMotion(enabled: boolean): boolean {
    this.assertAlive();
    if (typeof enabled !== 'boolean') {
      throw new TypeError('reduced motion must be a boolean');
    }
    if (this.reducedMotionValue === enabled) return false;
    this.reducedMotionValue = enabled;
    return true;
  }

  public probe(
    selectionIds: readonly string[],
    surface: PatchMapAccessibilitySurfaceProbe | null = null,
  ): PatchMapAccessibilityProbe {
    const selected = new Set(selectionIds);
    const targets: Record<string, PatchMapAccessibilityTargetProbe> =
      Object.create(null) as Record<string, PatchMapAccessibilityTargetProbe>;
    for (const target of this.targetsValue) {
      targets[target.id] = Object.freeze({
        id: target.id,
        role: 'button',
        name: target.label,
        description: null,
        disabled: target.locked,
        label: target.label,
        type: target.type,
        screenBounds: target.screenBounds,
        focused: target.id === this.focusedIdValue,
        focusVisible:
          target.id === this.focusedIdValue && this.focusVisibleValue,
        selected: selected.has(target.id),
        actions: target.actions,
        supportedActions: target.actions,
        performedActions: Object.freeze([
          ...(this.performedActionsByTarget.get(target.id) ?? new Set()),
        ]),
        children: Object.freeze([]),
      });
    }
    const orderedIds = Object.freeze(
      this.targetsValue.map(({ id }) => id),
    );
    return Object.freeze({
      schemaRevision: PATCH_MAP_ACCESSIBILITY_REVISION,
      root: 'scene',
      orderedIds,
      children: orderedIds,
      targets: Object.freeze(targets),
      focusedId: this.focusedIdValue,
      duplicateActivationCount: 0,
      suppressedAliasCount: this.suppressedAliasCountValue,
      hiddenFocusableCount: this.hiddenFocusableCountValue,
      invalidNodeCount: this.invalidNodeCountValue,
      nonFiniteBoundsCount: this.nonFiniteBoundsCountValue,
      reducedMotion: this.reducedMotionValue,
      surface: surface ?? (this.destroyedValue ? null : EMPTY_SURFACE_PROBE),
      destroyed: this.destroyedValue,
    });
  }

  public replaceScene(): void {
    this.assertAlive();
    this.targetsValue = Object.freeze([]);
    this.performedActionsByTarget.clear();
    this.activationIds.clear();
    this.focusedIdValue = null;
    this.focusVisibleValue = false;
    this.suppressedAliasCountValue = 0;
    this.hiddenFocusableCountValue = 0;
    this.invalidNodeCountValue = 0;
    this.nonFiniteBoundsCountValue = 0;
  }

  public destroy(): void {
    if (this.destroyedValue) return;
    this.replaceScene();
    this.enabledValue = false;
    this.destroyedValue = true;
  }

  private requireTarget(targetId: string): PatchMapAccessibilityTargetInput {
    if (typeof targetId !== 'string' || targetId.length === 0) {
      throw new TypeError('accessibility target ID must be non-empty');
    }
    const target = this.targetsValue.find(({ id }) => id === targetId);
    if (target === undefined) {
      throw new RangeError(`accessibility target is unavailable: ${targetId}`);
    }
    return target;
  }

  private performedActionSet(targetId: string): Set<PatchMapAccessibilityAction> {
    const current = this.performedActionsByTarget.get(targetId);
    if (current !== undefined) return current;
    const created = new Set<PatchMapAccessibilityAction>();
    this.performedActionsByTarget.set(targetId, created);
    return created;
  }

  private assertAlive(): void {
    if (this.destroyedValue) {
      throw new Error('PatchMap accessibility authority is destroyed');
    }
  }
}

/**
 * Build one focus order from the Engine logical index and renderer-aligned
 * screen geometry. Components stay aggregated under their owning logical
 * element; relations and non-visual hierarchy containers are not tab stops.
 */
export function derivePatchMapAccessibilityTargets(
  logicalTargets: readonly PatchMapLogicalTargetSnapshot[],
  geometries: readonly PatchMapSurfaceEntityGeometry[],
): PatchMapAccessibilityDerivation {
  const eligibleTargets = new Map<string, PatchMapLogicalTargetSnapshot>();
  const boundsByTarget = new Map<string, MutableBoundsAccumulator>();
  const targets: PatchMapAccessibilityTargetInput[] = [];
  let hiddenFocusableCount = 0;
  let invalidNodeCount = 0;
  let nonFiniteBoundsCount = 0;

  for (const target of logicalTargets) {
    if (
      target.kind !== 'element' ||
      !ACCESSIBLE_ELEMENT_TYPES.has(target.type)
    ) {
      continue;
    }
    if (target.value.show === false) {
      hiddenFocusableCount += 1;
      continue;
    }
    eligibleTargets.set(target.id, target);
    boundsByTarget.set(target.id, createBoundsAccumulator());
  }

  for (const geometry of geometries) {
    if (!geometry.visible) continue;
    const targetIds = geometry.ownerItemId === undefined ||
      geometry.ownerItemId === geometry.id
      ? [geometry.id]
      : [geometry.id, geometry.ownerItemId];
    for (const targetId of targetIds) {
      const bounds = boundsByTarget.get(targetId);
      if (bounds !== undefined) includeScreenBounds(bounds, geometry.screenBounds);
    }
  }

  for (const target of eligibleTargets.values()) {
    const accumulator = boundsByTarget.get(target.id);
    const bounds = accumulator === undefined
      ? null
      : finishScreenBounds(accumulator);
    if (bounds === null) {
      invalidNodeCount += 1;
      if (accumulator?.nonFinite === true) {
        nonFiniteBoundsCount += 1;
      }
      continue;
    }
    const locked = target.locked || target.ancestorLocked;
    targets.push(Object.freeze({
      id: target.id,
      label: accessibilityLabel(target),
      type: target.type,
      screenBounds: bounds,
      sceneOrder: target.sceneOrder,
      locked,
      actions: Object.freeze(
        locked
          ? ['focus'] as const
          : ['focus', 'activate', 'select'] as const,
      ),
    }));
  }

  targets.sort((left, right) =>
    left.sceneOrder - right.sceneOrder || left.id.localeCompare(right.id));
  return Object.freeze({
    targets: Object.freeze(targets),
    hiddenFocusableCount,
    invalidNodeCount,
    nonFiniteBoundsCount,
  });
}

interface MutableBoundsAccumulator {
  seen: boolean;
  invalid: boolean;
  nonFinite: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function createBoundsAccumulator(): MutableBoundsAccumulator {
  return {
    seen: false,
    invalid: false,
    nonFinite: false,
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

function includeScreenBounds(
  accumulator: MutableBoundsAccumulator,
  bounds: readonly [number, number, number, number],
): void {
  accumulator.seen = true;
  const [x, y, width, height] = bounds;
  if (![x, y, width, height].every(Number.isFinite)) {
    accumulator.invalid = true;
    accumulator.nonFinite = true;
    return;
  }
  if (width < 0 || height < 0) {
    accumulator.invalid = true;
    return;
  }
  accumulator.minX = Math.min(accumulator.minX, x);
  accumulator.minY = Math.min(accumulator.minY, y);
  accumulator.maxX = Math.max(accumulator.maxX, x + width);
  accumulator.maxY = Math.max(accumulator.maxY, y + height);
}

function finishScreenBounds(
  accumulator: MutableBoundsAccumulator,
): readonly [number, number, number, number] | null {
  if (
    !accumulator.seen ||
    accumulator.invalid ||
    ![
      accumulator.minX,
      accumulator.minY,
      accumulator.maxX,
      accumulator.maxY,
    ].every(Number.isFinite)
  ) {
    return null;
  }
  return Object.freeze([
    accumulator.minX,
    accumulator.minY,
    Math.max(0, accumulator.maxX - accumulator.minX),
    Math.max(0, accumulator.maxY - accumulator.minY),
  ] as const);
}

function accessibilityLabel(target: PatchMapLogicalTargetSnapshot): string {
  if (target.label !== null && target.label.length > 0) return target.label;
  const text = target.value.text;
  return typeof text === 'string' && text.length > 0 ? text : target.id;
}

function freezeTargetInput(
  target: PatchMapAccessibilityTargetInput,
): PatchMapAccessibilityTargetInput {
  return Object.freeze({
    id: target.id,
    label: target.label,
    type: target.type,
    screenBounds: Object.freeze([...target.screenBounds] as [
      number,
      number,
      number,
      number,
    ]),
    sceneOrder: target.sceneOrder,
    locked: target.locked,
    actions: Object.freeze([...target.actions]),
  });
}

function validateActivationInput(
  input: PatchMapAccessibilityActivationInput,
): void {
  if (
    !['Enter', 'Space', 'pixi-click-alias', 'host'].includes(input.source)
  ) {
    throw new TypeError('accessibility activation source is unsupported');
  }
  if (typeof input.activationId !== 'string' || input.activationId.length === 0) {
    throw new TypeError('accessibility activation ID must be non-empty');
  }
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

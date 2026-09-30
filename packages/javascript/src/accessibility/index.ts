import {
  PATCH_MAP_ACCESSIBILITY_REVISION,
  type PatchMapAccessibilityAction,
  type PatchMapAccessibilityActivationInput,
  type PatchMapAccessibilityActivationResult,
  type PatchMapAccessibilityDerivation,
  type PatchMapAccessibilityProbe,
  type PatchMapAccessibilityRenderNode,
  type PatchMapAccessibilitySurfaceProbe,
  type PatchMapAccessibilityTargetInput,
  type PatchMapAccessibilityTargetProbe,
} from './contracts';

export * from './contracts';
export { derivePatchMapAccessibilityTargets } from './semantic-tree-values';

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
    const targets = Object.freeze(derivation.targets.map(freezeTargetInput));
    const retainedIds = new Set(targets.map(({ id }) => id));
    const hiddenFocusableCount = nonNegativeInteger(
      derivation.hiddenFocusableCount,
      'hiddenFocusableCount',
    );
    const invalidNodeCount = nonNegativeInteger(
      derivation.invalidNodeCount,
      'invalidNodeCount',
    );
    const nonFiniteBoundsCount = nonNegativeInteger(
      derivation.nonFiniteBoundsCount,
      'nonFiniteBoundsCount',
    );

    this.targetsValue = targets;
    this.hiddenFocusableCountValue = hiddenFocusableCount;
    this.invalidNodeCountValue = invalidNodeCount;
    this.nonFiniteBoundsCountValue = nonFiniteBoundsCount;
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

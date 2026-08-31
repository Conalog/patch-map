export interface PatchMapTarget {
  readonly id: string;
  readonly componentId?: string;
}

export interface PatchMapPointerEventModifiers {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

/** Root-owned hover projection in CSS pixels and PatchMap world coordinates. */
export interface PatchMapPointerHoverEvent {
  readonly type: 'hover' | 'move' | 'leave';
  readonly target: PatchMapTarget | null;
  readonly previousTarget: PatchMapTarget | null;
  readonly anchor: readonly [number, number];
  readonly world: readonly [number, number];
  readonly pointerId: number;
  readonly pointerType: string;
  readonly modifiers: PatchMapPointerEventModifiers;
}

/** Pointer-origin selection publication. Programmatic selection does not echo here. */
export interface PatchMapPointerSelectionChange {
  readonly source: 'pointer';
  readonly selected: readonly PatchMapTarget[];
  readonly added: readonly PatchMapTarget[];
  readonly removed: readonly PatchMapTarget[];
  readonly interactionRevision: number;
}

/** Package-owned pointer projection policy for one mounted instance. */
export interface PatchMapPointerPolicy {
  /** Preserve the current hover target during press/click. Defaults to false. */
  readonly hoverDuringPress?: boolean;
  /** Optional package-owned tooltip projection and context-menu pin policy. */
  readonly tooltip?: PatchMapTooltipPolicy;
}

/** Package-owned tooltip pin behavior for one mounted instance. */
export interface PatchMapTooltipPolicy {
  /** Right-click the current target to pin it across pointer leave. Defaults to false. */
  readonly pinOnContextMenu?: boolean;
  /** Prevent the native context menu when a target is pinned. Defaults to true. */
  readonly preventDefault?: boolean;
}

export type PatchMapPointerTooltipEventType = 'show' | 'move' | 'pin' | 'hide';

/** Stable tooltip projection; no renderer object or live DOM event escapes. */
export interface PatchMapPointerTooltipEvent {
  readonly type: PatchMapPointerTooltipEventType;
  readonly target: PatchMapTarget | null;
  readonly previousTarget: PatchMapTarget | null;
  readonly anchor: readonly [number, number];
  readonly world: readonly [number, number];
  readonly pointerId: number;
  readonly pointerType: string;
  readonly modifiers: PatchMapPointerEventModifiers;
  readonly pinned: boolean;
}

export interface PatchMapBoxSelectionOptions {
  /** Select entities touched by the box. Defaults to true. */
  readonly partialIntersection?: boolean;
  /** Required modifier at primary pointer-down. Defaults to `none`. */
  readonly activationModifier?: 'none' | 'shift';
  /** Transient marquee paint. Omit to inherit selection outline color/width. */
  readonly visual?: PatchMapBoxSelectionVisualPolicy;
}

/** Package-owned transient box-marquee paint for one mounted instance. */
export interface PatchMapBoxSelectionVisualPolicy {
  /** Marquee color. Accepts 0xRRGGBB or PATCH MAP CSS colors. */
  readonly color?: number | string;
  /** Screen-space marquee width in CSS pixels. */
  readonly strokeWidth?: number;
  /** Marquee interior alpha from 0 through 1. Defaults to 0.08. */
  readonly fillAlpha?: number;
}

export type PatchMapSelectionDisplayMode =
  | 'all'
  | 'group-only'
  | 'element-only'
  | 'hidden';

/** Persistent selection stroke placement relative to the visual paint bound. */
export type PatchMapSelectionStrokeAlignment =
  | 'outside'
  | 'center'
  | 'inside';

/** Persistent selection stroke response to viewport scale. */
export type PatchMapSelectionStrokeScale = 'fixed' | 'viewport';

/** Pointer gesture that clears selection when it resolves on blank canvas. */
export type PatchMapBlankClickClearMode = 'single' | 'double' | 'never';

/** Package-owned persistent selection-bound paint for one mounted instance. */
export interface PatchMapSelectionVisualPolicy {
  /** Selection-bound color. Accepts 0xRRGGBB or PATCH MAP CSS colors. */
  readonly color?: number | string;
  /** Outline width in CSS pixels at 1x viewport scale. Defaults to 2. */
  readonly strokeWidth?: number;
  /** Keep screen width fixed or scale it down with the viewport. Defaults to `fixed`. */
  readonly strokeScale?: PatchMapSelectionStrokeScale;
  /** Viewport-scaled screen-width floor in CSS pixels. Defaults to 1. */
  readonly minStrokeWidth?: number;
  /** Stroke placement relative to the visual paint bound. Defaults to `center`. */
  readonly strokeAlignment?: PatchMapSelectionStrokeAlignment;
  /** Individual/group bounds composition. Defaults to `all`. */
  readonly displayMode?: PatchMapSelectionDisplayMode;
}

/** Package-owned pointer selection policy for one mounted instance. */
export interface PatchMapSelectionPolicy {
  /** Preserve multi-target shift selection. Defaults to true. */
  readonly allowMultiple?: boolean;
  /** Blank-canvas selection clearing. Defaults to the compatible `single`. */
  readonly clearOnBlankClick?: PatchMapBlankClickClearMode;
  /**
   * Remove only a target selected before a modifier-free double click.
   * New targets and Shift toggles remain immediate. Defaults to false.
   */
  readonly deselectOnTargetDoubleClick?: boolean;
  /** Enable root-owned pointer drag box selection. Disabled by default. */
  readonly box?: boolean | PatchMapBoxSelectionOptions;
  /**
   * Called with detached stable identity, never renderer objects. A rejected
   * point hit is treated as blank for configured selection clearing.
   */
  readonly isSelectable?: (target: PatchMapTarget) => boolean;
  /**
   * Resolve Ctrl/Cmd point selection from stable identities in the package's
   * pointer commit. Omit to retain the built-in selection semantics.
   */
  readonly resolveModifierSelection?: PatchMapPointerSelectionResolver;
  /** Instance-local package-owned persistent selection-bound paint. */
  readonly visual?: PatchMapSelectionVisualPolicy;
}

export interface PatchMapPointerSelectionResolverInput {
  readonly target: PatchMapTarget;
  readonly currentIds: readonly string[];
  readonly modifiers: PatchMapPointerEventModifiers;
  readonly clickCount: number;
}

export type PatchMapPointerSelectionResolver = (
  input: PatchMapPointerSelectionResolverInput,
) => readonly string[];

export type PatchMapTargetScope = 'all' | 'authored' | 'instances';

/**
 * A deliberately small semantic selector. It is not JSONPath: selectors are
 * resolved against PatchMap's stable logical index once, then reused by batch
 * APIs without reparsing the input dataset.
 */
export interface PatchMapTargetQuery {
  /** Element/instance ID. When componentId is present this is its owner ID. */
  readonly id?: string;
  /** Stable component ID such as `usage` or `label`. */
  readonly componentId?: string;
  /** PATCH MAP semantic type such as `item`, `bar`, or `text`. */
  readonly type?: string;
  /** Restrict matches to this element and its descendants. */
  readonly within?: string;
  /** Distinguish authored templates from expanded grid instances. */
  readonly scope?: PatchMapTargetScope;
}

export interface PatchMapTargetMatch extends PatchMapTarget {
  readonly kind: 'element' | 'component';
  readonly type: string;
  readonly label: string | null;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface PatchMapTargetSet {
  readonly matches: readonly PatchMapTargetMatch[];
  readonly count: number;
}

export type PatchMapOneOrMany<T> = T | readonly T[];

export type PatchMapTargetsInput =
  | PatchMapTarget
  | readonly PatchMapTarget[]
  | PatchMapTargetSet;

/** Existing logical target grammar reused by renderer-only presentation layers. */
export type PatchMapPresentationTargetsInput =
  | string
  | readonly string[]
  | PatchMapTargetsInput;

/** MVP renderer-only paint. It never changes visibility or hit identity. */
export interface PatchMapPresentationPaint {
  readonly alphaMultiplier: number;
}

/** One atomic snapshot partitioning a queried logical scope into two paint branches. */
export interface PatchMapPresentationLayer {
  readonly scope: PatchMapTargetSet;
  readonly targets: PatchMapPresentationTargetsInput;
  readonly matched?: PatchMapPresentationPaint;
  readonly unmatched?: PatchMapPresentationPaint;
}

export interface PatchMapPresentationSetResult {
  readonly changed: boolean;
  readonly revision: number;
  readonly scopeCount: number;
  readonly targetCount: number;
  readonly matchedCount: number;
  readonly unmatchedCount: number;
  readonly ignoredTargetCount: number;
}

export interface PatchMapPresentationApi {
  set(key: string, layer: PatchMapPresentationLayer): PatchMapPresentationSetResult;
  clear(key: string): boolean;
}

export type PatchMapSelectionInput =
  | string
  | readonly string[]
  | PatchMapTargetsInput;

export interface PatchMapTargetsApi {
  get(target: PatchMapTarget): PatchMapTargetMatch | null;
  query(query: PatchMapTargetQuery): PatchMapTargetSet;
}

export interface PatchMapSelectionApi {
  readonly ids: readonly string[];
  set(targets: PatchMapSelectionInput): readonly string[];
  add(targets: PatchMapSelectionInput): readonly string[];
  remove(targets: PatchMapSelectionInput): readonly string[];
  toggle(targets: PatchMapSelectionInput): readonly string[];
  clear(): readonly string[];
  onChange(listener: (ids: readonly string[]) => void): () => void;
  onPointerChange(listener: (change: PatchMapPointerSelectionChange) => void): () => void;
}

export interface PatchMapPointerApi {
  onHover(listener: (event: PatchMapPointerHoverEvent) => void): () => void;
  onTooltip(listener: (event: PatchMapPointerTooltipEvent) => void): () => void;
}

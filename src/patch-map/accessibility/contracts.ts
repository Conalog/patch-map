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

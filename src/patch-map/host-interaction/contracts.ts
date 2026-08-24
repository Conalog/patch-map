import type {
  PatchMapLogicalTargetKey,
  PatchMapLogicalTargetSnapshot,
  PatchMapSceneQuery,
} from '../query-selection';
import type { PatchMapSemanticPointerEvent } from '../pointer-gesture';
import type { PatchMapMutationTarget } from '../semantic/transaction';

export const PATCH_MAP_HOST_INTERACTION_REVISION = 'core-v2-host-interaction/1' as const;
export const PATCH_MAP_COMMAND_TARGET_REVISION = 'core-v2-command-target/1' as const;
export const PATCH_MAP_HOST_TOOLTIP_REVISION = 'core-v2-host-tooltip/1' as const;
export const PATCH_MAP_EDITOR_MOUNT_REVISION = 'core-v2-editor-mount/1' as const;

export type PatchMapCommandTargetStatus = 'pending' | 'active' | 'released';

export interface PatchMapCommandTargetState {
  readonly schemaRevision: typeof PATCH_MAP_COMMAND_TARGET_REVISION;
  readonly commandId: string;
  readonly targetIds: readonly string[];
  readonly status: PatchMapCommandTargetStatus | null;
  readonly statusTrace: readonly PatchMapCommandTargetStatus[];
}

export type PatchMapTooltipClearReason = 'drag' | 'redraw' | 'destroy' | 'empty-target';

export interface PatchMapHostTooltipInput {
  readonly targetId: string;
  readonly anchorCss: readonly [number, number];
  readonly viewportCssPx: readonly [number, number];
  readonly tooltipSizeCssPx: readonly [number, number];
}

export interface PatchMapHostTooltipState {
  readonly schemaRevision: typeof PATCH_MAP_HOST_TOOLTIP_REVISION;
  readonly targetId: string | null;
  readonly anchorCss: readonly [number, number] | null;
  readonly boundsCss: readonly [number, number, number, number] | null;
  readonly pinned: boolean;
  readonly revision: number;
  readonly clearTrace: readonly PatchMapTooltipClearReason[];
  readonly destroyed: boolean;
}

export interface PatchMapHostTooltipPublication {
  readonly reason: 'hover' | 'pin' | 'unpin' | PatchMapTooltipClearReason;
  readonly state: PatchMapHostTooltipState;
}

export interface PatchMapHostTooltipSubscription {
  dispose(): 'disposed' | 'already-disposed';
}

export interface PatchMapEditorMountDecision {
  readonly schemaRevision: typeof PATCH_MAP_EDITOR_MOUNT_REVISION;
  readonly status: 'allowed' | 'blocked';
  readonly blockedPlant: boolean;
  readonly createsEngine: boolean;
  readonly canvasBudget: 0 | 1;
}

export type PatchMapLogicalEventBindingDescriptor =
  | Readonly<{
      readonly id: string;
      readonly event: 'click';
      readonly target: PatchMapMutationTarget | null;
    }>
  | Readonly<{
      readonly id: string;
      readonly event: 'click';
      readonly query: PatchMapSceneQuery;
    }>;

export interface PatchMapLogicalEventDelivery {
  readonly event: 'click';
  readonly targetId: string | null;
  readonly targetKey: PatchMapLogicalTargetKey | 'surface';
  readonly bindingIds: readonly string[];
  readonly pointer: PatchMapSemanticPointerEvent['payload'];
}

export interface PatchMapLogicalEventBindingProbe {
  readonly enabled: boolean;
  readonly disposed: boolean;
  readonly bindingCount: number;
  readonly listenerCount: 0 | 1;
  readonly deliveryCount: number;
}

export interface PatchMapLogicalEventBindingHandle {
  enable(): 'enabled' | 'already-enabled' | 'disposed';
  disable(): 'disabled' | 'already-disabled' | 'disposed';
  dispose(): 'disposed' | 'already-disposed';
  probe(): PatchMapLogicalEventBindingProbe;
}

export interface PatchMapHostObservedEvent {
  readonly family: string;
  readonly type: string;
  readonly revision: number;
  readonly payload: unknown;
}

export interface PatchMapHostEventSubscription {
  dispose(): 'disposed' | 'already-disposed';
}

export type PatchMapInteractionMode =
  | 'select'
  | 'pan'
  | 'transform'
  | 'relation-paint'
  | 'text-edit';

export type PatchMapInteractionModeOperation =
  | Readonly<{ readonly op: 'replace' | 'push'; readonly state: string }>
  | Readonly<{ readonly op: 'pause' | 'resume' | 'pop' | 'blur' }>
  | Readonly<{
      readonly op: 'temporary';
      readonly state: string;
      readonly modifier: string;
    }>
  | Readonly<{ readonly op: 'release-temporary'; readonly modifier: string }>;

export interface PatchMapInteractionModeResult {
  readonly status: 'changed' | 'unchanged' | 'rejected';
  readonly code: 'MISSING_TARGET' | null;
  readonly activeState: PatchMapInteractionMode;
  readonly lifecycleDelta: readonly string[];
}

export interface PatchMapInteractionModeProbe {
  readonly activeState: PatchMapInteractionMode;
  readonly stack: readonly PatchMapInteractionMode[];
  readonly lifecycle: readonly string[];
  readonly temporaryModeCount: 0 | 1;
  readonly temporaryModifiers: readonly string[];
  readonly captureCount: 0;
  readonly activeOwnerCount: 0 | 1;
  readonly paused: boolean;
  readonly destroyed: boolean;
}

export interface PatchMapLogicalPropagationOptions {
  readonly phase?: 'capture' | 'target' | 'bubble';
  readonly mode?: 'none' | 'stop' | 'immediate-stop';
}

export interface PatchMapLogicalPropagationTrace {
  readonly phases: readonly string[];
  readonly currentTargets: readonly string[];
  readonly composedPath: readonly string[];
  readonly target: string;
  readonly targetListenerCount: number;
  readonly sceneRevision: number;
}

export interface PatchMapSelectionHostPublication {
  readonly selectedIds: readonly string[];
  readonly interactionRevision: number;
}

export interface PatchMapHostInteractionProbe {
  readonly bindings: number;
  readonly bindingListeners: number;
  readonly eventSubscriptions: number;
  readonly selectionHostListeners: number;
  readonly tooltipHostListeners: number;
  readonly callbackFailureCount: number;
  readonly tooltip: PatchMapHostTooltipState;
  readonly mode: PatchMapInteractionModeProbe;
  readonly destroyed: boolean;
}

export interface PatchMapHostInteractionAuthorityOptions {
  readonly queryTargets: (query: PatchMapSceneQuery) => readonly PatchMapLogicalTargetSnapshot[];
  readonly normalMode?: PatchMapInteractionMode;
  readonly modes?: readonly PatchMapInteractionMode[];
}

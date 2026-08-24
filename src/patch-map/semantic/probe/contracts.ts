import type {
  PatchMapComponentType,
  PatchMapElementType,
} from '../dataset/contracts';

export const PATCH_MAP_SEMANTIC_PROBE_REVISION = 'core-v2-semantic-probe/1' as const;

export type PatchMapSemanticProbeLifecycle =
  | 'new'
  | 'initializing'
  | 'ready-empty'
  | 'scene-ready'
  | 'destroying'
  | 'destroyed';

export type PatchMapSemanticProbeDatasetState =
  | 'absent'
  | 'empty'
  | 'loaded'
  | 'destroying'
  | 'destroyed';

export interface PatchMapElementTarget {
  readonly kind: 'element';
  readonly id: string;
}

export interface PatchMapComponentTarget {
  readonly kind: 'component';
  readonly ownerId: string;
  readonly id: string;
}

export type PatchMapSemanticTarget = PatchMapElementTarget | PatchMapComponentTarget;

export interface PatchMapSemanticNodeProbe {
  readonly order: number;
  readonly target: PatchMapSemanticTarget;
  readonly parent: PatchMapElementTarget | null;
  readonly type: PatchMapElementType | PatchMapComponentType;
  readonly depth: number;
  readonly authoredShow: boolean;
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface PatchMapSemanticTypeCount<T extends string> {
  readonly type: T;
  readonly count: number;
}

export type PatchMapPaintRole = 'fill' | 'stroke' | 'tint' | 'border' | 'shadow';

export interface PatchMapPaintIntentProbe {
  readonly path: string;
  readonly role: PatchMapPaintRole;
  readonly resolved: boolean;
  readonly rgba?: readonly [number, number, number, number];
}

export interface PatchMapSemanticProbeContext {
  readonly lifecycle: PatchMapSemanticProbeLifecycle;
  readonly datasetRef?: string | null;
  readonly interactionMode?:
    | 'select'
    | 'pan'
    | 'transform'
    | 'relation-paint'
    | 'text-edit';
  readonly selectionIds?: readonly string[];
  readonly activeAnimationCount?: number;
  readonly activeGestureCount?: number;
  readonly historyDepth?: number;
  readonly historyCorruptCount?: number;
}

export interface PatchMapSemanticProductProbe {
  readonly revision: typeof PATCH_MAP_SEMANTIC_PROBE_REVISION;
  readonly lifecycle: PatchMapSemanticProbeLifecycle;
  readonly dataset: Readonly<{
    state: PatchMapSemanticProbeDatasetState;
    ref: string | null;
    semanticHash: string | null;
    rootIds: readonly string[];
    graphDeepFrozen: boolean;
  }>;
  readonly scene: Readonly<{
    nodes: readonly PatchMapSemanticNodeProbe[];
    elementTypes: readonly PatchMapElementType[];
    componentTypes: readonly PatchMapComponentType[];
    elementTypeCounts: readonly PatchMapSemanticTypeCount<PatchMapElementType>[];
    componentTypeCounts: readonly PatchMapSemanticTypeCount<PatchMapComponentType>[];
    counts: Readonly<{
      rootElements: number;
      elements: number;
      components: number;
      hierarchyEdges: number;
      maxDepth: number;
      hiddenLogicalComponents: number;
    }>;
  }>;
  readonly geometry: Readonly<{
    finiteValueCount: number;
    nonFiniteValueCount: number;
    allFinite: boolean;
  }>;
  readonly text: Readonly<{
    sourceCount: number;
    codeUnitCount: number;
    sourcesWithUnpairedSurrogate: number;
    unpairedSurrogateCount: number;
  }>;
  readonly paint: Readonly<{
    intentCount: number;
    resolvedCount: number;
    unresolvedCount: number;
    intents: readonly PatchMapPaintIntentProbe[];
  }>;
  readonly interaction: Readonly<{
    mode?:
      | 'select'
      | 'pan'
      | 'transform'
      | 'relation-paint'
      | 'text-edit';
    selectionIds: readonly string[];
    activeAnimationCount?: number;
    activeGestureCount?: number;
  }>;
  readonly history: Readonly<{
    depth?: number;
    corruptCount?: number;
  }>;
}

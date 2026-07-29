export interface MainParityWorldTransform {
  readonly rotationDegrees: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export interface MainParityAction {
  readonly type:
    | 'fit'
    | 'focus'
    | 'set-view'
    | 'world-transform'
    | 'select'
    | 'transform'
    | 'update-component'
    | 'update-element'
    | 'undo'
    | 'redo'
    | 'wait'
    | 'resize'
    | 'publish'
    | 'browser-click'
    | 'browser-drag'
    | 'browser-wheel';
  readonly ids?: readonly string[];
  readonly transformKind?: 'move' | 'resize' | 'rotate';
  readonly deltaWorld?: readonly [number, number];
  readonly handle?: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
  readonly deltaDegrees?: number;
  readonly lockedIds?: readonly string[];
  readonly mainChanges?: Readonly<Record<string, unknown>>;
  readonly id?: string;
  readonly ownerId?: string;
  readonly componentId?: string;
  readonly changes?: Readonly<Record<string, unknown>>;
  readonly history?: boolean | string;
  readonly relativeTransform?: boolean;
  readonly rotateOrigin?: 'center';
  readonly padding?: number;
  readonly width?: number;
  readonly height?: number;
  readonly pixelRatio?: number;
  readonly centerWorld?: readonly [number, number];
  readonly scale?: number;
  readonly world?: MainParityWorldTransform;
  readonly timeMs?: number;
  readonly durationMs?: number;
  readonly x?: number;
  readonly y?: number;
  readonly toX?: number;
  readonly toY?: number;
  readonly steps?: number;
  readonly button?: 'left' | 'middle' | 'right';
  readonly clickCount?: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
}

export interface MainParityEntityObservation {
  readonly id: string;
  readonly scope: 'element' | 'component';
  readonly ownerId: string | null;
  readonly requestedType: string;
  readonly present: boolean;
  readonly visible: boolean | null;
  readonly renderable: boolean | null;
  readonly bounds: readonly [number, number, number, number] | null;
  readonly center: readonly [number, number] | null;
  readonly rotationDegrees: number | null;
  readonly alpha: number | null;
  /** Publicly observable text after product normalization; null for non-text. */
  readonly textContent: string | null;
  /** Renderer-correlated text visibility when the runtime exposes it. */
  readonly textPublication: 'current' | 'absent' | null;
}

export interface MainParityObservation {
  readonly runtime: 'main' | 'core-v2';
  readonly lifecycle: string;
  readonly canvasCount: number;
  readonly canvasCssSize: readonly [number, number] | null;
  readonly canvasBackingSize: readonly [number, number] | null;
  readonly inputUnchanged: boolean | null;
  readonly entityCount: number;
  readonly entities: readonly MainParityEntityObservation[];
  readonly selectionIds: readonly string[];
  readonly history: Readonly<{
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undoDepth: number | null;
    readonly redoDepth: number | null;
  }>;
  readonly viewport: Readonly<{
    readonly centerWorld: readonly [number, number] | null;
    readonly scale: number | null;
    /** Fixed CSS-pixel probe used to verify cursor-centered zoom invariants. */
    readonly wheelProbeWorld: readonly [number, number] | null;
  }>;
  readonly world: MainParityWorldTransform;
  readonly diagnostics: readonly string[];
}

export interface MainParityOracle {
  readonly kind: 'main' | 'core-v2';
  initialize(options?: Readonly<{
    readonly width?: number;
    readonly height?: number;
    readonly pixelRatio?: number;
  }>): Promise<MainParityObservation>;
  load(input: unknown): Promise<MainParityObservation>;
  act(action: MainParityAction): Promise<MainParityObservation>;
  observe(): Promise<MainParityObservation>;
  destroy(): Promise<MainParityObservation>;
}

declare global {
  interface Window {
    __PATCH_MAP_MAIN_PARITY__?: MainParityOracle;
  }
}

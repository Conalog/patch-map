export type EntityKind = 'rect' | 'text' | 'image' | 'bar' | 'relation';
export type AlignSetting = 'left' | 'center' | 'right';
export type FitSetting = 'contain' | 'cover' | 'stretch';

/** Packed as 0xRRGGBBAA. */
export type Rgba = number;

export interface CorePoint {
  readonly x: number;
  readonly y: number;
}

export interface CoreBounds extends CorePoint {
  readonly width: number;
  readonly height: number;
}

export interface CoreView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation?: number;
}

export interface EntityRef {
  readonly slot: number;
  readonly generation: number;
}

export interface BaseEntityInput {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly interactive?: boolean;
  readonly zIndex?: number;
  readonly tags?: readonly string[];
}

export interface RectEntityInput extends BaseEntityInput {
  readonly kind: 'rect';
  readonly fill: Rgba;
  readonly stroke?: Rgba;
  readonly strokeWidth?: number;
  readonly radius?: number;
}

export interface TextEntityInput extends BaseEntityInput {
  readonly kind: 'text';
  readonly text: string;
  readonly color: Rgba;
  readonly fontSize: number;
  readonly fontFamily?: string;
  readonly fontWeight?: number;
  readonly align?: AlignSetting;
  readonly maxLines?: number;
}

export interface ImageEntityInput extends BaseEntityInput {
  readonly kind: 'image';
  readonly source: string;
  readonly tint?: Rgba;
  readonly fit?: FitSetting;
}

export interface BarEntityInput extends BaseEntityInput {
  readonly kind: 'bar';
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly fill: Rgba;
  readonly trackFill?: Rgba;
  readonly radius?: number;
}

export interface RelationEntityInput {
  readonly kind: 'relation';
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly color: Rgba;
  readonly lineWidth?: number;
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly interactive?: boolean;
  readonly zIndex?: number;
  readonly tags?: readonly string[];
}

export type EntityInput =
  | RectEntityInput
  | TextEntityInput
  | ImageEntityInput
  | BarEntityInput
  | RelationEntityInput;

export interface SceneDocument {
  readonly version: 1;
  readonly entities: readonly EntityInput[];
  readonly view?: CoreView;
  readonly background?: Rgba;
}

export interface EntityPatch {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly interactive?: boolean;
  readonly zIndex?: number;
  readonly tags?: readonly string[];
  readonly fill?: Rgba;
  readonly stroke?: Rgba;
  readonly strokeWidth?: number;
  readonly radius?: number;
  readonly text?: string;
  readonly color?: Rgba;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly fontWeight?: number;
  readonly align?: AlignSetting;
  readonly maxLines?: number;
  readonly source?: string;
  readonly tint?: Rgba;
  readonly fit?: FitSetting;
  readonly value?: number;
  readonly min?: number;
  readonly max?: number;
  readonly trackFill?: Rgba;
  readonly from?: string;
  readonly to?: string;
  readonly lineWidth?: number;
}

export type CoreTarget = string | EntityRef;

export type AnimatableProperty =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'opacity'
  | 'value';

export type CoreOperation =
  | { readonly type: 'add'; readonly entity: EntityInput }
  | { readonly type: 'patch'; readonly target: CoreTarget; readonly changes: EntityPatch }
  | { readonly type: 'remove'; readonly target: CoreTarget }
  | { readonly type: 'visibility'; readonly target: CoreTarget; readonly visible: boolean }
  | {
      readonly type: 'animate';
      readonly target: CoreTarget;
      readonly property: AnimatableProperty;
      readonly to: number;
      readonly durationMs: number;
      readonly easing?: 'linear' | 'easeInOut';
    }
  | { readonly type: 'view'; readonly view: CoreView }
  | {
      readonly type: 'selection';
      readonly targets: readonly CoreTarget[];
      readonly mode?: 'replace' | 'add' | 'remove' | 'toggle';
    };

export interface TransactionBatch {
  readonly operations: readonly CoreOperation[];
  readonly id?: string;
  readonly recordHistory?: boolean;
}

export interface SlotRange {
  readonly start: number;
  readonly end: number;
}

export interface LoadResult {
  readonly revision: number;
  readonly entityCount: number;
  readonly capacity: number;
  readonly changedRanges: readonly SlotRange[];
}

export interface CommitResult {
  readonly revision: number;
  readonly operationCount: number;
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
  readonly changedRanges: readonly SlotRange[];
}

export interface AdvanceResult {
  readonly revision: number;
  readonly timeMs: number;
  readonly activeAnimations: number;
  readonly changed: number;
  readonly changedRanges: readonly SlotRange[];
}

export interface FrameReport {
  readonly revision: number;
  readonly frame: number;
  readonly rendered: boolean;
  readonly commandCount: number;
  readonly changedRanges: readonly SlotRange[];
  readonly cpuMs: number;
}

export interface EntitySnapshot {
  readonly ref: EntityRef;
  readonly id: string;
  readonly kind: EntityKind;
  readonly bounds: CoreBounds;
  readonly rotation: number;
  readonly opacity: number;
  readonly visible: boolean;
  readonly interactive: boolean;
  readonly zIndex: number;
  readonly tags: readonly string[];
  readonly data: Readonly<Record<string, string | number | boolean | undefined>>;
}

export interface QueryFilter {
  readonly kinds?: readonly EntityKind[];
  readonly visible?: boolean;
  readonly interactive?: boolean;
  readonly tags?: readonly string[];
  readonly ids?: readonly string[];
  readonly intersects?: CoreBounds;
}

export interface HitTestOptions {
  readonly kinds?: readonly EntityKind[];
  readonly interactiveOnly?: boolean;
}

export interface SelectionSnapshot {
  readonly revision: number;
  readonly refs: readonly EntityRef[];
}

export interface SceneSnapshot {
  readonly revision: number;
  readonly view: CoreView;
  readonly entityCount: number;
  readonly entities: readonly EntitySnapshot[];
  readonly selection: SelectionSnapshot;
}

export type CoreEvent =
  | { readonly type: 'load'; readonly revision: number; readonly entityCount: number }
  | { readonly type: 'commit'; readonly revision: number; readonly result: CommitResult }
  | { readonly type: 'advance'; readonly revision: number; readonly result: AdvanceResult }
  | { readonly type: 'flush'; readonly revision: number; readonly report: FrameReport }
  | {
      readonly type: 'pointer';
      readonly revision: number;
      readonly pointerType: PointerRecord['type'];
      readonly target: EntityRef | null;
    };

export interface PointerRecord extends CorePoint {
  readonly type: 'move' | 'down' | 'up' | 'cancel';
  readonly pointerId: number;
  readonly button?: number;
  readonly buttons?: number;
  readonly timeMs: number;
}

export interface PointerResult {
  readonly target: EntityRef | null;
  readonly selection: SelectionSnapshot;
}

export interface CoreSceneOptions {
  readonly initialCapacity?: number;
  readonly historyLimit?: number;
  readonly eventLimit?: number;
}

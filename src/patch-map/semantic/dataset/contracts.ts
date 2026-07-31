export const PATCH_MAP_ELEMENT_TYPES = [
  'group',
  'grid',
  'item',
  'relations',
  'image',
  'text',
  'rect',
] as const;

export const PATCH_MAP_COMPONENT_TYPES = ['background', 'bar', 'icon', 'text'] as const;

export type PatchMapElementType = (typeof PATCH_MAP_ELEMENT_TYPES)[number];
export type PatchMapComponentType = (typeof PATCH_MAP_COMPONENT_TYPES)[number];
export type PatchMapDatasetDiagnosticCode =
  | 'INVALID_RECORD_KIND'
  | 'DUPLICATE_ID'
  | 'MISSING_TARGET'
  | 'UNKNOWN_FIELD'
  | 'INVALID_VALUE';

export interface PatchMapFixedSize {
  readonly width: number;
  readonly height: number;
}

export interface PatchMapAxisSpacing {
  readonly x: number;
  readonly y: number;
}

export interface PatchMapEdges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PatchMapUnitDimension {
  readonly value: number;
  readonly unit: 'px' | '%';
}

export type PatchMapDimension = number | string | PatchMapUnitDimension;
export type PatchMapComponentSize =
  | PatchMapDimension
  | Readonly<{ width: PatchMapDimension; height: PatchMapDimension }>;
export type PatchMapEventMode = 'none' | 'passive' | 'auto' | 'static' | 'dynamic';
export type PatchMapTextOverflow = 'visible' | 'hidden' | 'ellipsis';
export type PatchMapPlacement =
  | 'left'
  | 'left-top'
  | 'left-bottom'
  | 'top'
  | 'right'
  | 'right-top'
  | 'right-bottom'
  | 'bottom'
  | 'center'
  | 'none';

export interface PatchMapAssetDescriptor {
  readonly src: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly format?: string;
  readonly parser?: string;
  readonly loadParser?: string;
}

export interface PatchMapRectTexture {
  readonly type: 'rect';
  readonly fill: unknown;
  readonly borderWidth: number;
  readonly borderColor: unknown;
  readonly radius: PatchMapRadius;
}

export type PatchMapAssetSource = string | PatchMapAssetDescriptor;
export type PatchMapBackgroundSource = PatchMapAssetSource | PatchMapRectTexture;
export type PatchMapRadius =
  | number
  | readonly [number, number, number, number]
  | Readonly<{
      topLeft: number;
      topRight: number;
      bottomRight: number;
      bottomLeft: number;
    }>;

export type PatchMapAttrs = Readonly<Record<string, unknown>>;
export type PatchMapStrokeStyle = Readonly<Record<string, unknown>>;
export type PatchMapTextStyle = Readonly<Record<string, unknown>>;

interface PatchMapElementBase {
  readonly [key: string]: unknown;
  readonly id: string;
  readonly label?: string;
  readonly show: boolean;
  readonly locked: boolean;
  readonly attrs?: PatchMapAttrs;
}

interface PatchMapComponentBase {
  readonly id: string;
  readonly label?: string;
  readonly show: boolean;
  readonly attrs?: PatchMapAttrs;
}

export interface PatchMapGroupElement extends PatchMapElementBase {
  readonly type: 'group';
  readonly children: readonly PatchMapElement[];
}

export interface PatchMapGridItemTemplate {
  readonly size: PatchMapFixedSize;
  readonly components: readonly PatchMapComponent[];
  readonly padding: PatchMapEdges;
  readonly contentOrientation: 'follow-item' | 'upright';
}

export interface PatchMapGridElement extends PatchMapElementBase {
  readonly type: 'grid';
  readonly cells: readonly (readonly (0 | 1 | string)[])[];
  readonly item: PatchMapGridItemTemplate;
  readonly inactiveCellStrategy: 'destroy' | 'hide';
  readonly gap: PatchMapAxisSpacing;
}

export interface PatchMapItemElement extends PatchMapElementBase {
  readonly type: 'item';
  readonly size: PatchMapFixedSize;
  readonly components: readonly PatchMapComponent[];
  readonly padding: PatchMapEdges;
  readonly contentOrientation: 'follow-item' | 'upright';
}

export interface PatchMapRelationLink {
  readonly source: string;
  readonly target: string;
}

export interface PatchMapRelationsElement extends PatchMapElementBase {
  readonly type: 'relations';
  readonly links: readonly PatchMapRelationLink[];
  readonly style: PatchMapStrokeStyle;
}

export interface PatchMapImageElement extends PatchMapElementBase {
  readonly type: 'image';
  readonly source: PatchMapAssetSource;
  readonly size?: PatchMapFixedSize;
  readonly opacity?: number;
}

export interface PatchMapTextElement extends PatchMapElementBase {
  readonly type: 'text';
  readonly text: string;
  readonly style: PatchMapTextStyle;
  readonly size?: PatchMapFixedSize;
  readonly overflow?: PatchMapTextOverflow;
}

export interface PatchMapRectElement extends PatchMapElementBase {
  readonly type: 'rect';
  readonly size: PatchMapFixedSize;
  readonly fill?: unknown;
  readonly stroke?: PatchMapStrokeStyle;
  readonly radius: PatchMapRadius;
  readonly eventMode?: PatchMapEventMode;
}

export type PatchMapElement =
  | PatchMapGroupElement
  | PatchMapGridElement
  | PatchMapItemElement
  | PatchMapRelationsElement
  | PatchMapImageElement
  | PatchMapTextElement
  | PatchMapRectElement;

export interface PatchMapBackgroundComponent extends PatchMapComponentBase {
  readonly type: 'background';
  readonly source: PatchMapBackgroundSource;
  readonly tint: unknown;
  readonly size?: PatchMapComponentSize;
}

export interface PatchMapBarComponent extends PatchMapComponentBase {
  readonly type: 'bar';
  readonly source: PatchMapRectTexture;
  readonly size: PatchMapComponentSize;
  readonly placement: PatchMapPlacement;
  readonly margin: PatchMapEdges;
  readonly tint: unknown;
  readonly animation: boolean;
  readonly animationDuration: number;
}

export interface PatchMapIconComponent extends PatchMapComponentBase {
  readonly type: 'icon';
  readonly source: PatchMapAssetSource;
  readonly size: PatchMapComponentSize;
  readonly placement: PatchMapPlacement;
  readonly margin: PatchMapEdges;
  readonly tint: unknown;
}

export interface PatchMapTextComponent extends PatchMapComponentBase {
  readonly type: 'text';
  readonly text: string;
  readonly placement: PatchMapPlacement;
  readonly margin: PatchMapEdges;
  readonly tint: unknown;
  readonly style: PatchMapTextStyle;
  readonly split: number;
}

export type PatchMapComponent =
  | PatchMapBackgroundComponent
  | PatchMapBarComponent
  | PatchMapIconComponent
  | PatchMapTextComponent;

export interface PatchMapDatasetMaterialization {
  readonly dataset: readonly PatchMapElement[];
  readonly rootIds: readonly string[];
  readonly elementTypes: readonly PatchMapElementType[];
  readonly componentTypes: readonly PatchMapComponentType[];
  readonly semanticHash: string;
  readonly visibleBoundsFinite: boolean;
}

/** Engine-facing names retained for the initial lifecycle tranche. */
export type MaterializedPatchMapDataset = PatchMapDatasetMaterialization;
export type NormalizedPatchMapElement = PatchMapElement;

export class PatchMapDatasetError extends Error {
  public readonly category: 'INVALID_INPUT' | 'MISSING_TARGET';
  public readonly code: PatchMapDatasetDiagnosticCode;
  public readonly datasetPath: string;
  public readonly recoverable = false;
  public readonly retryable = false;
  public readonly appliedCount = 0;
  public readonly missingCount: 0 | 1;
  public readonly unchangedCount = 0;

  public constructor(code: PatchMapDatasetDiagnosticCode, datasetPath: string, detail: string) {
    super(`${code} at ${datasetPath}: ${detail}`);
    this.name = 'PatchMapDatasetError';
    this.code = code;
    this.category = code === 'MISSING_TARGET' ? 'MISSING_TARGET' : 'INVALID_INPUT';
    this.missingCount = code === 'MISSING_TARGET' ? 1 : 0;
    this.datasetPath = datasetPath;
  }
}

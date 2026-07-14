import {
  Container,
  Graphics,
  Point,
  Rectangle,
  type PointData,
} from 'pixi.js';

import { ZodValidationError } from './model/validation';

export type TransformableElement = Container & {
  id?: string;
  type?: string;
  props?: object;
  setLocalBounds?: (bounds: {
    readonly x?: number;
    readonly y?: number;
    readonly width: number;
    readonly height: number;
  }) => unknown;
};

type ElementInput = TransformableElement | readonly TransformableElement[];
type BoundsDisplayMode = 'all' | 'groupOnly' | 'elementOnly' | 'none';
type ResizeHandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type RotateHandleName = 'nw' | 'ne' | 'se' | 'sw';
type PublicCornerName =
  | 'top-left'
  | 'top-right'
  | 'bottom-right'
  | 'bottom-left';
type PublicEdgeName = 'top' | 'right' | 'bottom' | 'left';
type GestureKind = 'resize' | 'rotate';
type GesturePhase = 'start' | 'change' | 'end';

export interface TransformerPointerEvent {
  readonly global: PointData;
  readonly shiftKey?: boolean;
  readonly target?: unknown;
  stopPropagation?: () => void;
}

interface Frame {
  readonly points: readonly [Point, Point, Point, Point];
  readonly center: Point;
  readonly width: number;
  readonly height: number;
  readonly unitX: Point;
  readonly unitY: Point;
}

interface ElementGestureSnapshot {
  readonly element: TransformableElement;
  readonly localCenter: Point;
  readonly centerX: number;
  readonly centerY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly angle: number;
  readonly rotation: number;
  readonly writesRotation: boolean;
  readonly semanticSize: { readonly width: number; readonly height: number } | null;
}

interface ActiveGesture {
  readonly kind: GestureKind;
  readonly handle: Container;
  readonly handleName: ResizeHandleName | RotateHandleName;
  readonly frame: Frame;
  readonly elements: readonly ElementGestureSnapshot[];
  readonly historyId: string | undefined;
  readonly startPointerAngle: number;
  readonly grabOffsetX: number;
  readonly grabOffsetY: number;
  keepRatio: boolean;
}

export interface TransformerGesturePayload {
  readonly kind: GestureKind;
  readonly phase: GesturePhase;
  readonly handle: Container;
  readonly elements: readonly TransformableElement[];
  readonly selected: readonly TransformableElement[];
  readonly historyId: string | undefined;
  readonly keepRatio?: boolean;
}

const ROTATE_HANDLES: readonly RotateHandleName[] = ['nw', 'ne', 'se', 'sw'];
const CORNER_NAMES: Readonly<Record<RotateHandleName, PublicCornerName>> = {
  nw: 'top-left',
  ne: 'top-right',
  se: 'bottom-right',
  sw: 'bottom-left',
};
const EDGE_NAMES: Readonly<Record<'n' | 'e' | 's' | 'w', PublicEdgeName>> = {
  n: 'top',
  e: 'right',
  s: 'bottom',
  w: 'left',
};
const publicResizeHandleName = (
  name: ResizeHandleName,
): PublicCornerName | PublicEdgeName =>
  name === 'nw' || name === 'ne' || name === 'se' || name === 'sw'
    ? CORNER_NAMES[name]
    : EDGE_NAMES[name];
const TRANSFORMABLE_TYPES = new Set(['grid', 'item', 'rect', 'image', 'text']);
const MIN_FRAME_SIZE = 1;
const ROTATE_HANDLE_OFFSET = 18;
const ROTATE_HANDLE_SIZE = 18;
const RESIZE_HANDLE_SIZE = 10;
const RESIZE_EDGE_HALF_SIZE = 6;
const RAD_TO_DEG = 180 / Math.PI;
const ROTATION_SNAP = Math.PI / 12;

const normalizeElements = (value: ElementInput): TransformableElement[] => {
  if (!Array.isArray(value)) return [value as TransformableElement];
  const elements = value as readonly TransformableElement[];
  return [...elements];
};

const uniqueElements = (value: ElementInput): TransformableElement[] => [
  ...new Set(normalizeElements(value)),
];

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const midpoint = (first: PointData, second: PointData): Point =>
  new Point((first.x + second.x) / 2, (first.y + second.y) / 2);

const distance = (first: PointData, second: PointData): number =>
  Math.hypot(second.x - first.x, second.y - first.y);

const normalizedVector = (
  first: PointData,
  second: PointData,
  fallback: PointData,
): Point => {
  const x = second.x - first.x;
  const y = second.y - first.y;
  const magnitude = Math.hypot(x, y);
  return magnitude > 0
    ? new Point(x / magnitude, y / magnitude)
    : new Point(fallback.x, fallback.y);
};

const frameFromPoints = (
  points: readonly [Point, Point, Point, Point],
): Frame => ({
  points,
  center: midpoint(points[0], points[2]),
  width: distance(points[0], points[1]),
  height: distance(points[0], points[3]),
  unitX: normalizedVector(points[0], points[1], { x: 1, y: 0 }),
  unitY: normalizedVector(points[0], points[3], { x: 0, y: 1 }),
});

const axisAlignedFrame = (frames: readonly Frame[]): Frame | null => {
  if (!frames.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const frame of frames) {
    for (const point of frame.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  return frameFromPoints([
    new Point(minX, minY),
    new Point(maxX, minY),
    new Point(maxX, maxY),
    new Point(minX, maxY),
  ]);
};

const paddedPointsBounds = (
  points: readonly PointData[],
  padding: number,
): Rectangle => {
  if (points.length === 0) return new Rectangle(0, 0, 0, 0);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return new Rectangle(
    minX - padding,
    minY - padding,
    maxX - minX + padding * 2,
    maxY - minY + padding * 2,
  );
};

const handleDirection = (
  name: ResizeHandleName,
): { readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1 } => ({
  x: name.includes('w') ? -1 : name.includes('e') ? 1 : 0,
  y: name.includes('n') ? -1 : name.includes('s') ? 1 : 0,
});

const framePosition = (frame: Frame, name: ResizeHandleName): Point => {
  const [nw, ne, se, sw] = frame.points;
  switch (name) {
    case 'nw':
      return nw.clone();
    case 'n':
      return midpoint(nw, ne);
    case 'ne':
      return ne.clone();
    case 'e':
      return midpoint(ne, se);
    case 'se':
      return se.clone();
    case 's':
      return midpoint(sw, se);
    case 'sw':
      return sw.clone();
    case 'w':
      return midpoint(nw, sw);
  }
};

const frameCoordinate = (
  point: PointData,
  frame: Frame,
): { readonly x: number; readonly y: number } => {
  const x = point.x - frame.center.x;
  const y = point.y - frame.center.y;
  return {
    x: x * frame.unitX.x + y * frame.unitX.y,
    y: x * frame.unitY.x + y * frame.unitY.y,
  };
};

const framePoint = (frame: Frame, x: number, y: number): Point =>
  new Point(
    frame.center.x + frame.unitX.x * x + frame.unitY.x * y,
    frame.center.y + frame.unitX.y * x + frame.unitY.y * y,
  );

const isLocked = (element: TransformableElement): boolean =>
  record(element.props).locked === true || Reflect.get(element, 'locked') === true;

const supportsTransform = (element: TransformableElement): boolean => {
  if (element.destroyed || isLocked(element)) return false;
  if (typeof element.type !== 'string') return true;
  return TRANSFORMABLE_TYPES.has(element.type.toLowerCase());
};

const writeProps = (
  element: TransformableElement,
  changes: Record<string, number>,
): void => {
  if (!element.props || typeof element.props !== 'object') return;
  const props = record(element.props);
  const attrs = record(props.attrs);
  element.props = { ...props, attrs: { ...attrs, ...changes } };
};

const semanticSize = (
  element: TransformableElement,
): { readonly width: number; readonly height: number } | null => {
  const size = record(element.props).size;
  if (typeof size === 'number' && Number.isFinite(size)) {
    return { width: size, height: size };
  }
  if (!size || typeof size !== 'object') return null;
  const width = record(size).width;
  const height = record(size).height;
  return typeof width === 'number' && Number.isFinite(width) &&
      typeof height === 'number' && Number.isFinite(height)
    ? { width, height }
    : null;
};

const writeSemanticSize = (
  element: TransformableElement,
  size: { readonly width: number; readonly height: number },
): void => {
  if (!element.props || typeof element.props !== 'object') return;
  const localBounds = element.getLocalBounds();
  element.props = { ...record(element.props), size: { ...size } };
  if (
    typeof element.setLocalBounds === 'function' &&
    typeof record(element).replaceProps === 'function'
  ) {
    element.setLocalBounds({
      x: localBounds.x,
      y: localBounds.y,
      ...size,
    });
  } else {
    element.boundsArea = new Rectangle(
      localBounds.x,
      localBounds.y,
      size.width,
      size.height,
    );
  }
};

export interface TransformerOptions {
  elements?: ElementInput;
  wireframeStyle?: { thickness?: number; color?: string };
  boundsDisplayMode?: BoundsDisplayMode;
  resizeHandles?: boolean;
  rotateHandles?: boolean;
  transformHistory?: boolean;
  resizeKeepRatio?: boolean;
  getResizeKeepRatio?: (context: {
    event: TransformerPointerEvent;
    handle: unknown;
    elements: readonly TransformableElement[];
  }) => boolean;
}

interface NormalizedTransformerOptions {
  readonly wireframeStyle: {
    readonly thickness: number;
    readonly color: string;
  };
  readonly boundsDisplayMode: BoundsDisplayMode;
  readonly resizeHandles: boolean;
  readonly rotateHandles: boolean;
  readonly transformHistory: boolean;
  readonly resizeKeepRatio: boolean;
  readonly getResizeKeepRatio:
    | TransformerOptions['getResizeKeepRatio']
    | undefined;
}

export class SelectionModel {
  #elements: TransformableElement[] = [];
  #destroyed = false;
  readonly #onChange: (
    current: TransformableElement[],
    added: TransformableElement[],
    removed: TransformableElement[],
  ) => void;

  public constructor(
    onChange: (
      current: TransformableElement[],
      added: TransformableElement[],
      removed: TransformableElement[],
    ) => void,
  ) {
    this.#onChange = onChange;
  }

  public get elements(): readonly TransformableElement[] {
    return [...this.#elements];
  }

  public add(value: ElementInput): void {
    if (this.#destroyed) return;

    const selected = new Set(this.#elements);
    const additions: TransformableElement[] = [];
    for (const element of normalizeElements(value)) {
      if (selected.has(element)) continue;
      selected.add(element);
      additions.push(element);
    }
    if (!additions.length) return;

    this.#elements = [...this.#elements, ...additions];
    this.#onChange([...this.#elements], additions, []);
  }

  public remove(value: ElementInput): void {
    if (this.#destroyed) return;

    const candidates = new Set(normalizeElements(value));
    const removed = this.#elements.filter((element) => candidates.has(element));
    if (!removed.length) return;

    this.#elements = this.#elements.filter((element) => !candidates.has(element));
    this.#onChange([...this.#elements], [], removed);
  }

  public set(value: ElementInput | null): void {
    if (this.#destroyed) return;

    const next = value === null ? [] : uniqueElements(value);
    const added = next.filter((element) => !this.#elements.includes(element));
    const removed = this.#elements.filter((element) => !next.includes(element));
    if (!added.length && !removed.length) return;

    this.#elements = next;
    this.#onChange([...next], added, removed);
  }

  public clear(): void {
    this.set([]);
  }

  public destroy(): void {
    if (this.#destroyed) return;

    const current = [...this.#elements];
    if (current.length) this.#onChange(current, [], []);
    this.#elements = [];
    this.#destroyed = true;
  }
}

export class Transformer extends Container {
  #destroying = false;
  #gestureSequence = 0;
  #activeGesture: ActiveGesture | null = null;
  #lastVisualKey = '';

  readonly #wireframe = new Graphics({
    label: 'Graphics',
    eventMode: 'passive',
  });
  readonly #handleLayer = new Container({
    label: 'transform-handles',
    eventMode: 'passive',
  });
  readonly #resizeFrame = new Graphics({
    label: 'resize-frame',
    eventMode: 'none',
  });
  readonly #resizeEdgeNodes = new Map<'n' | 'e' | 's' | 'w', Container>();
  readonly #resizeHandleNodes = new Map<ResizeHandleName, Graphics>();
  readonly #rotateHandleNodes = new Map<RotateHandleName, Graphics>();

  public readonly selection: SelectionModel;
  public readonly options: Readonly<NormalizedTransformerOptions>;

  public constructor(options: TransformerOptions | null = {}) {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new ZodValidationError(
        `Validation error: Expected object, received ${options === null ? 'null' : typeof options}`,
      );
    }
    if (
      options.boundsDisplayMode !== undefined &&
      !['all', 'groupOnly', 'elementOnly', 'none'].includes(options.boundsDisplayMode)
    ) {
      throw new ZodValidationError(
        `Validation error: Invalid enum value. Expected 'all' | 'groupOnly' | 'elementOnly' | 'none', received '${String(options.boundsDisplayMode)}' at "boundsDisplayMode"`,
      );
    }
    super({ label: 'transformer' });
    this.eventMode = 'static';
    Reflect.set(this.#wireframe, 'type', 'wireframe');
    this.options = {
      wireframeStyle: {
        thickness: 1.5,
        color: '#1099FF',
        ...options.wireframeStyle,
      },
      boundsDisplayMode: options.boundsDisplayMode ?? 'all',
      resizeHandles: options.resizeHandles ?? false,
      rotateHandles: options.rotateHandles ?? false,
      transformHistory: options.transformHistory ?? false,
      resizeKeepRatio: options.resizeKeepRatio ?? false,
      getResizeKeepRatio: options.getResizeKeepRatio,
    };

    this.addChild(this.#wireframe, this.#handleLayer);
    this.#handleLayer.addChild(this.#resizeFrame);
    this.#createHandles();
    this.hitArea = {
      contains: (x: number, y: number) => this.#containsGesturePoint(x, y),
    };
    this.#bindGestureEvents();
    this.selection = new SelectionModel((current, added, removed) => {
      this.#activeGesture = null;
      this.#lastVisualKey = '';
      this.refresh();
      this.emit('update_elements', { current, added, removed });
    });
    this.onRender = () => this.refresh();
    if (options.elements) this.selection.set(options.elements);
    this.refresh();
  }

  public get elements(): TransformableElement[] {
    return [...this.selection.elements];
  }

  public set elements(value: ElementInput) {
    this.selection.set(value);
  }

  public get wireframeStyle(): Readonly<NormalizedTransformerOptions['wireframeStyle']> {
    return this.options.wireframeStyle;
  }

  public get boundsDisplayMode(): BoundsDisplayMode {
    return this.options.boundsDisplayMode;
  }

  public get resizeHandles(): boolean {
    return this.options.resizeHandles;
  }

  public get rotateHandles(): boolean {
    return this.options.rotateHandles;
  }

  public get transformHistory(): boolean {
    return this.options.transformHistory;
  }

  public get resizeKeepRatio(): boolean {
    return this.options.resizeKeepRatio;
  }

  /** Recomputes visible bounds after external scene or view transforms. */
  public refresh(): void {
    if (this.destroyed || this.#destroying) return;

    const frames = this.selection.elements
      .filter((element) => element !== this && !element.destroyed)
      .map((element) => this.#elementFrame(element));
    const groupFrame = frames.length === 1
      ? (frames[0] ?? null)
      : axisAlignedFrame(frames);
    const visualKey = this.#visualKey(frames, groupFrame);
    if (visualKey === this.#lastVisualKey) return;
    this.#lastVisualKey = visualKey;

    this.#drawWireframes(frames, groupFrame);
    this.#positionHandles(groupFrame);
  }

  public override destroy(
    options?: Parameters<Container['destroy']>[0],
  ): void {
    if (this.destroyed || this.#destroying) return;

    this.#destroying = true;
    try {
      this.#activeGesture = null;
      this.onRender = null;
      this.selection.destroy();
      if (options === true) {
        super.destroy(true);
      } else if (options && typeof options === 'object') {
        super.destroy({ ...options, children: true });
      } else {
        super.destroy({ children: true });
      }
    } finally {
      this.#destroying = false;
    }
  }

  #createHandles(): void {
    for (const name of ['n', 'e', 's', 'w'] as const) {
      const handle = new Container({
        label: `resize-edge:${EDGE_NAMES[name]}`,
        eventMode: 'static',
        cursor: name === 'n' || name === 's' ? 'ns-resize' : 'ew-resize',
      });
      this.#resizeEdgeNodes.set(name, handle);
      this.#handleLayer.addChild(handle);
    }

    for (const name of ROTATE_HANDLES) {
      const handle = new Graphics({
        label: `rotate-handle:${CORNER_NAMES[name]}`,
        eventMode: 'static',
        cursor: 'crosshair',
      })
        .rect(
          -ROTATE_HANDLE_SIZE / 2,
          -ROTATE_HANDLE_SIZE / 2,
          ROTATE_HANDLE_SIZE,
          ROTATE_HANDLE_SIZE,
        )
        .fill(this.options.wireframeStyle.color);
      handle.hitArea = new Rectangle(
        -ROTATE_HANDLE_SIZE / 2,
        -ROTATE_HANDLE_SIZE / 2,
        ROTATE_HANDLE_SIZE,
        ROTATE_HANDLE_SIZE,
      );
      this.#rotateHandleNodes.set(name, handle);
      this.#handleLayer.addChild(handle);
    }

    for (const name of ROTATE_HANDLES) {
      const handle = new Graphics({
        label: `resize-handle:${CORNER_NAMES[name]}`,
        eventMode: 'static',
        cursor: name === 'nw' || name === 'se' ? 'nwse-resize' : 'nesw-resize',
      })
        .rect(
          -RESIZE_HANDLE_SIZE / 2,
          -RESIZE_HANDLE_SIZE / 2,
          RESIZE_HANDLE_SIZE,
          RESIZE_HANDLE_SIZE,
        )
        .fill('#FFFFFF');
      handle.hitArea = new Rectangle(
        -RESIZE_HANDLE_SIZE / 2,
        -RESIZE_HANDLE_SIZE / 2,
        RESIZE_HANDLE_SIZE,
        RESIZE_HANDLE_SIZE,
      );
      this.#resizeHandleNodes.set(name, handle);
      this.#handleLayer.addChild(handle);
    }
  }

  #bindGestureEvents(): void {
    this.on('pointerdown', (event: TransformerPointerEvent) => {
      if (this.#activeGesture) return;
      const target = this.#gestureTarget(event);
      if (!target) return;
      this.#startGesture(target.kind, target.name, target.handle, event);
    });
    this.on('globalpointermove', (event: TransformerPointerEvent) => {
      const gesture = this.#activeGesture;
      if (gesture) this.#moveGesture(gesture.handle, event);
    });
    const end = () => {
      const gesture = this.#activeGesture;
      if (gesture) this.#endGesture(gesture.handle);
    };
    this.on('pointerup', end);
    this.on('pointerupoutside', end);
    this.on('pointercancel', end);
  }

  #gestureTarget(event: TransformerPointerEvent): {
    readonly kind: GestureKind;
    readonly name: ResizeHandleName | RotateHandleName;
    readonly handle: Container;
  } | null {
    for (const [name, handle] of this.#resizeHandleNodes) {
      if (event.target === handle) return { kind: 'resize', name, handle };
    }
    for (const [name, handle] of this.#resizeEdgeNodes) {
      if (event.target === handle) return { kind: 'resize', name, handle };
    }
    const point = this.#handleLayer.toLocal(event.global);
    for (const [name, handle] of [...this.#resizeHandleNodes].reverse()) {
      if (handle.visible && handle.hitArea?.contains(
        point.x - handle.x,
        point.y - handle.y,
      )) {
        return { kind: 'resize', name, handle };
      }
    }
    for (const [name, handle] of [...this.#resizeEdgeNodes].reverse()) {
      if (handle.visible && handle.hitArea?.contains(point.x, point.y)) {
        return { kind: 'resize', name, handle };
      }
    }
    for (const [name, handle] of this.#rotateHandleNodes) {
      if (event.target === handle) return { kind: 'rotate', name, handle };
    }
    for (const [name, handle] of [...this.#rotateHandleNodes].reverse()) {
      if (handle.visible && handle.hitArea?.contains(
        point.x - handle.x,
        point.y - handle.y,
      )) {
        return { kind: 'rotate', name, handle };
      }
    }
    return null;
  }

  #containsGesturePoint(x: number, y: number): boolean {
    for (const handle of this.#resizeHandleNodes.values()) {
      if (handle.visible && handle.hitArea?.contains(x - handle.x, y - handle.y)) {
        return true;
      }
    }
    for (const handle of this.#resizeEdgeNodes.values()) {
      if (handle.visible && handle.hitArea?.contains(x, y)) return true;
    }
    for (const handle of this.#rotateHandleNodes.values()) {
      if (handle.visible && handle.hitArea?.contains(x - handle.x, y - handle.y)) {
        return true;
      }
    }
    return false;
  }

  #elementFrame(element: TransformableElement): Frame {
    const bounds = element.getLocalBounds();
    const localPoints = [
      new Point(bounds.x, bounds.y),
      new Point(bounds.x + bounds.width, bounds.y),
      new Point(bounds.x + bounds.width, bounds.y + bounds.height),
      new Point(bounds.x, bounds.y + bounds.height),
    ] as const;
    const points = localPoints.map((point) =>
      this.toLocal(element.toGlobal(point)),
    ) as unknown as [Point, Point, Point, Point];
    return frameFromPoints(points);
  }

  #visualKey(frames: readonly Frame[], groupFrame: Frame | null): string {
    const geometry = frames.flatMap((frame) =>
      frame.points.flatMap((point) => [point.x, point.y]),
    );
    return [
      this.options.boundsDisplayMode,
      this.options.resizeHandles,
      this.options.rotateHandles,
      this.selection.elements.filter(supportsTransform).length,
      groupFrame ? 1 : 0,
      ...geometry,
    ].join('|');
  }

  #drawWireframes(frames: readonly Frame[], groupFrame: Frame | null): void {
    const { boundsDisplayMode, wireframeStyle } = this.options;
    const showElements =
      boundsDisplayMode === 'all' || boundsDisplayMode === 'elementOnly';
    const showGroup =
      boundsDisplayMode === 'all' || boundsDisplayMode === 'groupOnly';

    this.#wireframe.clear();
    const displayedPoints: Point[] = [];
    if (showElements) {
      for (const frame of frames) {
        displayedPoints.push(...frame.points);
        this.#wireframe
          .poly(frame.points.flatMap((point) => [point.x, point.y]), true)
          .stroke({
            width: wireframeStyle.thickness,
            color: wireframeStyle.color,
          });
      }
    }
    if (showGroup && groupFrame) {
      displayedPoints.push(...groupFrame.points);
      this.#wireframe
        .poly(groupFrame.points.flatMap((point) => [point.x, point.y]), true)
        .stroke({
          width: wireframeStyle.thickness,
          color: wireframeStyle.color,
        });
    }
    this.#wireframe.visible = displayedPoints.length > 0;
    this.#wireframe.boundsArea = paddedPointsBounds(
      displayedPoints,
      wireframeStyle.thickness / 2,
    );
  }

  #positionHandles(frame: Frame | null): void {
    const eligible = this.selection.elements.some(supportsTransform);
    const showResize = this.options.resizeHandles && frame !== null && eligible;
    const showRotate = this.options.rotateHandles && frame !== null && eligible;

    this.#resizeFrame.clear();
    this.#resizeFrame.visible = (showResize || showRotate) && frame !== null;
    if (frame) {
      this.#resizeFrame
        .poly(frame.points.flatMap((point) => [point.x, point.y]), true)
        .stroke({
          width: this.options.wireframeStyle.thickness,
          color: this.options.wireframeStyle.color,
        });
      this.#resizeFrame.boundsArea = paddedPointsBounds(
        frame.points,
        this.options.wireframeStyle.thickness / 2,
      );
    } else {
      this.#resizeFrame.boundsArea = new Rectangle(0, 0, 0, 0);
    }

    const edgePoints = frame
      ? {
          n: [frame.points[0], frame.points[1]],
          e: [frame.points[1], frame.points[2]],
          s: [frame.points[3], frame.points[2]],
          w: [frame.points[0], frame.points[3]],
        } as const
      : null;
    for (const [name, handle] of this.#resizeEdgeNodes) {
      handle.visible = showResize;
      const points = edgePoints?.[name];
      const bounds = points
        ? paddedPointsBounds(points, RESIZE_EDGE_HALF_SIZE)
        : new Rectangle(0, 0, 0, 0);
      handle.boundsArea = bounds;
      handle.hitArea = bounds.clone();
    }

    for (const [name, handle] of this.#resizeHandleNodes) {
      handle.visible = showResize;
      if (frame) handle.position.copyFrom(framePosition(frame, name));
    }
    for (const [name, handle] of this.#rotateHandleNodes) {
      handle.visible = showRotate;
      if (!frame) continue;
      const corner = framePosition(frame, name);
      const outward = normalizedVector(frame.center, corner, { x: 1, y: 0 });
      handle.position.set(
        corner.x + outward.x * ROTATE_HANDLE_OFFSET,
        corner.y + outward.y * ROTATE_HANDLE_OFFSET,
      );
    }
  }

  #startGesture(
    kind: GestureKind,
    name: ResizeHandleName | RotateHandleName,
    handle: Container,
    event: TransformerPointerEvent,
  ): void {
    if (this.destroyed) return;
    this.refresh();
    const frames = this.selection.elements
      .filter((element) => element !== this && !element.destroyed)
      .map((element) => this.#elementFrame(element));
    const frame = frames.length === 1
      ? (frames[0] ?? null)
      : axisAlignedFrame(frames);
    if (!frame) return;

    const elements = this.selection.elements
      .filter(supportsTransform)
      .map((element) => this.#snapshotElement(element, frame));
    if (!elements.length) return;

    const pointer = this.toLocal(event.global);
    const pointerCoordinate = frameCoordinate(pointer, frame);
    let grabOffsetX = 0;
    let grabOffsetY = 0;
    if (kind === 'resize') {
      const direction = handleDirection(name as ResizeHandleName);
      grabOffsetX = pointerCoordinate.x - direction.x * frame.width / 2;
      grabOffsetY = pointerCoordinate.y - direction.y * frame.height / 2;
    }
    const historyId = this.options.transformHistory
      ? `transformer:${kind}:${++this.#gestureSequence}`
      : undefined;
    this.#activeGesture = {
      kind,
      handle,
      handleName: name,
      frame,
      elements,
      historyId,
      startPointerAngle: Math.atan2(
        pointer.y - frame.center.y,
        pointer.x - frame.center.x,
      ),
      grabOffsetX,
      grabOffsetY,
      keepRatio: false,
    };
    event.stopPropagation?.();
    this.#emitGesture('start', this.#activeGesture);
  }

  #snapshotElement(
    element: TransformableElement,
    frame: Frame,
  ): ElementGestureSnapshot {
    const bounds = element.getLocalBounds();
    const localCenter = new Point(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    const center = this.toLocal(element.toGlobal(localCenter));
    const coordinate = frameCoordinate(center, frame);
    const attrs = record(record(element.props).attrs);
    return {
      element,
      localCenter,
      centerX: coordinate.x,
      centerY: coordinate.y,
      scaleX: element.scale.x,
      scaleY: element.scale.y,
      angle: element.angle,
      rotation: element.rotation,
      writesRotation: Object.hasOwn(attrs, 'rotation'),
      semanticSize: semanticSize(element),
    };
  }

  #moveGesture(handle: Container, event: TransformerPointerEvent): void {
    const gesture = this.#activeGesture;
    if (!gesture || gesture.handle !== handle) return;
    if (gesture.kind === 'resize') this.#resizeGesture(gesture, event);
    else this.#rotateGesture(gesture, event);
    event.stopPropagation?.();
    this.#lastVisualKey = '';
    this.refresh();
    this.#emitGesture('change', gesture);
  }

  #resizeGesture(
    gesture: ActiveGesture,
    event: TransformerPointerEvent,
  ): void {
    const frame = gesture.frame;
    const direction = handleDirection(gesture.handleName as ResizeHandleName);
    const pointer = this.toLocal(event.global);
    const coordinate = frameCoordinate(pointer, frame);
    const anchorX = -direction.x * frame.width / 2;
    const anchorY = -direction.y * frame.height / 2;
    let movingX = coordinate.x - gesture.grabOffsetX;
    let movingY = coordinate.y - gesture.grabOffsetY;

    if (direction.x > 0) movingX = Math.max(movingX, anchorX + MIN_FRAME_SIZE);
    if (direction.x < 0) movingX = Math.min(movingX, anchorX - MIN_FRAME_SIZE);
    if (direction.y > 0) movingY = Math.max(movingY, anchorY + MIN_FRAME_SIZE);
    if (direction.y < 0) movingY = Math.min(movingY, anchorY - MIN_FRAME_SIZE);

    let scaleX = direction.x === 0
      ? 1
      : Math.abs(movingX - anchorX) / Math.max(frame.width, MIN_FRAME_SIZE);
    let scaleY = direction.y === 0
      ? 1
      : Math.abs(movingY - anchorY) / Math.max(frame.height, MIN_FRAME_SIZE);
    const shiftKey = event.shiftKey === true;
    const callbackRatio = this.options.getResizeKeepRatio?.({
      event,
      handle: publicResizeHandleName(
        gesture.handleName as ResizeHandleName,
      ),
      elements: this.elements,
    }) === true;
    gesture.keepRatio = shiftKey || this.options.resizeKeepRatio || callbackRatio;

    if (gesture.keepRatio) {
      const uniformScale = direction.x === 0
        ? scaleY
        : direction.y === 0
          ? scaleX
          : Math.abs(scaleX - 1) <= Math.abs(scaleY - 1)
            ? scaleX
            : scaleY;
      scaleX = uniformScale;
      scaleY = uniformScale;
      if (direction.x !== 0) {
        movingX = anchorX + direction.x * frame.width * uniformScale;
      }
      if (direction.y !== 0) {
        movingY = anchorY + direction.y * frame.height * uniformScale;
      }
    }

    const centerX = direction.x === 0 ? 0 : (anchorX + movingX) / 2;
    const centerY = direction.y === 0 ? 0 : (anchorY + movingY) / 2;
    for (const snapshot of gesture.elements) {
      const desiredCenter = framePoint(
        frame,
        centerX + snapshot.centerX * scaleX,
        centerY + snapshot.centerY * scaleY,
      );
      snapshot.element.scale.set(
        snapshot.scaleX * scaleX,
        snapshot.scaleY * scaleY,
      );
      this.#placeElementCenter(snapshot, desiredCenter);
      if (snapshot.semanticSize) {
        writeSemanticSize(snapshot.element, {
          width: Math.max(1, Math.ceil(snapshot.semanticSize.width * scaleX)),
          height: Math.max(1, Math.ceil(snapshot.semanticSize.height * scaleY)),
        });
        snapshot.element.scale.set(snapshot.scaleX, snapshot.scaleY);
      }
      writeProps(snapshot.element, {
        x: snapshot.element.position.x,
        y: snapshot.element.position.y,
      });
    }
  }

  #rotateGesture(
    gesture: ActiveGesture,
    event: TransformerPointerEvent,
  ): void {
    const pointer = this.toLocal(event.global);
    const pointerAngle = Math.atan2(
      pointer.y - gesture.frame.center.y,
      pointer.x - gesture.frame.center.x,
    );
    let delta = pointerAngle - gesture.startPointerAngle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (event.shiftKey === true) {
      delta = Math.round(delta / ROTATION_SNAP) * ROTATION_SNAP;
    }
    const cosine = Math.cos(delta);
    const sine = Math.sin(delta);

    for (const snapshot of gesture.elements) {
      const centerX = snapshot.centerX * cosine - snapshot.centerY * sine;
      const centerY = snapshot.centerX * sine + snapshot.centerY * cosine;
      const desiredCenter = framePoint(gesture.frame, centerX, centerY);
      if (snapshot.writesRotation) {
        const rotation = snapshot.rotation + delta;
        snapshot.element.rotation = rotation;
        writeProps(snapshot.element, { rotation });
      } else {
        const angle = snapshot.angle + delta * RAD_TO_DEG;
        snapshot.element.angle = angle;
        writeProps(snapshot.element, { angle });
      }
      this.#placeElementCenter(snapshot, desiredCenter);
      writeProps(snapshot.element, {
        x: snapshot.element.position.x,
        y: snapshot.element.position.y,
      });
    }
  }

  #placeElementCenter(
    snapshot: ElementGestureSnapshot,
    desiredTransformerPoint: PointData,
  ): void {
    const element = snapshot.element;
    const desiredGlobal = this.toGlobal(desiredTransformerPoint);
    const currentGlobal = element.toGlobal(snapshot.localCenter);
    if (element.parent) {
      const desiredParent = element.parent.toLocal(desiredGlobal);
      const currentParent = element.parent.toLocal(currentGlobal);
      element.position.set(
        element.position.x + (desiredParent.x - currentParent.x),
        element.position.y + (desiredParent.y - currentParent.y),
      );
      return;
    }
    element.position.set(
      element.position.x + desiredGlobal.x - currentGlobal.x,
      element.position.y + desiredGlobal.y - currentGlobal.y,
    );
  }

  #endGesture(handle: Container): void {
    const gesture = this.#activeGesture;
    if (!gesture || gesture.handle !== handle) return;
    this.#activeGesture = null;
    this.#emitGesture('end', gesture);
  }

  #emitGesture(phase: GesturePhase, gesture: ActiveGesture): void {
    const payload: TransformerGesturePayload = {
      kind: gesture.kind,
      phase,
      handle: gesture.handle,
      elements: gesture.elements.map(({ element }) => element),
      selected: this.elements,
      historyId: gesture.historyId,
      ...(gesture.kind === 'resize' ? { keepRatio: gesture.keepRatio } : {}),
    };
    this.emit('transform', payload);
  }
}

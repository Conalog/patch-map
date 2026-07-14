import { Container, Graphics } from 'pixi.js';
import type { ColorSource, PointData } from 'pixi.js';

import { State } from './state';
import type { StateStore } from './state';
import { isMoved } from './utils';

export type SelectionUnit = 'entity' | 'closestGroup' | 'highestGroup' | 'grid';

export interface SelectionNodeProps {
  locked: boolean;
  [key: string]: unknown;
}

export type SelectionNode = Container & {
  id: string;
  type: string;
  props: SelectionNodeProps;
};

export interface SelectionPointerEvent {
  target?: unknown;
  global?: PointData;
  pointerId?: number;
  button?: number;
  detail?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
  nativeEvent?: {
    preventDefault?: () => void;
  };
  [key: string]: unknown;
}

export interface SelectionStateHost {
  world: Container | null;
  viewport?: Container | null;
}

export interface SelectionFillStyle {
  color?: ColorSource;
  alpha?: number;
}

export interface SelectionStrokeStyle {
  color?: ColorSource;
  alpha?: number;
  width?: number;
}

export interface SelectionBoxStyle {
  fill?: SelectionFillStyle;
  stroke?: SelectionStrokeStyle;
}

export type SelectionTargetCallback = (
  target: SelectionNode | null,
  event: SelectionPointerEvent,
) => unknown;

export type SelectionDragCallback = (
  targets: SelectionNode[],
  event: SelectionPointerEvent,
) => unknown;

export interface SelectionStateOptions {
  draggable?: boolean;
  paintSelection?: boolean;
  selectUnit?: SelectionUnit;
  drillDown?: boolean;
  deepSelect?: boolean;
  filter?: (target: SelectionNode) => unknown;
  selectionBoxStyle?: SelectionBoxStyle;
  onDown?: SelectionTargetCallback;
  onUp?: SelectionTargetCallback;
  onClick?: SelectionTargetCallback;
  onDoubleClick?: SelectionTargetCallback;
  onRightClick?: SelectionTargetCallback;
  onDragStart?: SelectionDragCallback;
  onDrag?: SelectionDragCallback;
  onDragEnd?: SelectionDragCallback;
  onOver?: SelectionTargetCallback;
}

interface MaterializedSelectionOptions {
  draggable: boolean;
  paintSelection: boolean;
  selectUnit: SelectionUnit;
  drillDown: boolean;
  deepSelect: boolean;
  filter?: (target: SelectionNode) => unknown;
  selectionBoxStyle: {
    fill: Required<SelectionFillStyle>;
    stroke: Required<SelectionStrokeStyle>;
  };
  onDown?: SelectionTargetCallback;
  onUp?: SelectionTargetCallback;
  onClick?: SelectionTargetCallback;
  onDoubleClick?: SelectionTargetCallback;
  onRightClick?: SelectionTargetCallback;
  onDragStart?: SelectionDragCallback;
  onDrag?: SelectionDragCallback;
  onDragEnd?: SelectionDragCallback;
  onOver?: SelectionTargetCallback;
}

interface NormalizedRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_FILL: Required<SelectionFillStyle> = {
  color: '#9FD6FF',
  alpha: 0.2,
};

const DEFAULT_STROKE: Required<SelectionStrokeStyle> = {
  width: 2,
  color: '#1099FF',
  alpha: 1,
};

const CONTAINER_TYPES = new Set(['group', 'grid']);

const finitePoint = (value: unknown): PointData | null => {
  if (!value || typeof value !== 'object') return null;
  const point = value as Partial<PointData>;
  if (
    typeof point.x !== 'number' ||
    !Number.isFinite(point.x) ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.y)
  ) {
    return null;
  }
  return { x: point.x, y: point.y };
};

const isSelectionNode = (value: unknown): value is SelectionNode => {
  if (!(value instanceof Container)) return false;
  const candidate = value as Container & Record<string, unknown>;
  const props = candidate.props;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.type === 'string' &&
    !!props &&
    typeof props === 'object' &&
    typeof (props as Record<string, unknown>).locked === 'boolean'
  );
};

const normalizeRectangle = (
  start: PointData,
  end: PointData,
): NormalizedRectangle => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});

const containsPoint = (
  point: PointData,
  bounds: Pick<NormalizedRectangle, 'x' | 'y' | 'width' | 'height'>,
): boolean =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height;

const intersectsRectangle = (
  left: NormalizedRectangle,
  right: Pick<NormalizedRectangle, 'x' | 'y' | 'width' | 'height'>,
): boolean =>
  left.x <= right.x + right.width &&
  left.x + left.width >= right.x &&
  left.y <= right.y + right.height &&
  left.y + left.height >= right.y;

const segmentIntersectsRectangle = (
  start: PointData,
  end: PointData,
  bounds: Pick<NormalizedRectangle, 'x' | 'y' | 'width' | 'height'>,
): boolean => {
  if (containsPoint(start, bounds) || containsPoint(end, bounds)) return true;

  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  let minimum = 0;
  let maximum = 1;
  const clip = (direction: number, distance: number): boolean => {
    if (direction === 0) return distance >= 0;
    const ratio = distance / direction;
    if (direction < 0) {
      if (ratio > maximum) return false;
      minimum = Math.max(minimum, ratio);
    } else {
      if (ratio < minimum) return false;
      maximum = Math.min(maximum, ratio);
    }
    return true;
  };

  return (
    clip(-deltaX, start.x - bounds.x) &&
    clip(deltaX, bounds.x + bounds.width - start.x) &&
    clip(-deltaY, start.y - bounds.y) &&
    clip(deltaY, bounds.y + bounds.height - start.y)
  );
};

const isSelectionUnit = (value: unknown): value is SelectionUnit =>
  value === 'entity' ||
  value === 'closestGroup' ||
  value === 'highestGroup' ||
  value === 'grid';

const normalizeOptions = (
  options: SelectionStateOptions,
): MaterializedSelectionOptions => {
  const normalized: MaterializedSelectionOptions = {
    draggable: options.draggable === true,
    paintSelection: options.paintSelection === true,
    selectUnit: isSelectionUnit(options.selectUnit) ? options.selectUnit : 'entity',
    drillDown: options.drillDown === true,
    deepSelect: options.deepSelect === true,
    selectionBoxStyle: {
      fill: { ...DEFAULT_FILL, ...options.selectionBoxStyle?.fill },
      stroke: { ...DEFAULT_STROKE, ...options.selectionBoxStyle?.stroke },
    },
  };

  if (options.filter) normalized.filter = options.filter;
  if (options.onDown) normalized.onDown = options.onDown;
  if (options.onUp) normalized.onUp = options.onUp;
  if (options.onClick) normalized.onClick = options.onClick;
  if (options.onDoubleClick) normalized.onDoubleClick = options.onDoubleClick;
  if (options.onRightClick) normalized.onRightClick = options.onRightClick;
  if (options.onDragStart) normalized.onDragStart = options.onDragStart;
  if (options.onDrag) normalized.onDrag = options.onDrag;
  if (options.onDragEnd) normalized.onDragEnd = options.onDragEnd;
  if (options.onOver) normalized.onOver = options.onOver;

  return normalized;
};

const asSelectionHost = (store: StateStore): SelectionStateHost | null => {
  const host = store.patchmap;
  if (!host || typeof host !== 'object' || !('world' in host)) return null;
  return host as SelectionStateHost;
};

/**
 * Documented selection interaction state, kept independent from Patchmap's
 * concrete implementation through a minimal world/viewport host contract.
 */
export class SelectionState extends State {
  public static override handledEvents = [
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointerupoutside',
    'click',
    'tap',
    'rightclick',
    'pointerover',
  ] as const;

  #host: SelectionStateHost | null = null;
  #options: MaterializedSelectionOptions = normalizeOptions({});
  #pointerId: number | null = null;
  #pointerIsActive = false;
  #dragging = false;
  #suppressNextClick = false;
  #dragStart: PointData | null = null;
  #lastDragPoint: PointData | null = null;
  #pressedTarget: SelectionNode | null = null;
  #dragSelection: SelectionNode[] = [];
  #paintSelection = new Set<SelectionNode>();
  #lastPaintPoint: PointData | null = null;
  #overlay: Graphics | null = null;
  #lastOver: SelectionNode | null = null;

  public override enter(
    store: StateStore,
    options: SelectionStateOptions = {},
  ): void {
    super.enter(store);
    this.#host = asSelectionHost(store);
    this.#options = normalizeOptions(options);
    this.#resetInteraction();
  }

  public override pause(): void {
    this.#resetInteraction();
  }

  public override exit(): void {
    this.#resetInteraction();
    this.#lastOver = null;
  }

  public override destroy(): void {
    this.#resetInteraction();
    this.#lastOver = null;
    this.#host = null;
    super.destroy();
  }

  public pointerdown(event: SelectionPointerEvent): void {
    if (event.button !== undefined && event.button !== 0) {
      if (event.button === 2) {
        this.#options.onDown?.(this.#resolveEventTarget(event), event);
      }
      return;
    }

    this.#resetInteraction();
    this.#pointerIsActive = true;
    this.#pointerId = event.pointerId ?? null;
    this.#dragStart = finitePoint(event.global);
    const target = this.#resolveEventTarget(event);
    this.#pressedTarget = target;
    this.#options.onDown?.(target, event);
  }

  public pointermove(event: SelectionPointerEvent): void {
    if (!this.#pointerIsActive || !this.#matchesPointer(event)) return;
    const point = finitePoint(event.global);
    const start = this.#dragStart;
    if (!this.#options.draggable || !point || !start) return;

    if (!this.#dragging) {
      if (!isMoved(start, point)) return;
      this.#dragging = true;
      this.#updateDragSelection(event, point);
      this.#options.onDragStart?.([...this.#dragSelection], event);
      this.#options.onDrag?.([...this.#dragSelection], event);
      return;
    }

    this.#updateDragSelection(event, point);
    this.#options.onDrag?.([...this.#dragSelection], event);
  }

  public pointerup(event: SelectionPointerEvent): void {
    this.#finishPointer(event, true);
  }

  public pointerupoutside(event: SelectionPointerEvent): void {
    this.#finishPointer(event, false);
  }

  public click(event: SelectionPointerEvent): void {
    if (this.#suppressNextClick) {
      this.#suppressNextClick = false;
      return;
    }
    this.#dispatchClick(event);
  }

  public tap(event: SelectionPointerEvent): void {
    this.click(event);
  }

  public rightclick(event: SelectionPointerEvent): void {
    event.preventDefault?.();
    event.nativeEvent?.preventDefault?.();
    this.#options.onRightClick?.(this.#resolveEventTarget(event), event);
  }

  public pointerover(event: SelectionPointerEvent): void {
    if (this.#pointerIsActive || this.#dragging || !this.#options.onOver) return;
    const target = this.#resolveEventTarget(event);
    if (target === this.#lastOver) return;
    this.#lastOver = target;
    if (target) this.#options.onOver(target, event);
  }

  #finishPointer(event: SelectionPointerEvent, completedInside: boolean): void {
    if (!this.#pointerIsActive || !this.#matchesPointer(event)) return;

    if (this.#dragging) {
      const point = finitePoint(event.global);
      if (
        point &&
        (point.x !== this.#lastDragPoint?.x || point.y !== this.#lastDragPoint?.y)
      ) {
        this.#updateDragSelection(event, point);
      }
      const releaseTarget = this.#resolveEventTarget(event) ?? this.#pressedTarget;
      if (completedInside && this.#pressedTarget) {
        this.#options.onUp?.(releaseTarget, event);
      }
      this.#options.onDragEnd?.([...this.#dragSelection], event);
      this.#resetInteraction();
      this.#suppressNextClick = completedInside;
      return;
    }

    if (completedInside) {
      const target = this.#resolveEventTarget(event);
      this.#options.onUp?.(target, event);
      if (typeof event.detail === 'number' && event.detail > 0) {
        this.#dispatchClick(event);
      }
    }

    this.#resetInteraction();
  }

  #dispatchClick(event: SelectionPointerEvent): void {
    const target = this.#resolveClickTarget(event);
    if (event.detail === 2) {
      this.#options.onDoubleClick?.(target, event);
    } else {
      this.#options.onClick?.(target, event);
    }
  }

  #matchesPointer(event: SelectionPointerEvent): boolean {
    return (
      this.#pointerId === null ||
      event.pointerId === undefined ||
      event.pointerId === this.#pointerId
    );
  }

  #updateDragSelection(event: SelectionPointerEvent, point: PointData): void {
    const start = this.#dragStart;
    if (!start) return;
    this.#lastDragPoint = { x: point.x, y: point.y };

    if (this.#options.paintSelection) {
      const previous = this.#lastPaintPoint ?? start;
      for (const candidate of this.#selectionLeaves()) {
        if (!segmentIntersectsRectangle(previous, point, candidate.getBounds())) {
          continue;
        }
        const resolved = this.#resolveUnit(candidate, event);
        if (resolved && this.#passesFilter(resolved)) {
          this.#paintSelection.add(resolved);
        }
      }
      this.#lastPaintPoint = { x: point.x, y: point.y };
      this.#dragSelection = [...this.#paintSelection];
      this.#destroyOverlay();
      return;
    }

    const selectionRectangle = normalizeRectangle(start, point);
    const selected: SelectionNode[] = [];
    const seen = new Set<SelectionNode>();
    for (const candidate of this.#selectionLeaves()) {
      if (!intersectsRectangle(selectionRectangle, candidate.getBounds())) continue;
      const resolved = this.#resolveUnit(candidate, event);
      if (resolved && this.#passesFilter(resolved) && !seen.has(resolved)) {
        seen.add(resolved);
        selected.push(resolved);
      }
    }
    this.#dragSelection = selected;
    this.#drawOverlay(start, point);
  }

  #resolveClickTarget(event: SelectionPointerEvent): SelectionNode | null {
    const raw = this.#rawEventTarget(event);
    if (!raw) return null;
    const resolved = this.#resolveUnit(raw, event);
    if (!resolved || !this.#options.drillDown || this.#deepSelectActive(event)) {
      return resolved && this.#passesFilter(resolved) ? resolved : null;
    }

    const path = this.#selectionPath(raw);
    const startIndex = path.indexOf(resolved);
    if (startIndex < 0) return resolved;
    const detail = typeof event.detail === 'number' && Number.isFinite(event.detail)
      ? Math.max(1, Math.floor(event.detail))
      : 1;
    const drilled = path[Math.min(path.length - 1, startIndex + detail - 1)] ?? resolved;
    return this.#passesFilter(drilled) ? drilled : null;
  }

  #resolveEventTarget(event: SelectionPointerEvent): SelectionNode | null {
    const raw = this.#rawEventTarget(event);
    if (!raw) return null;
    const resolved = this.#resolveUnit(raw, event);
    return resolved && this.#passesFilter(resolved) ? resolved : null;
  }

  #rawEventTarget(event: SelectionPointerEvent): SelectionNode | null {
    const direct = this.#nearestSelectionNode(event.target);
    if (direct && this.#nodeIsVisible(direct)) {
      return direct;
    }
    const point = finitePoint(event.global);
    return point ? this.#rawPointTarget(point) : null;
  }

  #rawPointTarget(point: PointData): SelectionNode | null {
    const candidates = this.#selectionLeaves();
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (candidate && containsPoint(point, candidate.getBounds())) return candidate;
    }
    return null;
  }

  #selectionLeaves(): SelectionNode[] {
    const root = this.#host?.world;
    if (!root) return [];
    const output: SelectionNode[] = [];

    const visit = (container: Container): void => {
      for (const child of container.children) {
        if (!isSelectionNode(child)) {
          visit(child);
          continue;
        }
        if (!this.#nodeIsVisible(child)) continue;
        if (CONTAINER_TYPES.has(child.type)) {
          const selectableChildren = child.children.some(isSelectionNode);
          if (selectableChildren) {
            visit(child);
            continue;
          }
        }
        output.push(child);
      }
    };

    visit(root);
    return output;
  }

  #nearestSelectionNode(value: unknown): SelectionNode | null {
    const root = this.#host?.world;
    if (!root || !(value instanceof Container)) return null;
    let current: Container | null = value;
    let nearest: SelectionNode | null = null;
    while (current) {
      if (!nearest && isSelectionNode(current)) nearest = current;
      if (current === root) return nearest;
      current = current.parent;
    }
    return null;
  }

  #selectionPath(node: SelectionNode): SelectionNode[] {
    const root = this.#host?.world;
    if (!root) return [];
    const path: SelectionNode[] = [];
    let current: Container | null = node;
    while (current && current !== root) {
      if (isSelectionNode(current)) path.push(current);
      current = current.parent;
    }
    return current === root ? path.reverse() : [];
  }

  #resolveUnit(
    node: SelectionNode,
    event: SelectionPointerEvent,
  ): SelectionNode | null {
    const unit = this.#deepSelectActive(event) ? 'grid' : this.#options.selectUnit;
    if (unit === 'entity') return node;

    const path = this.#selectionPath(node);
    if (unit === 'grid') {
      return [...path].reverse().find((candidate) => candidate.type === 'grid') ?? node;
    }

    const groups = path.filter((candidate) => candidate.type === 'group');
    if (unit === 'closestGroup') return groups.at(-1) ?? node;
    return groups[0] ?? node;
  }

  #deepSelectActive(event: SelectionPointerEvent): boolean {
    if (!this.#options.deepSelect) return false;
    return (
      event.ctrlKey === true ||
      event.metaKey === true ||
      this.store?.stateManager.isModifierActive('control') === true ||
      this.store?.stateManager.isModifierActive('meta') === true
    );
  }

  #passesFilter(node: SelectionNode): boolean {
    return this.#options.filter ? Boolean(this.#options.filter(node)) : true;
  }

  #nodeIsVisible(node: SelectionNode): boolean {
    const root = this.#host?.world;
    let current: Container | null = node;
    while (current) {
      if (!current.visible || !current.renderable || current.destroyed) return false;
      if (current === root) return true;
      current = current.parent;
    }
    return false;
  }

  #drawOverlay(start: PointData, end: PointData): void {
    const parent = this.#host?.viewport ?? this.#host?.world;
    if (!parent) return;
    const overlay = this.#overlay ?? new Graphics();
    if (!this.#overlay) {
      overlay.eventMode = 'none';
      overlay.label = 'patch-map-selection-box';
      overlay.zIndex = Number.MAX_SAFE_INTEGER;
      parent.addChild(overlay);
      this.#overlay = overlay;
    }

    const localStart = parent.toLocal(start);
    const localEnd = parent.toLocal(end);
    const rectangle = normalizeRectangle(localStart, localEnd);
    const { fill, stroke } = this.#options.selectionBoxStyle;
    overlay
      .clear()
      .rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
      .fill({ color: fill.color, alpha: fill.alpha })
      .stroke({ color: stroke.color, alpha: stroke.alpha, width: stroke.width });
  }

  #destroyOverlay(): void {
    const overlay = this.#overlay;
    this.#overlay = null;
    if (!overlay || overlay.destroyed) return;
    overlay.removeFromParent();
    overlay.destroy();
  }

  #resetInteraction(): void {
    this.#destroyOverlay();
    this.#pointerId = null;
    this.#pointerIsActive = false;
    this.#dragging = false;
    this.#suppressNextClick = false;
    this.#dragStart = null;
    this.#lastDragPoint = null;
    this.#pressedTarget = null;
    this.#dragSelection = [];
    this.#paintSelection.clear();
    this.#lastPaintPoint = null;
  }
}

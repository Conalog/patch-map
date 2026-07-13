import {
  Color,
  Container,
  Graphics,
  Matrix,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type {
  ColorSource,
  DestroyOptions,
  TextStyleOptions,
} from 'pixi.js';

import { getCachedSceneTexture } from '../assets';
import type { PatchmapTheme } from '../theme';
import {
  layoutAnimatedBar,
  layoutComponent,
  measureText,
  readFixedSize,
  type SceneSize,
} from './layout';

type PublicRecord = Record<string, unknown>;

interface LocalRect extends SceneSize {
  x: number;
  y: number;
}

interface RenderEntry {
  props: PublicRecord;
  matrix: Matrix;
  parentProps?: PublicRecord | undefined;
  localRect?: LocalRect | undefined;
  component: boolean;
  node?: LiveHandle | undefined;
  parentMatrix?: Matrix | undefined;
}

interface RelationEndpoints {
  from: string;
  to: string;
}

interface RasterBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface RasterSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

interface BarAnimationState {
  signature: string;
  startedAt: number;
  complete: boolean;
}

export interface RenderSceneHints {
  componentTypes?: readonly string[];
  restartAnimations?: boolean;
}

type LiveHandle = Container & {
  id?: string;
  props?: PublicRecord;
};

const TEXT_STYLE_KEYS = [
  'align',
  'breakWords',
  'dropShadow',
  'fill',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'leading',
  'letterSpacing',
  'lineHeight',
  'padding',
  'stroke',
  'textBaseline',
  'trim',
  'whiteSpace',
  'wordWrap',
  'wordWrapWidth',
  'filters',
  'tagStyles',
] as const;

// The canonical 100-item grid yields 501 render entries. Crossing to the
// single-surface backend at that boundary avoids a costly 100 Graphics/Text
// leaf submission while leaving small editor scenes on precise vector leaves.
const RASTER_ENTRY_THRESHOLD = 500;
const MAX_RASTER_EDGE = 8_192;
const MAX_RASTER_PIXELS = 32_000_000;

const record = (value: unknown): PublicRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as PublicRecord
    : {};

const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const string = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const cloneMatrix = (matrix: Matrix): Matrix => new Matrix().copyFrom(matrix);

const colorCss = (value: ColorSource): string =>
  Color.shared.setValue(value).toHex();

const numberColorCss = (value: number): string =>
  `#${value.toString(16).padStart(6, '0')}`;

const appendMatrix = (parent: Matrix, local: Matrix): Matrix =>
  new Matrix().appendFrom(parent, local);

const attributeMatrix = (attributes: unknown): Matrix => {
  const attrs = record(attributes);
  const rotation = typeof attrs.rotation === 'number' && Number.isFinite(attrs.rotation)
    ? attrs.rotation
    : finite(attrs.angle) * Math.PI / 180;
  return new Matrix().setTransform(
    finite(attrs.x),
    finite(attrs.y),
    0,
    0,
    1,
    1,
    rotation,
    0,
    0,
  );
};

const resolveColor = (
  value: unknown,
  theme: PatchmapTheme,
  fallback: ColorSource,
): ColorSource => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') {
    return Color.isColorLike(value) ? value : fallback;
  }
  const [family, shade] = value.split('.');
  if (family === 'primary' && shade && shade in theme.primary) {
    return theme.primary[shade as keyof PatchmapTheme['primary']];
  }
  if (family === 'gray' && shade && shade in theme.gray) {
    return theme.gray[shade as keyof PatchmapTheme['gray']];
  }
  if (family === 'black') return theme.black;
  if (family === 'white') return theme.white;
  return value;
};

const multiplyColor = (
  value: unknown,
  tint: unknown,
  theme: PatchmapTheme,
  fallback: ColorSource,
): number => {
  const base = resolveColor(value, theme, fallback);
  const resolvedTint = resolveColor(tint, theme, 0xffffff);
  return Color.shared.setValue(base).multiply(resolvedTint).toNumber();
};

const safeStyleSignature = (style: TextStyleOptions): string | null => {
  try {
    return JSON.stringify(style);
  } catch {
    return null;
  }
};

const endpointId = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  return string(record(value).id);
};

const relationEndpoints = (link: unknown): RelationEndpoints | null => {
  if (Array.isArray(link) && link.length === 2) {
    const from = endpointId(link[0]);
    const to = endpointId(link[1]);
    return from && to ? { from, to } : null;
  }

  const input = record(link);
  const source = endpointId(input.source);
  const target = endpointId(input.target);
  if (source && target) return { from: source, to: target };

  const from = endpointId(input.from);
  const to = endpointId(input.to);
  return from && to ? { from, to } : null;
};

const includePoint = (
  bounds: RasterBounds,
  x: number,
  y: number,
): void => {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
};

const includeTransformedRect = (
  bounds: RasterBounds,
  matrix: Matrix,
  rect: LocalRect,
): void => {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  for (const point of [
    matrix.apply({ x: left, y: top }),
    matrix.apply({ x: right, y: top }),
    matrix.apply({ x: right, y: bottom }),
    matrix.apply({ x: left, y: bottom }),
  ]) {
    includePoint(bounds, point.x, point.y);
  }
};

const gridSize = (props: PublicRecord): SceneSize => {
  const cells: unknown[] = Array.isArray(props.cells)
    ? props.cells as unknown[]
    : [];
  const item = record(props.item);
  const itemSize = readFixedSize(item.size);
  const gap = record(props.gap);
  const gapX = finite(gap.x, typeof props.gap === 'number' ? props.gap : 0);
  const gapY = finite(gap.y, typeof props.gap === 'number' ? props.gap : 0);
  const columns = cells.reduce<number>(
    (maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0),
    0,
  );
  return {
    width: columns > 0 ? columns * itemSize.width + (columns - 1) * gapX : 0,
    height: cells.length > 0
      ? cells.length * itemSize.height + (cells.length - 1) * gapY
      : 0,
  };
};

const baseEntryRect = (entry: RenderEntry, texture?: Texture | null): LocalRect => {
  const { props, parentProps, localRect } = entry;
  if (localRect && (localRect.width > 0 || localRect.height > 0)) {
    return localRect;
  }

  switch (props.type) {
    case 'item': {
      const size = readFixedSize(props.size);
      return { x: 0, y: 0, ...size };
    }
    case 'grid': {
      const size = gridSize(props);
      return { x: 0, y: 0, ...size };
    }
    case 'rect': {
      const size = readFixedSize(props.size);
      return { x: 0, y: 0, ...size };
    }
    case 'image': {
      const size = props.size === undefined
        ? { width: texture?.width ?? 16, height: texture?.height ?? 16 }
        : readFixedSize(props.size);
      return { x: 0, y: 0, ...size };
    }
    case 'text': {
      const size = measureText(props.text, props.style, entry.component ? 26 : 16);
      return { x: 0, y: 0, ...size };
    }
    case 'background': {
      const size = readFixedSize(parentProps?.size);
      return { x: 0, y: 0, ...size };
    }
    case 'bar':
    case 'icon': {
      const layout = layoutComponent(props, parentProps ?? {});
      return {
        x: 0,
        y: 0,
        width: layout.localWidth,
        height: layout.localHeight,
      };
    }
    default:
      return { x: 0, y: 0, width: 0, height: 0 };
  }
};

/**
 * Private visual mirror for the managed public scene.
 *
 * Vector instructions are aggregated into consecutive Graphics runs so text
 * and texture leaves can remain in exact input order. Every leaf is pooled;
 * public ManagedNode handles stay untouched and keep their original hierarchy.
 */
export class AggregateRenderLayer extends Container {
  readonly #theme: () => PatchmapTheme;
  readonly #graphicsPool: Graphics[] = [];
  readonly #textPool: Text[] = [];
  readonly #spritePool: Sprite[] = [];
  readonly #textStyleSignatures: Array<string | null | undefined> = [];
  #rasterCanvas: HTMLCanvasElement | null = null;
  #rasterContext: CanvasRenderingContext2D | null = null;
  #rasterTexture: Texture | null = null;
  #rasterSprite: Sprite | null = null;
  readonly #gridRasterSurfaces: RasterSurface[] = [];
  #gridRasterSlots: RenderEntry[][] = [];
  #gridRasterTypeSlots = new Map<string, Set<number>>();
  #gridRasterOriginX = 0;
  #gridRasterOriginY = 0;
  #gridRasterWidth = 0;
  #gridRasterHeight = 0;
  #gridRasterActive = false;
  readonly #barAnimations = new Map<string, BarAnimationState>();
  #barAnimationFrame: number | null = null;
  #lastRoots: readonly Container[] | null = null;
  #graphicsUsed = 0;
  #textUsed = 0;
  #spriteUsed = 0;
  #currentGraphics: Graphics | null = null;

  public constructor(theme: () => PatchmapTheme) {
    super();
    this.#theme = theme;
    this.eventMode = 'none';
    this.interactiveChildren = false;
    this.label = 'patch-map-aggregate-render-layer';
  }

  public renderMap(data: readonly PublicRecord[]): void {
    if (this.destroyed) return;
    const entries: RenderEntry[] = [];
    for (const element of data) {
      this.#collectRaw(element, Matrix.IDENTITY, entries);
    }
    this.#renderEntries(entries);
  }

  public renderScene(
    roots: readonly Container[],
    hints?: RenderSceneHints,
  ): void {
    if (this.destroyed) return;
    if (roots !== this.#lastRoots || hints?.restartAnimations === true) {
      this.#barAnimations.clear();
      this.#lastRoots = roots;
    }
    if (hints?.componentTypes && this.#renderGridRasterChanges(hints.componentTypes)) {
      return;
    }
    const entries: RenderEntry[] = [];
    for (const root of roots) {
      this.#collectHandle(root as LiveHandle, Matrix.IDENTITY, entries);
    }
    this.#renderEntries(entries);
  }

  public override destroy(options?: DestroyOptions): void {
    if (this.destroyed) return;
    if (this.#rasterSprite && !this.#rasterSprite.destroyed) {
      this.#rasterSprite.destroy({ texture: false });
    }
    this.#rasterTexture?.destroy(true);
    this.#rasterSprite = null;
    this.#rasterTexture = null;
    this.#rasterContext = null;
    this.#rasterCanvas = null;
    this.#gridRasterSurfaces.length = 0;
    this.#gridRasterSlots = [];
    this.#gridRasterTypeSlots.clear();
    this.#cancelBarAnimationFrame();
    this.#barAnimations.clear();
    this.#lastRoots = null;
    const leaves = [
      ...this.#graphicsPool,
      ...this.#textPool,
      ...this.#spritePool,
    ];
    for (const leaf of leaves) {
      if (!leaf.destroyed) leaf.destroy();
    }
    this.#graphicsPool.length = 0;
    this.#textPool.length = 0;
    this.#spritePool.length = 0;
    this.#textStyleSignatures.length = 0;
    super.destroy(options);
  }

  #collectHandle(
    node: LiveHandle,
    parentMatrix: Matrix,
    entries: RenderEntry[],
    parentProps?: PublicRecord,
  ): void {
    if (!node.visible || node.destroyed) return;
    const props = record(node.props);
    if (!node.renderable && !(props.type === 'bar' && props.show !== false)) return;
    node.updateLocalTransform();
    const matrix = appendMatrix(parentMatrix, node.localTransform);
    const component = parentProps?.type === 'item';
    let localRect: LocalRect | undefined;
    if (this.#isVisualType(props.type)) {
      const bounds = node.getLocalBounds();
      localRect = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    }
    entries.push({
      props,
      matrix,
      parentProps,
      localRect,
      component,
      node,
      parentMatrix: cloneMatrix(parentMatrix),
    });
    for (const child of node.children) {
      this.#collectHandle(child as LiveHandle, matrix, entries, props);
    }
  }

  #collectRaw(
    props: PublicRecord,
    parentMatrix: Matrix,
    entries: RenderEntry[],
    parentProps?: PublicRecord,
  ): void {
    if (props.show === false) return;
    const matrix = appendMatrix(parentMatrix, attributeMatrix(props.attrs));
    const component = parentProps?.type === 'item';
    entries.push({ props, matrix, parentProps, component });

    if (props.type === 'group') {
      const children = Array.isArray(props.children) ? props.children : [];
      for (const child of children) {
        this.#collectRaw(record(child), matrix, entries, props);
      }
      return;
    }

    if (props.type === 'grid') {
      this.#collectRawGrid(props, matrix, entries);
      return;
    }

    if (props.type !== 'item') return;
    const components = Array.isArray(props.components) ? props.components : [];
    for (const value of components) {
      const child = record(value);
      if (child.show === false) continue;
      const layout = layoutComponent(child, props);
      const attrs = record(child.attrs);
      const rotation = typeof attrs.rotation === 'number' && Number.isFinite(attrs.rotation)
        ? attrs.rotation
        : finite(attrs.angle) * Math.PI / 180;
      const local = new Matrix().setTransform(
        layout.x,
        layout.y,
        0,
        0,
        layout.scaleX,
        layout.scaleY,
        rotation,
        0,
        0,
      );
      entries.push({
        props: child,
        matrix: appendMatrix(matrix, local),
        parentProps: props,
        localRect: {
          x: 0,
          y: 0,
          width: layout.localWidth,
          height: layout.localHeight,
        },
        component: true,
      });
    }
  }

  #collectRawGrid(
    grid: PublicRecord,
    matrix: Matrix,
    entries: RenderEntry[],
  ): void {
    const cells = Array.isArray(grid.cells) ? grid.cells : [];
    const itemTemplate = record(grid.item);
    const size = readFixedSize(itemTemplate.size);
    const gap = record(grid.gap);
    const gapX = finite(gap.x, typeof grid.gap === 'number' ? grid.gap : 0);
    const gapY = finite(gap.y, typeof grid.gap === 'number' ? grid.gap : 0);
    const gridId = string(grid.id) ?? 'grid';
    cells.forEach((rowValue, row) => {
      const values = Array.isArray(rowValue) ? rowValue : [];
      values.forEach((cell, column) => {
        const active = cell !== 0;
        if (!active && grid.inactiveCellStrategy !== 'hide') return;
        const item: PublicRecord = {
          ...itemTemplate,
          type: 'item',
          id: `${gridId}.${row}.${column}`,
          label: String(cell),
          show: active,
          attrs: {
            x: column * (size.width + gapX),
            y: row * (size.height + gapY),
          },
        };
        this.#collectRaw(item, matrix, entries, grid);
      });
    });
  }

  #renderEntries(entries: readonly RenderEntry[]): void {
    this.#prepareBarAnimations(entries);
    this.#beginFrame();
    const centers = this.#indexCenters(entries);
    if (this.#renderGridRaster(entries, centers)) return;
    this.#gridRasterActive = false;
    if (this.#renderRaster(entries, centers)) return;
    for (const entry of entries) {
      this.#drawEntry(entry, centers);
    }
  }

  #prepareBarAnimations(entries: readonly RenderEntry[]): void {
    const now = globalThis.performance?.now() ?? Date.now();
    const observed = new Set<string>();
    let active = false;
    for (const entry of entries) {
      if (
        entry.props.type !== 'bar' ||
        entry.props.animation !== true ||
        !entry.parentProps ||
        !entry.parentMatrix
      ) {
        continue;
      }
      const id = string(entry.props.id);
      if (!id) continue;
      observed.add(id);
      const signature = this.#barAnimationSignature(entry.props, entry.parentProps);
      let state = this.#barAnimations.get(id);
      if (!state || state.signature !== signature) {
        state = { signature, startedAt: now, complete: false };
        this.#barAnimations.set(id, state);
      }
      const duration = Math.max(0, finite(entry.props.animationDuration, 200));
      const progress = state.complete || duration === 0
        ? 1
        : Math.min(1, (now - state.startedAt) / duration);
      if (progress >= 1) state.complete = true;
      else active = true;

      const layout = layoutAnimatedBar(entry.props, entry.parentProps, progress);
      const start = layoutAnimatedBar(entry.props, entry.parentProps, 0);
      const local = entry.node
        ? cloneMatrix(entry.node.localTransform)
        : new Matrix().setTransform(
          start.x,
          start.y,
          0,
          0,
          start.scaleX,
          start.scaleY,
          finite(record(entry.props.attrs).rotation),
          0,
          0,
        );
      local.tx += layout.x - start.x;
      local.ty += layout.y - start.y;
      entry.matrix = appendMatrix(entry.parentMatrix, local);
      entry.localRect = {
        x: 0,
        y: 0,
        width: layout.localWidth,
        height: layout.localHeight,
      };
    }

    for (const id of this.#barAnimations.keys()) {
      if (!observed.has(id)) this.#barAnimations.delete(id);
    }
    if (active) this.#scheduleBarAnimationFrame();
    else this.#cancelBarAnimationFrame();
  }

  #barAnimationSignature(props: PublicRecord, parentProps: PublicRecord): string {
    try {
      return JSON.stringify([
        props.size,
        props.placement,
        props.margin,
        props.attrs,
        props.source,
        props.tint,
        props.animationDuration,
        parentProps.size,
        parentProps.padding,
        parentProps.contentOrientation,
      ]);
    } catch {
      return String(props.id);
    }
  }

  #scheduleBarAnimationFrame(): void {
    if (
      this.#barAnimationFrame !== null ||
      !this.#lastRoots ||
      typeof requestAnimationFrame === 'undefined'
    ) {
      return;
    }
    this.#barAnimationFrame = requestAnimationFrame(() => {
      this.#barAnimationFrame = null;
      const roots = this.#lastRoots;
      if (!this.destroyed && roots) this.renderScene(roots);
    });
  }

  #cancelBarAnimationFrame(): void {
    if (this.#barAnimationFrame === null) return;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.#barAnimationFrame);
    }
    this.#barAnimationFrame = null;
  }

  #beginFrame(): void {
    this.removeChildren();
    this.#graphicsUsed = 0;
    this.#textUsed = 0;
    this.#spriteUsed = 0;
    this.#currentGraphics = null;
  }

  #indexCenters(entries: readonly RenderEntry[]): Map<string, { x: number; y: number }> {
    const centers = new Map<string, { x: number; y: number }>();
    for (const entry of entries) {
      const id = string(entry.props.id);
      if (!id || entry.props.type === 'relations') continue;
      const texture = entry.props.type === 'image'
        ? getCachedSceneTexture(entry.props.source)
        : null;
      const bounds = baseEntryRect(entry, texture);
      if (bounds.width <= 0 && bounds.height <= 0) continue;
      centers.set(id, entry.matrix.apply({
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      }));
    }
    return centers;
  }

  #renderGridRaster(
    entries: readonly RenderEntry[],
    centers: ReadonlyMap<string, { x: number; y: number }>,
  ): boolean {
    if (
      entries.length < RASTER_ENTRY_THRESHOLD ||
      typeof document === 'undefined' ||
      !this.#canRasterize(entries)
    ) {
      return false;
    }
    const slots: RenderEntry[][] = [];
    const nextSlotByOwner = new Map<string, number>();
    const typeSlots = new Map<string, Set<number>>();
    let visualCount = 0;
    for (const entry of entries) {
      if (!this.#isVisualType(entry.props.type)) {
        if (entry.props.type === 'relations') return false;
        continue;
      }
      visualCount += 1;
      if (!this.#isGridComponentEntry(entry)) return false;
      const owner = string(entry.parentProps?.id);
      if (!owner) return false;
      const slot = nextSlotByOwner.get(owner) ?? 0;
      nextSlotByOwner.set(owner, slot + 1);
      (slots[slot] ??= []).push(entry);
      const type = String(entry.props.type);
      const occupied = typeSlots.get(type) ?? new Set<number>();
      occupied.add(slot);
      typeSlots.set(type, occupied);
    }
    if (visualCount < RASTER_ENTRY_THRESHOLD || slots.length === 0) return false;

    const bounds = this.#measureRasterBounds(entries, centers);
    if (!bounds) return false;
    const originX = Math.floor(bounds.minX) - 2;
    const originY = Math.floor(bounds.minY) - 2;
    const width = Math.max(1, Math.ceil(bounds.maxX) - originX + 2);
    const height = Math.max(1, Math.ceil(bounds.maxY) - originY + 2);
    if (
      width > MAX_RASTER_EDGE ||
      height > MAX_RASTER_EDGE ||
      width * height > MAX_RASTER_PIXELS
    ) {
      return false;
    }

    for (const [index, slotEntries] of slots.entries()) {
      const surface = this.#ensureGridRasterSurface(index, width, height);
      if (!surface) return false;
      this.#clearRasterSurface(surface, width, height);
      for (const entry of slotEntries) {
        this.#drawRasterEntry(
          surface.context,
          entry,
          centers,
          originX,
          originY,
        );
      }
    }
    this.#gridRasterSlots = slots;
    this.#gridRasterTypeSlots = typeSlots;
    this.#gridRasterOriginX = originX;
    this.#gridRasterOriginY = originY;
    this.#gridRasterWidth = width;
    this.#gridRasterHeight = height;
    this.#gridRasterActive = true;
    return this.#compositeGridRaster();
  }

  #renderGridRasterChanges(componentTypes: readonly string[]): boolean {
    if (!this.#gridRasterActive || this.#gridRasterSlots.length === 0) {
      return false;
    }
    const affected = new Set<number>();
    for (const type of componentTypes) {
      for (const slot of this.#gridRasterTypeSlots.get(type) ?? []) {
        affected.add(slot);
      }
    }
    if (affected.size === 0) return false;

    this.#beginFrame();
    const centers = new Map<string, { x: number; y: number }>();
    for (const slot of affected) {
      const surface = this.#gridRasterSurfaces[slot];
      const entries = this.#gridRasterSlots[slot];
      if (!surface || !entries) return false;
      this.#clearRasterSurface(
        surface,
        this.#gridRasterWidth,
        this.#gridRasterHeight,
      );
      for (const entry of entries) {
        if (!this.#refreshCachedEntry(entry)) continue;
        this.#drawRasterEntry(
          surface.context,
          entry,
          centers,
          this.#gridRasterOriginX,
          this.#gridRasterOriginY,
        );
      }
    }
    return this.#compositeGridRaster();
  }

  #isGridComponentEntry(entry: RenderEntry): boolean {
    const node = entry.node;
    if (!entry.component || !node || !(node.parent instanceof Container)) {
      return false;
    }
    const parent = node.parent as LiveHandle;
    const grid = parent.parent as LiveHandle | null;
    const parentProps = record(parent.props);
    const gridProps = record(grid?.props);
    if (
      parentProps.type !== 'item' ||
      gridProps.type !== 'grid' ||
      Object.keys(record(record(parentProps.attrs).gridIndex)).length === 0
    ) {
      return false;
    }

    const size = readFixedSize(parentProps.size);
    const gap = record(gridProps.gap);
    const gapX = Math.max(0, finite(gap.x, typeof gridProps.gap === 'number'
      ? gridProps.gap
      : 0));
    const gapY = Math.max(0, finite(gap.y, typeof gridProps.gap === 'number'
      ? gridProps.gap
      : 0));
    const local = node.localTransform;
    const bounds = node.getLocalBounds();
    const corners = [
      local.apply({ x: bounds.x, y: bounds.y }),
      local.apply({ x: bounds.x + bounds.width, y: bounds.y }),
      local.apply({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }),
      local.apply({ x: bounds.x, y: bounds.y + bounds.height }),
    ];
    const minX = Math.min(...corners.map(({ x }) => x));
    const maxX = Math.max(...corners.map(({ x }) => x));
    const minY = Math.min(...corners.map(({ y }) => y));
    const maxY = Math.max(...corners.map(({ y }) => y));
    return minX >= -gapX / 2 &&
      maxX <= size.width + gapX / 2 &&
      minY >= -gapY / 2 &&
      maxY <= size.height + gapY / 2;
  }

  #refreshCachedEntry(entry: RenderEntry): boolean {
    const node = entry.node;
    if (!node || node.destroyed || !node.visible) return false;
    entry.props = record(node.props);
    if (
      !node.renderable &&
      !(entry.props.type === 'bar' && entry.props.show !== false)
    ) return false;
    entry.parentProps = record((node.parent as LiveHandle | null)?.props);
    node.updateLocalTransform();
    entry.matrix = entry.parentMatrix
      ? appendMatrix(entry.parentMatrix, node.localTransform)
      : this.#matrixForManagedNode(node);
    if (this.#isVisualType(entry.props.type)) {
      const bounds = node.getLocalBounds();
      entry.localRect = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    }
    return true;
  }

  #matrixForManagedNode(node: LiveHandle): Matrix {
    const chain: Matrix[] = [];
    let current: LiveHandle | null = node;
    while (current?.props) {
      current.updateLocalTransform();
      chain.push(current.localTransform);
      current = current.parent as LiveHandle | null;
    }
    const matrix = new Matrix();
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      matrix.append(chain[index]!);
    }
    return matrix;
  }

  #ensureGridRasterSurface(
    index: number,
    width: number,
    height: number,
  ): RasterSurface | null {
    let surface = this.#gridRasterSurfaces[index];
    if (!surface) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) return null;
      surface = { canvas, context };
      this.#gridRasterSurfaces[index] = surface;
    } else if (surface.canvas.width !== width || surface.canvas.height !== height) {
      surface.canvas.width = width;
      surface.canvas.height = height;
    }
    return surface;
  }

  #clearRasterSurface(
    surface: RasterSurface,
    width: number,
    height: number,
  ): void {
    surface.context.setTransform(1, 0, 0, 1, 0, 0);
    surface.context.clearRect(0, 0, width, height);
  }

  #compositeGridRaster(): boolean {
    const finalSurface = this.#ensureRaster(
      this.#gridRasterWidth,
      this.#gridRasterHeight,
    );
    if (!finalSurface) return false;
    finalSurface.context.setTransform(1, 0, 0, 1, 0, 0);
    finalSurface.context.clearRect(
      0,
      0,
      this.#gridRasterWidth,
      this.#gridRasterHeight,
    );
    for (let index = 0; index < this.#gridRasterSlots.length; index += 1) {
      const surface = this.#gridRasterSurfaces[index];
      if (!surface) return false;
      finalSurface.context.drawImage(surface.canvas, 0, 0);
    }
    finalSurface.texture.source.update();
    finalSurface.sprite.position.set(
      this.#gridRasterOriginX,
      this.#gridRasterOriginY,
    );
    finalSurface.sprite.scale.set(1, 1);
    finalSurface.sprite.visible = true;
    finalSurface.sprite.renderable = true;
    this.addChild(finalSurface.sprite);
    return true;
  }

  #renderRaster(
    entries: readonly RenderEntry[],
    centers: ReadonlyMap<string, { x: number; y: number }>,
  ): boolean {
    if (
      entries.length < RASTER_ENTRY_THRESHOLD ||
      typeof document === 'undefined' ||
      !this.#canRasterize(entries)
    ) {
      return false;
    }
    const bounds = this.#measureRasterBounds(entries, centers);
    if (!bounds) return false;
    const originX = Math.floor(bounds.minX) - 2;
    const originY = Math.floor(bounds.minY) - 2;
    const width = Math.max(1, Math.ceil(bounds.maxX) - originX + 2);
    const height = Math.max(1, Math.ceil(bounds.maxY) - originY + 2);
    if (
      width > MAX_RASTER_EDGE ||
      height > MAX_RASTER_EDGE ||
      width * height > MAX_RASTER_PIXELS
    ) {
      return false;
    }

    const surface = this.#ensureRaster(width, height);
    if (!surface) return false;
    const { context, sprite, texture } = surface;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    for (const entry of entries) {
      this.#drawRasterEntry(context, entry, centers, originX, originY);
    }
    texture.source.update();
    sprite.position.set(originX, originY);
    sprite.scale.set(1, 1);
    sprite.visible = true;
    sprite.renderable = true;
    this.addChild(sprite);
    return true;
  }

  #canRasterize(entries: readonly RenderEntry[]): boolean {
    for (const entry of entries) {
      const type = entry.props.type;
      if (
        (type === 'image' || type === 'icon' || type === 'background' || type === 'bar') &&
        record(entry.props.source).type !== 'rect' &&
        getCachedSceneTexture(entry.props.source)
      ) {
        return false;
      }
      if (type !== 'text') continue;
      const style = record(entry.props.style);
      if (
        style.dropShadow !== undefined ||
        style.filters !== undefined ||
        style.tagStyles !== undefined ||
        style.wordWrapWidth !== undefined
      ) {
        return false;
      }
    }
    return true;
  }

  #measureRasterBounds(
    entries: readonly RenderEntry[],
    centers: ReadonlyMap<string, { x: number; y: number }>,
  ): RasterBounds | null {
    const bounds: RasterBounds = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    };
    for (const entry of entries) {
      if (entry.props.type === 'relations') {
        const links = Array.isArray(entry.props.links) ? entry.props.links : [];
        for (const link of links) {
          const endpoints = relationEndpoints(link);
          if (!endpoints) continue;
          const from = centers.get(endpoints.from);
          const to = centers.get(endpoints.to);
          if (!from || !to) continue;
          includePoint(bounds, from.x, from.y);
          includePoint(bounds, to.x, to.y);
        }
        continue;
      }
      if (!this.#isVisualType(entry.props.type)) continue;
      const rect = baseEntryRect(entry);
      if (rect.width <= 0 && rect.height <= 0) continue;
      includeTransformedRect(bounds, entry.matrix, rect);
    }
    return Number.isFinite(bounds.minX) ? bounds : null;
  }

  #ensureRaster(
    width: number,
    height: number,
  ): {
    context: CanvasRenderingContext2D;
    sprite: Sprite;
    texture: Texture;
  } | null {
    if (!this.#rasterCanvas) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) return null;
      const texture = Texture.from(canvas);
      const sprite = new Sprite(texture);
      sprite.eventMode = 'none';
      this.#rasterCanvas = canvas;
      this.#rasterContext = context;
      this.#rasterTexture = texture;
      this.#rasterSprite = sprite;
    } else if (
      this.#rasterCanvas.width !== width ||
      this.#rasterCanvas.height !== height
    ) {
      this.#rasterTexture?.source.resize(width, height, 1);
    }
    if (!this.#rasterContext || !this.#rasterSprite || !this.#rasterTexture) {
      return null;
    }
    return {
      context: this.#rasterContext,
      sprite: this.#rasterSprite,
      texture: this.#rasterTexture,
    };
  }

  #drawRasterEntry(
    context: CanvasRenderingContext2D,
    entry: RenderEntry,
    centers: ReadonlyMap<string, { x: number; y: number }>,
    originX: number,
    originY: number,
  ): void {
    const type = entry.props.type;
    if (type === 'relations') {
      this.#drawRasterRelations(context, entry, centers, originX, originY);
      return;
    }
    if (!this.#isVisualType(type)) return;

    const matrix = entry.matrix;
    context.save();
    context.setTransform(
      matrix.a,
      matrix.b,
      matrix.c,
      matrix.d,
      matrix.tx - originX,
      matrix.ty - originY,
    );
    switch (type) {
      case 'rect':
        this.#drawRasterRect(context, entry);
        break;
      case 'text':
        this.#drawRasterText(context, entry);
        break;
      case 'background':
        this.#drawRasterBackground(context, entry);
        break;
      case 'bar':
        this.#drawRasterBar(context, entry);
        break;
      case 'image':
        this.#drawRasterPlaceholder(context, entry, 0.18);
        break;
      case 'icon':
        this.#drawRasterPlaceholder(context, entry, 0.3);
        break;
      default:
        break;
    }
    context.restore();
  }

  #roundedRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    context.beginPath();
    context.roundRect(x, y, width, height, Math.max(0, radius));
  }

  #drawRasterRect(context: CanvasRenderingContext2D, entry: RenderEntry): void {
    const props = entry.props;
    const size = readFixedSize(props.size);
    this.#roundedRect(context, 0, 0, size.width, size.height, finite(props.radius));
    if (props.fill !== null) {
      context.fillStyle = colorCss(
        resolveColor(props.fill, this.#theme(), this.#theme().black),
      );
      context.fill();
    }
    this.#rasterStroke(context, props.stroke);
  }

  #drawRasterBackground(
    context: CanvasRenderingContext2D,
    entry: RenderEntry,
  ): void {
    const source = record(entry.props.source);
    if (source.type !== 'rect') {
      this.#drawRasterPlaceholder(context, entry, 0.18);
      return;
    }
    const itemSize = readFixedSize(entry.parentProps?.size);
    const borderWidth = finite(source.borderWidth);
    this.#roundedRect(
      context,
      borderWidth / 2,
      borderWidth / 2,
      itemSize.width,
      itemSize.height,
      finite(source.radius),
    );
    context.fillStyle = numberColorCss(multiplyColor(
      source.fill,
      entry.props.tint,
      this.#theme(),
      this.#theme().white,
    ));
    context.fill();
    if (borderWidth > 0) {
      context.strokeStyle = colorCss(resolveColor(
        source.borderColor,
        this.#theme(),
        this.#theme().black,
      ));
      context.lineWidth = borderWidth;
      context.stroke();
    }
  }

  #drawRasterBar(context: CanvasRenderingContext2D, entry: RenderEntry): void {
    const source = record(entry.props.source);
    if (source.type !== 'rect') {
      this.#drawRasterPlaceholder(context, entry, 0.3);
      return;
    }
    const bounds = baseEntryRect(entry);
    this.#roundedRect(
      context,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      finite(source.radius),
    );
    context.fillStyle = numberColorCss(multiplyColor(
      source.fill,
      entry.props.tint,
      this.#theme(),
      this.#theme().white,
    ));
    context.fill();
    const borderWidth = finite(source.borderWidth);
    if (borderWidth > 0) {
      context.strokeStyle = colorCss(resolveColor(
        source.borderColor,
        this.#theme(),
        this.#theme().black,
      ));
      context.lineWidth = borderWidth;
      context.stroke();
    }
  }

  #drawRasterPlaceholder(
    context: CanvasRenderingContext2D,
    entry: RenderEntry,
    alpha: number,
  ): void {
    const bounds = baseEntryRect(entry);
    context.globalAlpha = alpha;
    context.fillStyle = colorCss(resolveColor(
      entry.props.tint,
      this.#theme(),
      this.#theme().gray.light,
    ));
    context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    context.globalAlpha = 1;
  }

  #drawRasterText(context: CanvasRenderingContext2D, entry: RenderEntry): void {
    const content = typeof entry.props.text === 'string' ? entry.props.text : '';
    if (!content) return;
    const style = record(entry.props.style);
    const fontSize = finite(style.fontSize, entry.component ? 26 : 16);
    const family = typeof style.fontFamily === 'string' ? style.fontFamily : 'sans-serif';
    const weight = typeof style.fontWeight === 'string' || typeof style.fontWeight === 'number'
      ? String(style.fontWeight)
      : 'normal';
    const fontStyle = typeof style.fontStyle === 'string' ? style.fontStyle : 'normal';
    context.font = `${fontStyle} ${weight} ${fontSize}px ${JSON.stringify(family)}`;
    context.textBaseline = 'top';
    const align = style.align;
    context.textAlign = align === 'center' || align === 'right' || align === 'left'
      ? align
      : 'left';
    Reflect.set(context, 'letterSpacing', `${finite(style.letterSpacing)}px`);
    context.fillStyle = numberColorCss(multiplyColor(
      style.fill,
      entry.props.tint,
      this.#theme(),
      this.#theme().black,
    ));
    const lineHeight = finite(style.lineHeight, fontSize * 77 / 65);
    content.split('\n').forEach((line, index) => {
      context.fillText(line, 0, index * lineHeight);
    });
  }

  #drawRasterRelations(
    context: CanvasRenderingContext2D,
    entry: RenderEntry,
    centers: ReadonlyMap<string, { x: number; y: number }>,
    originX: number,
    originY: number,
  ): void {
    const links = Array.isArray(entry.props.links) ? entry.props.links : [];
    const style = record(entry.props.style);
    context.save();
    context.setTransform(1, 0, 0, 1, -originX, -originY);
    context.strokeStyle = colorCss(resolveColor(
      style.color,
      this.#theme(),
      this.#theme().black,
    ));
    context.lineWidth = finite(style.width, 1);
    context.globalAlpha = finite(style.alpha, 1);
    context.beginPath();
    for (const link of links) {
      const endpoints = relationEndpoints(link);
      if (!endpoints) continue;
      const from = centers.get(endpoints.from);
      const to = centers.get(endpoints.to);
      if (!from || !to) continue;
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
    }
    context.stroke();
    context.restore();
  }

  #rasterStroke(context: CanvasRenderingContext2D, value: unknown): void {
    if (value === undefined || value === null) return;
    const theme = this.#theme();
    if (Color.isColorLike(value)) {
      context.strokeStyle = colorCss(resolveColor(value, theme, theme.black));
      context.lineWidth = 1;
      context.stroke();
      return;
    }
    const stroke = record(value);
    if (Object.keys(stroke).length === 0) return;
    context.strokeStyle = colorCss(resolveColor(stroke.color, theme, theme.black));
    context.lineWidth = finite(stroke.width, 1);
    context.globalAlpha = finite(stroke.alpha, 1);
    context.stroke();
    context.globalAlpha = 1;
  }

  #drawEntry(
    entry: RenderEntry,
    centers: ReadonlyMap<string, { x: number; y: number }>,
  ): void {
    switch (entry.props.type) {
      case 'rect':
        this.#drawRect(entry);
        break;
      case 'image':
        this.#drawTexture(entry, entry.props.source, 0.18);
        break;
      case 'text':
        this.#drawText(entry);
        break;
      case 'relations':
        this.#drawRelations(entry, centers);
        break;
      case 'background':
        this.#drawBackground(entry);
        break;
      case 'bar':
        this.#drawBar(entry);
        break;
      case 'icon':
        this.#drawTexture(entry, entry.props.source, 0.3);
        break;
      default:
        break;
    }
  }

  #drawRect(entry: RenderEntry): void {
    const props = entry.props;
    const size = readFixedSize(props.size);
    const graphics = this.#graphics();
    graphics.setTransform(entry.matrix);
    graphics.roundRect(0, 0, size.width, size.height, finite(props.radius));
    if (props.fill !== null) {
      graphics.fill(resolveColor(props.fill, this.#theme(), this.#theme().black));
    }
    this.#stroke(graphics, props.stroke);
  }

  #drawBackground(entry: RenderEntry): void {
    const source = record(entry.props.source);
    if (source.type !== 'rect') {
      this.#drawTexture(entry, entry.props.source, 0.18);
      return;
    }

    const itemSize = readFixedSize(entry.parentProps?.size);
    const borderWidth = finite(source.borderWidth);
    const graphics = this.#graphics();
    graphics.setTransform(entry.matrix);
    graphics
      .roundRect(
        borderWidth / 2,
        borderWidth / 2,
        itemSize.width,
        itemSize.height,
        finite(source.radius),
      )
      .fill(multiplyColor(
        source.fill,
        entry.props.tint,
        this.#theme(),
        this.#theme().white,
      ));
    if (borderWidth > 0) {
      graphics.stroke({
        color: resolveColor(source.borderColor, this.#theme(), this.#theme().black),
        width: borderWidth,
      });
    }
  }

  #drawBar(entry: RenderEntry): void {
    const source = record(entry.props.source);
    const bounds = baseEntryRect(entry);
    const texture = source.type === 'rect'
      ? null
      : getCachedSceneTexture(entry.props.source);
    if (texture) {
      this.#drawSprite(entry, texture, bounds);
      return;
    }

    const graphics = this.#graphics();
    graphics.setTransform(entry.matrix);
    graphics
      .roundRect(bounds.x, bounds.y, bounds.width, bounds.height, finite(source.radius))
      .fill(multiplyColor(
        source.fill,
        entry.props.tint,
        this.#theme(),
        this.#theme().white,
      ));
    const borderWidth = finite(source.borderWidth);
    if (borderWidth > 0) {
      graphics.stroke({
        color: resolveColor(source.borderColor, this.#theme(), this.#theme().black),
        width: borderWidth,
      });
    }
  }

  #drawTexture(entry: RenderEntry, source: unknown, placeholderAlpha: number): void {
    const texture = getCachedSceneTexture(source);
    const bounds = baseEntryRect(entry, texture);
    if (texture) {
      this.#drawSprite(entry, texture, bounds);
      return;
    }

    const graphics = this.#graphics();
    graphics.setTransform(entry.matrix);
    graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height).fill({
      color: resolveColor(entry.props.tint, this.#theme(), this.#theme().gray.light),
      alpha: placeholderAlpha,
    });
  }

  #drawSprite(entry: RenderEntry, texture: Texture, bounds: LocalRect): void {
    this.#currentGraphics = null;
    const sprite = this.#spritePool[this.#spriteUsed] ?? new Sprite();
    if (!this.#spritePool[this.#spriteUsed]) {
      sprite.eventMode = 'none';
      this.#spritePool.push(sprite);
    }
    this.#spriteUsed += 1;
    this.#resetLeafTransform(sprite, entry.matrix);
    sprite.texture = texture;
    sprite.anchor.set(0);
    sprite.position.x += entry.matrix.a * bounds.x + entry.matrix.c * bounds.y;
    sprite.position.y += entry.matrix.b * bounds.x + entry.matrix.d * bounds.y;
    const textureWidth = texture.width || 1;
    const textureHeight = texture.height || 1;
    sprite.scale.x *= bounds.width / textureWidth;
    sprite.scale.y *= bounds.height / textureHeight;
    sprite.tint = resolveColor(entry.props.tint, this.#theme(), 0xffffff);
    sprite.alpha = 1;
    sprite.visible = true;
    sprite.renderable = true;
    this.addChild(sprite);
  }

  #drawText(entry: RenderEntry): void {
    this.#currentGraphics = null;
    const index = this.#textUsed;
    const text = this.#textPool[index] ?? new Text();
    if (!this.#textPool[index]) {
      text.eventMode = 'none';
      text.anchor.set(0);
      this.#textPool.push(text);
    }
    this.#textUsed += 1;

    const content = typeof entry.props.text === 'string' ? entry.props.text : '';
    if (text.text !== content) text.text = content;
    const style = this.#textStyle(entry);
    const signature = safeStyleSignature(style);
    if (signature === null || signature !== this.#textStyleSignatures[index]) {
      text.style = style;
      this.#textStyleSignatures[index] = signature;
    }
    this.#resetLeafTransform(text, entry.matrix);
    text.anchor.set(0);
    text.tint = resolveColor(entry.props.tint, this.#theme(), 0xffffff);
    text.alpha = 1;
    text.visible = true;
    text.renderable = true;
    this.addChild(text);
  }

  #textStyle(entry: RenderEntry): TextStyleOptions {
    const input = record(entry.props.style);
    const output: PublicRecord = {};
    for (const key of TEXT_STYLE_KEYS) {
      if (input[key] !== undefined) output[key] = input[key];
    }
    output.fontSize ??= entry.component ? 26 : 16;
    output.fill = resolveColor(input.fill, this.#theme(), this.#theme().black);

    const stroke = record(input.stroke);
    if (Object.keys(stroke).length > 0) {
      output.stroke = {
        ...stroke,
        color: resolveColor(stroke.color, this.#theme(), this.#theme().black),
      };
    }
    const shadow = record(input.dropShadow);
    if (Object.keys(shadow).length > 0) {
      output.dropShadow = {
        ...shadow,
        color: resolveColor(shadow.color, this.#theme(), this.#theme().black),
      };
    }
    return output as TextStyleOptions;
  }

  #drawRelations(
    entry: RenderEntry,
    centers: ReadonlyMap<string, { x: number; y: number }>,
  ): void {
    const links = Array.isArray(entry.props.links) ? entry.props.links : [];
    const style = record(entry.props.style);
    const color = resolveColor(style.color, this.#theme(), this.#theme().black);
    const width = finite(style.width, 1);
    const alpha = finite(style.alpha, 1);
    let graphics: Graphics | null = null;
    for (const link of links) {
      const endpoints = relationEndpoints(link);
      if (!endpoints) continue;
      const from = centers.get(endpoints.from);
      const to = centers.get(endpoints.to);
      if (!from || !to) continue;
      graphics ??= this.#graphics();
      graphics.setTransform(Matrix.IDENTITY);
      graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({
        color,
        width,
        alpha,
      });
    }
  }

  #stroke(graphics: Graphics, value: unknown): void {
    if (value === undefined || value === null) return;
    const theme = this.#theme();
    if (Color.isColorLike(value)) {
      graphics.stroke({ color: resolveColor(value, theme, theme.black), width: 1 });
      return;
    }
    const stroke = record(value);
    if (Object.keys(stroke).length === 0) return;
    graphics.stroke({
      color: resolveColor(stroke.color, theme, theme.black),
      width: finite(stroke.width, 1),
      alpha: finite(stroke.alpha, 1),
    });
  }

  #graphics(): Graphics {
    if (this.#currentGraphics) return this.#currentGraphics;
    const graphics = this.#graphicsPool[this.#graphicsUsed] ?? new Graphics();
    if (!this.#graphicsPool[this.#graphicsUsed]) {
      graphics.eventMode = 'none';
      this.#graphicsPool.push(graphics);
    }
    this.#graphicsUsed += 1;
    graphics.clear();
    graphics.visible = true;
    graphics.renderable = true;
    graphics.position.set(0, 0);
    graphics.scale.set(1, 1);
    graphics.rotation = 0;
    graphics.skew.set(0, 0);
    graphics.pivot.set(0, 0);
    graphics.origin.set(0, 0);
    graphics.alpha = 1;
    graphics.tint = 0xffffff;
    this.addChild(graphics);
    this.#currentGraphics = graphics;
    return graphics;
  }

  #resetLeafTransform(leaf: Container, matrix: Matrix): void {
    leaf.pivot.set(0, 0);
    leaf.origin.set(0, 0);
    leaf.setFromMatrix(cloneMatrix(matrix));
  }

  #isVisualType(type: unknown): boolean {
    return type === 'rect' ||
      type === 'image' ||
      type === 'text' ||
      type === 'background' ||
      type === 'bar' ||
      type === 'icon';
  }
}

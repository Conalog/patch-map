import type { CoreView } from '../contracts';
import { assertView, assertViewport } from './noop-renderer';
import {
  RenderAlign,
  RenderFit,
  RenderFlags,
  RenderKind,
  type CanvasRendererOptions,
  type CanvasSurface,
  type CoreRenderer,
  type RendererFlushResult,
  type RenderStoreView,
} from './types';

const NO_RENDER = Object.freeze({ rendered: false, commandCount: 0 });
const SELECTION_COLOR = 0xf59e0bff;
const DEFAULT_IMAGE_TINT = 0x64748bff;

/**
 * Aggregate Canvas2D backend for the dense Core v1 store.
 *
 * It owns one canvas/context, no entity objects, listeners, tickers, or
 * per-entity closures. Consecutive compatible rectangles are submitted as one
 * path without reordering the store's deterministic z-order.
 */
export class Canvas2DRenderer implements CoreRenderer {
  #canvas: CanvasSurface | null;
  #context: CanvasRenderingContext2D | null;
  #width = -1;
  #height = -1;
  #pixelRatio = -1;
  #viewX = 0;
  #viewY = 0;
  #viewScale = 1;
  #viewRotation = 0;
  #lastRevision = -1;
  #lastBackground = -1;
  #presentationDirty = true;
  #destroyed = false;
  readonly #colorCss = new Map<number, string>();
  readonly #fontCss = new Map<string, Map<number, Map<number, string>>>();
  readonly #images = new Map<string, CanvasImageSource>();

  public constructor(canvas: CanvasSurface, options: CanvasRendererOptions = {}) {
    const context = canvas.getContext('2d', {
      alpha: true,
      desynchronized: options.desynchronized ?? true,
    });
    if (context === null) throw new Error('Canvas2D is unavailable');

    this.#canvas = canvas;
    this.#context = context;
    const pixelRatio = options.pixelRatio ?? 1;
    this.resize(
      options.width ?? canvas.width / pixelRatio,
      options.height ?? canvas.height / pixelRatio,
      pixelRatio,
    );
  }

  public get width(): number {
    return this.#width;
  }

  public get height(): number {
    return this.#height;
  }

  public get pixelRatio(): number {
    return this.#pixelRatio;
  }

  public get destroyed(): boolean {
    return this.#destroyed;
  }

  /** Registers a caller-decoded image without adding loading to the render hot path. */
  public registerImage(source: string, image: CanvasImageSource): boolean {
    this.#assertAlive();
    if (source.length === 0) throw new TypeError('Image source key must be non-empty');
    if (this.#images.get(source) === image) return false;
    this.#images.set(source, image);
    this.#presentationDirty = true;
    return true;
  }

  public unregisterImage(source: string): boolean {
    this.#assertAlive();
    const removed = this.#images.delete(source);
    if (removed) this.#presentationDirty = true;
    return removed;
  }

  public resize(width: number, height: number, pixelRatio = this.#pixelRatio): boolean {
    this.#assertAlive();
    assertViewport(width, height, pixelRatio);
    if (width === this.#width && height === this.#height && pixelRatio === this.#pixelRatio) {
      return false;
    }

    const canvas = this.#canvas as CanvasSurface;
    const backingWidth = Math.max(0, Math.round(width * pixelRatio));
    const backingHeight = Math.max(0, Math.round(height * pixelRatio));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    if (canvas.style !== undefined) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    this.#width = width;
    this.#height = height;
    this.#pixelRatio = pixelRatio;
    this.#presentationDirty = true;
    return true;
  }

  public setView(view: CoreView): boolean {
    this.#assertAlive();
    assertView(view);
    const rotation = view.rotation ?? 0;
    if (
      view.x === this.#viewX &&
      view.y === this.#viewY &&
      view.scale === this.#viewScale &&
      rotation === this.#viewRotation
    ) {
      return false;
    }
    this.#viewX = view.x;
    this.#viewY = view.y;
    this.#viewScale = view.scale;
    this.#viewRotation = rotation;
    this.#presentationDirty = true;
    return true;
  }

  public flush(store: RenderStoreView): RendererFlushResult {
    this.#assertAlive();
    this.setView(store.view);
    const background = store.background >>> 0;
    if (
      !this.#presentationDirty &&
      store.revision === this.#lastRevision &&
      background === this.#lastBackground
    ) {
      return NO_RENDER;
    }

    const context = this.#context as CanvasRenderingContext2D;
    let commandCount = this.#clear(context, background);
    this.#applyWorldTransform(context);

    const order = store.renderOrder();
    let rectBatchOpen = false;
    let rectBatchFill = 0;
    let rectBatchOpacity = 1;

    for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
      const slot = order[orderIndex] as number;
      if (!this.#isDrawable(store, slot)) continue;

      const kind = store.kind[slot] as number;
      if (kind === RenderKind.Rect && this.#canBatchRect(store, slot)) {
        const fill = (store.fill[slot] as number) >>> 0;
        const opacity = store.opacity[slot] as number;
        if (!rectBatchOpen || fill !== rectBatchFill || opacity !== rectBatchOpacity) {
          if (rectBatchOpen) commandCount += this.#finishRectBatch(context, rectBatchFill, rectBatchOpacity);
          context.beginPath();
          rectBatchOpen = true;
          rectBatchFill = fill;
          rectBatchOpacity = opacity;
        }
        context.rect(
          store.x[slot] as number,
          store.y[slot] as number,
          store.width[slot] as number,
          store.height[slot] as number,
        );
        continue;
      }

      if (rectBatchOpen) {
        commandCount += this.#finishRectBatch(context, rectBatchFill, rectBatchOpacity);
        rectBatchOpen = false;
      }

      switch (kind) {
        case RenderKind.Rect:
          commandCount += this.#drawRect(context, store, slot);
          break;
        case RenderKind.Text:
          commandCount += this.#drawText(context, store, slot);
          break;
        case RenderKind.Image:
          commandCount += this.#drawImagePlaceholder(context, store, slot);
          break;
        case RenderKind.Bar:
          commandCount += this.#drawBar(context, store, slot);
          break;
        case RenderKind.Relation:
          commandCount += this.#drawRelation(context, store, slot);
          break;
      }
    }
    if (rectBatchOpen) commandCount += this.#finishRectBatch(context, rectBatchFill, rectBatchOpacity);

    commandCount += this.#drawSelection(context, store, order);
    context.globalAlpha = 1;

    this.#lastRevision = store.revision;
    this.#lastBackground = background;
    this.#presentationDirty = false;
    return Object.freeze({ rendered: true, commandCount });
  }

  public destroy(): boolean {
    if (this.#destroyed) return false;
    const context = this.#context;
    const canvas = this.#canvas;
    if (context !== null && canvas !== null) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.#colorCss.clear();
    this.#fontCss.clear();
    this.#images.clear();
    this.#context = null;
    this.#canvas = null;
    this.#width = 0;
    this.#height = 0;
    this.#pixelRatio = 1;
    this.#lastRevision = -1;
    this.#lastBackground = -1;
    this.#presentationDirty = false;
    this.#destroyed = true;
    return true;
  }

  #clear(context: CanvasRenderingContext2D, background: number): number {
    const canvas = this.#canvas as CanvasSurface;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    let commands = 1;
    if ((background & 0xff) !== 0) {
      context.fillStyle = this.#css(background);
      context.fillRect(0, 0, canvas.width, canvas.height);
      commands += 1;
    }
    return commands;
  }

  #applyWorldTransform(context: CanvasRenderingContext2D): void {
    context.setTransform(this.#pixelRatio, 0, 0, this.#pixelRatio, 0, 0);
    context.translate(this.#viewX, this.#viewY);
    if (this.#viewRotation !== 0) context.rotate(degreesToRadians(this.#viewRotation));
    context.scale(this.#viewScale, this.#viewScale);
  }

  #isDrawable(store: RenderStoreView, slot: number): boolean {
    return (
      slot >= 0 &&
      slot < store.capacity &&
      (store.alive[slot] as number) !== 0 &&
      ((store.flags[slot] as number) & RenderFlags.Visible) !== 0 &&
      (store.opacity[slot] as number) > 0
    );
  }

  #canBatchRect(store: RenderStoreView, slot: number): boolean {
    return (
      (store.rotation[slot] as number) === 0 &&
      (store.radius[slot] as number) <= 0 &&
      (
        ((store.stroke[slot] as number) & 0xff) === 0 ||
        (store.strokeWidth[slot] as number) <= 0
      ) &&
      ((store.fill[slot] as number) & 0xff) === 0xff &&
      (store.opacity[slot] as number) >= 1 &&
      (store.width[slot] as number) > 0 &&
      (store.height[slot] as number) > 0 &&
      !this.#isCulled(store, slot)
    );
  }

  #finishRectBatch(context: CanvasRenderingContext2D, fill: number, opacity: number): number {
    context.globalAlpha = clamp01(opacity);
    context.fillStyle = this.#css(fill);
    context.fill();
    return 1;
  }

  #drawRect(context: CanvasRenderingContext2D, store: RenderStoreView, slot: number): number {
    const width = store.width[slot] as number;
    const height = store.height[slot] as number;
    if (width <= 0 || height <= 0 || this.#isCulled(store, slot)) return 0;

    const rotated = this.#beginEntity(context, store, slot);
    const x = rotated ? -width / 2 : (store.x[slot] as number);
    const y = rotated ? -height / 2 : (store.y[slot] as number);
    this.#roundedRectPath(context, x, y, width, height, store.radius[slot] as number);

    const opacity = store.opacity[slot] as number;
    let commands = this.#fill(context, store.fill[slot] as number, opacity);
    commands += this.#stroke(
      context,
      store.stroke[slot] as number,
      store.strokeWidth[slot] as number,
      opacity,
    );
    if (rotated) context.restore();
    return commands;
  }

  #drawBar(context: CanvasRenderingContext2D, store: RenderStoreView, slot: number): number {
    const width = store.width[slot] as number;
    const height = store.height[slot] as number;
    if (width <= 0 || height <= 0 || this.#isCulled(store, slot)) return 0;

    const rotated = this.#beginEntity(context, store, slot);
    const x = rotated ? -width / 2 : (store.x[slot] as number);
    const y = rotated ? -height / 2 : (store.y[slot] as number);
    const radius = store.radius[slot] as number;
    const opacity = store.opacity[slot] as number;
    let commands = 0;

    this.#roundedRectPath(context, x, y, width, height, radius);
    commands += this.#fill(context, store.trackFill[slot] as number, opacity);

    const min = store.min[slot] as number;
    const max = store.max[slot] as number;
    const progress = max > min ? clamp01(((store.value[slot] as number) - min) / (max - min)) : 0;
    if (progress > 0) {
      const fillWidth = width * progress;
      this.#roundedRectPath(context, x, y, fillWidth, height, Math.min(radius, fillWidth / 2));
      commands += this.#fill(context, store.fill[slot] as number, opacity);
    }

    if (rotated) context.restore();
    return commands;
  }

  #drawText(context: CanvasRenderingContext2D, store: RenderStoreView, slot: number): number {
    const width = store.width[slot] as number;
    const height = store.height[slot] as number;
    const fontSize = store.fontSize[slot] as number;
    const text = store.text[slot] ?? '';
    if (
      width <= 0 ||
      height <= 0 ||
      fontSize <= 0 ||
      text.length === 0 ||
      ((store.color[slot] as number) & 0xff) === 0 ||
      this.#isCulled(store, slot)
    ) {
      return 0;
    }

    const rotated = this.#beginEntity(context, store, slot);
    const x = rotated ? -width / 2 : (store.x[slot] as number);
    const y = rotated ? -height / 2 : (store.y[slot] as number);
    const family = store.fontFamily[slot] ?? 'sans-serif';
    context.font = this.#font(family, store.fontWeight[slot] as number, fontSize);
    context.textBaseline = 'top';
    const align = store.align[slot] as number;
    if (align === RenderAlign.Center) {
      context.textAlign = 'center';
    } else if (align === RenderAlign.Right) {
      context.textAlign = 'right';
    } else {
      context.textAlign = 'left';
    }
    const textX = align === RenderAlign.Center ? x + width / 2 : align === RenderAlign.Right ? x + width : x;
    context.globalAlpha = clamp01(store.opacity[slot] as number);
    context.fillStyle = this.#css(store.color[slot] as number);

    const lineHeight = fontSize * 1.2;
    const heightLimit = Math.max(1, Math.floor(height / lineHeight));
    const configuredLimit = store.maxLines[slot] as number;
    const lineLimit = configuredLimit > 0 ? Math.min(configuredLimit, heightLimit) : heightLimit;
    let start = 0;
    let line = 0;
    while (line < lineLimit && start <= text.length) {
      const newline = text.indexOf('\n', start);
      const end = newline < 0 ? text.length : newline;
      const content = start === 0 && end === text.length ? text : text.slice(start, end);
      context.fillText(content, textX, y + line * lineHeight, width);
      line += 1;
      if (newline < 0) break;
      start = newline + 1;
    }
    if (rotated) context.restore();
    return line;
  }

  #drawImagePlaceholder(
    context: CanvasRenderingContext2D,
    store: RenderStoreView,
    slot: number,
  ): number {
    const width = store.width[slot] as number;
    const height = store.height[slot] as number;
    if (width <= 0 || height <= 0 || this.#isCulled(store, slot)) return 0;

    const rotated = this.#beginEntity(context, store, slot);
    const x = rotated ? -width / 2 : (store.x[slot] as number);
    const y = rotated ? -height / 2 : (store.y[slot] as number);
    const image = this.#images.get(store.source[slot] ?? '');
    if (image !== undefined) {
      context.globalAlpha = clamp01(store.opacity[slot] as number);
      this.#drawRegisteredImage(context, image, store.fit[slot] as number, x, y, width, height);
      if (rotated) context.restore();
      return 1;
    }
    const rawTint = (store.tint[slot] as number) >>> 0;
    const tint = (rawTint & 0xff) === 0 ? DEFAULT_IMAGE_TINT : rawTint;
    const opacity = store.opacity[slot] as number;

    context.beginPath();
    context.rect(x, y, width, height);
    let commands = this.#fill(context, tint, opacity * 0.12);
    commands += this.#stroke(context, tint, 1, opacity * 0.65);

    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + width, y + height);
    context.moveTo(x + width, y);
    context.lineTo(x, y + height);
    commands += this.#stroke(context, tint, 1, opacity * 0.65);
    if (rotated) context.restore();
    return commands;
  }

  #drawRegisteredImage(
    context: CanvasRenderingContext2D,
    image: CanvasImageSource,
    fit: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const dimensions = imageDimensions(image);
    if (fit === RenderFit.Stretch || dimensions.width <= 0 || dimensions.height <= 0) {
      context.drawImage(image, x, y, width, height);
      return;
    }
    const scale = fit === RenderFit.Cover
      ? Math.max(width / dimensions.width, height / dimensions.height)
      : Math.min(width / dimensions.width, height / dimensions.height);
    const drawWidth = dimensions.width * scale;
    const drawHeight = dimensions.height * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;
    if (fit === RenderFit.Cover) {
      context.save();
      context.beginPath();
      context.rect(x, y, width, height);
      context.clip();
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      context.restore();
      return;
    }
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  #drawRelation(context: CanvasRenderingContext2D, store: RenderStoreView, slot: number): number {
    const from = store.relationFrom[slot] as number;
    const to = store.relationTo[slot] as number;
    const lineWidth = store.lineWidth[slot] as number;
    if (
      !this.#isEndpoint(store, from) ||
      !this.#isEndpoint(store, to) ||
      lineWidth <= 0 ||
      this.#isSegmentCulled(store, from, to)
    ) {
      return 0;
    }

    context.beginPath();
    context.moveTo(
      (store.x[from] as number) + (store.width[from] as number) / 2,
      (store.y[from] as number) + (store.height[from] as number) / 2,
    );
    context.lineTo(
      (store.x[to] as number) + (store.width[to] as number) / 2,
      (store.y[to] as number) + (store.height[to] as number) / 2,
    );
    return this.#stroke(context, store.color[slot] as number, lineWidth, store.opacity[slot] as number);
  }

  #drawSelection(
    context: CanvasRenderingContext2D,
    store: RenderStoreView,
    order: ArrayLike<number>,
  ): number {
    let selected = 0;
    let pathOpen = false;
    context.beginPath();
    for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
      const slot = order[orderIndex] as number;
      if (
        !this.#isDrawable(store, slot) ||
        ((store.flags[slot] as number) & RenderFlags.Selected) === 0 ||
        (
          (store.kind[slot] as number) !== RenderKind.Relation &&
          this.#isCulled(store, slot)
        )
      ) {
        continue;
      }
      if ((store.kind[slot] as number) === RenderKind.Relation) {
        if (pathOpen) {
          selected += this.#stroke(context, SELECTION_COLOR, 2 / this.#viewScale, 1);
          context.beginPath();
          pathOpen = false;
        }
        const from = store.relationFrom[slot] as number;
        const to = store.relationTo[slot] as number;
        if (
          !this.#isEndpoint(store, from) ||
          !this.#isEndpoint(store, to) ||
          this.#isSegmentCulled(store, from, to)
        ) {
          continue;
        }
        context.moveTo(
          (store.x[from] as number) + (store.width[from] as number) / 2,
          (store.y[from] as number) + (store.height[from] as number) / 2,
        );
        context.lineTo(
          (store.x[to] as number) + (store.width[to] as number) / 2,
          (store.y[to] as number) + (store.height[to] as number) / 2,
        );
        selected += this.#stroke(context, SELECTION_COLOR, 3 / this.#viewScale, 1);
        context.beginPath();
        continue;
      }

      const rotation = store.rotation[slot] as number;
      if (rotation !== 0) {
        if (pathOpen) {
          selected += this.#stroke(context, SELECTION_COLOR, 2 / this.#viewScale, 1);
          pathOpen = false;
        }
        const width = store.width[slot] as number;
        const height = store.height[slot] as number;
        this.#beginEntity(context, store, slot);
        context.beginPath();
        context.rect(-width / 2, -height / 2, width, height);
        selected += this.#stroke(context, SELECTION_COLOR, 2 / this.#viewScale, 1);
        context.restore();
        context.beginPath();
        continue;
      }

      context.rect(
        store.x[slot] as number,
        store.y[slot] as number,
        store.width[slot] as number,
        store.height[slot] as number,
      );
      pathOpen = true;
    }
    if (pathOpen) selected += this.#stroke(context, SELECTION_COLOR, 2 / this.#viewScale, 1);
    return selected;
  }

  #beginEntity(context: CanvasRenderingContext2D, store: RenderStoreView, slot: number): boolean {
    const rotation = store.rotation[slot] as number;
    if (rotation === 0) return false;
    const width = store.width[slot] as number;
    const height = store.height[slot] as number;
    context.save();
    context.translate(
      (store.x[slot] as number) + width / 2,
      (store.y[slot] as number) + height / 2,
    );
    context.rotate(degreesToRadians(rotation));
    return true;
  }

  #roundedRectPath(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    context.beginPath();
    const resolved = Math.max(0, Math.min(radius, width / 2, height / 2));
    if (resolved === 0) {
      context.rect(x, y, width, height);
      return;
    }
    context.moveTo(x + resolved, y);
    context.lineTo(x + width - resolved, y);
    context.quadraticCurveTo(x + width, y, x + width, y + resolved);
    context.lineTo(x + width, y + height - resolved);
    context.quadraticCurveTo(x + width, y + height, x + width - resolved, y + height);
    context.lineTo(x + resolved, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - resolved);
    context.lineTo(x, y + resolved);
    context.quadraticCurveTo(x, y, x + resolved, y);
    context.closePath();
  }

  #fill(context: CanvasRenderingContext2D, packed: number, opacity: number): number {
    if ((packed & 0xff) === 0 || opacity <= 0) return 0;
    context.globalAlpha = clamp01(opacity);
    context.fillStyle = this.#css(packed);
    context.fill();
    return 1;
  }

  #stroke(
    context: CanvasRenderingContext2D,
    packed: number,
    lineWidth: number,
    opacity: number,
  ): number {
    if ((packed & 0xff) === 0 || lineWidth <= 0 || opacity <= 0) return 0;
    context.globalAlpha = clamp01(opacity);
    context.strokeStyle = this.#css(packed);
    context.lineWidth = lineWidth;
    context.stroke();
    return 1;
  }

  #css(packed: number): string {
    const normalized = packed >>> 0;
    const cached = this.#colorCss.get(normalized);
    if (cached !== undefined) return cached;
    const red = normalized >>> 24;
    const green = (normalized >>> 16) & 0xff;
    const blue = (normalized >>> 8) & 0xff;
    const alpha = normalized & 0xff;
    const value = alpha === 0xff
      ? `rgb(${red} ${green} ${blue})`
      : `rgba(${red} ${green} ${blue} / ${trimAlpha(alpha / 0xff)})`;
    this.#colorCss.set(normalized, value);
    return value;
  }

  #font(family: string, weight: number, size: number): string {
    let byWeight = this.#fontCss.get(family);
    if (byWeight === undefined) {
      byWeight = new Map();
      this.#fontCss.set(family, byWeight);
    }
    let bySize = byWeight.get(weight);
    if (bySize === undefined) {
      bySize = new Map();
      byWeight.set(weight, bySize);
    }
    const cached = bySize.get(size);
    if (cached !== undefined) return cached;
    const value = `${weight} ${size}px ${family}`;
    bySize.set(size, value);
    return value;
  }

  #isEndpoint(store: RenderStoreView, slot: number): boolean {
    return slot >= 0 && slot < store.capacity && (store.alive[slot] as number) !== 0;
  }

  #isCulled(store: RenderStoreView, slot: number): boolean {
    if (
      this.#viewRotation !== 0 ||
      (store.rotation[slot] as number) !== 0 ||
      this.#width <= 0 ||
      this.#height <= 0
    ) {
      return false;
    }
    const left = -this.#viewX / this.#viewScale;
    const top = -this.#viewY / this.#viewScale;
    const right = left + this.#width / this.#viewScale;
    const bottom = top + this.#height / this.#viewScale;
    const x = store.x[slot] as number;
    const y = store.y[slot] as number;
    return (
      x + (store.width[slot] as number) < left ||
      x > right ||
      y + (store.height[slot] as number) < top ||
      y > bottom
    );
  }

  #isSegmentCulled(store: RenderStoreView, from: number, to: number): boolean {
    if (this.#viewRotation !== 0 || this.#width <= 0 || this.#height <= 0) return false;
    const left = -this.#viewX / this.#viewScale;
    const top = -this.#viewY / this.#viewScale;
    const right = left + this.#width / this.#viewScale;
    const bottom = top + this.#height / this.#viewScale;
    const fromX = (store.x[from] as number) + (store.width[from] as number) / 2;
    const fromY = (store.y[from] as number) + (store.height[from] as number) / 2;
    const toX = (store.x[to] as number) + (store.width[to] as number) / 2;
    const toY = (store.y[to] as number) + (store.height[to] as number) / 2;
    return (
      Math.max(fromX, toX) < left ||
      Math.min(fromX, toX) > right ||
      Math.max(fromY, toY) < top ||
      Math.min(fromY, toY) > bottom
    );
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('Renderer is destroyed');
  }
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function trimAlpha(value: number): string {
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function imageDimensions(image: CanvasImageSource): { width: number; height: number } {
  const candidate = image as unknown as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
  };
  return {
    width: candidate.naturalWidth ?? candidate.videoWidth ?? candidate.displayWidth ?? candidate.width ?? 0,
    height: candidate.naturalHeight ?? candidate.videoHeight ?? candidate.displayHeight ?? candidate.height ?? 0,
  };
}

import { Graphics } from 'pixi.js';
import type { ColorSource, Container } from 'pixi.js';

import type { PatchmapTheme } from '../theme';

type PublicRecord = Record<string, unknown>;

interface SizeValue {
  width: number;
  height: number;
}

type LiveHandle = Container & {
  props?: PublicRecord;
};

const record = (value: unknown): PublicRecord =>
  value && typeof value === 'object' ? value as PublicRecord : {};

const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const fixedSize = (value: unknown): SizeValue => {
  if (typeof value === 'number') return { width: value, height: value };
  const input = record(value);
  return { width: number(input.width), height: number(input.height) };
};

const componentLength = (value: unknown, extent: number): number => {
  if (typeof value === 'number') return value;
  const input = record(value);
  const amount = number(input.value);
  return input.unit === '%' ? extent * amount / 100 : amount;
};

const componentSize = (value: unknown, item: SizeValue): SizeValue => {
  const input = record(value);
  if ('width' in input || 'height' in input) {
    return {
      width: componentLength(input.width, item.width),
      height: componentLength(input.height, item.height),
    };
  }
  const side = componentLength(value, Math.min(item.width, item.height));
  return { width: side, height: side };
};

const resolveColor = (
  value: unknown,
  theme: PatchmapTheme,
  fallback: ColorSource,
): ColorSource => {
  if (typeof value !== 'string') return value as ColorSource ?? fallback;
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

const placementPosition = (
  placement: unknown,
  item: SizeValue,
  component: SizeValue,
): { x: number; y: number } => {
  const centerX = (item.width - component.width) / 2;
  const centerY = (item.height - component.height) / 2;
  switch (placement) {
    case 'left': return { x: 0, y: centerY };
    case 'left-top': return { x: 0, y: 0 };
    case 'left-bottom': return { x: 0, y: item.height - component.height };
    case 'top': return { x: centerX, y: 0 };
    case 'right': return { x: item.width - component.width, y: centerY };
    case 'right-top': return { x: item.width - component.width, y: 0 };
    case 'right-bottom': return {
      x: item.width - component.width,
      y: item.height - component.height,
    };
    case 'bottom': return { x: centerX, y: item.height - component.height };
    case 'none': return { x: 0, y: 0 };
    default: return { x: centerX, y: centerY };
  }
};

export class AggregateRenderLayer extends Graphics {
  readonly #theme: () => PatchmapTheme;

  public constructor(theme: () => PatchmapTheme) {
    super();
    this.#theme = theme;
    this.eventMode = 'none';
    this.label = 'patch-map-aggregate-render-layer';
  }

  public renderMap(data: readonly PublicRecord[]): void {
    this.clear();
    for (const element of data) this.#drawElement(element, 0, 0);
  }

  public renderScene(roots: readonly Container[]): void {
    this.clear();
    for (const root of roots) this.#drawHandle(root as LiveHandle, 0, 0);
  }

  #drawHandle(node: LiveHandle, parentX: number, parentY: number): void {
    if (!node.renderable) return;
    const element = record(node.props);
    const x = parentX + node.x;
    const y = parentY + node.y;
    if (element.type === 'group' || element.type === 'grid') {
      for (const child of node.children) {
        this.#drawHandle(child as LiveHandle, x, y);
      }
      return;
    }
    if (element.type === 'item') {
      this.#drawItem(element, x, y);
      return;
    }
    if (element.type === 'rect') {
      this.#drawRectElement(element, x, y);
      return;
    }
    if (element.type === 'image') {
      const size = fixedSize(element.size);
      this.rect(x, y, size.width, size.height)
        .fill({ color: this.#theme().gray.light, alpha: 0.18 });
    }
  }

  #drawElement(element: PublicRecord, parentX: number, parentY: number): void {
    if (element.show === false) return;
    const attrs = record(element.attrs);
    const x = parentX + number(attrs.x);
    const y = parentY + number(attrs.y);

    switch (element.type) {
      case 'group':
        for (const child of element.children as PublicRecord[] ?? []) {
          this.#drawElement(child, x, y);
        }
        break;
      case 'grid':
        this.#drawGrid(element, x, y);
        break;
      case 'item':
        this.#drawItem(element, x, y);
        break;
      case 'rect':
        this.#drawRectElement(element, x, y);
        break;
      case 'image': {
        const size = fixedSize(element.size);
        this.rect(x, y, size.width, size.height)
          .fill({ color: this.#theme().gray.light, alpha: 0.18 });
        break;
      }
      default:
        break;
    }
  }

  #drawGrid(grid: PublicRecord, x: number, y: number): void {
    const cells = grid.cells as unknown[][] ?? [];
    const item = record(grid.item);
    const size = fixedSize(item.size);
    const gap = record(grid.gap);
    const gapX = number(gap.x);
    const gapY = number(gap.y);
    for (let row = 0; row < cells.length; row += 1) {
      const values = cells[row] ?? [];
      for (let column = 0; column < values.length; column += 1) {
        if (values[column] === 0) continue;
        this.#drawItem(
          { ...item, type: 'item', show: true },
          x + column * (size.width + gapX),
          y + row * (size.height + gapY),
        );
      }
    }
  }

  #drawItem(item: PublicRecord, x: number, y: number): void {
    const size = fixedSize(item.size);
    for (const component of item.components as PublicRecord[] ?? []) {
      if (component.show === false) continue;
      const source = record(component.source);
      if (component.type === 'background' && source.type === 'rect') {
        this.#drawRectangleSource(source, x, y, size.width, size.height);
        continue;
      }
      if (component.type === 'bar') {
        const barSize = componentSize(component.size, size);
        const position = placementPosition(component.placement, size, barSize);
        this.roundRect(
          x + position.x,
          y + position.y,
          barSize.width,
          barSize.height,
          number(source.radius),
        ).fill(resolveColor(component.tint, this.#theme(), this.#theme().white));
        continue;
      }
      if (component.type === 'icon') {
        const iconSize = componentSize(component.size, size);
        const position = placementPosition(component.placement, size, iconSize);
        this.rect(
          x + position.x,
          y + position.y,
          iconSize.width,
          iconSize.height,
        ).fill({
          color: resolveColor(component.tint, this.#theme(), this.#theme().white),
          alpha: 0.3,
        });
      }
    }
  }

  #drawRectElement(rectangle: PublicRecord, x: number, y: number): void {
    const size = fixedSize(rectangle.size);
    this.roundRect(x, y, size.width, size.height, number(rectangle.radius))
      .fill(resolveColor(rectangle.fill, this.#theme(), 0x000000));
    const stroke = record(rectangle.stroke);
    if (Object.keys(stroke).length > 0) {
      this.stroke({
        color: resolveColor(stroke.color, this.#theme(), 0x000000),
        width: number(stroke.width, 1),
        alpha: number(stroke.alpha, 1),
      });
    }
  }

  #drawRectangleSource(
    source: PublicRecord,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    this.roundRect(x, y, width, height, number(source.radius))
      .fill(resolveColor(source.fill, this.#theme(), this.#theme().white));
    const borderWidth = number(source.borderWidth);
    if (borderWidth > 0) {
      this.stroke({
        color: resolveColor(source.borderColor, this.#theme(), this.#theme().black),
        width: borderWidth,
      });
    }
  }
}

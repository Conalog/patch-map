type PublicRecord = Record<string, unknown>;

export interface SceneSize {
  width: number;
  height: number;
}

export interface ComponentLayout {
  x: number;
  y: number;
  localWidth: number;
  localHeight: number;
  scaleX: number;
  scaleY: number;
}

interface BoxEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const FIRA_CODE_ADVANCE_EM = 0.6153845;
export const GRID_COMPONENT_DEFAULT_ADVANCE_EM = 8 / 13;
const FIRA_CODE_LINE_HEIGHT_EM = 1.18461544;
const STANDALONE_TEXT_DEFAULT_FONT_SIZE = 16;
const COMPONENT_TEXT_DEFAULT_FONT_SIZE = 26;

const object = (value: unknown): PublicRecord =>
  value && typeof value === 'object' ? value as PublicRecord : {};

const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const readFixedSize = (value: unknown): SceneSize => {
  if (typeof value === 'number') return { width: value, height: value };
  const size = object(value);
  return { width: finite(size.width), height: finite(size.height) };
};

const readEdges = (value: unknown): BoxEdges => {
  if (typeof value === 'number') {
    return { top: value, right: value, bottom: value, left: value };
  }
  const edges = object(value);
  const x = finite(edges.x);
  const y = finite(edges.y);
  return {
    top: finite(edges.top, y),
    right: finite(edges.right, x),
    bottom: finite(edges.bottom, y),
    left: finite(edges.left, x),
  };
};

const readLength = (value: unknown, extent: number): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.endsWith('%')) {
    return extent * finite(Number.parseFloat(value)) / 100;
  }
  const length = object(value);
  const amount = finite(length.value);
  return length.unit === '%' ? extent * amount / 100 : amount;
};

const readComponentSize = (value: unknown, extent: SceneSize): SceneSize => {
  const size = object(value);
  if ('width' in size || 'height' in size) {
    return {
      width: readLength(size.width, extent.width),
      height: readLength(size.height, extent.height),
    };
  }
  const side = readLength(value, Math.min(extent.width, extent.height));
  return { width: side, height: side };
};

/** Resolve the observable text lines while preserving explicit newlines. */
export const resolveTextLines = (
  text: unknown,
  split: unknown = 0,
): string[] => {
  const content = typeof text === 'string' ? text : '';
  const explicitLines = content.split('\n');
  if (!(typeof split === 'number' && Number.isInteger(split) && split > 0)) {
    return explicitLines;
  }

  const lines: string[] = [];
  for (const line of explicitLines) {
    if (line.length === 0) {
      lines.push('');
      continue;
    }
    for (let offset = 0; offset < line.length; offset += split) {
      lines.push(line.slice(offset, offset + split));
    }
  }
  return lines;
};

export const measureText = (
  text: unknown,
  styleValue: unknown,
  defaultFontSize = STANDALONE_TEXT_DEFAULT_FONT_SIZE,
  split: unknown = 0,
  defaultAdvanceEm = FIRA_CODE_ADVANCE_EM,
): SceneSize => {
  const style = object(styleValue);
  const hasFontSize = typeof style.fontSize === 'number' &&
    Number.isFinite(style.fontSize);
  const fontSize = finite(style.fontSize, defaultFontSize);
  const advanceEm = hasFontSize ? FIRA_CODE_ADVANCE_EM : defaultAdvanceEm;
  const letterSpacing = finite(style.letterSpacing);
  const lines = resolveTextLines(text, split);
  const widths = lines.map((line) =>
    line.length * (fontSize * advanceEm + letterSpacing),
  );
  return {
    width: widths.length ? Math.max(...widths) : 0,
    height: lines.length * fontSize * FIRA_CODE_LINE_HEIGHT_EM,
  };
};

const place = (
  placement: unknown,
  box: { x: number; y: number; width: number; height: number },
  size: SceneSize,
  margin: BoxEdges,
): { x: number; y: number } => {
  const left = box.x + margin.left;
  const top = box.y + margin.top;
  const width = Math.max(0, box.width - margin.left - margin.right);
  const height = Math.max(0, box.height - margin.top - margin.bottom);
  const centerX = left + (width - size.width) / 2;
  const centerY = top + (height - size.height) / 2;

  switch (placement) {
    case 'left': return { x: left, y: centerY };
    case 'left-top': return { x: left, y: top };
    case 'left-bottom': return { x: left, y: top + height - size.height };
    case 'top': return { x: centerX, y: top };
    case 'right': return { x: left + width - size.width, y: centerY };
    case 'right-top': return { x: left + width - size.width, y: top };
    case 'right-bottom': return {
      x: left + width - size.width,
      y: top + height - size.height,
    };
    case 'bottom': return { x: centerX, y: top + height - size.height };
    case 'none': return { x: left, y: top };
    default: return { x: centerX, y: centerY };
  }
};

export const layoutComponent = (
  component: PublicRecord,
  item: PublicRecord,
  defaultTextAdvanceEm = FIRA_CODE_ADVANCE_EM,
): ComponentLayout => {
  const itemSize = readFixedSize(item.size);
  const source = object(component.source);

  if (component.type === 'background') {
    const borderWidth = source.type === 'rect' ? finite(source.borderWidth) : 0;
    return {
      x: -borderWidth / 2,
      y: -borderWidth / 2,
      localWidth: itemSize.width + borderWidth,
      localHeight: itemSize.height + borderWidth,
      scaleX: 1,
      scaleY: 1,
    };
  }

  const padding = readEdges(item.padding);
  const contentBox = {
    x: padding.left,
    y: padding.top,
    width: Math.max(0, itemSize.width - padding.left - padding.right),
    height: Math.max(0, itemSize.height - padding.top - padding.bottom),
  };
  const margin = readEdges(component.margin);
  let displayedSize: SceneSize;
  let localSize: SceneSize;
  let scaleX = 1;
  let scaleY = 1;

  if (component.type === 'text') {
    displayedSize = measureText(
      component.text,
      component.style,
      COMPONENT_TEXT_DEFAULT_FONT_SIZE,
      component.split,
      defaultTextAdvanceEm,
    );
    localSize = displayedSize;
  } else {
    displayedSize = readComponentSize(component.size, {
      width: contentBox.width,
      height: contentBox.height,
    });
    localSize = displayedSize;
    if (component.type === 'bar' && component.animation !== false) {
      displayedSize = { width: 1, height: 1 };
      localSize = displayedSize;
    } else if (
      component.type === 'icon' &&
      (component.source === 'device' || component.source === 'loading')
    ) {
      localSize = { width: 72, height: 72 };
      scaleX = displayedSize.width / localSize.width;
      scaleY = displayedSize.height / localSize.height;
    }
  }

  const position = place(component.placement, contentBox, displayedSize, margin);
  const attrs = object(component.attrs);
  return {
    x: position.x + finite(attrs.x),
    y: position.y + finite(attrs.y),
    localWidth: localSize.width,
    localHeight: localSize.height,
    scaleX,
    scaleY,
  };
};

/** Visual-only bar interpolation; public live-handle geometry remains initial. */
export const layoutAnimatedBar = (
  component: PublicRecord,
  item: PublicRecord,
  progress: number,
): ComponentLayout => {
  const start = layoutComponent(component, item);
  const target = layoutComponent(
    { ...component, animation: false },
    item,
  );
  const ratio = Math.max(0, Math.min(1, progress));
  return {
    x: start.x + (target.x - start.x) * ratio,
    y: start.y + (target.y - start.y) * ratio,
    localWidth: start.localWidth +
      (target.localWidth - start.localWidth) * ratio,
    localHeight: start.localHeight +
      (target.localHeight - start.localHeight) * ratio,
    scaleX: start.scaleX + (target.scaleX - start.scaleX) * ratio,
    scaleY: start.scaleY + (target.scaleY - start.scaleY) * ratio,
  };
};

export const leafBounds = (element: PublicRecord): SceneSize | null => {
  if (element.type === 'rect') {
    if (element.fill === undefined && element.stroke === undefined) {
      return { width: 0, height: 0 };
    }
    return readFixedSize(element.size);
  }
  if (element.type === 'image') {
    if (element.size !== undefined) return readFixedSize(element.size);
    return element.source === 'device' || element.source === 'loading'
      ? { width: 72, height: 72 }
      : { width: 1, height: 1 };
  }
  if (element.type === 'text') return measureText(element.text, element.style);
  return null;
};

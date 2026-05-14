import { normalizeBoxSpacing } from '../../utils/spacing';

export const createLayout = (model) => {
  const frames = new Map();
  frames.set(model.root.id, {
    id: model.root.id,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    alpha: 1,
    visible: true,
  });

  for (const child of model.getChildren(model.root.id)) {
    layoutNodeRecursive(model, frames, child, frames.get(model.root.id));
  }

  return {
    frames,
    getFrame(id) {
      return frames.get(id) ?? null;
    },
  };
};

export const layoutNode = (model, frames, record) => {
  const parentFrame = frames.get(record.parentId) ?? frames.get(model.root.id);
  if (!parentFrame) return;
  layoutNodeRecursive(model, frames, record, parentFrame, {
    recursive: false,
  });
};

const layoutNodeRecursive = (
  model,
  frames,
  record,
  parentFrame,
  { recursive = true } = {},
) => {
  const attrs = record.props.attrs ?? {};
  const size = resolveElementSize(record);
  const frame = {
    id: record.id,
    parentId: record.parentId,
    x: parentFrame.x + (attrs.x ?? 0),
    y: parentFrame.y + (attrs.y ?? 0),
    width: size.width,
    height: size.height,
    rotation: parentFrame.rotation + resolveRotation(attrs),
    alpha: parentFrame.alpha * (attrs.alpha ?? 1),
    visible: parentFrame.visible && record.show,
  };
  frames.set(record.id, frame);

  if (record.type === 'item') {
    for (const component of model.getComponents(record.id)) {
      frames.set(component.id, layoutComponent(component, frame, record));
    }
  }

  if (!recursive) return;

  for (const child of model.getChildren(record.id)) {
    if (child.kind === 'component') continue;
    layoutNodeRecursive(model, frames, child, frame);
  }
};

const resolveElementSize = (record) => {
  const size = record.props.size ?? record.props.item?.size;
  if (typeof size === 'number' || typeof size === 'string') {
    const value = resolveNumber(size);
    return { width: value, height: value };
  }
  return {
    width: resolveNumber(size?.width),
    height: resolveNumber(size?.height),
  };
};

const layoutComponent = (component, itemFrame, itemRecord) => {
  const contentFrame = getItemContentFrame(itemFrame, itemRecord.props.padding);
  const size = resolveComponentSize(component, contentFrame);
  const placement =
    component.props.placement ?? defaultPlacement(component.type);
  const margin = normalizeBoxSpacing(component.props.margin ?? 0);
  const point = resolvePlacement(placement, contentFrame, size, margin);
  return {
    id: component.id,
    parentId: itemRecord.id,
    x: point.x,
    y: point.y,
    width: size.width,
    height: size.height,
    rotation: itemFrame.rotation,
    alpha: itemFrame.alpha,
    visible: itemFrame.visible && component.show,
  };
};

const getItemContentFrame = (itemFrame, padding = 0) => {
  const normalized = normalizeBoxSpacing(padding);
  return {
    x: itemFrame.x + normalized.left,
    y: itemFrame.y + normalized.top,
    width: Math.max(0, itemFrame.width - normalized.left - normalized.right),
    height: Math.max(0, itemFrame.height - normalized.top - normalized.bottom),
  };
};

const resolveComponentSize = (component, contentFrame) => {
  const size = component.props.size ?? {
    width: { value: 100, unit: '%' },
    height: { value: 100, unit: '%' },
  };
  return {
    width: resolvePxOrPercent(size.width ?? size, contentFrame.width),
    height: resolvePxOrPercent(size.height ?? size, contentFrame.height),
  };
};

const resolvePlacement = (placement, contentFrame, size, margin) => {
  const left = contentFrame.x + margin.left;
  const right = contentFrame.x + contentFrame.width - size.width - margin.right;
  const top = contentFrame.y + margin.top;
  const bottom =
    contentFrame.y + contentFrame.height - size.height - margin.bottom;
  const centerX = contentFrame.x + (contentFrame.width - size.width) / 2;
  const centerY = contentFrame.y + (contentFrame.height - size.height) / 2;

  switch (placement) {
    case 'top':
      return { x: centerX, y: top };
    case 'bottom':
      return { x: centerX, y: bottom };
    case 'left':
      return { x: left, y: centerY };
    case 'right':
      return { x: right, y: centerY };
    case 'top-left':
    case 'left-top':
      return { x: left, y: top };
    case 'top-right':
    case 'right-top':
      return { x: right, y: top };
    case 'bottom-left':
    case 'left-bottom':
      return { x: left, y: bottom };
    case 'bottom-right':
    case 'right-bottom':
      return { x: right, y: bottom };
    default:
      return { x: centerX, y: centerY };
  }
};

const resolveNumber = (value) => {
  if (typeof value === 'number') return value;
  if (value?.unit === 'px') return value.value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  return 0;
};

const resolvePxOrPercent = (value, parentSize) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value.endsWith('%')
      ? parentSize * (Number.parseFloat(value) / 100)
      : Number.parseFloat(value) || 0;
  }
  if (value?.unit === '%') return parentSize * (value.value / 100);
  if (value?.unit === 'px') return value.value;
  return 0;
};

const resolveRotation = (attrs) => {
  if (typeof attrs.rotation === 'number') return attrs.rotation;
  if (typeof attrs.angle === 'number') return (attrs.angle * Math.PI) / 180;
  return 0;
};

const defaultPlacement = (type) => (type === 'bar' ? 'bottom' : 'center');

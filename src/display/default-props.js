import { isPlainObject } from 'is-plain-object';
import { normalizeBoxSpacing } from '../utils/spacing';
import { uid } from '../utils/uuid';
import {
  DEFAULT_AUTO_FONT_RANGE,
  DEFAULT_PATHSTYLE,
  DEFAULT_TEXTSTYLE,
} from './mixins/constants';
import { normalizeChanges } from './normalize';

const COMPONENT_TYPES = new Set(['background', 'bar', 'icon', 'text']);

const defaultComponentSize = () => ({
  width: { value: 100, unit: '%' },
  height: { value: 100, unit: '%' },
});

const withBaseDefaults = (value) => {
  if (!isPlainObject(value)) return value;
  if (value.show !== undefined && value.id !== undefined) return value;

  const next = { ...value };
  if (next.show === undefined) {
    next.show = true;
  }
  if (next.id === undefined) {
    next.id = uid();
  }
  return next;
};

const withElementBaseDefaults = (value) => {
  if (!isPlainObject(value)) return value;
  if (
    value.show !== undefined &&
    value.id !== undefined &&
    value.locked !== undefined
  ) {
    return value;
  }

  const next = { ...value };
  if (next.show === undefined) {
    next.show = true;
  }
  if (next.id === undefined) {
    next.id = uid();
  }
  if (next.locked === undefined) {
    next.locked = false;
  }
  return next;
};

const withTextStyleDefaults = (style) => ({
  fontFamily: DEFAULT_TEXTSTYLE.fontFamily,
  fontWeight: DEFAULT_TEXTSTYLE.fontWeight,
  fill: DEFAULT_TEXTSTYLE.fill,
  fontSize: 16,
  ...style,
});

const withLabelTextStyleDefaults = (style) => {
  const current = isPlainObject(style) ? style : {};
  const autoFont = isPlainObject(current.autoFont) ? current.autoFont : {};

  return {
    ...withTextStyleDefaults(current),
    autoFont: {
      min: DEFAULT_AUTO_FONT_RANGE.min,
      max: DEFAULT_AUTO_FONT_RANGE.max,
      ...autoFont,
    },
    overflow: current.overflow ?? 'visible',
  };
};

const withElementTextStyleDefaults = (style) => {
  const current = isPlainObject(style) ? style : {};

  return {
    ...withTextStyleDefaults(current),
    wordWrap: current.wordWrap ?? true,
    letterSpacing: current.letterSpacing ?? 0,
  };
};

const withStrokeStyleDefaults = (style) => ({
  color: DEFAULT_PATHSTYLE.color,
  ...(isPlainObject(style) ? style : {}),
});

const withItemLikeDefaults = (value, options = {}) => {
  const { materializeComponents = true } = options;
  let next = value;
  if (next.components === undefined) {
    next = { ...next, components: [] };
  }
  if (next.padding === undefined) {
    next = { ...next, padding: normalizeBoxSpacing(0) };
  }
  if (next.contentOrientation === undefined) {
    next = { ...next, contentOrientation: 'upright' };
  }
  if (materializeComponents && Array.isArray(next.components)) {
    next = {
      ...next,
      components: next.components.map(applyComponentDefaults),
    };
  }
  return next;
};

const withGridItemDefaults = (item) => {
  if (!isPlainObject(item)) return item;
  return normalizeChanges(
    withItemLikeDefaults(item, { materializeComponents: false }),
    'item',
  );
};

export const applyElementDefaults = (value) => {
  if (!isPlainObject(value)) return value;

  let next = withElementBaseDefaults(value);

  switch (next.type) {
    case 'group':
      if (Array.isArray(next.children)) {
        next = {
          ...next,
          children: next.children.map(applyElementDefaults),
        };
      }
      break;
    case 'grid':
      if (next.inactiveCellStrategy === undefined) {
        next = { ...next, inactiveCellStrategy: 'destroy' };
      }
      if (next.gap === undefined) {
        next = { ...next, gap: { x: 0, y: 0 } };
      }
      if (isPlainObject(next.item)) {
        next = { ...next, item: withGridItemDefaults(next.item) };
      }
      break;
    case 'item':
      next = withItemLikeDefaults(next);
      break;
    case 'relations':
      if (next.style === undefined) {
        next = { ...next, style: withStrokeStyleDefaults() };
      } else if (isPlainObject(next.style)) {
        next = { ...next, style: withStrokeStyleDefaults(next.style) };
      }
      break;
    case 'text':
      if (next.text === undefined) {
        next = { ...next, text: '' };
      }
      if (next.style === undefined || isPlainObject(next.style)) {
        next = { ...next, style: withElementTextStyleDefaults(next.style) };
      }
      break;
    case 'rect':
      if (next.radius === undefined) {
        next = { ...next, radius: 0 };
      }
      break;
  }

  return normalizeChanges(next, next.type);
};

export const applyComponentDefaults = (value) => {
  if (!isPlainObject(value)) return value;
  if (!COMPONENT_TYPES.has(value.type)) return value;

  let next = withBaseDefaults(value);

  if (next.tint === undefined) {
    next = { ...next, tint: 0xffffff };
  }

  switch (next.type) {
    case 'background':
      next = { ...next, size: defaultComponentSize() };
      break;
    case 'bar':
      if (next.placement === undefined) {
        next = { ...next, placement: 'bottom' };
      }
      if (next.margin === undefined) {
        next = { ...next, margin: normalizeBoxSpacing(0) };
      }
      if (next.animation === undefined) {
        next = { ...next, animation: true };
      }
      if (next.animationDuration === undefined) {
        next = { ...next, animationDuration: 200 };
      }
      break;
    case 'icon':
      if (next.placement === undefined) {
        next = { ...next, placement: 'center' };
      }
      if (next.margin === undefined) {
        next = { ...next, margin: normalizeBoxSpacing(0) };
      }
      break;
    case 'text':
      if (next.placement === undefined) {
        next = { ...next, placement: 'center' };
      }
      if (next.margin === undefined) {
        next = { ...next, margin: normalizeBoxSpacing(0) };
      }
      if (next.text === undefined) {
        next = { ...next, text: '' };
      }
      if (next.style === undefined || isPlainObject(next.style)) {
        next = { ...next, style: withLabelTextStyleDefaults(next.style) };
      }
      if (next.split === undefined) {
        next = { ...next, split: 0 };
      }
      break;
  }

  return normalizeChanges(next, next.type);
};

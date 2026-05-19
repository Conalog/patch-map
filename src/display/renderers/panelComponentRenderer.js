import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { getColor } from '../../utils/get';
import { normalizeBoxSpacing } from '../../utils/spacing';
import { ensurePanelBarLayer } from './PanelBarLayer';

const PANEL_COMPONENT_TYPES = new Set(['background', 'bar', 'icon', 'text']);
const COMPONENT_CACHE_FIELDS = {
  background: '_panelBackgroundComponent',
  bar: '_panelBarComponent',
  icon: '_panelIconComponent',
  text: '_panelTextComponent',
};

export const tryApplyPanelComponentChanges = (
  item,
  componentChanges,
  options = {},
) => {
  if (!canUsePanelRenderer(item, componentChanges, options)) return false;
  if (hasDuplicateUnkeyedTypes(componentChanges)) {
    restorePanelBarFallback(item);
    return false;
  }

  const jobs = [];
  ensurePanelComponentCache(item);

  for (const change of componentChanges) {
    if (!PANEL_COMPONENT_TYPES.has(change?.type)) {
      restorePanelBarFallback(item);
      return false;
    }

    const component = findPanelComponent(item, change);
    if (!component) {
      if (change.show === false) continue;
      restorePanelBarFallback(item);
      return false;
    }

    if (!isNoopHiddenChange(component, change)) {
      jobs.push({ component, change });
    }
  }

  let barChange = null;
  let shouldReconcileBar = false;
  for (const { component, change } of jobs) {
    const isBar = component.type === 'bar';
    applyPanelComponentChange(item, component, change, options, {
      deferBarVisual: isBar,
    });
    if (isBar) {
      barChange = mergeComponentProps(barChange ?? {}, change);
    }
    shouldReconcileBar ||=
      isBar || component.type === 'icon' || component.type === 'text';
  }

  if (shouldReconcileBar) {
    reconcilePanelBarVisual(item, barChange, options);
  }
  return true;
};

const canUsePanelRenderer = (item, componentChanges, options) =>
  item?.type === 'item' &&
  options.validateSchema === false &&
  options.mergeStrategy !== 'replace' &&
  Array.isArray(componentChanges);

const ensurePanelComponentCache = (item) => {
  if (
    item._panelComponentCacheLength === item.children.length &&
    !hasDestroyedCachedPanelComponent(item)
  ) {
    return;
  }

  item._panelBackgroundComponent = null;
  item._panelBarComponent = null;
  item._panelIconComponent = null;
  item._panelTextComponent = null;

  for (const child of item.children) {
    const field = COMPONENT_CACHE_FIELDS[child?.type];
    if (field && !item[field]) item[field] = child;
  }
  item._panelComponentCacheLength = item.children.length;
};

const hasDestroyedCachedPanelComponent = (item) =>
  item._panelBackgroundComponent?.destroyed ||
  item._panelBarComponent?.destroyed ||
  item._panelIconComponent?.destroyed ||
  item._panelTextComponent?.destroyed;

const findPanelComponent = (item, change) => {
  if (change.id || change.label) {
    const index = findIndexByPriority(item.children, change);
    return index === -1 ? null : item.children[index];
  }

  const field = COMPONENT_CACHE_FIELDS[change.type];
  return field ? (item[field] ?? null) : null;
};

const getSinglePanelBarComponent = (item) => {
  let bar = null;
  for (const child of item.children ?? []) {
    if (child?.type !== 'bar' || child.destroyed) continue;
    if (bar) return null;
    bar = child;
  }
  return bar;
};

const hasDuplicateUnkeyedTypes = (componentChanges) => {
  const seenTypes = new Set();
  for (const change of componentChanges) {
    if (!change || change.id || change.label) continue;
    if (seenTypes.has(change.type)) return true;
    seenTypes.add(change.type);
  }
  return false;
};

const applyPanelComponentChange = (
  item,
  component,
  change,
  options,
  { deferBarVisual = false } = {},
) => {
  const nextProps = mergeComponentProps(component.props, change);
  component.props = nextProps;
  syncParentComponentProps(item, component, change, options.mergeStrategy);

  if (Object.hasOwn(change, 'show')) {
    component.renderable = component.props.show;
  }
  if (Object.hasOwn(change, 'tint')) {
    component.tint = getColor(component.store.theme, component.props.tint);
  }
  if (Object.hasOwn(change, 'source')) {
    component._applySource?.({ source: component.props.source });
  }

  if (component.type === 'bar' && deferBarVisual) {
    return;
  }

  if (component.type === 'text') {
    applyTextChange(component, change, options);
  }

  if (component.type === 'bar') {
    applyBarChange(component, change);
    return;
  }

  if (needsComponentSize(component, change)) {
    component._applyComponentSize?.({
      source: component.props.source,
      size: component.props.size,
      margin: component.props.margin,
    });
  }
  if (needsPlacement(change)) {
    component._applyPlacement?.({
      placement: component.props.placement,
      margin: component.props.margin,
    });
  }
};

const reconcilePanelBarVisual = (item, change, options) => {
  const bar = getSinglePanelBarComponent(item);
  if (!bar) return;

  if (canUseAggregateBar(item, bar)) {
    const layer = ensurePanelBarLayer(bar.store);
    if (layer?.syncBar(bar)) {
      if (options.deferAggregateBarFlush) {
        options.aggregateBarLayers?.add(layer);
      } else {
        layer.flushParticleChildrenUpdate?.();
      }
      bar.renderable = false;
      bar._patchmapUseAggregateBar = true;
      return;
    }
  }

  restoreBarFallback(bar, change);
};

const canUseAggregateBar = (item, bar) => {
  if (!bar || bar.props?.show === false) return false;
  if (isVisiblePanelComponent(item._panelIconComponent)) return false;
  if (isVisiblePanelComponent(item._panelTextComponent)) return false;
  if (hasUnsafeAggregateEffects(item) || hasUnsafeAggregateEffects(bar)) {
    return false;
  }

  const layer = ensurePanelBarLayer(bar.store);
  return Boolean(layer?.canRender(bar));
};

const isVisiblePanelComponent = (component) =>
  Boolean(component && !component.destroyed && component.props?.show !== false);

const hasUnsafeAggregateEffects = (component) =>
  Boolean(
    component?.mask ||
      component?.filters?.length ||
      (component?.blendMode &&
        component.blendMode !== 'normal' &&
        component.blendMode !== 'inherit'),
  );

const restorePanelBarFallback = (item) => {
  const bar = getSinglePanelBarComponent(item) ?? item?._panelBarComponent;
  if (bar) restoreBarFallback(bar);
};

const restoreBarFallback = (bar, change = null) => {
  const layer = bar?.store?.panelBarLayer;
  layer?.hideBar?.(bar);
  if (!bar) return;
  bar._patchmapUseAggregateBar = false;
  bar.renderable = bar.props?.show !== false;
  if (!bar.renderable) return;

  const fallbackChange = change ?? {
    source: bar.props?.source,
    size: bar.props?.size,
    margin: bar.props?.margin,
    animation: bar.props?.animation,
    animationDuration: bar.props?.animationDuration,
    placement: bar.props?.placement,
  };
  if (Object.hasOwn(fallbackChange, 'source')) {
    bar._applySource?.({ source: bar.props.source });
  }
  applyBarChange(bar, fallbackChange);
};

const applyBarChange = (bar, change) => {
  if (needsAnimatedSize(change)) {
    bar._applyAnimationSize?.({
      animation: bar.props.animation,
      animationDuration: bar.props.animationDuration,
      source: bar.props.source,
      size: bar.props.size,
      margin: bar.props.margin,
    });
    return;
  }

  if (needsPlacement(change)) {
    bar._applyPlacement?.({
      placement: bar.props.placement,
      margin: bar.props.margin,
    });
  }
};

const applyTextChange = (text, change, options) => {
  if (Object.hasOwn(change, 'text') || Object.hasOwn(change, 'split')) {
    text._applyText?.({ text: text.props.text, split: text.props.split });
  }
  if (Object.hasOwn(change, 'style')) {
    text._applyTextstyle?.({ style: change.style }, options);
  }
  if (needsTextLayout(change)) {
    text._applyTextLayout?.({
      text: text.props.text,
      split: text.props.split,
      style: text.props.style,
      margin: text.props.margin,
      size: text.props.size,
    });
  }
  if (needsPlacement(change)) {
    text._applyPlacement?.({
      placement: text.props.placement,
      margin: text.props.margin,
    });
  }
};

const syncParentComponentProps = (item, component, change, mergeStrategy) => {
  const parentComponents = item.props?.components;
  if (!Array.isArray(parentComponents)) return;

  const index = getParentComponentPropsIndex(parentComponents, component);
  if (index === -1) return;

  parentComponents[index] =
    mergeStrategy === 'replace'
      ? { type: component.type, ...change }
      : mergeComponentProps(parentComponents[index], change);
};

const getParentComponentPropsIndex = (parentComponents, component) => {
  const cachedIndex = component._parentComponentPropsIndex;
  if (
    Number.isInteger(cachedIndex) &&
    parentComponents[cachedIndex] &&
    matchesComponent(parentComponents[cachedIndex], component.props)
  ) {
    return cachedIndex;
  }

  const index =
    component.props?.id || component.props?.label
      ? findIndexByPriority(parentComponents, component.props)
      : findParentComponentTypeIndex(parentComponents, component.type);
  component._parentComponentPropsIndex = index;
  return index;
};

const findParentComponentTypeIndex = (parentComponents, type) => {
  for (let index = 0; index < parentComponents.length; index += 1) {
    if (parentComponents[index]?.type === type) return index;
  }
  return -1;
};

const matchesComponent = (left, right) =>
  (right.id && left.id === right.id) ||
  (right.label && left.label === right.label) ||
  left.type === right.type;

const mergeComponentProps = (props = {}, change = {}) => {
  const next = { ...props, type: props.type ?? change.type };

  for (const [key, value] of Object.entries(change)) {
    if (key === 'type') {
      next.type = value;
    } else if (key === 'size') {
      next.size = mergeSize(props.size, value, next.type);
    } else if (key === 'source' || key === 'style') {
      next[key] = mergePlainObject(props[key], value);
    } else if (key === 'margin') {
      next.margin = normalizeBoxSpacing(value);
    } else {
      next[key] = value;
    }
  }

  return next;
};

const mergeSize = (current, patch, type) => {
  if (type === 'background') {
    return {
      width: { value: 100, unit: '%' },
      height: { value: 100, unit: '%' },
    };
  }

  const normalizedPatch = normalizeSizePatch(patch);
  if (
    isPlainObject(current) &&
    isPlainObject(normalizedPatch) &&
    ('width' in normalizedPatch || 'height' in normalizedPatch)
  ) {
    return { ...current, ...normalizedPatch };
  }
  return normalizedPatch;
};

const normalizeSizePatch = (size) => {
  if (typeof size === 'number' || typeof size === 'string') {
    const normalized = normalizePxOrPercent(size);
    return { width: normalized, height: normalized };
  }
  if (!isPlainObject(size)) return size;

  const next = { ...size };
  if (Object.hasOwn(next, 'width')) {
    next.width = normalizePxOrPercent(next.width);
  }
  if (Object.hasOwn(next, 'height')) {
    next.height = normalizePxOrPercent(next.height);
  }
  return next;
};

const normalizePxOrPercent = (value) => {
  if (typeof value === 'number') return { value, unit: 'px' };
  if (typeof value === 'string' && value.endsWith('%')) {
    return { value: Number.parseFloat(value), unit: '%' };
  }
  return value;
};

const mergePlainObject = (current, patch) => {
  if (!isPlainObject(current) || !isPlainObject(patch)) return patch;
  return { ...current, ...patch };
};

const needsAnimatedSize = (change) =>
  Object.hasOwn(change, 'animation') ||
  Object.hasOwn(change, 'animationDuration') ||
  Object.hasOwn(change, 'source') ||
  Object.hasOwn(change, 'size') ||
  Object.hasOwn(change, 'margin');

const needsComponentSize = (component, change) =>
  component.type !== 'text' &&
  (Object.hasOwn(change, 'source') ||
    Object.hasOwn(change, 'size') ||
    Object.hasOwn(change, 'margin'));

const needsPlacement = (change) =>
  Object.hasOwn(change, 'placement') || Object.hasOwn(change, 'margin');

const needsTextLayout = (change) =>
  Object.hasOwn(change, 'text') ||
  Object.hasOwn(change, 'split') ||
  Object.hasOwn(change, 'style') ||
  Object.hasOwn(change, 'margin') ||
  Object.hasOwn(change, 'size');

const isNoopHiddenChange = (component, change) =>
  change?.show === false &&
  component.props?.show === false &&
  component.renderable === false &&
  Object.keys(change).every((key) => key === 'type' || key === 'show');

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

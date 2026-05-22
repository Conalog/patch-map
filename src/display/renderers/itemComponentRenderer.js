import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { getColor } from '../../utils/get';
import { normalizeBoxSpacing } from '../../utils/spacing';
import { getSizeBatcher } from '../animation/sizeBatchTween';
import {
  deactivateAggregateBar,
  ensureAggregateBarLayerForBar,
  getCurrentAggregateBarLayer,
  removeAggregateBar,
  setCurrentAggregateBarLayer,
} from './AggregateBarLayer';

const ITEM_COMPONENT_TYPES = new Set(['background', 'bar', 'icon', 'text']);
const COMPONENT_CACHE_FIELDS = {
  background: '_itemBackgroundComponent',
  bar: '_itemBarComponent',
  icon: '_itemIconComponent',
  text: '_itemTextComponent',
};

export const tryApplyItemComponentChanges = (
  item,
  componentChanges,
  options = {},
) => {
  if (!canUseItemComponentRenderer(item, componentChanges, options))
    return false;
  if (hasDuplicateUnkeyedTypes(componentChanges)) {
    restoreAggregateBarFallback(item, options, {
      suppressNextBarAnimation: hasBarVisualChange(componentChanges),
    });
    return false;
  }

  const jobs = [];
  ensureItemComponentCache(item);

  for (const change of componentChanges) {
    if (!ITEM_COMPONENT_TYPES.has(change?.type)) {
      restoreAggregateBarFallback(item, options, {
        suppressNextBarAnimation: hasBarVisualChange(componentChanges),
      });
      return false;
    }

    const component = findItemComponent(item, change);
    if (!component) {
      if (change.show === false) continue;
      restoreAggregateBarFallback(item, options, {
        suppressNextBarAnimation: hasBarVisualChange(componentChanges),
      });
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
    applyItemComponentChange(item, component, change, options, {
      deferBarVisual: isBar,
    });
    if (isBar) {
      barChange = mergeComponentProps(barChange ?? {}, change);
    }
    shouldReconcileBar ||=
      isBar || component.type === 'icon' || component.type === 'text';
  }

  if (shouldReconcileBar) {
    reconcileAggregateBarVisual(item, barChange, options);
  }
  return true;
};

export const syncAggregateBar = (bar, options = {}) => {
  if (!bar?._patchmapUseAggregateBar) return false;

  const previousLayer = getCurrentAggregateBarLayer(bar);
  const layer = ensureAggregateBarLayerForBar(bar);
  if (previousLayer && previousLayer !== layer) {
    const removedLayer = removeAggregateBar(bar);
    flushOrDeferAggregateBarLayer(removedLayer, options);
  }

  if (!layer?.syncBar(bar)) {
    restoreBarFallback(bar, null, options);
    return false;
  }

  setCurrentAggregateBarLayer(bar, layer);
  if (options.deferAggregateBarFlush) {
    options.aggregateBarLayers?.add(layer);
  } else {
    layer.flushParticleChildrenUpdate?.();
  }
  return true;
};

export const syncAggregateBarForItem = (item, options = {}) => {
  if (item?.type !== 'item') return false;
  const bar = getSingleBarComponent(item) ?? item?._itemBarComponent;
  return syncAggregateBar(bar, options);
};

const canUseItemComponentRenderer = (item, componentChanges, options) =>
  item?.type === 'item' &&
  options.validateSchema === false &&
  options.mergeStrategy !== 'replace' &&
  Array.isArray(componentChanges);

const ensureItemComponentCache = (item) => {
  if (
    item._itemComponentCacheLength === item.children.length &&
    !hasDestroyedCachedItemComponent(item)
  ) {
    return;
  }

  item._itemBackgroundComponent = null;
  item._itemBarComponent = null;
  item._itemIconComponent = null;
  item._itemTextComponent = null;

  for (const child of item.children) {
    const field = COMPONENT_CACHE_FIELDS[child?.type];
    if (field && !item[field]) item[field] = child;
  }
  item._itemComponentCacheLength = item.children.length;
};

const hasDestroyedCachedItemComponent = (item) =>
  item._itemBackgroundComponent?.destroyed ||
  item._itemBarComponent?.destroyed ||
  item._itemIconComponent?.destroyed ||
  item._itemTextComponent?.destroyed;

const findItemComponent = (item, change) => {
  if (change.id || change.label) {
    const index = findIndexByPriority(item.children, change);
    return index === -1 ? null : item.children[index];
  }

  const field = COMPONENT_CACHE_FIELDS[change.type];
  return field ? (item[field] ?? null) : null;
};

const getSingleBarComponent = (item) => {
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

const applyItemComponentChange = (
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

const reconcileAggregateBarVisual = (item, change, options) => {
  const bar = getSingleBarComponent(item);
  if (!bar) return;

  const wasAggregate = bar._patchmapUseAggregateBar === true;
  if (canUseAggregateBar(item, bar)) {
    if (!wasAggregate) {
      applyBarChange(bar, getCurrentBarVisualChange(bar), { instant: true });
    }
    bar._patchmapUseAggregateBar = true;
    if (syncAggregateBar(bar, options)) {
      bar.renderable = false;
      return;
    }
  }

  restoreBarFallback(bar, change, options, { instant: wasAggregate });
};

const canUseAggregateBar = (item, bar) => {
  if (!bar || bar.props?.show === false) return false;
  if (bar.props?.animation === true) return false;
  if (isVisibleItemComponent(item._itemIconComponent)) return false;
  if (isVisibleItemComponent(item._itemTextComponent)) return false;
  if (hasUnsafeAggregateEffects(item) || hasUnsafeAggregateEffects(bar)) {
    return false;
  }

  const layer = ensureAggregateBarLayerForBar(bar);
  return Boolean(layer?.canRender(bar));
};

const isVisibleItemComponent = (component) =>
  Boolean(component && !component.destroyed && component.props?.show !== false);

const hasUnsafeAggregateEffects = (component) =>
  Boolean(
    component?.mask ||
      component?.filters?.length ||
      (component?.blendMode &&
        component.blendMode !== 'normal' &&
        component.blendMode !== 'inherit'),
  );

const restoreAggregateBarFallback = (
  item,
  options = {},
  { suppressNextBarAnimation = false } = {},
) => {
  const bar = getSingleBarComponent(item) ?? item?._itemBarComponent;
  if (bar) {
    restoreBarFallback(bar, null, options, {
      instant: bar._patchmapUseAggregateBar === true,
    });
    if (suppressNextBarAnimation) {
      bar._patchmapSuppressNextSizeAnimation = true;
    }
  }
};

const restoreBarFallback = (
  bar,
  change = null,
  options = {},
  { instant = false } = {},
) => {
  const shouldRemoveAggregateEntry = Boolean(
    change && Object.hasOwn(change, 'source'),
  );
  const layer = shouldRemoveAggregateEntry
    ? removeAggregateBar(bar)
    : deactivateAggregateBar(bar);
  flushOrDeferAggregateBarLayer(layer, options);
  if (!bar) return;
  bar._patchmapUseAggregateBar = false;
  bar.renderable = bar.props?.show !== false;
  if (!bar.renderable) return;

  const fallbackChange = instant
    ? getCurrentBarVisualChange(bar)
    : (change ?? getCurrentBarVisualChange(bar));
  if (Object.hasOwn(fallbackChange, 'source')) {
    bar._applySource?.({ source: bar.props.source });
  }
  applyBarChange(bar, fallbackChange, { instant });
};

const flushOrDeferAggregateBarLayer = (layer, options) => {
  if (!layer) return;
  if (options.deferAggregateBarFlush) {
    options.aggregateBarLayers?.add(layer);
    return;
  }
  layer.flushParticleChildrenUpdate?.();
};

const getCurrentBarVisualChange = (bar) => ({
  source: bar.props?.source,
  size: bar.props?.size,
  margin: bar.props?.margin,
  animation: bar.props?.animation,
  animationDuration: bar.props?.animationDuration,
  placement: bar.props?.placement,
});

const applyBarChange = (bar, change, { instant = false } = {}) => {
  if (needsAnimatedSize(change)) {
    if (instant) {
      cancelBarSizeAnimation(bar);
    }
    bar._applyAnimationSize?.({
      animation: instant ? false : bar.props.animation,
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

const cancelBarSizeAnimation = (bar) => {
  const job = bar?._sizeAnimJob;
  if (!job) return;

  const batcher = getSizeBatcher(bar.store);
  if (batcher) {
    batcher.cancel(job);
  } else {
    job.cancelled = true;
    job.done = true;
  }
  bar._sizeAnimJob = null;
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
      next[key] = mergePlainObjectDeep(props[key], value);
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

const mergePlainObjectDeep = (current, patch) => {
  if (!isPlainObject(current) || !isPlainObject(patch)) return patch;
  return deepMerge(current, patch);
};

const needsAnimatedSize = (change) =>
  Object.hasOwn(change, 'animation') ||
  Object.hasOwn(change, 'animationDuration') ||
  Object.hasOwn(change, 'source') ||
  Object.hasOwn(change, 'size') ||
  Object.hasOwn(change, 'margin');

const hasBarVisualChange = (componentChanges) =>
  componentChanges.some(
    (change) => change?.type === 'bar' && needsAnimatedSize(change),
  );

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

import { deepMerge } from '../../utils/deepmerge/deepmerge';
import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { getColor } from '../../utils/get';
import { normalizeBoxSpacing } from '../../utils/spacing';
import { getSizeBatcher } from '../animation/sizeBatchTween';
import { newComponent } from '../components/creator';
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
const SCHEDULED_AGGREGATE_BAR_SYNC_BUDGET_MS = 4;
const QUEUED_AGGREGATE_BAR_SYNCS = new Set();
const QUEUED_AGGREGATE_BAR_LAYERS = new Set();
let aggregateBarFlushScheduled = false;

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

  ensureItemComponentCache(item);
  if (tryApplyItemBarStateChange(item, componentChanges, options)) return true;

  const jobs = [];

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
      const props = findItemComponentProps(item, change);
      if (!props) {
        restoreAggregateBarFallback(item, options, {
          suppressNextBarAnimation: hasBarVisualChange(componentChanges),
        });
        return false;
      }
      jobs.push({
        component: null,
        change,
        nextProps: mergeComponentProps(props, change),
      });
      continue;
    }

    const nextProps = mergeComponentProps(component.props, change);
    if (!isEqualValue(component.props, nextProps)) {
      jobs.push({ component, change, nextProps });
    }
  }

  let barChange = null;
  let shouldReconcileBar = false;
  for (const { component, change, nextProps } of jobs) {
    const targetComponent =
      component ?? createItemComponent(item, change, nextProps, options);
    const isBar = targetComponent.type === 'bar';
    if (component) {
      applyItemComponentChange(
        item,
        targetComponent,
        change,
        nextProps,
        options,
        {
          deferBarVisual: isBar,
        },
      );
    }
    if (isBar) {
      barChange = mergeComponentProps(barChange ?? {}, change);
    }
    shouldReconcileBar ||=
      isBar ||
      targetComponent.type === 'icon' ||
      targetComponent.type === 'text';
  }

  if (shouldReconcileBar) {
    reconcileAggregateBarVisual(item, barChange, options);
  }
  return true;
};

const tryApplyItemBarStateChange = (item, componentChanges, options) => {
  if (!isItemBarStateChange(componentChanges)) return false;

  const barChange = componentChanges[0];
  let bar = findItemComponent(item, barChange);
  const baseProps = bar ? bar.props : findItemComponentProps(item, barChange);
  if (!baseProps) return false;

  const nextProps = mergeComponentProps(baseProps, barChange);
  if (!bar) {
    bar = createItemComponent(item, barChange, nextProps, options);
  } else if (!isEqualValue(bar.props, nextProps)) {
    bar.props = nextProps;
    syncParentComponentProps(item, bar, barChange, options.mergeStrategy);
    if (Object.hasOwn(barChange, 'show')) {
      bar.renderable = bar.props.show;
    }
    if (Object.hasOwn(barChange, 'tint')) {
      bar.tint = getColor(bar.store.theme, bar.props.tint);
    }
  }

  const barChanged = !isEqualValue(baseProps, nextProps);
  const iconChanged = needsHideItemComponent(item, 'icon');
  const textChanged = needsHideItemComponent(item, 'text');
  if (!barChanged && !iconChanged && !textChanged) return true;

  if (iconChanged) {
    hideItemComponent(item, 'icon', componentChanges[1], options.mergeStrategy);
  }
  if (textChanged) {
    hideItemComponent(item, 'text', componentChanges[2], options.mergeStrategy);
  }
  reconcileAggregateBarVisual(item, barChange, options);
  return true;
};

const isItemBarStateChange = (componentChanges) => {
  if (componentChanges.length !== 3) return false;
  const [barChange, iconChange, textChange] = componentChanges;
  return (
    barChange?.type === 'bar' &&
    !barChange.id &&
    !barChange.label &&
    iconChange?.type === 'icon' &&
    iconChange.show === false &&
    textChange?.type === 'text' &&
    textChange.show === false
  );
};

export const syncAggregateBar = (bar, options = {}) => {
  if (
    options.immediateAggregateBarSync === true ||
    options.deferAggregateBarFlush
  ) {
    return syncAggregateBarNow(bar, options);
  }
  return queueAggregateBarSync(bar, options);
};

const syncAggregateBarNow = (bar, options = {}) => {
  if (!bar?._patchmapUseAggregateBar) return false;

  const previousLayer = getCurrentAggregateBarLayer(bar);
  const layer = ensureAggregateBarLayerForBar(bar);
  if (previousLayer && previousLayer !== layer) {
    const removedLayer = removeAggregateBar(bar);
    flushOrDeferAggregateBarLayer(removedLayer, options);
  }

  if (!layer?.syncBar(bar, options)) {
    restoreBarFallback(bar, null, options);
    return false;
  }

  setCurrentAggregateBarLayer(bar, layer);
  if (options.deferAggregateBarFlush) {
    options.aggregateBarLayers?.add(layer);
  } else {
    queueAggregateBarLayerFlush(layer);
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

const findItemComponentProps = (item, change) => {
  const components = item?.props?.components;
  if (!Array.isArray(components)) return null;
  const index = findIndexByPriority(components, change);
  return index === -1 ? null : components[index];
};

const createItemComponent = (item, change, nextProps, options) => {
  const component = newComponent(nextProps.type ?? change.type, item.store);
  item.addChild(component);
  component._applyInitialTrusted(nextProps, {
    ...options,
    changes: nextProps,
    validateSchema: false,
    normalize: false,
  });
  syncParentComponentProps(item, component, nextProps, 'replace');
  const cacheField = COMPONENT_CACHE_FIELDS[component.type];
  if (cacheField) {
    item[cacheField] = component;
    item._itemComponentCacheLength = item.children.length;
  }
  component._parentComponentPropsIndex = getParentComponentPropsIndex(
    item.props?.components ?? [],
    component,
  );
  return component;
};

const needsHideItemComponent = (item, type) => {
  const component = item[COMPONENT_CACHE_FIELDS[type]];
  if (component && !component.destroyed) {
    return component.props?.show !== false || component.renderable !== false;
  }

  const parentComponents = item.props?.components;
  if (!Array.isArray(parentComponents)) return false;
  const index = findIndexByPriority(parentComponents, { type });
  if (index === -1) return false;
  return parentComponents[index]?.show !== false;
};

const hideItemComponent = (item, type, change, mergeStrategy) => {
  const component = item[COMPONENT_CACHE_FIELDS[type]];
  if (component && !component.destroyed) {
    if (component.props?.show !== false) {
      component.props = mergeComponentProps(component.props, change);
      component.renderable = false;
    }
    syncParentComponentProps(item, component, change, mergeStrategy);
    return;
  }

  syncParentComponentChange(item, change, mergeStrategy);
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
  nextProps,
  options,
  { deferBarVisual = false } = {},
) => {
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
    let syncOptions = options;
    if (!wasAggregate) {
      applyBarChange(bar, getCurrentBarVisualChange(bar), { instant: true });
      syncOptions = { ...options, suppressAggregateBarAnimation: true };
    }
    bar._patchmapUseAggregateBar = true;
    if (syncAggregateBar(bar, syncOptions)) {
      bar.renderable = false;
      return;
    }
  }

  restoreBarFallback(bar, change, options, { instant: wasAggregate });
};

const canUseAggregateBar = (item, bar) => {
  if (!bar || bar.props?.show === false) return false;
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
  queueAggregateBarLayerFlush(layer);
};

export const flushQueuedAggregateBarLayers = ({
  frameBudgetMs = Number.POSITIVE_INFINITY,
} = {}) => {
  if (
    QUEUED_AGGREGATE_BAR_SYNCS.size === 0 &&
    QUEUED_AGGREGATE_BAR_LAYERS.size === 0
  ) {
    aggregateBarFlushScheduled = false;
    return;
  }

  const startedAt = now();
  aggregateBarFlushScheduled = false;
  while (
    QUEUED_AGGREGATE_BAR_SYNCS.size > 0 ||
    QUEUED_AGGREGATE_BAR_LAYERS.size > 0
  ) {
    while (QUEUED_AGGREGATE_BAR_SYNCS.size > 0) {
      const bar = QUEUED_AGGREGATE_BAR_SYNCS.values().next().value;
      QUEUED_AGGREGATE_BAR_SYNCS.delete(bar);
      const syncOptions = bar?._patchmapQueuedAggregateBarOptions ?? {};
      if (bar) bar._patchmapQueuedAggregateBarOptions = null;
      syncAggregateBarNow(bar, {
        ...syncOptions,
        immediateAggregateBarSync: true,
      });
      if (
        QUEUED_AGGREGATE_BAR_SYNCS.size + QUEUED_AGGREGATE_BAR_LAYERS.size >
          0 &&
        now() - startedAt >= frameBudgetMs
      ) {
        scheduleAggregateBarFlush();
        return;
      }
    }

    while (QUEUED_AGGREGATE_BAR_LAYERS.size > 0) {
      const layer = QUEUED_AGGREGATE_BAR_LAYERS.values().next().value;
      QUEUED_AGGREGATE_BAR_LAYERS.delete(layer);
      layer?.flushParticleChildrenUpdate?.();
      if (
        QUEUED_AGGREGATE_BAR_SYNCS.size + QUEUED_AGGREGATE_BAR_LAYERS.size >
          0 &&
        now() - startedAt >= frameBudgetMs
      ) {
        scheduleAggregateBarFlush();
        return;
      }
    }
  }
};

const queueAggregateBarSync = (bar, options) => {
  if (!bar || bar.destroyed) return false;
  bar._patchmapQueuedAggregateBarOptions = {
    ...(bar._patchmapQueuedAggregateBarOptions ?? {}),
    ...options,
  };
  QUEUED_AGGREGATE_BAR_SYNCS.add(bar);
  scheduleAggregateBarFlush();
  return true;
};

const queueAggregateBarLayerFlush = (layer) => {
  if (!layer || layer.destroyed) return;
  QUEUED_AGGREGATE_BAR_LAYERS.add(layer);
  scheduleAggregateBarFlush();
};

const scheduleAggregateBarFlush = () => {
  if (aggregateBarFlushScheduled) return;

  aggregateBarFlushScheduled = true;
  requestFrame(() =>
    flushQueuedAggregateBarLayers({
      frameBudgetMs: SCHEDULED_AGGREGATE_BAR_SYNC_BUDGET_MS,
    }),
  );
};

const requestFrame = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(callback, 16);
};

const now = () => {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
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

const syncParentComponentChange = (item, change, mergeStrategy) => {
  const parentComponents = item.props?.components;
  if (!Array.isArray(parentComponents)) return;

  const index = findIndexByPriority(parentComponents, change);
  if (index === -1) return;
  parentComponents[index] =
    mergeStrategy === 'replace'
      ? { type: change.type, ...change }
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

const isEqualValue = (left, right) => {
  if (Object.is(left, right)) return true;
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!isEqualValue(left[index], right[index])) return false;
    }
    return true;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.hasOwn(right, key)) return false;
    if (!isEqualValue(left[key], right[key])) return false;
  }
  return true;
};

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

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

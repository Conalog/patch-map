import { findIndexByPriority } from '../../utils/findIndexByPriority';
import { getColor } from '../../utils/get';
import { newComponent } from '../components/creator';
import { ensurePanelBarLayer } from './PanelBarLayer';

const SUPPORTED_TYPES = new Set(['background', 'bar', 'icon', 'text']);
const FRAME_BUDGET_MS = 2;
const QUEUE_BY_STORE = new WeakMap();
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
  if (tryApplyPanelBarStateChange(item, componentChanges, options)) return true;
  if (hasDuplicateUnkeyedTypes(componentChanges)) return false;

  const jobs = [];
  for (const change of componentChanges) {
    if (!SUPPORTED_TYPES.has(change?.type)) return false;

    const component = findPanelComponent(item, change);
    if (!component) {
      if (change.show === false) continue;
      return false;
    }

    if (!isNoopHiddenChange(component, change)) {
      jobs.push({ component, change });
    }
  }

  for (const { component, change } of jobs) {
    applyPanelComponentChange(item, component, change, options);
  }
  return true;
};

export const primePanelComponentCache = (
  item,
  { materializeHiddenBar = false } = {},
) => {
  if (item?.type !== 'item' || !Array.isArray(item.children)) return;
  ensurePanelComponentCache(item);
  if (materializeHiddenBar && !item._panelBarComponent) {
    createPanelBarComponent(item);
  }
};

const tryApplyPanelBarStateChange = (item, componentChanges, options) => {
  if (!isPanelBarStateChange(componentChanges)) return false;

  const barChange = componentChanges[0];
  const bar =
    getPanelComponentByType(item, 'bar') ?? createPanelBarComponent(item);
  if (!bar) return false;

  applyBarProps(bar, barChange);
  hidePanelComponent(getPanelComponentByType(item, 'icon'));
  hidePanelComponent(getPanelComponentByType(item, 'text'));
  markPanelBarVisualDirty(bar, barChange, options);
  return true;
};

const isPanelBarStateChange = (componentChanges) => {
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

const getPanelComponentByType = (item, type) => {
  const field = COMPONENT_CACHE_FIELDS[type];
  if (!field) return null;
  ensurePanelComponentCache(item);
  return item[field] ?? null;
};

const createPanelBarComponent = (item) => {
  const baseProps = getParentComponentPropsByType(item, 'bar');
  if (!baseProps?.source) return null;

  const bar = newComponent('bar', item.store);
  bar.props = {
    type: 'bar',
    show: false,
    placement: 'bottom',
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    animation: true,
    animationDuration: 200,
    tint: 0xffffff,
    ...baseProps,
  };
  if (bar.props.id) bar.id = bar.props.id;
  if (bar.props.label) bar.label = bar.props.label;
  bar.renderable = false;
  bar._patchmapNeedsInitialSource = true;
  primeVisualQueueFields(bar);
  item.addChild(bar);
  item._panelBarComponent = bar;
  item._panelComponentCacheLength = item.children.length;
  const layer = ensurePanelBarLayer(item.store);
  if (layer?.canRender(bar)) {
    bar._patchmapUseAggregateBar = true;
  }
  return bar;
};

const getParentComponentPropsByType = (item, type) => {
  const components = item.props?.components;
  if (!Array.isArray(components)) return null;
  for (const componentProps of components) {
    if (componentProps?.type === type) return componentProps;
  }
  return null;
};

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
    primeVisualQueueFields(child);
  }
  item._panelComponentCacheLength = item.children.length;
};

const hasDestroyedCachedPanelComponent = (item) =>
  item._panelBackgroundComponent?.destroyed ||
  item._panelBarComponent?.destroyed ||
  item._panelIconComponent?.destroyed ||
  item._panelTextComponent?.destroyed;

const primeVisualQueueFields = (component) => {
  if (!component || component._patchmapVisualQueuePrimed) return;
  component._patchmapQueuedVisualQueue = null;
  component._patchmapQueuedVisualChange = null;
  component._patchmapQueuedVisualOptions = null;
  component._patchmapPanelBarDirty = false;
  component._patchmapUseAggregateBar = false;
  component._patchmapVisualQueuePrimed = true;
};

const applyBarProps = (bar, change) => {
  const props = bar.props;
  if (Object.hasOwn(change, 'show')) props.show = change.show;
  if (Object.hasOwn(change, 'size')) {
    props.size = mergeSize(props.size, change.size, props.type);
  }
  if (Object.hasOwn(change, 'tint')) props.tint = change.tint;
  if (Object.hasOwn(change, 'animation')) props.animation = change.animation;
  if (Object.hasOwn(change, 'animationDuration')) {
    props.animationDuration = change.animationDuration;
  }
  if (Object.hasOwn(change, 'source')) {
    props.source = mergeObject(props.source, change.source);
    bar._patchmapAggregateTextureSource = null;
    bar._patchmapAggregateTexture = null;
  }
  if (Object.hasOwn(change, 'margin')) props.margin = change.margin;
};

const applyTint = (component, tint) => {
  if (component._patchmapAppliedTint === tint) return;
  component.tint = getColor(component.store.theme, tint);
  component._patchmapAppliedTint = tint;
};

const hidePanelComponent = (component) => {
  if (!component || component.props?.show === false) return;
  component.props.show = false;
  component.renderable = false;
};

const hasDuplicateUnkeyedTypes = (componentChanges) => {
  for (let index = 0; index < componentChanges.length; index += 1) {
    const change = componentChanges[index];
    if (!change || change.id || change.label) continue;
    for (
      let nextIndex = index + 1;
      nextIndex < componentChanges.length;
      nextIndex += 1
    ) {
      const nextChange = componentChanges[nextIndex];
      if (
        nextChange &&
        !nextChange.id &&
        !nextChange.label &&
        nextChange.type === change.type
      ) {
        return true;
      }
    }
  }
  return false;
};

const findPanelComponent = (item, change) => {
  if (change.id || change.label) {
    const index = findIndexByPriority(item.children, change);
    return index === -1 ? null : item.children[index];
  }

  return getPanelComponentByType(item, change.type);
};

const canUsePanelRenderer = (item, componentChanges, options) =>
  item?.type === 'item' &&
  options.validateSchema === false &&
  options.mergeStrategy !== 'replace' &&
  Array.isArray(componentChanges);

const applyPanelComponentChange = (item, component, change, options) => {
  if (isNoopHiddenChange(component, change)) return;

  if (component.type === 'bar') {
    hideAggregatedBar(component);
  }

  component.props = mergeComponentProps(component.props, change);
  syncParentComponentProps(item, component, change, options.mergeStrategy);

  if (Object.hasOwn(change, 'show')) {
    component.renderable = component.props.show;
  }
  if (Object.hasOwn(change, 'tint')) {
    component.tint = getColor(component.store.theme, component.props.tint);
  }

  if (needsDeferredVisualWork(component, change)) {
    enqueueVisualChange(component, change, options);
    return;
  }

  if (component.type === 'text') {
    applyTextChange(component, change, options);
  }

  if (needsSize(component, change)) {
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

const enqueueVisualChange = (
  component,
  change,
  options,
  { cloneChange = true } = {},
) => {
  const queue = ensureVisualQueue(component.store);
  if (!queue) {
    applyDeferredVisualChange(component, change, options);
    return;
  }

  if (component._patchmapQueuedVisualQueue === queue) {
    mergeQueuedChange(component._patchmapQueuedVisualChange, change);
    component._patchmapQueuedVisualOptions = options;
  } else {
    component._patchmapQueuedVisualQueue = queue;
    component._patchmapQueuedVisualChange = cloneChange
      ? { ...change }
      : change;
    component._patchmapQueuedVisualOptions = options;
    queue.jobs.push(component);
  }
  scheduleFlush(queue);
};

const markPanelBarVisualDirty = (component, change, options) => {
  const queue = ensureVisualQueue(component.store);
  if (!queue) {
    applyDeferredVisualChange(component, change, options);
    return;
  }

  const layer = ensurePanelBarLayer(component.store);
  component._patchmapUseAggregateBar = Boolean(layer?.canRender(component));
  if (component._patchmapPanelBarDirty) {
    mergeQueuedChange(component._patchmapQueuedVisualChange, change);
  } else {
    component._patchmapPanelBarDirty = true;
    component._patchmapQueuedVisualChange = change;
    queue.dirtyPanelBars.push(component);
  }
  component._patchmapQueuedVisualOptions = options;
  scheduleFlush(queue);
};

const ensureVisualQueue = (store) => {
  if (!store) return null;
  let queue = QUEUE_BY_STORE.get(store);
  if (!queue) {
    queue = {
      store,
      jobs: [],
      index: 0,
      scheduled: false,
      dirtyPanelBars: [],
      dirtyPanelBarIndex: 0,
    };
    QUEUE_BY_STORE.set(store, queue);
  }
  return queue;
};

const scheduleFlush = (queue) => {
  if (queue.scheduled) return;
  queue.scheduled = true;
  requestFrame(() => flushVisualQueue(queue));
};

const flushVisualQueue = (queue) => {
  queue.scheduled = false;
  const startedAt = now();

  while (queue.index < queue.jobs.length) {
    const component = queue.jobs[queue.index];
    queue.index += 1;
    const change = component._patchmapQueuedVisualChange;
    const options = component._patchmapQueuedVisualOptions;
    if (component._patchmapQueuedVisualQueue === queue) {
      component._patchmapQueuedVisualQueue = null;
      component._patchmapQueuedVisualChange = null;
      component._patchmapQueuedVisualOptions = null;
    }
    if (!component.destroyed) {
      applyDeferredVisualChange(component, change, options);
    }
    if (
      queue.index < queue.jobs.length &&
      now() - startedAt >= FRAME_BUDGET_MS
    ) {
      scheduleFlush(queue);
      return;
    }
  }

  queue.jobs = [];
  queue.index = 0;

  flushDirtyPanelBars(queue, startedAt);
};

const flushDirtyPanelBars = (queue, startedAt) => {
  if (queue.dirtyPanelBars.length === 0) return;

  while (queue.dirtyPanelBarIndex < queue.dirtyPanelBars.length) {
    const bar = queue.dirtyPanelBars[queue.dirtyPanelBarIndex];
    queue.dirtyPanelBarIndex += 1;
    if (bar?._patchmapPanelBarDirty) {
      const change = bar._patchmapQueuedVisualChange;
      const options = bar._patchmapQueuedVisualOptions;
      bar._patchmapPanelBarDirty = false;
      bar._patchmapQueuedVisualChange = null;
      bar._patchmapQueuedVisualOptions = null;
      if (bar.destroyed) {
        continue;
      }
      const layer = bar._patchmapUseAggregateBar
        ? ensurePanelBarLayer(bar.store)
        : null;
      if (layer?.syncBar(bar)) {
        bar.renderable = false;
        bar._patchmapNeedsInitialSource = false;
      } else {
        hideAggregatedBar(bar);
        applyDeferredVisualChange(bar, change, options);
      }
    }
    if (
      queue.dirtyPanelBarIndex < queue.dirtyPanelBars.length &&
      now() - startedAt >= FRAME_BUDGET_MS
    ) {
      scheduleFlush(queue);
      return;
    }
  }

  queue.dirtyPanelBars = [];
  queue.dirtyPanelBarIndex = 0;
};

const applyDeferredVisualChange = (component, change, options) => {
  if (Object.hasOwn(change, 'show')) {
    component.renderable = component.props.show;
  }

  if (Object.hasOwn(change, 'tint')) {
    applyTint(component, change.tint);
  }

  if (
    component._patchmapNeedsInitialSource ||
    Object.hasOwn(change, 'source')
  ) {
    component._patchmapNeedsInitialSource = false;
    component._applySource?.({ source: component.props.source });
  }

  if (component.type === 'bar') {
    applyBarChange(component, change);
    return;
  }

  if (component.type === 'text') {
    applyTextChange(component, change, options);
  }

  if (needsSize(component, change)) {
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

const mergeQueuedChange = (current, change) => {
  Object.assign(current, change);
  return current;
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
  }
  if (needsPlacement(change) && !needsAnimatedSize(change)) {
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
};

const hideAggregatedBar = (bar) => {
  const layer = bar?.store?.panelBarLayer;
  layer?.hideBar?.(bar);
  if (bar) bar._patchmapUseAggregateBar = false;
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

  if (!component.props?.id && !component.props?.label) {
    const index = getParentComponentTypeIndex(parentComponents, component.type);
    component._parentComponentPropsIndex = index;
    return index;
  }

  const index = findIndexByPriority(parentComponents, component.props);
  component._parentComponentPropsIndex = index;
  return index;
};

const getParentComponentTypeIndex = (parentComponents, type) => {
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
      next[key] = mergeObject(props[key], value);
    } else if (key === 'margin') {
      next.margin = value;
    } else {
      next[key] = value;
    }
  }
  return next;
};

const mergeObject = (current, patch) => {
  if (!isPlainObject(current) || !isPlainObject(patch)) return patch;
  return { ...current, ...patch };
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

const needsAnimatedSize = (change) =>
  Object.hasOwn(change, 'animation') ||
  Object.hasOwn(change, 'animationDuration') ||
  Object.hasOwn(change, 'source') ||
  Object.hasOwn(change, 'size') ||
  Object.hasOwn(change, 'margin');

const needsSize = (component, change) =>
  component.type !== 'text' &&
  (Object.hasOwn(change, 'source') ||
    Object.hasOwn(change, 'size') ||
    Object.hasOwn(change, 'margin'));

const needsPlacement = (change) =>
  Object.hasOwn(change, 'placement') || Object.hasOwn(change, 'margin');

const needsDeferredVisualWork = (component, change) =>
  Object.hasOwn(change, 'source') ||
  needsSize(component, change) ||
  (component.type === 'bar' && needsAnimatedSize(change)) ||
  (component.type === 'text' &&
    (Object.hasOwn(change, 'text') ||
      Object.hasOwn(change, 'split') ||
      Object.hasOwn(change, 'style')));

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const isNoopHiddenChange = (component, change) =>
  change?.show === false &&
  component.props?.show === false &&
  component.renderable === false &&
  Object.keys(change).every((key) => key === 'type' || key === 'show');

const requestFrame = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
};

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

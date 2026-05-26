import {
  Particle,
  ParticleContainer,
  Point,
  Rectangle,
  Texture,
} from 'pixi.js';
import { getTexture } from '../../assets/textures/texture';
import { getColor } from '../../utils/get';

const DEFAULT_BOUNDS = new Rectangle(
  -1_000_000,
  -1_000_000,
  2_000_000,
  2_000_000,
);
const TEMP_POINT = new Point();
const TEMP_ORIGIN = new Point();
const TEMP_X_EDGE = new Point();
const TEMP_Y_EDGE = new Point();

export class AggregateBarLayer extends ParticleContainer {
  constructor(store, textureSource = null) {
    super({
      boundsArea: DEFAULT_BOUNDS,
      dynamicProperties: {
        vertex: true,
        position: true,
        rotation: true,
        uvs: true,
        color: true,
      },
    });
    this._patchmapInternal = true;
    this.label = 'patchmap-aggregate-bar-layer';
    this.store = store;
    this.textureSource = textureSource;
    this.zIndex = 0;
    this._entries = new WeakMap();
    this._activeAnimations = new Set();
    this._animationFrame = null;
    this._needsParticleChildrenUpdate = false;
  }

  canRender(bar) {
    return Boolean(getBarTexture(bar));
  }

  syncBar(bar, options = {}) {
    if (!bar?.parent || bar.destroyed) return false;

    const texture = getBarTexture(bar);
    if (!texture) return false;
    if (this.textureSource && texture.source !== this.textureSource) {
      return false;
    }

    let entry = this._entries.get(bar);
    if (!entry) {
      entry = this._createEntry(bar, texture);
    } else if (entry.texture !== texture) {
      this._setEntryTexture(entry, texture);
    }

    const alpha = this._resolveAlpha(bar);
    const tint = getColor(bar.store.theme, bar.props?.tint ?? 0xffffff);
    this._applyAppearance(entry, { alpha, tint });

    if (alpha === 0) {
      this._cancelEntryAnimation(entry);
      return true;
    }

    const nextState = this._resolveState(bar);
    const shouldAnimate = Boolean(
      bar.props?.animation &&
        entry.state &&
        options.suppressAggregateBarAnimation !== true,
    );
    if (
      shouldAnimate &&
      !hasSameState(entry.state, nextState) &&
      this._animateEntry(entry, bar, texture, nextState)
    ) {
      return true;
    }

    this._cancelEntryAnimation(entry);
    this._applyState(entry, texture, nextState);
    return true;
  }

  hideBar(bar) {
    const entry = this._entries.get(bar);
    if (entry) {
      this._cancelEntryAnimation(entry);
      this._applyAppearance(entry, { alpha: 0 });
    }
  }

  deactivateBar(bar) {
    const entry = this._entries.get(bar);
    if (!entry) return false;

    this._cancelEntryAnimation(entry);
    this._applyAppearance(entry, { alpha: 0 });
    return true;
  }

  removeBar(bar) {
    const entry = this._entries.get(bar);
    if (!entry) return;

    this._cancelEntryAnimation(entry);
    this._removeEntryParticles(entry);
    this._entries.delete(bar);
  }

  flushParticleChildrenUpdate() {
    if (!this._needsParticleChildrenUpdate) return;
    this._needsParticleChildrenUpdate = false;
    this.update();
  }

  destroy(options) {
    if (this._animationFrame !== null) {
      cancelFrame(this._animationFrame);
      this._animationFrame = null;
    }
    this._activeAnimations.clear();
    this._entries = new WeakMap();
    this._needsParticleChildrenUpdate = false;
    super.destroy(options);
  }

  _createEntry(bar, texture) {
    const entry = {
      texture: null,
      layout: null,
      particles: [],
      state: null,
      animation: null,
    };
    this._setEntryTexture(entry, texture);
    this._entries.set(bar, entry);
    return entry;
  }

  _setEntryTexture(entry, texture) {
    const layout = getNineSliceLayout(texture);
    const particles = layout.pieces.map(
      (piece) =>
        new Particle({
          texture: piece.texture,
          anchorX: 0,
          anchorY: 0,
          alpha: 0,
        }),
    );

    this._removeEntryParticles(entry);
    this.particleChildren.push(...particles);
    entry.texture = texture;
    entry.layout = layout;
    entry.particles = particles;
    this._needsParticleChildrenUpdate = true;
  }

  _removeEntryParticles(entry) {
    if (!entry.particles?.length) return;

    const particles = new Set(entry.particles);
    this.particleChildren = this.particleChildren.filter(
      (particle) => !particles.has(particle),
    );
    this._needsParticleChildrenUpdate = true;
  }

  _applyAppearance(entry, { alpha, tint }) {
    if (alpha !== undefined) entry.alpha = alpha;
    for (const particle of entry.particles) {
      if (alpha !== undefined) particle.alpha = alpha;
      if (tint !== undefined) particle.tint = tint;
    }
  }

  _animateEntry(entry, bar, texture, nextState) {
    this._cancelEntryAnimation(entry);
    const fromState = cloneState(entry.state);
    const durationMs = normalizeDuration(bar.props?.animationDuration);
    if (durationMs === 0) {
      this._applyState(entry, texture, nextState);
      return true;
    }

    entry.animation = {
      texture,
      from: fromState,
      to: nextState,
      durationMs,
      startedAt: now(),
    };
    this._activeAnimations.add(entry);
    this._scheduleAnimationFrame();
    return true;
  }

  _cancelEntryAnimation(entry) {
    if (!entry?.animation) return;
    entry.animation = null;
    this._activeAnimations.delete(entry);
  }

  _applyState(entry, texture, state, rotation = state.rotation) {
    this._applyStateValues(
      entry,
      texture,
      state.x,
      state.y,
      state.width ?? state.w,
      state.height ?? state.h,
      rotation ?? 0,
    );
  }

  _applyInterpolatedState(entry, animation, progress) {
    const from = animation.from;
    const to = animation.to;
    this._applyStateValues(
      entry,
      animation.texture,
      lerp(from.x, to.x, progress),
      lerp(from.y, to.y, progress),
      lerp(from.width, to.width, progress),
      lerp(from.height, to.height, progress),
      to.rotation,
    );
  }

  _applyStateValues(entry, texture, x, y, width, height, rotation) {
    const layout = entry.layout ?? getNineSliceLayout(texture);
    if (layout.borderless) {
      this._applyBorderlessState(entry, layout, x, y, width, height, rotation);
      return;
    }

    const state = updateEntryState(entry, x, y, width, height, rotation);
    const targetSlices = resolveTargetSlices(layout, state);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    for (let index = 0; index < entry.particles.length; index += 1) {
      const particle = entry.particles[index];
      const piece = layout.pieces[index];
      const target = targetSlices[index];
      applyParticleState(
        particle,
        piece,
        target?.x,
        target?.y,
        target?.width,
        target?.height,
        x,
        y,
        cos,
        sin,
        rotation,
        entry.alpha,
      );
    }
  }

  _applyBorderlessState(entry, layout, x, y, width, height, rotation) {
    updateEntryState(entry, x, y, width, height, rotation);
    const borderScale = resolveBorderScaleForSize(layout, width, height);
    const left = layout.slice.leftWidth * borderScale;
    const right = layout.slice.rightWidth * borderScale;
    const top = layout.slice.topHeight * borderScale;
    const bottom = layout.slice.bottomHeight * borderScale;
    const centerWidth = Math.max(0, width - left - right);
    const centerHeight = Math.max(0, height - top - bottom);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const particles = entry.particles;
    const pieces = layout.pieces;

    applyParticleState(
      particles[0],
      pieces[0],
      0,
      0,
      left,
      top,
      x,
      y,
      cos,
      sin,
      rotation,
      entry.alpha,
    );
    applyParticleState(
      particles[1],
      pieces[1],
      width - right,
      0,
      right,
      top,
      x,
      y,
      cos,
      sin,
      rotation,
      entry.alpha,
    );
    applyParticleState(
      particles[2],
      pieces[2],
      0,
      height - bottom,
      left,
      bottom,
      x,
      y,
      cos,
      sin,
      rotation,
      entry.alpha,
    );
    applyParticleState(
      particles[3],
      pieces[3],
      width - right,
      height - bottom,
      right,
      bottom,
      x,
      y,
      cos,
      sin,
      rotation,
      entry.alpha,
    );
    applyParticleState(
      particles[4],
      pieces[4],
      0,
      top,
      width,
      centerHeight,
      x,
      y,
      cos,
      sin,
      rotation,
      entry.alpha,
    );
    applyParticleState(
      particles[5],
      pieces[5],
      left,
      0,
      centerWidth,
      height,
      x,
      y,
      cos,
      sin,
      rotation,
      entry.alpha,
    );
  }

  _resolveState(bar) {
    const origin = resolveBarLayerPoint(this, bar, 0, 0, TEMP_ORIGIN);
    const xEdge = resolveBarLayerPoint(this, bar, bar.width, 0, TEMP_X_EDGE);
    const yEdge = resolveBarLayerPoint(this, bar, 0, bar.height, TEMP_Y_EDGE);
    const dx = xEdge.x - origin.x;
    const dy = xEdge.y - origin.y;
    const yDx = yEdge.x - origin.x;
    const yDy = yEdge.y - origin.y;
    const width = Math.hypot(dx, dy);
    const height = Math.hypot(yDx, yDy);

    return {
      x: origin.x,
      y: origin.y,
      width,
      height,
      rotation: width > 0 ? Math.atan2(dy, dx) : 0,
    };
  }

  _resolveAlpha(bar) {
    if (bar.props?.show === false) return 0;

    let alpha = 1;
    let current = bar;
    while (current && current !== this.parent) {
      alpha *= current.alpha ?? 1;
      current = current.parent ?? null;
    }
    return alpha;
  }

  _scheduleAnimationFrame() {
    if (this._animationFrame !== null) return;
    this._animationFrame = requestFrame((time) => {
      this._animationFrame = null;
      this._tickAnimations(time ?? now());
    });
  }

  _tickAnimations(time) {
    for (const entry of this._activeAnimations) {
      const animation = entry.animation;
      if (!animation || entry.particles.length === 0) {
        this._activeAnimations.delete(entry);
        continue;
      }

      const progress = clamp01(
        (time - animation.startedAt) / animation.durationMs,
      );
      this._applyInterpolatedState(entry, animation, easePower2InOut(progress));
      if (progress >= 1) {
        entry.animation = null;
        this._activeAnimations.delete(entry);
      }
    }

    if (this._activeAnimations.size > 0 && !this.destroyed) {
      this._scheduleAnimationFrame();
    }
  }
}

export const ensureAggregateBarLayer = (store, texture) => {
  if (!store?.world || !texture?.source) return null;

  const layers = getAggregateBarLayers(store);
  let layer = layers.get(texture.source);
  if (layer?.destroyed) {
    layers.delete(texture.source);
    layer = null;
  }
  if (!layer) {
    layer = new AggregateBarLayer(store, texture.source);
    layers.set(texture.source, layer);
    if (!store.aggregateBarLayer || store.aggregateBarLayer.destroyed) {
      store.aggregateBarLayer = layer;
    }
  }

  placeAggregateBarLayers(store.world, layers);
  return layer;
};

export const ensureAggregateBarLayerForBar = (bar) => {
  const texture = getBarTexture(bar);
  return ensureAggregateBarLayer(bar?.store, texture);
};

export const removeAggregateBar = (bar) => {
  const layer = getCurrentAggregateBarLayer(bar);
  layer?.removeBar?.(bar);
  clearCurrentAggregateBarLayer(bar);
  releaseAggregateBarLayerIfEmpty(layer);
  return layer?.destroyed ? null : (layer ?? null);
};

export const deactivateAggregateBar = (bar) => {
  const layer = getCurrentAggregateBarLayer(bar);
  layer?.deactivateBar?.(bar);
  return layer?.destroyed ? null : (layer ?? null);
};

const getAggregateBarLayers = (store) => {
  if (!store.aggregateBarLayers) {
    store.aggregateBarLayers = new Map();
  }
  return store.aggregateBarLayers;
};

export const getCurrentAggregateBarLayer = (bar) =>
  bar?._patchmapAggregateBarLayer ??
  bar?.store?.aggregateBarLayerByBar?.get(bar) ??
  null;

export const setCurrentAggregateBarLayer = (bar, layer) => {
  if (!bar) return;
  if (!bar.store.aggregateBarLayerByBar) {
    bar.store.aggregateBarLayerByBar = new WeakMap();
  }
  bar.store.aggregateBarLayerByBar.set(bar, layer);
  bar._patchmapAggregateBarLayer = layer;
};

const clearCurrentAggregateBarLayer = (bar) => {
  if (!bar) return;
  bar.store?.aggregateBarLayerByBar?.delete(bar);
  bar._patchmapAggregateBarLayer = null;
};

const releaseAggregateBarLayerIfEmpty = (layer) => {
  if (!layer || layer.destroyed || layer.particleChildren.length > 0) return;

  const store = layer.store;
  if (store?.aggregateBarLayers?.get(layer.textureSource) === layer) {
    store.aggregateBarLayers.delete(layer.textureSource);
  }
  if (store?.aggregateBarLayer === layer) {
    store.aggregateBarLayer =
      [...(store.aggregateBarLayers?.values() ?? [])].find(
        (nextLayer) => !nextLayer.destroyed,
      ) ?? null;
  }

  layer.parent?.removeChild(layer);
  layer.destroy();
};

const placeAggregateBarLayers = (world, layers) => {
  const activeLayers = [...layers.values()].filter((layer) => !layer.destroyed);
  if (activeLayers.length === 0) {
    return;
  }
  if (isAggregateBarLayerBlockPlaced(world, activeLayers)) return;

  for (const layer of activeLayers) {
    layer.parent?.removeChild(layer);
  }

  const relationIndex = world.children.findIndex(
    (child) => child.type === 'relations',
  );
  const insertIndex =
    relationIndex === -1 ? world.children.length : relationIndex;
  for (let offset = 0; offset < activeLayers.length; offset += 1) {
    world.addChildAt(activeLayers[offset], insertIndex + offset);
  }
};

const isAggregateBarLayerBlockPlaced = (world, activeLayers) => {
  const layerSet = new Set(activeLayers);
  const firstIndex = world.children.indexOf(activeLayers[0]);
  if (firstIndex === -1) return false;

  for (let offset = 0; offset < activeLayers.length; offset += 1) {
    if (world.children[firstIndex + offset] !== activeLayers[offset]) {
      return false;
    }
  }

  const relationIndex = world.children.findIndex(
    (child) => !layerSet.has(child) && child.type === 'relations',
  );
  return (
    relationIndex === -1 || firstIndex + activeLayers.length <= relationIndex
  );
};

const getBarTexture = (bar) => {
  const source = bar?.props?.source;
  if (!source || source.type !== 'rect') return null;
  if (
    bar._patchmapAggregateTextureSource === source &&
    bar._patchmapAggregateTexture
  ) {
    return bar._patchmapAggregateTexture;
  }
  const texture = getTexture(
    bar.store.viewport.app.renderer,
    bar.store.theme,
    source,
  );
  bar._patchmapAggregateTextureSource = source;
  bar._patchmapAggregateTexture = texture;
  return texture;
};

const getNineSliceLayout = (texture) => {
  if (texture._patchmapNineSliceLayout) {
    return texture._patchmapNineSliceLayout;
  }

  const slice = normalizeSlice(texture);
  if (
    slice.leftWidth +
      slice.rightWidth +
      slice.topHeight +
      slice.bottomHeight ===
    0
  ) {
    texture._patchmapNineSliceLayout = {
      texture,
      slice,
      pieces: [
        {
          x: 0,
          y: 0,
          width: texture.width,
          height: texture.height,
          texture,
        },
      ],
      single: true,
    };
    return texture._patchmapNineSliceLayout;
  }

  if ((texture.metadata?.borderWidth ?? 0) === 0) {
    texture._patchmapNineSliceLayout = createBorderlessNineSliceLayout(
      texture,
      slice,
    );
    return texture._patchmapNineSliceLayout;
  }

  const sourceColumns = buildSegments(
    texture.width,
    slice.leftWidth,
    slice.rightWidth,
  );
  const sourceRows = buildSegments(
    texture.height,
    slice.topHeight,
    slice.bottomHeight,
  );
  const pieces = [];

  for (const row of sourceRows) {
    for (const column of sourceColumns) {
      pieces.push({
        x: column.offset,
        y: row.offset,
        width: column.size,
        height: row.size,
        texture: createSubTexture(
          texture,
          column.offset,
          row.offset,
          column.size,
          row.size,
        ),
      });
    }
  }

  texture._patchmapNineSliceLayout = {
    texture,
    slice,
    pieces,
  };
  return texture._patchmapNineSliceLayout;
};

const createBorderlessNineSliceLayout = (texture, slice) => {
  const centerWidth = Math.max(
    1,
    texture.width - slice.leftWidth - slice.rightWidth,
  );
  const centerHeight = Math.max(
    1,
    texture.height - slice.topHeight - slice.bottomHeight,
  );
  const centerX = slice.leftWidth;
  const centerY = slice.topHeight;
  const centerTexture = createSubTexture(
    texture,
    centerX,
    centerY,
    centerWidth,
    centerHeight,
  );

  return {
    texture,
    slice,
    borderless: true,
    pieces: [
      {
        width: slice.leftWidth,
        height: slice.topHeight,
        texture: createSubTexture(
          texture,
          0,
          0,
          slice.leftWidth,
          slice.topHeight,
        ),
      },
      {
        width: slice.rightWidth,
        height: slice.topHeight,
        texture: createSubTexture(
          texture,
          texture.width - slice.rightWidth,
          0,
          slice.rightWidth,
          slice.topHeight,
        ),
      },
      {
        width: slice.leftWidth,
        height: slice.bottomHeight,
        texture: createSubTexture(
          texture,
          0,
          texture.height - slice.bottomHeight,
          slice.leftWidth,
          slice.bottomHeight,
        ),
      },
      {
        width: slice.rightWidth,
        height: slice.bottomHeight,
        texture: createSubTexture(
          texture,
          texture.width - slice.rightWidth,
          texture.height - slice.bottomHeight,
          slice.rightWidth,
          slice.bottomHeight,
        ),
      },
      {
        width: centerWidth,
        height: centerHeight,
        texture: centerTexture,
      },
      {
        width: centerWidth,
        height: centerHeight,
        texture: centerTexture,
      },
    ],
  };
};

const normalizeSlice = (texture) => {
  const slice = texture?.metadata?.slice ?? {};
  return {
    leftWidth: clampSlice(slice.leftWidth, texture.width),
    rightWidth: clampSlice(slice.rightWidth, texture.width),
    topHeight: clampSlice(slice.topHeight, texture.height),
    bottomHeight: clampSlice(slice.bottomHeight, texture.height),
  };
};

const clampSlice = (value, limit) =>
  Math.max(0, Math.min(Number(value) || 0, limit / 2));

const buildSegments = (size, start, end) => {
  const center = Math.max(0, size - start - end);
  return [
    { offset: 0, size: start },
    { offset: start, size: center },
    { offset: start + center, size: end },
  ];
};

const createSubTexture = (texture, x, y, width, height) =>
  new Texture({
    source: texture.source,
    frame: new Rectangle(
      texture.frame.x + x,
      texture.frame.y + y,
      width,
      height,
    ),
    orig: new Rectangle(0, 0, width, height),
  });

const resolveTargetSlices = (layout, state) => {
  if (layout.single) {
    return [
      {
        x: 0,
        y: 0,
        width: state.width,
        height: state.height,
      },
    ];
  }

  if (layout.borderless) {
    return resolveBorderlessTargetSlices(layout, state);
  }

  const borderScale = resolveBorderScale(layout, state);
  const left = layout.slice.leftWidth * borderScale;
  const right = layout.slice.rightWidth * borderScale;
  const top = layout.slice.topHeight * borderScale;
  const bottom = layout.slice.bottomHeight * borderScale;
  const targetColumns = buildSegments(state.width, left, right);
  const targetRows = buildSegments(state.height, top, bottom);
  const targets = [];

  for (const row of targetRows) {
    for (const column of targetColumns) {
      targets.push({
        x: column.offset,
        y: row.offset,
        width: column.size,
        height: row.size,
      });
    }
  }
  return targets;
};

const resolveBorderlessTargetSlices = (layout, state) => {
  const borderScale = resolveBorderScale(layout, state);
  const left = layout.slice.leftWidth * borderScale;
  const right = layout.slice.rightWidth * borderScale;
  const top = layout.slice.topHeight * borderScale;
  const bottom = layout.slice.bottomHeight * borderScale;
  const centerWidth = Math.max(0, state.width - left - right);
  const centerHeight = Math.max(0, state.height - top - bottom);

  return [
    { x: 0, y: 0, width: left, height: top },
    { x: state.width - right, y: 0, width: right, height: top },
    { x: 0, y: state.height - bottom, width: left, height: bottom },
    {
      x: state.width - right,
      y: state.height - bottom,
      width: right,
      height: bottom,
    },
    { x: 0, y: top, width: state.width, height: centerHeight },
    { x: left, y: 0, width: centerWidth, height: state.height },
  ];
};

const resolveBorderScale = (layout, state) =>
  resolveBorderScaleForSize(layout, state.width, state.height);

const resolveBorderScaleForSize = (layout, width, height) =>
  Math.min(
    1,
    safeScale(width, layout.slice.leftWidth + layout.slice.rightWidth),
    safeScale(height, layout.slice.topHeight + layout.slice.bottomHeight),
  );

const safeScale = (size, borderSize) => {
  if (borderSize <= 0) return 1;
  return Math.max(0, size / borderSize);
};

const updateEntryState = (entry, x, y, width, height, rotation) => {
  const state = entry.state ?? {};
  state.x = x;
  state.y = y;
  state.width = width;
  state.height = height;
  state.rotation = rotation;
  entry.state = state;
  return state;
};

const cloneState = (state) => ({
  x: state.x,
  y: state.y,
  width: state.width,
  height: state.height,
  rotation: state.rotation,
});

const hasSameState = (current, next) =>
  current &&
  next &&
  current.x === next.x &&
  current.y === next.y &&
  current.width === next.width &&
  current.height === next.height &&
  current.rotation === next.rotation;

const applyParticleState = (
  particle,
  piece,
  localX,
  localY,
  width,
  height,
  x,
  y,
  cos,
  sin,
  rotation,
  alpha,
) => {
  if (!particle || !piece || width <= 0 || height <= 0) {
    if (particle) particle.alpha = 0;
    return;
  }

  particle.x = x + localX * cos - localY * sin;
  particle.y = y + localX * sin + localY * cos;
  particle.scaleX = width / piece.width;
  particle.scaleY = height / piece.height;
  particle.rotation = rotation;
  if (alpha !== undefined && particle.alpha !== alpha) {
    particle.alpha = alpha;
  }
};

const requestFrame = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(now()), 16);
};

const cancelFrame = (handle) => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
};

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const normalizeDuration = (durationMs) =>
  Math.max(0, Number(durationMs ?? 200) || 0);

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

const easePower2InOut = (progress) =>
  progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;

const lerp = (from, to, progress) => from + (to - from) * progress;

const resolveBarLayerPoint = (layer, bar, x, y, out) => {
  TEMP_POINT.set(x, y);
  const point = bar.toGlobal(TEMP_POINT, out);
  return layer.parent ? layer.toLocal(point, undefined, point) : point;
};

import {
  BitmapText,
  Container,
  NineSliceSprite,
  Particle,
  ParticleContainer,
  Point,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import { getTexture } from '../../assets/textures/texture';
import { splitText } from '../../display/mixins/utils';
import { getColor } from '../../utils/get';
import { getCentroid, getObjectWorldCorners } from '../../utils/transform';

export class PixiRenderer {
  constructor({ store, target }) {
    this.store = store;
    this.target = target ?? store?.world;
    this.layers = createLayers();
    this.aggregateLayers = createAggregateLayers();
    this.aggregateTextureAtlases = {
      background: new RectTextureAtlas(),
      bar: new RectTextureAtlas({ tintable: true, animatedHeights: true }),
    };
    this.objectsById = new Map();
    this.particlesById = new Map();
    this.aggregateNodesById = new Map();
    this.particleAnimations = new Map();
    this.particleAnimationFrame = null;
    this.attached = false;
  }

  attach() {
    if (this.attached || !this.target) return;
    this.layers.background.addChild(this.aggregateLayers.background);
    this.layers.bar.addChild(this.aggregateLayers.bar);
    this.target.addChild(this.layers.background);
    this.target.addChild(this.layers.bar);
    this.target.addChild(this.layers.fallback);
    this.target.addChild(this.layers.relations);
    this.attached = true;
  }

  render(snapshot) {
    this.attach();
    if (!snapshot?.renderIR) return;

    if (snapshot.incremental) {
      this.#renderIncremental(snapshot);
      return;
    }

    const plan = snapshot.renderPlan;
    const aggregateNodes = [
      ...(plan?.aggregateBackgrounds ?? []),
      ...(plan?.aggregateBars ?? []),
    ];
    const normalNodes = plan
      ? [...plan.pixiNodes, ...plan.relations]
      : snapshot.renderIR.nodes;

    this.#removeStaleNormalNodes(normalNodes, aggregateNodes);
    this.#syncAggregateLayer('background', plan?.aggregateBackgrounds ?? []);
    this.#syncAggregateLayer('bar', plan?.aggregateBars ?? []);

    for (const node of normalNodes) {
      this.#upsertNode(node);
    }
  }

  destroy() {
    for (const object of this.objectsById.values()) {
      cancelObjectAnimation(object);
      object.destroy({ children: true });
    }
    this.objectsById.clear();
    this.particlesById.clear();
    this.aggregateNodesById.clear();
    this.#cancelAllParticleAnimations();
    for (const atlas of Object.values(this.aggregateTextureAtlases)) {
      atlas?.destroy();
    }
    for (const layer of Object.values(this.aggregateLayers)) {
      layer.destroy();
    }
    for (const layer of Object.values(this.layers)) {
      layer.destroy({ children: true });
    }
    this.attached = false;
  }

  #upsertNode(node) {
    const layer = this.#getLayer(node);
    if (!layer) return;

    let object = this.objectsById.get(node.id);
    const objectKind = getDisplayObjectKind(node);
    if (object && object._patchmapObjectKind !== objectKind) {
      this.#removeNode(node.id);
      object = null;
    }
    if (!object) {
      object = this.#createDisplayObject(node);
      this.objectsById.set(node.id, object);
      layer.addChild(object);
    } else if (object.parent !== layer) {
      object.parent?.removeChild(object);
      layer.addChild(object);
    }

    applyNodeToObject(object, node, this.store);
    syncRenderedRef(this.store, node, object);
  }

  #removeStaleNormalNodes(normalNodes, aggregateNodes) {
    const retainedIds = new Set(normalNodes.map((node) => node.id));
    for (const node of aggregateNodes) {
      retainedIds.delete(node.id);
    }
    for (const id of this.objectsById.keys()) {
      if (!retainedIds.has(id)) {
        this.#removeNode(id);
      }
    }
  }

  #renderIncremental(snapshot) {
    const plan = snapshot.renderPlan;
    const aggregateNodes = [
      ...(plan?.aggregateBackgrounds ?? []),
      ...(plan?.aggregateBars ?? []),
    ];
    const normalNodes = plan
      ? [...plan.pixiNodes, ...plan.relations]
      : [
          ...(snapshot.renderDiff?.added ?? []),
          ...(snapshot.renderDiff?.updated ?? []),
        ];

    for (const node of snapshot.renderDiff?.removed ?? []) {
      this.#removeNode(node.id);
      this.#removeParticle(node.id);
    }
    for (const node of aggregateNodes) {
      this.#removeNode(node.id);
      this.#upsertParticle(node);
    }
    for (const node of normalNodes) {
      this.#removeParticle(node.id);
      this.#upsertNode(node);
    }
    this.aggregateLayers.background.update();
    this.aggregateLayers.bar.update();
  }

  #syncAggregateLayer(kind, nodes) {
    const layer = this.aggregateLayers[kind];
    const wantedIds = new Set(nodes.map((node) => node.id));
    const atlas = this.aggregateTextureAtlases[kind];

    for (const [id, node] of this.aggregateNodesById) {
      if (node.layer === kind && !wantedIds.has(id)) {
        this.aggregateNodesById.delete(id);
      }
    }
    for (const node of nodes) {
      this.aggregateNodesById.set(node.id, node);
    }
    atlas?.sync(nodes, this.store);
    if (atlas?.baseTexture) {
      layer.texture = atlas.baseTexture;
    }

    for (const id of this.particlesById.keys()) {
      if (this.#getParticleKind(id) === kind && !wantedIds.has(id)) {
        this.particlesById.delete(id);
      }
    }

    const particles = nodes.map((node) => {
      let particle = this.particlesById.get(node.id);
      if (!particle) {
        particle = new Particle({
          texture: this.#resolveAggregateTexture(kind, node) ?? Texture.WHITE,
        });
        particle._patchmapNodeId = node.id;
        particle._patchmapKind = kind;
        this.particlesById.set(node.id, particle);
      }
      applyNodeToParticle(particle, node, this.store, {
        texture: this.#resolveAggregateTexture(kind, node),
        tint: this.#resolveAggregateTint(kind, node),
      });
      return particle;
    });

    layer.particleChildren.length = 0;
    layer.particleChildren.push(...particles);
    layer.update();
  }

  #upsertParticle(node) {
    const kind = node.layer === 'background' ? 'background' : 'bar';
    const layer = this.aggregateLayers[kind];
    this.aggregateNodesById.set(node.id, node);
    this.#ensureAggregateTexture(kind, node);
    if (this.aggregateTextureAtlases[kind]?.baseTexture) {
      layer.texture = this.aggregateTextureAtlases[kind].baseTexture;
    }
    let particle = this.particlesById.get(node.id);
    if (!particle) {
      particle = new Particle({
        texture: this.#resolveAggregateTexture(kind, node) ?? Texture.WHITE,
      });
      particle._patchmapNodeId = node.id;
      particle._patchmapKind = kind;
      this.particlesById.set(node.id, particle);
      layer.particleChildren.push(particle);
    }
    applyNodeToParticle(particle, node, this.store, {
      texture: this.#resolveAggregateTexture(kind, node),
      tint: this.#resolveAggregateTint(kind, node),
      animate: kind === 'bar',
      onAnimate: (fromFrame, toFrame, durationMs) =>
        this.#animateParticleFrame(
          kind,
          particle,
          node,
          fromFrame,
          toFrame,
          durationMs,
        ),
    });
  }

  #removeParticle(id) {
    const particle = this.particlesById.get(id);
    if (!particle) return;
    this.#cancelParticleAnimation(particle);
    const layer = this.aggregateLayers[particle._patchmapKind];
    const index = layer.particleChildren.indexOf(particle);
    if (index !== -1) {
      layer.particleChildren.splice(index, 1);
    }
    this.particlesById.delete(id);
    this.aggregateNodesById.delete(id);
  }

  #getParticleKind(id) {
    return this.particlesById.get(id)?._patchmapKind;
  }

  #removeNode(id) {
    const object = this.objectsById.get(id);
    if (!object) return;
    cancelObjectAnimation(object);
    object.parent?.removeChild(object);
    object.destroy({ children: true });
    this.objectsById.delete(id);
  }

  #resolveAggregateTexture(kind, node) {
    return this.aggregateTextureAtlases[kind]?.get(node, this.store) ?? null;
  }

  #resolveAggregateTextureForFrame(kind, node, frame) {
    return (
      this.aggregateTextureAtlases[kind]?.getForFrame(
        node,
        frame,
        this.store,
      ) ?? null
    );
  }

  #resolveAggregateTint(kind, node) {
    if (kind !== 'bar') return undefined;
    return getNodeTint(node, this.store);
  }

  #ensureAggregateTexture(kind, node) {
    const atlas = this.aggregateTextureAtlases[kind];
    if (!atlas || atlas.has(node, this.store)) return;
    const nodes = [...this.aggregateNodesById.values()].filter(
      (current) => current.layer === kind,
    );
    atlas.sync(nodes, this.store);
    for (const [id, particle] of this.particlesById) {
      if (particle._patchmapKind !== kind) continue;
      const currentNode = this.aggregateNodesById.get(id);
      if (!currentNode) continue;
      const texture = atlas.get(currentNode, this.store);
      if (texture) particle.texture = texture;
    }
  }

  #animateParticleFrame(kind, particle, node, fromFrame, toFrame, durationMs) {
    this.#cancelParticleAnimation(particle);
    const duration = normalizeDuration(durationMs);
    if (duration === 0) {
      applyParticleFrame(particle, toFrame, {
        texture: this.#resolveAggregateTextureForFrame(kind, node, toFrame),
        tint: this.#resolveAggregateTint(kind, node),
      });
      return;
    }

    this.particleAnimations.set(particle, {
      kind,
      node,
      fromFrame,
      toFrame,
      duration,
      startedAt: now(),
    });
    this.#scheduleParticleAnimationFrame();
  }

  #scheduleParticleAnimationFrame() {
    if (this.particleAnimationFrame !== null) return;
    this.particleAnimationFrame = requestFrame((time) => {
      this.particleAnimationFrame = null;
      this.#tickParticleAnimations(time);
    });
  }

  #tickParticleAnimations(time = now()) {
    for (const [particle, animation] of this.particleAnimations) {
      if (!this.particlesById.has(particle._patchmapNodeId)) {
        this.particleAnimations.delete(particle);
        continue;
      }
      const progress = clamp01(
        (time - animation.startedAt) / animation.duration,
      );
      const eased = easePower2InOut(progress);
      const frame = interpolateFrame(
        animation.fromFrame,
        animation.toFrame,
        eased,
      );
      applyParticleFrame(particle, frame, {
        texture: this.#resolveAggregateTextureForFrame(
          animation.kind,
          animation.node,
          frame,
        ),
        tint: this.#resolveAggregateTint(animation.kind, animation.node),
      });
      if (progress >= 1) {
        this.particleAnimations.delete(particle);
      }
    }

    for (const layer of Object.values(this.aggregateLayers)) {
      layer.update();
    }
    if (this.particleAnimations.size > 0) {
      this.#scheduleParticleAnimationFrame();
    }
  }

  #cancelParticleAnimation(particle) {
    this.particleAnimations.delete(particle);
  }

  #cancelAllParticleAnimations() {
    this.particleAnimations.clear();
    if (this.particleAnimationFrame !== null) {
      cancelFrame(this.particleAnimationFrame);
      this.particleAnimationFrame = null;
    }
  }

  #getLayer(node) {
    if (node.layer === 'background') return this.layers.background;
    if (node.layer === 'bar') return this.layers.bar;
    if (node.layer === 'relations') return this.layers.relations;
    return this.layers.fallback;
  }

  #createDisplayObject(node) {
    const object = createDisplayObject(node, this.store);
    object.label = `patchmap-${node.id}`;
    object._patchmapNodeId = node.id;
    return object;
  }
}

const createDisplayObject = (node, store) => {
  const kind = getDisplayObjectKind(node);
  let object;
  if (kind === 'relations') {
    object = new Container();
    object.linkPoints = [];
    object._patchmapLineSprites = [];
  } else if (kind === 'text') {
    object = new BitmapText({ text: '', style: {} });
  } else {
    const texture = resolveNodeTexture(node, store) ?? Texture.WHITE;
    object =
      kind === 'nine-slice'
        ? new NineSliceSprite({ texture })
        : new Sprite(texture);
    applySlice(object, texture);
  }
  object._patchmapObjectKind = kind;
  return object;
};

const getDisplayObjectKind = (node) => {
  if (node.feature === 'relations') return 'relations';
  if (node.feature === 'label' || node.feature === 'text') return 'text';
  if (node.feature === 'background' || node.feature === 'bar') {
    return 'nine-slice';
  }
  if (node.feature === 'rect' && node.material?.radius) return 'nine-slice';
  return 'sprite';
};

const createLayers = () => ({
  background: createLayer('patchmap-background-layer'),
  bar: createLayer('patchmap-bar-layer'),
  fallback: createLayer('patchmap-fallback-layer'),
  relations: createLayer('patchmap-relations-layer'),
});

const createLayer = (label) => {
  const layer = new Container({ label });
  layer._patchmapInternal = true;
  layer._patchmapLayer = true;
  return layer;
};

const createAggregateLayers = () => ({
  background: createAggregateLayer('patchmap-aggregate-background-layer', {
    vertex: false,
    position: false,
    rotation: false,
    uvs: false,
    color: false,
  }),
  bar: createAggregateLayer('patchmap-aggregate-bar-layer', {
    vertex: true,
    position: true,
    rotation: false,
    uvs: true,
    color: false,
  }),
});

const createAggregateLayer = (label, dynamicProperties) => {
  const layer = new ParticleContainer({
    label,
    texture: Texture.WHITE,
    boundsArea: new Rectangle(-1_000_000, -1_000_000, 2_000_000, 2_000_000),
    dynamicProperties,
  });
  layer._patchmapInternal = true;
  layer._patchmapAggregateLayer = true;
  return layer;
};

const applyNodeToObject = (object, node, store) => {
  if (object._patchmapObjectKind === 'relations') {
    applyNodeTransform(object, node);
    applyRelationNodeToGraphics(object, node, store);
    return;
  }

  if (object._patchmapObjectKind === 'text') {
    applyNodeTransform(object, node);
    applyTextNodeToBitmapText(object, node, store);
    return;
  }

  const texture = resolveNodeTexture(node, store);
  if (texture && object.texture !== texture) {
    object.texture = texture;
    applySlice(object, texture);
  }

  object.visible = node.frame.visible !== false;
  object.renderable = object.visible;
  applyNodeFrame(object, node);
  const tint = getNodeTint(node, store);
  if (tint !== undefined) {
    object.tint = normalizeColor(tint);
  }
};

const applyNodeTransform = (object, node) => {
  object.visible = node.frame.visible !== false;
  object.renderable = object.visible;
  object.x = node.frame.x;
  object.y = node.frame.y;
  object.rotation = node.frame.rotation ?? 0;
  object.alpha = node.frame.alpha ?? 1;
};

const applyNodeFrame = (object, node) => {
  const nextFrame = normalizeFrame(node.frame);
  const previousFrame = object._patchmapFrame;
  const shouldAnimate =
    node.feature === 'bar' &&
    node.material?.animation &&
    previousFrame &&
    previousFrame.visible !== false &&
    nextFrame.visible !== false &&
    hasGeometryChange(previousFrame, nextFrame);

  object.visible = nextFrame.visible !== false;
  object.renderable = object.visible;
  object._patchmapFrame = nextFrame;

  if (shouldAnimate) {
    animateObjectFrame(
      object,
      readObjectFrame(object, previousFrame),
      nextFrame,
      node.material?.animationDuration,
    );
    return;
  }

  cancelObjectAnimation(object);
  applyFrameToObject(object, nextFrame);
};

const normalizeFrame = (frame) => ({
  x: frame.x,
  y: frame.y,
  width: frame.width,
  height: frame.height,
  rotation: frame.rotation ?? 0,
  alpha: frame.alpha ?? 1,
  visible: frame.visible !== false,
});

const readObjectFrame = (object, fallback) => ({
  x: Number.isFinite(object.x) ? object.x : fallback.x,
  y: Number.isFinite(object.y) ? object.y : fallback.y,
  width: Number.isFinite(object.width) ? object.width : fallback.width,
  height: Number.isFinite(object.height) ? object.height : fallback.height,
  rotation: Number.isFinite(object.rotation)
    ? object.rotation
    : fallback.rotation,
  alpha: Number.isFinite(object.alpha) ? object.alpha : fallback.alpha,
  visible: object.visible !== false,
});

const applyFrameToObject = (object, frame) => {
  object.visible = frame.visible !== false;
  object.renderable = object.visible;
  object.x = frame.x;
  object.y = frame.y;
  object.rotation = frame.rotation ?? 0;
  object.alpha = frame.alpha ?? 1;
  object.width = Math.max(0, frame.width);
  object.height = Math.max(0, frame.height);
};

const animateObjectFrame = (object, fromFrame, toFrame, durationMs) => {
  cancelObjectAnimation(object);

  const duration = normalizeDuration(durationMs);
  if (duration === 0) {
    applyFrameToObject(object, toFrame);
    return;
  }

  const startedAt = now();
  const animation = {
    frameId: null,
    cancelled: false,
  };
  const tick = (time = now()) => {
    if (animation.cancelled || object.destroyed) return;

    const progress = clamp01((time - startedAt) / duration);
    const eased = easePower2InOut(progress);
    applyFrameToObject(object, interpolateFrame(fromFrame, toFrame, eased));

    if (progress < 1) {
      animation.frameId = requestFrame(tick);
    } else {
      object._patchmapAnimation = null;
      applyFrameToObject(object, toFrame);
    }
  };

  object._patchmapAnimation = animation;
  animation.frameId = requestFrame(tick);
};

const cancelObjectAnimation = (object) => {
  const animation = object?._patchmapAnimation;
  if (!animation) return;
  animation.cancelled = true;
  if (animation.frameId !== null) cancelFrame(animation.frameId);
  object._patchmapAnimation = null;
};

const interpolateFrame = (fromFrame, toFrame, progress) => ({
  x: lerp(fromFrame.x, toFrame.x, progress),
  y: lerp(fromFrame.y, toFrame.y, progress),
  width: lerp(fromFrame.width, toFrame.width, progress),
  height: lerp(fromFrame.height, toFrame.height, progress),
  rotation: lerp(fromFrame.rotation, toFrame.rotation, progress),
  alpha: lerp(fromFrame.alpha, toFrame.alpha, progress),
  visible: toFrame.visible !== false,
});

const hasGeometryChange = (fromFrame, toFrame) =>
  Math.abs(fromFrame.x - toFrame.x) > 0.001 ||
  Math.abs(fromFrame.y - toFrame.y) > 0.001 ||
  Math.abs(fromFrame.width - toFrame.width) > 0.001 ||
  Math.abs(fromFrame.height - toFrame.height) > 0.001 ||
  Math.abs(fromFrame.rotation - toFrame.rotation) > 0.001;

const normalizeDuration = (durationMs) =>
  Math.max(0, Number.isFinite(durationMs) ? durationMs : 200);

const easePower2InOut = (value) =>
  value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;

const lerp = (from, to, progress) => from + (to - from) * progress;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const now = () => {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
};

const requestFrame = (callback) => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(now()), 16);
};

const cancelFrame = (frameId) => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frameId);
    return;
  }
  clearTimeout(frameId);
};

const applyTextNodeToBitmapText = (object, node, store) => {
  const layout = resolveTextLayout(node, store);
  object.text = layout.text;
  object.style = layout.style;
  object._patchmapTextStyle = layout.style;
  const tint = getNodeTint(node, store);
  if (tint !== undefined) object.tint = normalizeColor(tint);
};

const applyRelationNodeToGraphics = (object, node, store) => {
  object.linkPoints.length = 0;

  const links = node.material?.links ?? [];
  if (links.length === 0) return;
  const style = node.material?.style ?? {};
  const strokeStyle = {
    color: normalizeColor(getColor(store?.theme, style.color ?? '#1A1A1A')),
    width: style.width ?? 1,
    alpha: style.alpha ?? 1,
    alignment: style.alignment,
    cap: style.cap,
    join: style.join,
  };
  object.strokeStyle = strokeStyle;

  let renderedLinks = 0;
  for (const link of links) {
    const source = store?.elementById?.get(link.source);
    const target = store?.elementById?.get(link.target);
    if (!source || !target || source.destroyed || target.destroyed) continue;

    const sourcePoint = resolveLinkedLocalAnchor(object, source);
    const targetPoint = resolveLinkedLocalAnchor(object, target);
    if (!sourcePoint || !targetPoint) continue;

    const line = getRelationLineSprite(object, renderedLinks);
    applyLineSprite(line, sourcePoint, targetPoint, strokeStyle);
    object.linkPoints.push({
      sourcePoint: [sourcePoint.x, sourcePoint.y],
      targetPoint: [targetPoint.x, targetPoint.y],
    });
    renderedLinks += 1;
  }

  for (
    let index = renderedLinks;
    index < object._patchmapLineSprites.length;
    index += 1
  ) {
    object._patchmapLineSprites[index].visible = false;
  }
};

const getRelationLineSprite = (object, index) => {
  let line = object._patchmapLineSprites[index];
  if (!line) {
    line = new Sprite(Texture.WHITE);
    line.anchor.set(0, 0.5);
    line.label = `patchmap-relation-line-${index}`;
    object._patchmapLineSprites[index] = line;
    object.addChild(line);
  }
  line.visible = true;
  line.renderable = true;
  return line;
};

const applyLineSprite = (line, sourcePoint, targetPoint, strokeStyle) => {
  const dx = targetPoint.x - sourcePoint.x;
  const dy = targetPoint.y - sourcePoint.y;
  line.x = sourcePoint.x;
  line.y = sourcePoint.y;
  line.width = Math.hypot(dx, dy);
  line.height = strokeStyle.width ?? 1;
  line.rotation = Math.atan2(dy, dx);
  line.tint = strokeStyle.color;
  line.alpha = strokeStyle.alpha ?? 1;
};

const resolveLinkedLocalAnchor = (object, ref) => {
  const globalPoint = getCentroid(getObjectWorldCorners(ref));
  return object.toLocal(globalPoint, undefined, new Point());
};

const getLinkBounds = (linkPoints) => {
  const xs = [];
  const ys = [];
  for (const point of linkPoints) {
    xs.push(point.sourcePoint[0], point.targetPoint[0]);
    ys.push(point.sourcePoint[1], point.targetPoint[1]);
  }
  if (xs.length === 0) return new Rectangle(0, 0, 0, 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return new Rectangle(minX, minY, maxX - minX, maxY - minY);
};

const applyNodeToParticle = (particle, node, store, options = {}) => {
  const nextFrame = normalizeFrame(node.frame);
  const previousFrame = particle._patchmapFrame;
  const shouldAnimate =
    options.animate &&
    node.material?.animation &&
    previousFrame &&
    previousFrame.visible !== false &&
    nextFrame.visible !== false &&
    hasGeometryChange(previousFrame, nextFrame);

  particle._patchmapFrame = nextFrame;
  if (shouldAnimate) {
    options.onAnimate?.(
      readParticleFrame(particle, previousFrame),
      nextFrame,
      node.material?.animationDuration,
    );
    return;
  }

  applyParticleFrame(particle, nextFrame, {
    texture: options.texture,
    tint:
      options.tint ?? (options.texture ? undefined : getNodeTint(node, store)),
  });
};

const readParticleFrame = (particle, fallback) => ({
  x: Number.isFinite(particle.x) ? particle.x : fallback.x,
  y: Number.isFinite(particle.y) ? particle.y : fallback.y,
  width: particle.texture
    ? particle.texture.width * particle.scaleX
    : fallback.width,
  height: particle.texture
    ? particle.texture.height * particle.scaleY
    : fallback.height,
  rotation: Number.isFinite(particle.rotation)
    ? particle.rotation
    : fallback.rotation,
  alpha: Number.isFinite(particle.alpha) ? particle.alpha : fallback.alpha,
  visible: fallback.visible !== false,
});

const applyParticleFrame = (particle, frame, options = {}) => {
  if (options.texture) {
    particle.texture = options.texture;
  }
  const texture = options.texture ? particle.texture : null;
  particle.x = frame.x;
  particle.y = frame.y;
  particle.scaleX = texture
    ? frame.width / Math.max(1, texture.width)
    : frame.width;
  particle.scaleY = texture
    ? frame.height / Math.max(1, texture.height)
    : frame.height;
  const rotation = frame.rotation ?? 0;
  if (particle.rotation !== rotation) particle.rotation = rotation;
  if (particle.anchorX !== 0) particle.anchorX = 0;
  if (particle.anchorY !== 0) particle.anchorY = 0;
  const alpha = frame.alpha ?? 1;
  if (particle.alpha !== alpha) particle.alpha = alpha;
  const tint = options.tint;
  if (tint !== undefined) {
    const color = normalizeColor(tint);
    if (particle._patchmapTint !== color) {
      particle.tint = color;
      particle._patchmapTint = color;
    }
  } else if (particle._patchmapTint !== 0xffffff) {
    particle.tint = 0xffffff;
    particle._patchmapTint = 0xffffff;
  }
};

const getNodeTint = (node, store) =>
  getColor(store?.theme, node.material?.tint ?? node.material?.source?.fill);

const resolveNodeTexture = (node, store) => {
  const source = node.material?.source;
  if (!source) return Texture.WHITE;
  const resolved = store.textureResolver?.(source, store, node);
  if (resolved) return resolved;
  try {
    const renderer = store?.viewport?.app?.renderer ?? store?.app?.renderer;
    if (renderer) {
      return getTexture(renderer, store.theme, source) ?? Texture.EMPTY;
    }
  } catch {
    return Texture.EMPTY;
  }
  return typeof source === 'string' ? Texture.EMPTY : Texture.WHITE;
};

const applySlice = (object, texture) => {
  const slice = texture.metadata?.slice;
  if (!slice) return;
  object.leftWidth = slice.leftWidth ?? 0;
  object.rightWidth = slice.rightWidth ?? 0;
  object.topHeight = slice.topHeight ?? 0;
  object.bottomHeight = slice.bottomHeight ?? 0;
};

const normalizeTextStyle = (style = {}, node, store) => {
  const next = { ...style };
  if (next.fill !== undefined) {
    next.fill = normalizeColor(getColor(store?.theme, next.fill));
  } else {
    const tint = getNodeTint(node, store);
    if (tint !== undefined) next.fill = normalizeColor(tint);
  }
  return next;
};

const normalizeColor = (color) => {
  if (typeof color === 'string' && color.startsWith('#')) {
    return Number.parseInt(color.slice(1), 16);
  }
  return color;
};

const resolveTextLayout = (node, store) => {
  const baseStyle = normalizeTextStyle(node.material?.style, node, store);
  const margin = normalizeMargin(node.material?.margin);
  const bounds = {
    width: Math.max(0, node.frame.width - margin.left - margin.right),
    height: Math.max(0, node.frame.height - margin.top - margin.bottom),
  };
  const style = { ...baseStyle };
  let text = splitText(node.material?.text ?? '', node.material?.split ?? 0);

  if (style.fontSize === 'auto') {
    const range = style.autoFont ?? { min: 8, max: 48 };
    style.fontSize = fitFontSize(text, bounds, range);
  }

  if (style.overflow && style.overflow !== 'visible') {
    text = truncateText(text, bounds, style, style.overflow);
  }

  return { text, style };
};

const fitFontSize = (text, bounds, range) => {
  const min = Number(range.min ?? 8);
  const max = Number(range.max ?? 48);
  if (!text) return max;
  const byWidth = bounds.width / Math.max(1, longestLineLength(text) * 0.55);
  const byHeight = bounds.height / Math.max(1, lineCount(text));
  return Math.max(min, Math.min(max, Math.floor(Math.min(byWidth, byHeight))));
};

const truncateText = (text, bounds, style, overflow) => {
  const fontSize = Number(style.fontSize) || 16;
  const maxChars = Math.max(
    0,
    Math.floor(bounds.width / Math.max(1, fontSize * 0.55)),
  );
  if (measureTextWidth(text, fontSize) <= bounds.width) return text;
  if (overflow === 'ellipsis') {
    if (maxChars <= 1) return '…';
    return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return text.slice(0, maxChars);
};

const measureTextWidth = (text, fontSize) =>
  longestLineLength(text) * fontSize * 0.55;

const longestLineLength = (text) =>
  Math.max(
    0,
    ...String(text)
      .split('\n')
      .map((line) => line.length),
  );

const lineCount = (text) => String(text).split('\n').length;

const normalizeMargin = (margin = 0) => {
  if (typeof margin === 'number') {
    return { top: margin, right: margin, bottom: margin, left: margin };
  }
  return {
    top: margin.top ?? margin.y ?? 0,
    right: margin.right ?? margin.x ?? 0,
    bottom: margin.bottom ?? margin.y ?? 0,
    left: margin.left ?? margin.x ?? 0,
  };
};

class RectTextureAtlas {
  constructor({ tintable = false, animatedHeights = false } = {}) {
    this.tintable = tintable;
    this.animatedHeights = animatedHeights;
    this.animatedHeightMaxByBaseKey = new Map();
    this.signature = '';
    this.baseTexture = null;
    this.texturesByKey = new Map();
  }

  sync(nodes, store) {
    const entries = createAtlasEntries(nodes, store, {
      tintable: this.tintable,
      animatedHeights: this.animatedHeights,
      animatedHeightMaxByBaseKey: this.animatedHeightMaxByBaseKey,
    });
    const signature = entries.map((entry) => entry.key).join('|');
    if (signature === this.signature) return;

    this.destroy();
    this.signature = signature;
    if (entries.length === 0 || !canCreateCanvas()) return;

    const packed = packAtlasEntries(entries);
    const canvas = document.createElement('canvas');
    canvas.width = packed.width;
    canvas.height = packed.height;
    const context = canvas.getContext('2d');
    if (!context) return;

    for (const entry of packed.entries) {
      drawRectAtlasEntry(context, entry);
    }

    this.baseTexture = Texture.from(canvas);
    this.baseTexture.source.update?.();
    for (const entry of packed.entries) {
      this.texturesByKey.set(
        entry.key,
        new Texture({
          source: this.baseTexture.source,
          frame: new Rectangle(
            entry.x,
            entry.y,
            entry.pixelWidth,
            entry.pixelHeight,
          ),
          orig: new Rectangle(0, 0, entry.width, entry.height),
        }),
      );
    }
  }

  has(node, store) {
    return this.texturesByKey.has(
      createAtlasKey(node, store, { tintable: this.tintable }),
    );
  }

  get(node, store) {
    return (
      this.texturesByKey.get(
        createAtlasKey(node, store, { tintable: this.tintable }),
      ) ?? null
    );
  }

  getForFrame(node, frame, store) {
    return (
      this.texturesByKey.get(
        createAtlasKey(node, store, {
          frame,
          tintable: this.tintable,
        }),
      ) ?? null
    );
  }

  destroy() {
    for (const texture of this.texturesByKey.values()) {
      texture.destroy(false);
    }
    this.texturesByKey.clear();
    this.baseTexture?.destroy(true);
    this.baseTexture = null;
    this.signature = '';
  }
}

const canCreateCanvas = () =>
  typeof document !== 'undefined' &&
  typeof document.createElement === 'function';

const ATLAS_RESOLUTION = 5;

const createAtlasEntries = (nodes, store, options = {}) => {
  const byKey = new Map();
  for (const node of nodes) {
    if (node.material?.source?.type !== 'rect') continue;
    const entries = createAtlasNodeEntries(node, store, options);
    for (const entry of entries) {
      if (!entry || byKey.has(entry.key)) continue;
      byKey.set(entry.key, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
};

const createAtlasNodeEntries = (node, store, options) => {
  const height = Math.max(1, Math.ceil(node.frame.height));
  if (!options.animatedHeights) {
    return [createAtlasEntry(node, store, options, node.frame)];
  }

  const baseKey = createAtlasBaseKey(node, store, options);
  const reservedHeight = Math.min(
    256,
    Math.max(height, Math.ceil(Math.max(1, node.frame.width) * 3)),
  );
  const maxHeight = Math.max(
    reservedHeight,
    options.animatedHeightMaxByBaseKey?.get(baseKey) ?? 0,
  );
  options.animatedHeightMaxByBaseKey?.set(baseKey, maxHeight);

  const entries = [];
  for (let currentHeight = 1; currentHeight <= maxHeight; currentHeight += 1) {
    entries.push(
      createAtlasEntry(node, store, options, {
        ...node.frame,
        height: currentHeight,
      }),
    );
  }
  return entries;
};

const createAtlasEntry = (node, store, options, frame) => {
  const width = Math.max(1, Math.ceil(frame.width));
  const height = Math.max(1, Math.ceil(frame.height));
  const source = node.material.source;
  const fill = resolveAtlasFill(node, store, options);
  return {
    key: createAtlasKey(node, store, { ...options, frame }),
    width,
    height,
    fill,
    borderColor: resolveCanvasColor(
      store,
      source.borderColor ??
        source.stroke?.color ??
        source.fill ??
        'transparent',
    ),
    borderWidth: Math.max(
      0,
      Number(source.borderWidth ?? source.stroke?.width ?? 0),
    ),
    radius: normalizeRadius(source.radius ?? 0),
  };
};

const createAtlasKey = (node, store, options = {}) => {
  const source = node.material?.source ?? {};
  const frame = options.frame ?? node.frame;
  return JSON.stringify({
    width: Math.max(1, Math.ceil(frame.width)),
    height: Math.max(1, Math.ceil(frame.height)),
    fill: resolveAtlasFill(node, store, options),
    borderColor: resolveCanvasColor(
      store,
      source.borderColor ??
        source.stroke?.color ??
        source.fill ??
        'transparent',
    ),
    borderWidth: Math.max(
      0,
      Number(source.borderWidth ?? source.stroke?.width ?? 0),
    ),
    radius: normalizeRadius(source.radius ?? 0),
  });
};

const createAtlasBaseKey = (node, store, options = {}) => {
  const source = node.material?.source ?? {};
  return JSON.stringify({
    width: Math.max(1, Math.ceil(node.frame.width)),
    fill: resolveAtlasFill(node, store, options),
    borderColor: resolveCanvasColor(
      store,
      source.borderColor ??
        source.stroke?.color ??
        source.fill ??
        'transparent',
    ),
    borderWidth: Math.max(
      0,
      Number(source.borderWidth ?? source.stroke?.width ?? 0),
    ),
    radius: normalizeRadius(source.radius ?? 0),
  });
};

const resolveAtlasFill = (node, store, options = {}) => {
  if (
    options.tintable &&
    node.material?.tint &&
    Number(node.material?.source?.borderWidth ?? 0) === 0
  ) {
    return 'white';
  }
  return resolveCanvasColor(
    store,
    node.material?.source?.fill ?? node.material?.tint ?? 'white',
  );
};

const packAtlasEntries = (entries) => {
  const padding = 2;
  const maxWidth = 2048;
  let cursorX = padding;
  let cursorY = padding;
  let rowHeight = 0;
  let width = 0;

  const packedEntries = entries.map((entry) => {
    const pixelWidth = entry.width * ATLAS_RESOLUTION;
    const pixelHeight = entry.height * ATLAS_RESOLUTION;
    if (cursorX + pixelWidth + padding > maxWidth) {
      cursorX = padding;
      cursorY += rowHeight + padding;
      rowHeight = 0;
    }
    const packed = {
      ...entry,
      x: cursorX,
      y: cursorY,
      pixelWidth,
      pixelHeight,
    };
    cursorX += pixelWidth + padding;
    rowHeight = Math.max(rowHeight, pixelHeight);
    width = Math.max(width, cursorX);
    return packed;
  });

  return {
    width: nextPowerOfTwo(Math.max(1, Math.min(maxWidth, width + padding))),
    height: nextPowerOfTwo(Math.max(1, cursorY + rowHeight + padding)),
    entries: packedEntries,
  };
};

const drawRectAtlasEntry = (context, entry) => {
  context.save();
  context.translate(entry.x, entry.y);
  context.scale(ATLAS_RESOLUTION, ATLAS_RESOLUTION);

  const borderInset = entry.borderWidth / 2;
  const x = borderInset;
  const y = borderInset;
  const width = Math.max(0, entry.width - entry.borderWidth);
  const height = Math.max(0, entry.height - entry.borderWidth);
  const radius = clampRadius(entry.radius, width, height);

  context.beginPath();
  roundedRectPath(context, x, y, width, height, radius);
  context.fillStyle = entry.fill;
  context.fill();
  if (entry.borderWidth > 0) {
    context.lineWidth = entry.borderWidth;
    context.strokeStyle = entry.borderColor;
    context.stroke();
  }
  context.restore();
};

const roundedRectPath = (context, x, y, width, height, radius) => {
  context.moveTo(x + radius.topLeft, y);
  context.lineTo(x + width - radius.topRight, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius.topRight);
  context.lineTo(x + width, y + height - radius.bottomRight);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius.bottomRight,
    y + height,
  );
  context.lineTo(x + radius.bottomLeft, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius.bottomLeft);
  context.lineTo(x, y + radius.topLeft);
  context.quadraticCurveTo(x, y, x + radius.topLeft, y);
};

const normalizeRadius = (radius) => {
  if (typeof radius === 'number') {
    return {
      topLeft: radius,
      topRight: radius,
      bottomRight: radius,
      bottomLeft: radius,
    };
  }
  return {
    topLeft: Number(radius?.topLeft ?? radius?.top ?? radius?.left ?? 0),
    topRight: Number(radius?.topRight ?? radius?.top ?? radius?.right ?? 0),
    bottomRight: Number(
      radius?.bottomRight ?? radius?.bottom ?? radius?.right ?? 0,
    ),
    bottomLeft: Number(
      radius?.bottomLeft ?? radius?.bottom ?? radius?.left ?? 0,
    ),
  };
};

const clampRadius = (radius, width, height) => {
  const limit = Math.max(0, Math.min(width, height) / 2);
  return {
    topLeft: Math.min(limit, radius.topLeft),
    topRight: Math.min(limit, radius.topRight),
    bottomRight: Math.min(limit, radius.bottomRight),
    bottomLeft: Math.min(limit, radius.bottomLeft),
  };
};

const resolveCanvasColor = (store, color) => {
  const resolved = getColor(store?.theme, color);
  if (typeof resolved === 'number') {
    return `#${resolved.toString(16).padStart(6, '0')}`;
  }
  return resolved ?? 'transparent';
};

const nextPowerOfTwo = (value) => 2 ** Math.ceil(Math.log2(value));

const syncRenderedRef = (store, node, object) => {
  const ref = store?.elementById?.get(node.id);
  if (!ref) return;
  ref._renderObject = object;
  if (node.feature === 'relations') {
    ref.children = [getRelationPathProxy(object)];
    ref._linkPoints = object.linkPoints;
  }
};

const getRelationPathProxy = (object) => {
  if (!object._patchmapPathProxy) {
    object._patchmapPathProxy = {
      type: 'path',
      allowContainsPoint: true,
      get strokeStyle() {
        return object.strokeStyle;
      },
      getBounds: () => getLinkBounds(object.linkPoints),
    };
  }
  return object._patchmapPathProxy;
};

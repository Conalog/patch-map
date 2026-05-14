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
    this.objectsById = new Map();
    this.particlesById = new Map();
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
      object.destroy({ children: true });
    }
    this.objectsById.clear();
    this.particlesById.clear();
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

    for (const id of this.particlesById.keys()) {
      if (this.#getParticleKind(id) === kind && !wantedIds.has(id)) {
        this.particlesById.delete(id);
      }
    }

    const particles = nodes.map((node) => {
      let particle = this.particlesById.get(node.id);
      if (!particle) {
        particle = new Particle({ texture: Texture.WHITE });
        particle._patchmapNodeId = node.id;
        particle._patchmapKind = kind;
        this.particlesById.set(node.id, particle);
      }
      applyNodeToParticle(particle, node, this.store);
      return particle;
    });

    layer.particleChildren.length = 0;
    layer.particleChildren.push(...particles);
    layer.update();
  }

  #upsertParticle(node) {
    const kind = node.layer === 'background' ? 'background' : 'bar';
    const layer = this.aggregateLayers[kind];
    let particle = this.particlesById.get(node.id);
    if (!particle) {
      particle = new Particle({ texture: Texture.WHITE });
      particle._patchmapNodeId = node.id;
      particle._patchmapKind = kind;
      this.particlesById.set(node.id, particle);
      layer.particleChildren.push(particle);
    }
    applyNodeToParticle(particle, node, this.store);
  }

  #removeParticle(id) {
    const particle = this.particlesById.get(id);
    if (!particle) return;
    const layer = this.aggregateLayers[particle._patchmapKind];
    const index = layer.particleChildren.indexOf(particle);
    if (index !== -1) {
      layer.particleChildren.splice(index, 1);
    }
    this.particlesById.delete(id);
  }

  #getParticleKind(id) {
    return this.particlesById.get(id)?._patchmapKind;
  }

  #removeNode(id) {
    const object = this.objectsById.get(id);
    if (!object) return;
    object.parent?.removeChild(object);
    object.destroy({ children: true });
    this.objectsById.delete(id);
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
  background: createAggregateLayer('patchmap-aggregate-background-layer'),
  bar: createAggregateLayer('patchmap-aggregate-bar-layer'),
});

const createAggregateLayer = (label) => {
  const layer = new ParticleContainer({
    label,
    texture: Texture.WHITE,
    boundsArea: new Rectangle(-1_000_000, -1_000_000, 2_000_000, 2_000_000),
    dynamicProperties: {
      vertex: true,
      position: true,
      rotation: true,
      color: true,
    },
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
  applyNodeTransform(object, node);
  object.width = node.frame.width;
  object.height = node.frame.height;
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

const applyNodeToParticle = (particle, node, store) => {
  particle.x = node.frame.x;
  particle.y = node.frame.y;
  particle.scaleX = node.frame.width;
  particle.scaleY = node.frame.height;
  particle.rotation = node.frame.rotation ?? 0;
  particle.anchorX = 0;
  particle.anchorY = 0;
  particle.alpha = node.frame.alpha ?? 1;
  const tint = getNodeTint(node, store);
  if (tint !== undefined) {
    particle.tint = normalizeColor(tint);
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

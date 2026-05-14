import {
  Container,
  Particle,
  ParticleContainer,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import { getColor } from '../../utils/get';

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
      object.destroy();
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
    if (!object) {
      object = this.#createDisplayObject(node);
      this.objectsById.set(node.id, object);
      layer.addChild(object);
    } else if (object.parent !== layer) {
      object.parent?.removeChild(object);
      layer.addChild(object);
    }

    applyNodeToObject(object, node, this.store);
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
    object.destroy();
    this.objectsById.delete(id);
  }

  #getLayer(node) {
    if (node.layer === 'background') return this.layers.background;
    if (node.layer === 'bar') return this.layers.bar;
    if (node.layer === 'relations') return this.layers.relations;
    return this.layers.fallback;
  }

  #createDisplayObject(node) {
    const texture = resolveNodeTexture(node, this.store) ?? Texture.WHITE;
    const object = new Sprite(texture);
    object.label = `patchmap-${node.id}`;
    object._patchmapNodeId = node.id;
    applySlice(object, texture);
    return object;
  }
}

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
  const texture = resolveNodeTexture(node, store);
  if (texture && object.texture !== texture) {
    object.texture = texture;
    applySlice(object, texture);
  }

  object.visible = node.frame.visible !== false;
  object.renderable = object.visible;
  object.x = node.frame.x;
  object.y = node.frame.y;
  object.width = node.frame.width;
  object.height = node.frame.height;
  object.rotation = node.frame.rotation ?? 0;
  object.alpha = node.frame.alpha ?? 1;
  const tint = getNodeTint(node, store);
  if (tint !== undefined) {
    object.tint = tint;
  }
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
    particle.tint = tint;
  }
};

const getNodeTint = (node, store) =>
  getColor(store.theme, node.material?.tint ?? node.material?.source?.fill);

const resolveNodeTexture = (node, store) => {
  const source = node.material?.source;
  if (!source) return Texture.WHITE;
  return store.textureResolver?.(source, store, node) ?? Texture.WHITE;
};

const applySlice = (object, texture) => {
  const slice = texture.metadata?.slice;
  if (!slice) return;
  object.leftWidth = slice.leftWidth ?? 0;
  object.rightWidth = slice.rightWidth ?? 0;
  object.topHeight = slice.topHeight ?? 0;
  object.bottomHeight = slice.bottomHeight ?? 0;
};

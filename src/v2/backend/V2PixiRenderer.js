import { Container, Sprite, Texture } from 'pixi.js';
import { getColor } from '../../utils/get';

export class V2PixiRenderer {
  constructor({ store, target }) {
    this.store = store;
    this.target = target ?? store?.world;
    this.layers = createLayers();
    this.objectsById = new Map();
    this.attached = false;
  }

  attach() {
    if (this.attached || !this.target) return;
    this.target.addChild(this.layers.background);
    this.target.addChild(this.layers.bar);
    this.target.addChild(this.layers.fallback);
    this.target.addChild(this.layers.relations);
    this.attached = true;
  }

  render(snapshot) {
    this.attach();
    if (!snapshot?.renderIR) return;

    const diff = snapshot.renderDiff ?? {
      added: snapshot.renderIR.nodes,
      updated: [],
      removed: [],
    };
    for (const node of diff.removed ?? []) {
      this.#removeNode(node.id);
    }
    for (const node of diff.added ?? []) {
      this.#upsertNode(node);
    }
    for (const node of diff.updated ?? []) {
      this.#upsertNode(node);
    }
  }

  destroy() {
    for (const object of this.objectsById.values()) {
      object.destroy();
    }
    this.objectsById.clear();
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
    object.label = `patchmap-v2-${node.id}`;
    object._patchmapV2NodeId = node.id;
    applySlice(object, texture);
    return object;
  }
}

const createLayers = () => ({
  background: createLayer('patchmap-v2-background-layer'),
  bar: createLayer('patchmap-v2-bar-layer'),
  fallback: createLayer('patchmap-v2-fallback-layer'),
  relations: createLayer('patchmap-v2-relations-layer'),
});

const createLayer = (label) => {
  const layer = new Container({ label });
  layer._patchmapInternal = true;
  layer._patchmapV2Layer = true;
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
  if (node.material?.tint !== undefined) {
    object.tint = getColor(store.theme, node.material.tint);
  }
};

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

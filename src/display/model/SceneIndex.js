export class SceneIndex {
  constructor() {
    this.elementById = new Map();
    this.byId = new Map();
    this.byType = new Map();
    this.selectable = new Set();
    this.version = 0;
  }

  add(node) {
    const keys = getSceneIndexKeys(node);
    if (!keys) return;

    if (keys.id) {
      this.elementById.set(keys.id, node);
    }
    addToBucket(this.byId, keys.id, node);
    addToBucket(this.byType, keys.type, node);
    if (keys.selectable) {
      this.selectable.add(node);
    }
    this.version++;
  }

  update(node, previousKeys) {
    this.remove(node, previousKeys);
    this.add(node);
  }

  remove(node, keys = getSceneIndexKeys(node)) {
    if (!keys) return;

    if (keys.id && this.elementById.get(keys.id) === node) {
      this.elementById.delete(keys.id);
    }
    removeFromBucket(this.byId, keys.id, node);
    removeFromBucket(this.byType, keys.type, node);
    this.selectable.delete(node);
    this.version++;
  }

  touch() {
    this.version++;
  }

  getById(id) {
    return this.elementById.get(id) ?? null;
  }

  getAllById(id) {
    return [...(this.byId.get(id) ?? [])];
  }

  getByType(type) {
    return [...(this.byType.get(type) ?? [])];
  }
}

export const getSceneIndexKeys = (node) => {
  if (!node?.type) return null;
  return {
    id: node.id,
    type: node.type,
    selectable: Boolean(node.constructor?.isSelectable),
  };
};

const addToBucket = (buckets, key, node) => {
  if (key === undefined || key === null) return;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = new Set();
    buckets.set(key, bucket);
  }
  bucket.add(node);
};

const removeFromBucket = (buckets, key, node) => {
  if (key === undefined || key === null) return;
  const bucket = buckets.get(key);
  if (!bucket) return;
  bucket.delete(node);
  if (bucket.size === 0) {
    buckets.delete(key);
  }
};

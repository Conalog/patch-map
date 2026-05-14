export class LogicalSceneIndex {
  constructor() {
    this.recordsById = new Map();
    this.recordsByNode = new WeakMap();
    this.byType = new Map();
    this.byDisplay = new Map();
    this.childrenById = new Map();
    this.selectableIds = new Set();
    this.version = 0;
  }

  addFromNode(node) {
    const record = createLogicalNodeRecord(node);
    if (!record) return;

    this.recordsByNode.set(node, record);
    if (record.id) {
      this.recordsById.set(record.id, record);
    }
    addToBucket(this.byType, record.type, record);
    addToBucket(this.byDisplay, record.display, record);
    if (record.selectable && record.id) {
      this.selectableIds.add(record.id);
    }
    this.#addParentChild(record);
    this.version++;
  }

  updateFromNode(node) {
    this.removeFromNode(node);
    this.addFromNode(node);
  }

  removeFromNode(node) {
    const record = this.recordsByNode.get(node);
    if (!record) return;

    if (record.id && this.recordsById.get(record.id)?.ref === node) {
      this.recordsById.delete(record.id);
    }
    removeFromBucket(this.byType, record.type, record);
    removeFromBucket(this.byDisplay, record.display, record);
    if (record.id) {
      this.selectableIds.delete(record.id);
    }
    this.#removeParentChild(record);
    this.recordsByNode.delete(node);
    this.version++;
  }

  touch() {
    this.version++;
  }

  getById(id) {
    return this.recordsById.get(id) ?? null;
  }

  getRefById(id) {
    return this.getById(id)?.ref ?? null;
  }

  getByType(type) {
    return [...(this.byType.get(type) ?? [])];
  }

  getRefsByType(type) {
    return this.getByType(type).map((record) => record.ref);
  }

  getByDisplay(display) {
    return [...(this.byDisplay.get(display) ?? [])];
  }

  getRefsByDisplay(display) {
    return this.getByDisplay(display).map((record) => record.ref);
  }

  getChildren(parentId) {
    const ids = this.childrenById.get(parentId);
    if (!ids) return [];
    return [...ids].map((id) => this.getById(id)).filter(Boolean);
  }

  #addParentChild(record) {
    if (!record.parentId || !record.id) return;
    let childIds = this.childrenById.get(record.parentId);
    if (!childIds) {
      childIds = new Set();
      this.childrenById.set(record.parentId, childIds);
    }
    childIds.add(record.id);
  }

  #removeParentChild(record) {
    if (!record.parentId || !record.id) return;
    const childIds = this.childrenById.get(record.parentId);
    if (!childIds) return;
    childIds.delete(record.id);
    if (childIds.size === 0) {
      this.childrenById.delete(record.parentId);
    }
  }
}

export const createLogicalNodeRecord = (node) => {
  if (!node?.type) return null;
  const id = node.id;
  const attrs = node.props?.attrs ?? {};
  return {
    id,
    type: node.type,
    display: node.display ?? attrs.display,
    label: node.label,
    parentId: node.parent?.id,
    childIds: getChildIds(node),
    selectable: Boolean(node.constructor?.isSelectable),
    attrs,
    props: node.props,
    ref: node,
  };
};

const getChildIds = (node) => {
  if (!Array.isArray(node.children)) return [];
  const ids = [];
  for (const child of node.children) {
    if (child?.id) {
      ids.push(child.id);
    }
  }
  return ids;
};

const addToBucket = (buckets, key, record) => {
  if (key === undefined || key === null) return;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = new Set();
    buckets.set(key, bucket);
  }
  bucket.add(record);
};

const removeFromBucket = (buckets, key, record) => {
  if (key === undefined || key === null) return;
  const bucket = buckets.get(key);
  if (!bucket) return;
  bucket.delete(record);
  if (bucket.size === 0) {
    buckets.delete(key);
  }
};

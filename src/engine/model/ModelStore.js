import { CompatibilityRef } from '../compat/CompatibilityRef';

export class ModelStore {
  constructor() {
    this.root = createRecord({
      id: '$root',
      type: 'canvas',
      kind: 'root',
      parentId: null,
      props: { type: 'canvas', id: '$root', children: [] },
      depth: 0,
    });
    this.records = new Map([[this.root.id, this.root]]);
    this.byType = new Map([['canvas', new Set([this.root.id])]]);
    this.byDisplay = new Map();
    this.childrenById = new Map([[this.root.id, []]]);
    this.componentsByParentId = new Map();
    this.selectableIds = new Set();
    this.sceneIndexAdapter = createSceneIndexAdapter(this);
    this.modelIndexAdapter = createModelIndexAdapter(this);
    this.revision = 0;
  }

  add(recordInput) {
    const record = createRecord(recordInput);
    if (!record?.id) {
      throw new Error(`PatchMap model record requires an id: ${record?.type}`);
    }
    if (this.records.has(record.id)) {
      throw new Error(`Duplicate PatchMap model id: ${record.id}`);
    }

    this.records.set(record.id, record);
    addToBucket(this.byType, record.type, record.id);
    addToBucket(this.byDisplay, record.display, record.id);
    addChildId(this.childrenById, record.parentId, record.id);
    if (record.kind === 'component') {
      addChildId(this.componentsByParentId, record.parentId, record.id);
    }
    if (record.selectable) {
      this.selectableIds.add(record.id);
    }
    this.revision += 1;
    return record;
  }

  replaceRecordProps(id, props) {
    const record = this.records.get(id);
    if (!record) return null;

    removeFromBucket(this.byType, record.type, id);
    removeFromBucket(this.byDisplay, record.display, id);
    const nextRecord = createRecord({
      ...record,
      type: props.type ?? record.type,
      props,
      ref: record.ref,
    });
    this.records.set(id, nextRecord);
    addToBucket(this.byType, nextRecord.type, id);
    addToBucket(this.byDisplay, nextRecord.display, id);
    this.revision += 1;
    return nextRecord;
  }

  remove(id) {
    const record = this.records.get(id);
    if (!record || record.id === this.root.id) return;

    for (const childId of this.childrenById.get(id) ?? []) {
      this.remove(childId);
    }
    removeFromBucket(this.byType, record.type, id);
    removeFromBucket(this.byDisplay, record.display, id);
    removeChildId(this.childrenById, record.parentId, id);
    removeChildId(this.componentsByParentId, record.parentId, id);
    this.childrenById.delete(id);
    this.componentsByParentId.delete(id);
    this.selectableIds.delete(id);
    this.records.delete(id);
    this.revision += 1;
  }

  get(id) {
    return this.records.get(id) ?? null;
  }

  getByType(type) {
    return idsToRecords(this, this.byType.get(type));
  }

  getByDisplay(display) {
    return idsToRecords(this, this.byDisplay.get(display));
  }

  getChildren(id) {
    return idsToRecords(this, this.childrenById.get(id));
  }

  getComponents(id) {
    return idsToRecords(this, this.componentsByParentId.get(id));
  }

  selector(path) {
    if (typeof path !== 'string') return [];

    const id = matchExactIdPath(path);
    if (id) {
      const record = this.get(id);
      return record ? [record] : [];
    }

    const anyPath = matchExactAnyPath(path);
    if (anyPath) {
      return anyPath.key === 'display'
        ? this.getByDisplay(anyPath.value)
        : this.getByType(anyPath.value);
    }

    const childrenPath = matchExactChildrenPath(path);
    if (childrenPath) {
      const records =
        childrenPath.key === 'display'
          ? this.getByDisplay(childrenPath.value)
          : this.getByType(childrenPath.value);
      if (childrenPath.children) {
        return records.flatMap((record) => this.getChildren(record.id));
      }
      return records;
    }

    return [];
  }

  syncCompatibilityRefs(layout, store = null) {
    for (const record of this.records.values()) {
      const ref = record.ref;
      ref._layout = layout;
      ref.store = store;
      ref.parent =
        record.kind === 'root'
          ? (store?.world ?? null)
          : (this.get(record.parentId)?.ref ?? null);
      ref.children = this.getChildren(record.id)
        .filter((child) => child.kind !== 'component')
        .map((child) => child.ref);
    }
    if (store) {
      store.sceneIndex = this.sceneIndexAdapter;
      store.modelIndex = this.modelIndexAdapter;
      store.elementById = this.sceneIndexAdapter.elementById;
    }
  }
}

export const createRecord = ({
  id,
  type,
  kind = 'element',
  parentId = null,
  props = {},
  depth = 0,
  generated = false,
  ref = null,
}) => {
  const attrs = props.attrs ?? {};
  const record = {
    id,
    type,
    kind,
    parentId,
    depth,
    generated,
    props,
    attrs,
    display: props.display ?? attrs.display,
    label: props.label,
    show: props.show !== false,
    locked: props.locked === true,
    selectable: isSelectableType(type, kind),
    ref: null,
  };
  record.ref = syncCompatibilityRef(ref ?? createCompatibilityRef(), record);
  return record;
};

const createCompatibilityRef = () => new CompatibilityRef();

const syncCompatibilityRef = (ref, record) => {
  ref.id = record.id;
  ref.type = record.type;
  ref.label = record.label;
  ref.display = record.display;
  ref.props = record.props;
  ref.attrs = record.attrs;
  ref._record = record;
  return ref;
};

const isSelectableType = (type, kind) =>
  kind === 'element' &&
  (type === 'group' ||
    type === 'grid' ||
    type === 'item' ||
    type === 'rect' ||
    type === 'image' ||
    type === 'text' ||
    type === 'relations');

const addToBucket = (buckets, key, id) => {
  if (key === undefined || key === null) return;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = new Set();
    buckets.set(key, bucket);
  }
  bucket.add(id);
};

const removeFromBucket = (buckets, key, id) => {
  if (key === undefined || key === null) return;
  const bucket = buckets.get(key);
  if (!bucket) return;
  bucket.delete(id);
  if (bucket.size === 0) {
    buckets.delete(key);
  }
};

const addChildId = (childrenById, parentId, childId) => {
  if (!parentId) return;
  let children = childrenById.get(parentId);
  if (!children) {
    children = [];
    childrenById.set(parentId, children);
  }
  children.push(childId);
};

const removeChildId = (childrenById, parentId, childId) => {
  if (!parentId) return;
  const children = childrenById.get(parentId);
  if (!children) return;
  const index = children.indexOf(childId);
  if (index !== -1) {
    children.splice(index, 1);
  }
};

const idsToRecords = (store, ids) =>
  [...(ids ?? [])].map((id) => store.get(id)).filter(Boolean);

const recordsToRefs = (records) => records.map((record) => record.ref);

const createSceneIndexAdapter = (store) => ({
  get version() {
    return store.revision;
  },
  get selectable() {
    return recordsToRefs(idsToRecords(store, store.selectableIds));
  },
  get elementById() {
    return new Map(
      [...store.records.values()].map((record) => [record.id, record.ref]),
    );
  },
  getById(id) {
    return store.get(id)?.ref ?? null;
  },
  getByType(type) {
    return recordsToRefs(store.getByType(type));
  },
  getByDisplay(display) {
    return recordsToRefs(store.getByDisplay(display));
  },
  queryPoint(point, _config, parent) {
    const localPoint = parent?.toLocal ? parent.toLocal(point) : null;
    return querySelectableFrames(
      store,
      (bounds) =>
        boundsContainPoint(bounds, point) ||
        (localPoint && boundsContainPoint(bounds, localPoint)),
    );
  },
  queryBounds(bounds, _config, parent) {
    const localBounds = parent?.toLocal
      ? convertBoundsToLocal(bounds, parent)
      : null;
    return querySelectableFrames(
      store,
      (candidateBounds) =>
        boundsIntersect(bounds, candidateBounds) ||
        (localBounds && boundsIntersect(localBounds, candidateBounds)),
    );
  },
  add() {},
  update() {},
  remove() {},
  touch() {},
});

const createModelIndexAdapter = (store) => ({
  get version() {
    return store.revision;
  },
  getRefById(id) {
    return store.get(id)?.ref ?? null;
  },
  getRefsByType(type) {
    return recordsToRefs(store.getByType(type));
  },
  getRefsByDisplay(display) {
    return recordsToRefs(store.getByDisplay(display));
  },
  updateFromNode() {},
  removeFromNode() {},
  touch() {},
});

const querySelectableFrames = (store, predicate) => {
  const refs = [];
  for (const id of store.selectableIds) {
    const record = store.get(id);
    if (!record || !record.ref.visible || !predicate(getRecordBounds(record))) {
      continue;
    }
    refs.push(record.ref);
  }
  return refs;
};

const getRecordBounds = (record) => {
  const frame = record.ref._layout?.getFrame(record.id);
  const x = frame?.x ?? record.attrs?.x ?? 0;
  const y = frame?.y ?? record.attrs?.y ?? 0;
  const width = frame?.width ?? record.props?.size?.width ?? 0;
  const height = frame?.height ?? record.props?.size?.height ?? 0;
  return {
    minX: x,
    minY: y,
    maxX: x + width,
    maxY: y + height,
  };
};

const boundsContainPoint = (bounds, point) =>
  point.x >= bounds.minX &&
  point.x <= bounds.maxX &&
  point.y >= bounds.minY &&
  point.y <= bounds.maxY;

const boundsIntersect = (left, right) =>
  !left ||
  !right ||
  (left.minX <= right.maxX &&
    left.maxX >= right.minX &&
    left.minY <= right.maxY &&
    left.maxY >= right.minY);

const convertBoundsToLocal = (bounds, parent) => {
  if (!bounds) return null;
  const topLeft = parent.toLocal({ x: bounds.minX, y: bounds.minY });
  const bottomRight = parent.toLocal({ x: bounds.maxX, y: bounds.maxY });
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxX: Math.max(topLeft.x, bottomRight.x),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
};

const matchExactIdPath = (path) => {
  const match = path.match(/^\$..\[\?\(@\.id\s*={2,3}\s*(["'])([^"']+)\1\)\]$/);
  return match?.[2] ?? null;
};

const matchExactAnyPath = (path) => {
  const match = path.match(
    /^\$..\[\?\(@\.(display|type)\s*={2,3}\s*(["'])([^"']+)\2\)\]$/,
  );
  if (!match) return null;
  return {
    key: match[1],
    value: match[3],
  };
};

const matchExactChildrenPath = (path) => {
  const match = path.match(
    /^\$..children\[\?\(@\.(display|type)\s*={2,3}\s*(["'])([^"']+)\2\)\](\.children)?$/,
  );
  if (!match) return null;
  return {
    key: match[1],
    value: match[3],
    children: Boolean(match[4]),
  };
};

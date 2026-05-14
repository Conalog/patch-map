import { applyComponentDefaults } from '../../display/default-props';

export const updateV2Model = (model, opts = {}) => {
  const targets = resolveTargets(model, opts);
  const changes = opts.changes ?? null;
  if (!changes || targets.length === 0) return [];

  const updated = [];
  for (const target of targets) {
    if (canUseComponentOnlyUpdate(target, changes, opts)) {
      updateComponents(model, target, changes.components, opts);
      updated.push(model.get(target.id) ?? target);
      continue;
    }

    const nextProps =
      opts.mergeStrategy === 'replace'
        ? { type: target.type, ...changes }
        : mergePatch(target.props, changes);
    const nextRecord = model.replaceRecordProps(target.id, nextProps);
    if (!nextRecord) continue;
    if (Array.isArray(changes.components) && nextRecord.type === 'item') {
      updateComponents(model, nextRecord, changes.components, opts);
    }
    updated.push(nextRecord);
  }
  return updated;
};

const canUseComponentOnlyUpdate = (target, changes, opts) =>
  target.type === 'item' &&
  Array.isArray(changes.components) &&
  opts.mergeStrategy !== 'replace' &&
  Object.keys(changes).every((key) => key === 'components');

const resolveTargets = (model, opts) => {
  const directElements = normalizeElements(opts.elements)
    .map((element) => resolveElementRecord(model, element))
    .filter(Boolean);
  if (opts.path) {
    directElements.push(...model.selector(opts.path));
  }
  return uniqueRecords(directElements);
};

const normalizeElements = (elements) => {
  if (!elements) return [];
  return Array.isArray(elements) ? elements : [elements];
};

const resolveElementRecord = (model, element) => {
  if (!element) return null;
  if (typeof element === 'string') return model.get(element);
  if (element._v2Record) return model.get(element._v2Record.id);
  if (element.id) return model.get(element.id);
  return null;
};

const updateComponents = (model, itemRecord, componentChanges, opts) => {
  const current = model.getComponents(itemRecord.id);
  const used = new Set();
  const nextComponentProps = [];

  for (const change of componentChanges) {
    const match = findComponentRecord(current, change, used);
    const nextProps = match
      ? mergeComponentProps(match.props, change, opts)
      : applyComponentDefaults(change);
    if (match) {
      used.add(match.id);
      model.replaceRecordProps(match.id, nextProps);
    } else if (nextProps.show !== false) {
      model.add({
        id: nextProps.id,
        type: nextProps.type,
        kind: 'component',
        parentId: itemRecord.id,
        props: nextProps,
        depth: itemRecord.depth + 1,
      });
    }
    nextComponentProps.push(nextProps);
  }

  if (opts.mergeStrategy === 'replace') {
    for (const component of current) {
      if (!used.has(component.id)) {
        model.remove(component.id);
      }
    }
  }

  const mergedItemProps = {
    ...itemRecord.props,
    components:
      opts.mergeStrategy === 'replace'
        ? nextComponentProps
        : mergeParentComponents(
            itemRecord.props.components,
            nextComponentProps,
          ),
  };
  model.replaceRecordProps(itemRecord.id, mergedItemProps);
};

const findComponentRecord = (records, change, used) => {
  const match = records.find(
    (record) =>
      !used.has(record.id) &&
      ((change.id && isComponentIdMatch(record, change.id)) ||
        (change.label && record.label === change.label)),
  );
  if (match) return match;
  if (!change.id && !change.label) {
    return records.find(
      (record) => !used.has(record.id) && record.type === change.type,
    );
  }
  return null;
};

const isComponentIdMatch = (record, id) =>
  record.id === id ||
  record.props?.id === id ||
  record.id === `${record.parentId}.${id}`;

const mergeComponentProps = (props, change, opts) =>
  opts.mergeStrategy === 'replace'
    ? applyComponentDefaults({ type: props.type, ...change })
    : mergePatch(props, change);

const mergePatch = (target, source) => {
  if (source === undefined) return target;
  if (!isMergeableObject(target) || !isMergeableObject(source)) {
    return source;
  }

  const out = { ...target };
  for (const key of Object.keys(source)) {
    out[key] = mergePatch(out[key], source[key]);
  }
  return out;
};

const isMergeableObject = (value) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const mergeParentComponents = (current = [], next = []) => {
  const byIdOrType = new Map();
  for (const component of current) {
    byIdOrType.set(
      component.id ?? component.label ?? component.type,
      component,
    );
  }
  for (const component of next) {
    byIdOrType.set(
      component.id ?? component.label ?? component.type,
      component,
    );
  }
  return [...byIdOrType.values()];
};

const uniqueRecords = (records) => {
  const seen = new Set();
  const unique = [];
  for (const record of records) {
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    unique.push(record);
  }
  return unique;
};

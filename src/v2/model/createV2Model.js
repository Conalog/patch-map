import {
  applyComponentDefaults,
  applyElementDefaults,
} from '../../display/default-props';
import { V2ModelStore } from './V2ModelStore';

export const createV2Model = (data) => {
  const store = new V2ModelStore();
  const elements = Array.isArray(data) ? data : [];
  const normalized = elements.map((element) =>
    applyElementDefaults(seedStableComponentIds(element)),
  );

  store.root.props.children = normalized;
  for (const element of normalized) {
    addElement(store, element, {
      parentId: store.root.id,
      depth: 1,
      generated: false,
    });
  }
  return store;
};

const addElement = (store, props, context) => {
  const record = store.add({
    id: props.id,
    type: props.type,
    kind: 'element',
    parentId: context.parentId,
    props,
    depth: context.depth,
    generated: context.generated,
  });

  if (props.type === 'group') {
    for (const child of props.children ?? []) {
      addElement(store, applyElementDefaults(seedStableComponentIds(child)), {
        parentId: props.id,
        depth: context.depth + 1,
        generated: false,
      });
    }
    return record;
  }

  if (props.type === 'grid') {
    addGridItems(store, props, context.depth + 1);
    return record;
  }

  if (props.type === 'item') {
    addComponents(store, props, context.depth + 1);
  }

  return record;
};

const addGridItems = (store, grid, depth) => {
  const cells = grid.cells ?? [];
  const gap = grid.gap ?? { x: 0, y: 0 };
  const itemTemplate = grid.item ?? {};
  const itemWidth = itemTemplate.size?.width ?? 0;
  const itemHeight = itemTemplate.size?.height ?? 0;

  for (let rowIndex = 0; rowIndex < cells.length; rowIndex += 1) {
    const row = cells[rowIndex] ?? [];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const cellValue = row[colIndex];
      const inactive = !cellValue;
      if (inactive && grid.inactiveCellStrategy !== 'hide') continue;

      const id = `${grid.id}.${rowIndex}.${colIndex}`;
      const itemProps = applyElementDefaults(
        seedStableComponentIds({
          type: 'item',
          id,
          ...cloneGridItemTemplate(itemTemplate),
          label: String(cellValue),
          attrs: {
            ...(itemTemplate.attrs ?? {}),
            gridIndex: { row: rowIndex, col: colIndex },
            x: colIndex * (itemWidth + gap.x),
            y: rowIndex * (itemHeight + gap.y),
          },
          show: !inactive,
        }),
      );
      store.add({
        id,
        type: 'item',
        kind: 'element',
        parentId: grid.id,
        props: itemProps,
        depth,
        generated: true,
      });
      addComponents(store, itemProps, depth + 1);
    }
  }
};

const addComponents = (store, itemProps, depth) => {
  const components = itemProps.components ?? [];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const componentProps = applyComponentDefaults({
      ...component,
      id: component.id ?? `${itemProps.id}.${component.type}.${index}`,
    });
    store.add({
      id: componentProps.id,
      type: componentProps.type,
      kind: 'component',
      parentId: itemProps.id,
      props: componentProps,
      depth,
      generated: false,
    });
  }
};

const seedStableComponentIds = (element) => {
  if (!element || typeof element !== 'object') return element;

  if (element.type === 'group' && Array.isArray(element.children)) {
    return {
      ...element,
      children: element.children.map(seedStableComponentIds),
    };
  }

  if (element.type !== 'item' || !Array.isArray(element.components)) {
    return element;
  }

  return {
    ...element,
    components: element.components.map((component, index) => {
      if (!component || typeof component !== 'object' || component.id) {
        return component;
      }
      return {
        ...component,
        id: `${element.id}.${component.type}.${index}`,
      };
    }),
  };
};

const cloneGridItemTemplate = (itemTemplate) => {
  const next = structuredClone(itemTemplate);
  if (!Array.isArray(next.components)) return next;
  next.components = next.components.map(({ id, ...component }) => component);
  return next;
};

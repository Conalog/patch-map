import { Container } from 'pixi.js';
import { findContainers } from '../../utils/find';
import { frameComponent } from '../components/frame';
import { GRID_OBJECT_CONFIG, GROUP_DEFAULT_CONFIG } from '../config';

export const drawFrame = (viewport, objects = [], options = {}) => {
  removeAllObjects(viewport);
  const groupContainer = createGroupContainer(objects, options);

  for (const object of objects) {
    const group = object.group;
    const objectOption = options[group] ?? {};

    if (object.type === 'grid') {
      drawGridObject(object, groupContainer[group], objectOption);
    } else if (object.type === 'each') {
      drawEachObject(object, groupContainer[group], objectOption);
    }
  }
  viewport.addChild(...Object.values(groupContainer));
};

const drawGridObject = (object, container, options) => {
  const gridContainer = createContainer(object.id, {
    label: object.name,
    transform: object.transform,
  });
  gridContainer.group = container.group;
  gridContainer.metadata = object.metadata ?? {};
  const frameName = getFrameName(options.frame, object.transform);
  createGridElements(object.layout, gridContainer, frameName);
  container.addChild(gridContainer);

  function createGridElements(layout, container, frameName) {
    for (let rowIndex = 0; rowIndex < layout.length; rowIndex++) {
      const row = layout[rowIndex];
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const col = row[colIndex];
        if (!col || col === 0) continue;

        const gridElementId = `${object.id}.${rowIndex}.${colIndex}`;
        const frame = frameComponent(frameName, {
          id: gridElementId,
          ...object.transform,
          x: colIndex * (object.transform.width + GRID_OBJECT_CONFIG.margin),
          y: rowIndex * (object.transform.height + GRID_OBJECT_CONFIG.margin),
          parent: container,
        });
        frame.metadata = object.metadata ?? {};
      }
    }
  }
};

const drawEachObject = (object, container, options) => {
  const frameName = getFrameName(options.frame, object.transform);
  const frame = frameComponent(frameName, {
    id: object.id,
    label: object.name,
    ...object.transform,
    parent: container,
  });
  frame.metadata = object.metadata ?? {};
};

const createContainer = (id, options = {}) => {
  const container = new Container({ isRenderGroup: true });
  container.type = 'container';
  container.id = id;
  container.interactive = true;
  container.label = options.label ?? null;
  container.zIndex = options.zIndex ?? 0;
  if (options.transform) {
    container.position.set(options.transform.x ?? 0, options.transform.y ?? 0);
    container.angle = options.transform.rotation ?? 0;
  }
  return container;
};

const createGroupContainer = (objects, options) => {
  const objectGroups = Array.from(
    new Set(objects.map((object) => object.group)),
  );
  const container = {};
  for (const group of objectGroups) {
    const objContainer = createContainer(group, {
      zIndex: options[group]?.zIndex,
    });
    objContainer.renderable = options[group]?.show ?? GROUP_DEFAULT_CONFIG.show;

    objContainer.group = group;
    container[group] = objContainer;
  }
  return container;
};

const removeAllObjects = (viewport) => {
  const containers = findContainers(viewport);
  containers.forEach((container) => {
    container.destroy({
      children: true,
      context: true,
      style: true,
    });
  });
};

const getFrameName = (frameName, transform) => {
  if (frameName) return frameName;
  return transform.width && transform.height ? 'base' : 'icon';
};

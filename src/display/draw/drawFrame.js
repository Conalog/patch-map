import { Container } from 'pixi.js';
import { frameComponent } from '../components/frame';
import { findContainers } from '../../utils/find';

const GRID_CONFIG = {
  scale: 40,
  margin: 4,
};

export const drawFrame = (viewport, data, opts = {}) => {
  removeAllContainers(viewport);

  const containers = [];
  for (const [key, items] of Object.entries(data)) {
    if (!(key in opts) || !opts[key].show) continue;
    if (key === 'grids') {
      for (const item of items) {
        const properties = item.properties;
        const frameWidth = properties.spec.width * GRID_CONFIG.scale;
        const frameHeight = properties.spec.height * GRID_CONFIG.scale;

        const container = new Container({ isRenderGroup: true });
        container.id = item.id;
        container.type = key;
        container.label = item.name;
        container.interactive = true;
        container.properties = properties;
        container.position.set(properties.transform.x, properties.transform.y);
        container.angle = properties.transform.rotation;

        const childrenLength = item.children.length;
        for (let y = 0; y < childrenLength; y++) {
          const row = item.children[y];
          const rowLength = row.length;

          for (let x = 0; x < rowLength; x++) {
            const col = row[x];
            if (col === '0') continue;

            const label = `${item.id}.${y}.${x}`;
            const frame = frameComponent(opts[key].frame, {
              label,
              x: x * (frameWidth + GRID_CONFIG.margin),
              y: y * (frameHeight + GRID_CONFIG.margin),
              width: frameWidth,
              height: frameHeight,
              parent: container,
            });
            frame.interactive = true;
            frame.metadata = {
              ...frame.metadata,
              stringId: col,
            };
          }
        }
        container.sortChildren();
        containers.push(container);
      }
    } else {
      const container = new Container({ isRenderGroup: true });
      container.id = key;
      container.type = key;
      container.zIndex = 10;
      container.interactive = true;

      for (const item of items) {
        const properties = item.properties;
        const frameWidth = properties.spec
          ? properties.spec.width * GRID_CONFIG.scale
          : null;
        const frameHeight = properties.spec
          ? properties.spec.height * GRID_CONFIG.scale
          : null;

        const frame = frameComponent(opts[key].frame, {
          label: item.id,
          x: properties.transform.x,
          y: properties.transform.y,
          width: frameWidth,
          height: frameHeight,
          parent: container,
        });
        frame.interactive = true;
      }
      container.sortChildren();
      containers.push(container);
    }
  }
  containers.forEach((container) => viewport.addChild(container));
};

const removeAllContainers = (viewport) => {
  const containers = findContainers(viewport);
  containers.forEach((container) => {
    container.destroy({
      children: true,
      texture: true,
      context: true,
      style: true,
    });
  });
};

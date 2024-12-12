import { Container } from 'pixi.js';
import { deepMerge } from '../utils/merge';
import { frameComponent } from './components/frame';
import { iconComponent } from './components/icon';
import { barComponent } from './components/bar';

export const DEFAULT_OPTIONS = {
  grids: {
    show: true,
    frameName: 'base',
    isGridSelected: true,
    components: {
      bar: {
        name: 'rounded',
        percentWidth: 1,
        percentHeight: 1,
      },
      icon: {
        name: 'loading',
      },
    },
  },
  strings: {
    show: false,
  },
  inverters: {
    show: true,
    frameName: 'label',
    components: {
      icon: {
        name: 'inverter',
      },
    },
  },
  combines: {
    show: true,
    frameName: 'icon',
    components: {
      icon: {
        name: 'combine',
      },
    },
  },
  edges: {
    show: true,
    frameName: 'icon',
    components: {
      icon: {
        name: 'edge',
      },
    },
  },
};

export const PANEL_CONFIG = {
  scale: 40,
  margin: 4,
};

export function draw(viewport, data = {}, userOptions = {}) {
  const options = deepMerge(DEFAULT_OPTIONS, userOptions);

  const containers = [];
  for (const [key, values] of Object.entries(data)) {
    const option = options[key];
    if (!option?.show) continue;

    if (key === 'grids') {
      for (const object of values) {
        const properties = object.properties;
        const frameWidth = properties.spec.width * PANEL_CONFIG.scale;
        const frameHeight = properties.spec.height * PANEL_CONFIG.scale;

        const container = new Container({ isRenderGroup: true });
        container.id = object.id;
        container.type = key;
        container.label = object.name;
        container.interactive = true;
        container.properties = properties;
        container.position.set(properties.transform.x, properties.transform.y);
        container.angle = properties.transform.rotation;

        const childrenLength = object.children.length;
        for (let y = 0; y < childrenLength; y++) {
          const row = object.children[y];
          const rowLength = row.length;
          for (let x = 0; x < rowLength; x++) {
            const col = row[x];
            if (col === '0') continue;

            const id = `${object.id}.${y}.${x}`;
            const frame = frameComponent(option.frameName, {
              parent: container,
              x: x * (frameWidth + PANEL_CONFIG.margin),
              y: y * (frameHeight + PANEL_CONFIG.margin),
              width: frameWidth,
              height: frameHeight,
            });
            if (!frame) continue;
            frame.id = id;
            frame.label = 'frame';
            frame.interactive = true;
            frame.properties = {
              stringId: col,
              x: frame.x,
              y: frame.y,
              width: frameWidth,
              height: frameHeight,
            };

            if (option.components && typeof option.components === 'object') {
              for (const [componentId, componentOption] of Object.entries(
                option.components,
              )) {
                if (componentId === 'icon') {
                  iconComponent(componentOption.name, {
                    parent: container,
                    frame: frame,
                    zIndex: 5,
                  });
                } else if (componentId === 'bar') {
                  barComponent(componentOption.name, {
                    parent: container,
                    frame: frame,
                    zIndex: 5,
                    color: '#9EB3C3',
                    percentWidth: componentOption.percentWidth,
                    percentHeight: componentOption.percentHeight,
                  });
                }
              }
            }

            container.addChild(frame);
          }
        }
        container.sortChildren();
        containers.push(container);
      }
    } else {
      const container = new Container({ isRenderGroup: true });
      container.id = key;
      container.type = key;
      container.interactive = false;
      container.zIndex = 10;

      for (const object of values) {
        const properties = object.properties;
        const frame = frameComponent(option.frameName, {
          parent: container,
          x: properties.transform.x,
          y: properties.transform.y,
        });

        if (option.components && typeof option.components === 'object') {
          for (const [componentId, componentOption] of Object.entries(
            option.components,
          )) {
            if (componentId === 'icon') {
              iconComponent(componentOption.name, {
                parent: container,
                frame: frame,
                color: options.theme.primary.default,
                zIndex: 5,
              });
            }
          }
        }
      }
      container.sortChildren();
      containers.push(container);
    }
  }
  containers.forEach((container) => viewport.addChild(container));
}

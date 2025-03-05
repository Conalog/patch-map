import { createUUID } from './uuid';

export const convertArray = (items) => {
  return Array.isArray(items) ? items : [items];
};

export const convertLegacyData = (data) => {
  let result = [];
  const objs = {};

  for (const [key, values] of Object.entries(data)) {
    if (key === 'metadata') continue;

    objs[key] = {
      type: 'group',
      id: createUUID(),
      label: key === 'grids' ? 'panelGroups' : key,
      items: [],
    };

    if (key === 'grids') {
      for (const value of values) {
        const { transform, ...props } = value.properties;
        objs[key].items.push({
          type: 'grid',
          id: value.id,
          label: value.name,
          cells: value.children.map((row) =>
            row.map((child) => (child === '0' ? 0 : 1)),
          ),
          position: { x: transform.x, y: transform.y },
          angle: transform.rotation,
          size: {
            width: props.spec.width * 40,
            height: props.spec.height * 40,
          },
          components: [
            {
              type: 'background',
              texture: {
                type: 'rect',
                fill: 'white',
                borderWidth: 2,
                borderColor: 'primary.dark',
                radius: 6,
              },
            },
            {
              type: 'bar',
              texture: {
                type: 'rect',
                fill: 'white',
                radius: 3,
              },
              tint: 'primary.default',
              show: false,
              margin: '3',
            },
          ],
          metadata: props,
        });
      }
    } else if (key === 'strings') {
      objs[key].show = false;
      for (const value of values) {
        objs[key].items.push({
          type: 'relations',
          id: value.id,
          label: value.name,
          links: value.children.slice(0, -1).map((child, i) => ({
            source: child.join('.'),
            target: value.children[i + 1].join('.'),
          })),
          strokeStyle: {
            width: 4,
            color: value.properties.color.dark,
            cap: 'round',
            join: 'round',
          },
          metadata: value.properties,
        });
      }
    } else {
      for (const value of values) {
        const { transform, ...props } = value.properties;
        objs[key].items.push({
          type: 'item',
          id: value.id,
          label: value.name,
          position: { x: transform.x, y: transform.y },
          angle: 0,
          size: { width: 24, height: 24 },
          components: [
            {
              type: 'background',
              texture: {
                type: 'rect',
                fill: 'white',
                borderWidth: 2,
                borderColor: 'primary.default',
                radius: 4,
              },
            },
            {
              type: 'icon',
              asset: key.slice(0, -1),
              size: 16,
              tint: 'primary.default',
              placement: 'center',
            },
          ],
          metadata: props,
        });
      }
    }

    result = Object.values(objs);
  }

  console.log('Transformed data output:', result);
  return result;
};

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
        const { transform, spec } = value.properties;
        objs[key].items.push({
          type: 'grid',
          id: value.id,
          label: value.name,
          cells: value.children.map((row) =>
            row.map((child) => (child === '0' ? 0 : 1)),
          ),
          position: { x: transform.x, y: transform.y },
          rotation: transform.rotation,
          size: { width: spec.width * 40, height: spec.height * 40 },
          components: [
            {
              type: 'background',
              texture: 'base',
            },
            {
              type: 'bar',
              texture: 'base',
              show: false,
              margin: '3',
            },
          ],
          metadata: value.properties,
        });
      }
    } else if (key === 'strings') {
    } else {
      for (const value of values) {
        const { transform } = value.properties;
        objs[key].items.push({
          type: 'item',
          id: value.id,
          label: value.name,
          position: { x: transform.x, y: transform.y },
          rotation: 0,
          size: { width: 24, height: 24 },
          components: [
            {
              type: 'background',
              texture: 'icon',
            },
            {
              type: 'icon',
              texture: key.slice(0, -1),
              size: 16,
              color: 'primary.default',
              placement: 'center',
            },
          ],
        });
      }
    }

    result = Object.values(objs);
  }

  console.log('Transformed data output:', result);
  return result;
};

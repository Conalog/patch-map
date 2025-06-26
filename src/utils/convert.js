import { uid } from './uuid';

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
      id: uid(),
      label: key === 'grids' ? 'panelGroups' : key,
      children: [],
    };

    if (key === 'grids') {
      for (const value of values) {
        const { transform, ...props } = value.properties;
        objs[key].children.push({
          type: 'grid',
          id: value.id,
          label: value.name,
          cells: value.children.map((row) =>
            row.map((child) => (child === '0' ? 0 : 1)),
          ),
          x: transform.x,
          y: transform.y,
          angle: transform.rotation,
          gap: 4,
          item: {
            width: props.spec.width * 40,
            height: props.spec.height * 40,
            components: [
              {
                type: 'background',
                id: uid(),
                source: {
                  type: 'rect',
                  fill: 'white',
                  borderWidth: 2,
                  borderColor: 'primary.dark',
                  radius: 6,
                },
              },
              {
                type: 'bar',
                id: uid(),
                width: '100%',
                height: '100%',
                source: { type: 'rect', fill: 'white', radius: 3 },
                color: 'primary.default',
                show: false,
                margin: 3,
              },
            ],
          },
          metadata: props,
        });
      }
    } else if (key === 'strings') {
      objs[key].show = false;
      for (const value of values) {
        objs[key].children.push({
          type: 'relations',
          id: value.id,
          label: value.name,
          links:
            value.children.length > 1
              ? value.children.slice(0, -1).map((child, i) => ({
                  source: child.join('.'),
                  target: value.children[i + 1].join('.'),
                }))
              : value.children.length === 1
                ? [
                    {
                      source: value.children[0].join('.'),
                      target: value.children[0].join('.'),
                    },
                  ]
                : [],
          style: {
            width: 4,
            color: value.properties.color.dark,
            cap: 'round',
            join: 'round',
          },
          metadata: value.properties,
        });
      }
    } else {
      objs[key].zIndex = 10;
      for (const value of values) {
        const { transform, ...props } = value.properties;
        objs[key].children.push({
          type: 'item',
          id: value.id,
          label: value.name,
          x: transform.x,
          y: transform.y,
          width: 40,
          height: 40,
          components: [
            {
              type: 'background',
              id: uid(),
              source: {
                type: 'rect',
                fill: 'white',
                borderWidth: 2,
                borderColor: 'primary.default',
                radius: 6,
              },
            },
            {
              type: 'icon',
              id: uid(),
              source: key === 'combines' ? 'combiner' : key.slice(0, -1),
              size: 24,
              color: 'primary.default',
              placement: 'center',
            },
          ],
          metadata: props,
        });
      }
    }

    result = Object.values(objs);
  }

  return result;
};

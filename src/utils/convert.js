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
          gap: 4,
          item: {
            padding: 3,
            size: {
              width: props.spec.width * 40,
              height: props.spec.height * 40,
            },
            components: [
              {
                type: 'background',
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
                show: false,
                size: '100%',
                source: { type: 'rect', radius: 3, fill: 'white' },
                tint: 'primary.default',
              },
            ],
          },
          attrs: {
            x: transform.x,
            y: transform.y,
            angle: transform.rotation,
            metadata: props,
          },
        });
      }
    } else if (key === 'strings') {
      objs[key].show = false;
      objs[key].attrs = { zIndex: 20 };
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
          attrs: {
            metadata: value.properties,
          },
        });
      }
    } else {
      objs[key].attrs = { zIndex: 10 };
      for (const value of values) {
        const { transform, ...props } = value.properties;
        objs[key].children.push({
          type: 'item',
          id: value.id,
          label: value.name,
          size: 40,
          components: [
            {
              type: 'background',
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
              source: key === 'combines' ? 'combiner' : key.slice(0, -1),
              size: 24,
              tint: 'primary.default',
              placement: 'center',
            },
          ],
          attrs: {
            x: transform.x,
            y: transform.y,
            metadata: props,
          },
        });
      }
    }

    result = Object.values(objs);
  }

  return result;
};

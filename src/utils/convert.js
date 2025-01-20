import { v4 as uuidv4 } from 'uuid';

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
      id: uuidv4(),
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
          layout: [
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
          layout: [
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

// export const convertLegacyData = (data) => {
//   const newData = { objects: [], relations: [] };

//   for (const [key, values] of Object.entries(data)) {
//     if (key === 'metadata') continue;

//     if (key === 'strings') {
//       for (const value of values) {
//         const { parent, ...rest } = value.properties;
//         newData.relations.push({
//           group: 'strings',
//           id: value.id,
//           name: value.name,
//           connections: value.children
//             .map((child, index) => {
//               if (index === value.children.length - 1) return null; // Prevent accessing out of bounds
//               return {
//                 sourceId: `${child[0]}.${child[1]}.${child[2]}`,
//                 targetId: `${value.children[index + 1][0]}.${value.children[index + 1][1]}.${value.children[index + 1][2]}`,
//               };
//             })
//             .filter((connection) => connection !== null), // Filter out null values
//           metadata: { ...rest },
//         });
//       }
//     } else if (key === 'grids') {
//       for (const value of values) {
//         const { transform, size, spec } = value.properties;
//         const { width, height, ...restSpec } = spec;
//         newData.objects.push({
//           type: 'grid',
//           group: 'panelGroups',
//           id: value.id,
//           name: value.name,
//           layout: value.children.map((row) =>
//             row.map((child) => (child === '0' ? 0 : 1)),
//           ),
//           transform: {
//             ...transform,
//             width: width * 40,
//             height: height * 40,
//           },
//           metadata: {
//             ...restSpec,
//             ...size,
//           },
//         });
//       }
//     } else {
//       for (const value of values) {
//         const { transform, ...rest } = value.properties;
//         newData.objects.push({
//           type: 'each',
//           group: key,
//           id: value.id,
//           name: value.name,
//           transform,
//           metadata: { ...rest },
//         });
//       }
//     }
//   }

//   return newData;
// };

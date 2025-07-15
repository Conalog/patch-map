/**
 * @param {Point[]} points1 - [x1, y1, ...]
 * @param {Point[]} points2 - [x1, y1, ...]
 * @returns {boolean}
 */
export function sat(points1, points2) {
  const polygons = [points1, points2];

  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i += 2) {
      const j = (i + 2) % poly.length;

      const x_i = poly[i];
      const y_i = poly[i + 1];
      const x_j = poly[j];
      const y_j = poly[j + 1];

      const nx = y_i - y_j;
      const ny = x_j - x_i;

      let minA = Number.POSITIVE_INFINITY;
      let maxA = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < points1.length; k += 2) {
        const dot = nx * points1[k] + ny * points1[k + 1];
        if (dot < minA) minA = dot;
        if (dot > maxA) maxA = dot;
      }

      let minB = Number.POSITIVE_INFINITY;
      let maxB = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < points2.length; k += 2) {
        const dot = nx * points2[k] + ny * points2[k + 1];
        if (dot < minB) minB = dot;
        if (dot > maxB) maxB = dot;
      }

      if (maxA < minB || maxB < minA) {
        return false;
      }
    }
  }
  return true;
}

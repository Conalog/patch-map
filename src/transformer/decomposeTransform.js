/**
 * Decomposes a PIXI.Matrix into its constituent properties (scale, skew, rotation, position)
 * and applies them to a PIXI.Transform object.
 *
 * @param {PIXI.Transform} transform - The Transform object to store the decomposed results into.
 * @param {PIXI.Matrix} matrix - The Matrix object to decompose.
 * @returns {PIXI.Transform} The resulting Transform object with the applied properties.
 */
export const decomposeTransform = (transform, matrix) => {
  const a = matrix.a;
  const b = matrix.b;
  const c = matrix.c;
  const d = matrix.d;

  transform.position.set(matrix.tx, matrix.ty);

  const skewX = -Math.atan2(-c, d);
  const skewY = Math.atan2(b, a);

  const delta = Math.abs(skewX + skewY);

  if (delta < 0.00001 || Math.abs(Math.PI - delta) < 0.00001) {
    transform.rotation = skewY;
    transform.skew.set(0, 0);
  } else {
    transform.rotation = 0;
    transform.skew.set(skewX, skewY);
  }

  transform.scale.x = Math.sqrt(a * a + b * b);
  transform.scale.y = Math.sqrt(c * c + d * d);

  return transform;
};

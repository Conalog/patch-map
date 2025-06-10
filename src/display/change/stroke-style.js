import { getColor } from '../../utils/get';
import { selector } from '../../utils/selector/selector';
import { updateConfig } from './utils';

export const changeStrokeStyle = (object, { strokeStyle, links }) => {
  const path = selector(object, '$.children[?(@.type==="path")]')[0];
  if (!path) return;

  if ('color' in strokeStyle) {
    strokeStyle.color = getColor(strokeStyle.color);
  }

  path.setStrokeStyle({ ...path.strokeStyle, ...strokeStyle });
  if (!links && path.links.length > 0) {
    reRenderPath(path);
  }
  updateConfig(object, { strokeStyle });

  function reRenderPath(path) {
    path.clear();
    const { links } = path;
    for (let i = 0; i < path.links.length; i++) {
      const { sourcePoint, targetPoint } = links[i];
      if (i === 0 || !pointsMatch(links[i - 1].targetPoint, sourcePoint)) {
        path.moveTo(...sourcePoint);
      }
      path.lineTo(...targetPoint);
    }
    path.stroke();
  }

  function pointsMatch([x1, y1], [x2, y2]) {
    return x1 === x2 && y1 === y2;
  }
};

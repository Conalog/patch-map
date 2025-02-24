import gsap from 'gsap';
import { getTexture } from '../assets/textures/texture';
import { getScaleBounds } from '../utils/canvas';
import { deepMerge } from '../utils/deepmerge/deepmerge';
import { diffJson } from '../utils/diff/diff-json';
import { getColor } from '../utils/get';
import { selector } from '../utils/selector/selector';
import { FONT_WEIGHT } from './components/config';
import { parseMargin } from './utils';

export const changeProperty = (object, { key, value }) => {
  if (isMatch(object, key, value)) return;
  object[key] = value;
};

export const changeShow = (object, { show }) => {
  if (isConfigMatch(object, 'show', show)) return;
  object.renderable = show;
};

export const changeTexture = (component, { texture: textureConfig }) => {
  if (
    isConfigMatch(component, 'texture', textureConfig) ||
    Object.keys(diffJson(component.config.texture, textureConfig)).length === 0
  ) {
    return;
  }

  const texture = getTexture(
    typeof textureConfig === 'string'
      ? textureConfig
      : deepMerge(component.texture.metadata.config, textureConfig),
  );
  component.texture = texture ?? null;
};

export const changeTint = (component, { tint }) => {
  if (isConfigMatch(component, 'tint', tint)) return;
  const color = getColor(tint);
  component.tint = color;
};

export const changeSize = (component, { size }) => {
  if (isConfigMatch(component, 'size', size)) return;
  component.setSize(size);
  changePlacement(component, {});
};

export const changePlacement = (
  component,
  { placement = component.config.placement, margin = component.config.margin },
) => {
  if (!placement || !margin) return;

  const directionMap = {
    left: { h: 'left', v: 'center' },
    right: { h: 'right', v: 'center' },
    top: { h: 'center', v: 'top' },
    bottom: { h: 'center', v: 'bottom' },
    center: { h: 'center', v: 'center' },
  };
  const marginObj = parseMargin(margin);

  const [first, second] = placement.split('-');
  const directions = second ? { h: first, v: second } : directionMap[first];

  component.visible = false;
  const x = getHorizontalPosition(component, directions.h, marginObj);
  const y = getVerticalPosition(component, directions.v, marginObj);
  component.position.set(x, y);
  component.visible = true;

  function getHorizontalPosition(component, alignment, margin) {
    const parentWidth = component.parent.size.width;
    const positions = {
      left: margin.left,
      right: parentWidth - component.width - margin.right,
      center: (parentWidth - component.width) / 2,
    };
    return positions[alignment] ?? positions.center;
  }

  function getVerticalPosition(component, alignment, margin) {
    const parentHeight = component.parent.size.height;
    const positions = {
      top: margin.top,
      bottom: parentHeight - component.height - margin.bottom,
      center: (parentHeight - component.height) / 2,
    };
    return positions[alignment] ?? positions.center;
  }
};

export const changePercentSize = (
  component,
  {
    percentWidth = component.config.percentWidth,
    percentHeight = component.config.percentHeight,
    margin = component.config.margin,
    animation = component.config.animation,
    animationDuration = component.config.animationDuration,
  },
) => {
  if (
    isConfigMatch(component, 'percentWidth', percentWidth) &&
    isConfigMatch(component, 'percentHeight', percentHeight) &&
    isConfigMatch(component, 'margin', margin)
  ) {
    return;
  }

  const marginObj = parseMargin(margin);
  if (percentWidth) changeWidth(component, percentWidth, marginObj);
  if (percentHeight) changeHeight(component, percentHeight, marginObj);

  function changeWidth(component, percentWidth, marginObj) {
    const maxWidth =
      component.parent.size.width - (marginObj.left + marginObj.right);
    component.width = maxWidth * percentWidth;
  }

  function changeHeight(component, percentHeight) {
    const maxHeight =
      component.parent.size.height - (marginObj.top + marginObj.bottom);

    if (animation) {
      gsap.to(component, {
        pixi: { height: maxHeight * percentHeight },
        duration: animationDuration / 1000,
        ease: 'power2.inOut',
        onUpdate: () => changePlacement(component, {}),
      });
    } else {
      component.height = maxHeight * percentHeight;
    }
  }
};

export const changeText = (
  component,
  { text = component.config.text, split = component.config.split },
) => {
  if (
    isConfigMatch(component, 'text', text) &&
    isConfigMatch(component, 'split', split)
  ) {
    return;
  }

  component.text = splitText(text, split);

  if (component.config?.style?.fontSize === 'auto') {
    changeTextStyle(component, { style: { fontSize: 'auto' } });
  }

  function splitText(text, chunkSize) {
    if (chunkSize === 0 || chunkSize == null) {
      return text;
    }
    let result = '';
    for (let i = 0; i < text.length; i += chunkSize) {
      result += `${text.slice(i, i + chunkSize)}\n`;
    }
    return result.trim();
  }
};

export const changeTextStyle = (
  component,
  { style = component.config.style, margin = component.config.margin },
) => {
  if (
    isConfigMatch(component, 'style', style) &&
    isConfigMatch(component, 'margin', margin)
  ) {
    return;
  }

  for (const key in style) {
    if (key === 'fontFamily' || key === 'fontWeight') {
      component.style.fontFamily = `${style.fontFamily ?? component.style.fontFamily.split(' ')[0]} ${FONT_WEIGHT[style.fontWeight ?? component.style.fontWeight]}`;
    } else if (key === 'fill') {
      component.style[key] = getColor(style.fill);
    } else if (key === 'fontSize' && style[key] === 'auto') {
      const marginObj = parseMargin(margin);
      setAutoFontSize(component, marginObj);
    } else {
      component.style[key] = style[key];
    }
  }

  function setAutoFontSize(component, margin) {
    component.visible = false;
    const { width, height } = component.parent.getSize();
    const parentSize = {
      width: width - margin.left - margin.right,
      height: height - margin.top - margin.bottom,
    };
    component.visible = true;

    let minSize = 1;
    let maxSize = 100;

    while (minSize <= maxSize) {
      const fontSize = Math.floor((minSize + maxSize) / 2);
      component.style.fontSize = fontSize;

      const metrics = component.getLocalBounds();
      if (
        metrics.width <= parentSize.width &&
        metrics.height <= parentSize.height
      ) {
        minSize = fontSize + 1;
      } else {
        maxSize = fontSize - 1;
      }
    }
  }
};

export const changeStrokeStyle = (element, { strokeStyle, links }) => {
  if (!strokeStyle) return;
  const path = selector(element, '$.children[?(@.type==="path")]')[0];
  if (!path) return;

  path.setStrokeStyle({ ...path.strokeStyle, ...strokeStyle });
  if (!links && path.links.length > 0) {
    reRenderPath(path);
  }

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

export const changeLinks = (element, { links }) => {
  if (!links) return;
  const path = selector(element, '$.children[?(@.type==="path")]')[0];
  if (!path) return;

  path.clear();
  path.links = [];
  const objs = collectLinkedObjects(element.viewport, links);
  for (const link of links) {
    const { sourcePoint, targetPoint } = getLinkPoints(
      link,
      objs,
      element.viewport,
    );
    if (!sourcePoint || !targetPoint) continue;

    if (shouldMovePoint(path, sourcePoint)) {
      path.moveTo(...sourcePoint);
    }
    path.lineTo(...targetPoint);
    path.links.push({ sourcePoint, targetPoint });
  }
  path.stroke();

  function collectLinkedObjects(viewport, links) {
    const uniqueIds = new Set(
      links.flatMap((link) => [link.source, link.target]),
    );
    const items = selector(viewport, '$..children').filter((item) =>
      uniqueIds.has(item.id),
    );
    return Object.fromEntries(items.map((item) => [item.id, item]));
  }

  function getLinkPoints(link, objs, viewport) {
    const sourceObject = objs[link.source];
    const targetObject = objs[link.target];
    const sourcePoint = sourceObject
      ? getPoint(getScaleBounds(viewport, sourceObject))
      : null;
    const targetPoint = targetObject
      ? getPoint(getScaleBounds(viewport, targetObject))
      : null;
    return { sourcePoint, targetPoint };
  }

  function shouldMovePoint(path, [sx, sy]) {
    const lastLink = path.links[path.links.length - 1];
    if (!lastLink) return true;
    return lastLink.targetPoint[0] !== sx || lastLink.targetPoint[1] !== sy;
  }

  function getPoint(bounds) {
    return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  }
};

const isConfigMatch = (object, key, value) => {
  return value == null || object.config[key] === value;
};

const isMatch = (object, key, value) => {
  return object[key] === value;
};

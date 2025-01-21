import { selector } from './selector/selector';

export const focus = (viewport, idLabel) => {
  const object = getObject(viewport, idLabel);
  const bounds = getScaleBounds(viewport, object[0]);
  viewport.moveCenter(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
};

export const fit = (viewport, idLabel) => {
  focus(viewport, idLabel);
  const object = getObject(viewport, idLabel);
  const bounds = getScaleBounds(viewport, object[0]);
  viewport.fit(true, bounds.width, bounds.height);
};

const getObject = (viewport, idLabel) => {
  return idLabel
    ? selector(
        viewport,
        `$..children[?(@.id=="${idLabel}" || @.label=="${idLabel}")]`,
      )
    : [viewport];
};

export const getScaleBounds = (viewport, object) => {
  const bounds = object.getBounds();
  return {
    x: (bounds.x - viewport.position.x) / viewport.scale.x,
    y: (bounds.y - viewport.position.y) / viewport.scale.y,
    width: bounds.width / viewport.scale.x,
    height: bounds.height / viewport.scale.y,
  };
};

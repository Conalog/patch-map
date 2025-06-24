import { Container } from 'pixi.js';

export const createContainer = ({ type, id, label, isRenderGroup = false }) => {
  const container = new Container({ isRenderGroup });
  container.eventMode = 'static';
  Object.assign(container, { type, id, label });
  container.config = { type, id, label };
  return container;
};

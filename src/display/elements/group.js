import { changeRenderOrder, changeShow } from '../change';
import { updateObject } from '../update-object';
import { createContainer } from '../utils';

export const createGroup = (config) => {
  const container = createContainer({ ...config, isRenderGroup: false }); // TODO: renderLayer의 자식은 같은 renderGroup에 속해야 함 (향후 수정)
  container.config = {};
  return container;
};

const pipeline = [
  { keys: ['show'], handler: changeShow },
  { keys: ['renderOrder'], handler: changeRenderOrder },
];
const pipelineKeys = new Set(pipeline.flatMap((item) => item.keys));

export const updateGroup = (element, options) => {
  updateObject(element, options, pipeline, pipelineKeys);
};

import { pool } from '../worker/worker-pool';
import { JSONSearch } from './json-search';

export const selector = (json, path, options = {}) => {
  return JSONSearch({
    searchableKeys: ['children'],
    flatten: true,
    ...options,
    path: path ?? '',
    json: json ?? {},
  });
};

export const selectorWithWorker = async (viewport, path, options = {}) => {
  const paths = await pool.exec('workerSelector', [
    viewport.displayObject,
    path,
  ]);
  const result = paths.flatMap((path) => {
    return selector(viewport, path, options);
  });
  return result;
};

import { JSONSearch } from './json-search';

export const selector = (json, path, options = {}) => {
  return JSONSearch({
    ...options,
    path: path ?? '',
    json: json ?? {},
    searchableKeys: ['children'],
    flatten: true,
  });
};

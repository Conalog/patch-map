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

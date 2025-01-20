import { JSONSearch } from './json-search';

export const selector = (json, path) => {
  return JSONSearch({
    path: path ?? '',
    json,
    searchableKeys: ['children'],
    wrap: false,
    flatten: true,
  });
};

import { JSONSearch } from './json-search';

export const selector = (json, path, options = {}) => {
  const indexedResult = selectFromSceneIndex(json, path, options);
  if (indexedResult) return indexedResult;

  return JSONSearch({
    searchableKeys: ['children'],
    flatten: true,
    ...options,
    path: path ?? '',
    json: json ?? {},
  });
};

const selectFromSceneIndex = (json, path, options) => {
  if (options?.resultType || json?.type !== 'canvas') return null;

  const sceneIndex = json?.store?.sceneIndex;
  if (!sceneIndex || typeof path !== 'string') return null;

  const id = matchExactIdPath(path);
  if (id) {
    return sceneIndex.getAllById(id);
  }

  const directPath = matchExactDirectPath(path);
  if (directPath) {
    return sceneIndex.getByType(directPath.value);
  }

  const childrenPath = matchExactChildrenPath(path);
  if (childrenPath) {
    const elements = sceneIndex.getByType(childrenPath.value);
    if (childrenPath.children) {
      return elements.flatMap((element) => element.children ?? []);
    }
    return elements;
  }

  return null;
};

const matchExactIdPath = (path) => {
  const match = path.match(
    /^\$\.\.\[\?\(@\.id\s*={2,3}\s*(["'])([^"']+)\1\)\]$/,
  );
  return match?.[2] ?? null;
};

const matchExactDirectPath = (path) => {
  const match = path.match(
    /^\$\.\.\[\?\(@\.type\s*={2,3}\s*(["'])([^"']+)\1\)\]$/,
  );
  if (!match) return null;
  return {
    value: match[2],
  };
};

const matchExactChildrenPath = (path) => {
  const match = path.match(
    /^\$..children\[\?\(@\.type\s*={2,3}\s*(["'])([^"']+)\1\)\](\.children)?$/,
  );
  if (!match) return null;
  return {
    value: match[2],
    children: Boolean(match[3]),
  };
};

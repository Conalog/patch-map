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

  const modelIndex = json?.store?.modelIndex;
  const sceneIndex = json?.store?.sceneIndex;
  if ((!modelIndex && !sceneIndex) || typeof path !== 'string') return null;

  const id = matchExactIdPath(path);
  if (id) {
    const element =
      modelIndex?.getRefById?.(id) ?? sceneIndex?.getById?.(id) ?? null;
    return element ? [element] : [];
  }

  const childrenPath = matchExactChildrenPath(path);
  if (childrenPath) {
    const elements = getIndexedElements(
      modelIndex,
      sceneIndex,
      childrenPath.key,
      childrenPath.value,
    );
    if (childrenPath.children) {
      return elements.flatMap((element) => element.children ?? []);
    }
    return elements;
  }

  return null;
};

const getIndexedElements = (modelIndex, sceneIndex, key, value) => {
  if (key === 'display') {
    return (
      modelIndex?.getRefsByDisplay?.(value) ??
      sceneIndex?.getByDisplay?.(value) ??
      []
    );
  }
  return (
    modelIndex?.getRefsByType?.(value) ?? sceneIndex?.getByType?.(value) ?? []
  );
};

const matchExactIdPath = (path) => {
  const match = path.match(/^\$..\[\?\(@\.id\s*={2,3}\s*(["'])([^"']+)\1\)\]$/);
  return match?.[2] ?? null;
};

const matchExactChildrenPath = (path) => {
  const match = path.match(
    /^\$..children\[\?\(@\.(display|type)\s*={2,3}\s*(["'])([^"']+)\2\)\](\.children)?$/,
  );
  if (!match) return null;
  return {
    key: match[1],
    value: match[3],
    children: Boolean(match[4]),
  };
};

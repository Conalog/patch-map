import { isPlainObject } from 'is-plain-object';

const ASSET_SOURCE_KEY_PREFIX = 'patchmap:asset-source:';
const ASSET_SOURCE_FRAGMENT_PREFIX = 'patchmapAssetSource=';

export const isAssetSource = (source) =>
  isPlainObject(source) && typeof source.src === 'string';

const stableStringify = (value, ancestors = new WeakSet()) => {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (ancestors.has(value)) return '"__cycle__"';
  ancestors.add(value);

  if (Array.isArray(value)) {
    const result = `[${value
      .map((item) => stableStringify(item, ancestors))
      .join(',')}]`;
    ancestors.delete(value);
    return result;
  }

  const keys = Object.keys(value).sort();
  const result = `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(value[key], ancestors)}`,
    )
    .join(',')}}`;
  ancestors.delete(value);
  return result;
};

export const assetSourceCacheKey = (source) =>
  `${ASSET_SOURCE_KEY_PREFIX}${stableStringify({
    src: source.src,
    data: source.data ?? {},
    format: source.format,
    parser: source.parser ?? source.loadParser,
  })}`;

const inferParser = (src) => {
  const normalizedSrc = src.split('#')[0].split('?')[0].toLowerCase();
  if (src.startsWith('data:image/svg+xml') || normalizedSrc.endsWith('.svg')) {
    return 'svg';
  }
  if (
    /^data:image\/(png|jpeg|jpg|webp|avif)/.test(src) ||
    /\.(png|jpe?g|webp|avif)$/.test(normalizedSrc)
  ) {
    return 'texture';
  }
  return undefined;
};

const cacheScopedSrc = (src, key) => {
  const cacheScope = `${ASSET_SOURCE_FRAGMENT_PREFIX}${encodeURIComponent(key)}`;
  if (src.startsWith('data:')) {
    const separator = src.includes('#') ? '&' : '#';
    return `${src}${separator}${cacheScope}`;
  }

  const fragmentIndex = src.indexOf('#');
  if (fragmentIndex === -1) {
    return `${src}#${cacheScope}`;
  }

  const base = src.slice(0, fragmentIndex);
  const fragment = src.slice(fragmentIndex);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${cacheScope}${fragment}`;
};

export const toLoadableAssetSource = (source) => {
  const key = assetSourceCacheKey(source);
  const parser = source.parser ?? source.loadParser ?? inferParser(source.src);

  return {
    alias: key,
    src: parser ? cacheScopedSrc(source.src, key) : source.src,
    ...(source.data === undefined ? {} : { data: source.data }),
    ...(source.format === undefined ? {} : { format: source.format }),
    ...(parser === undefined ? {} : { parser }),
  };
};

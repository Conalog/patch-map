import { isPlainObject } from 'is-plain-object';

const ASSET_SOURCE_KEY_PREFIX = 'patchmap:asset-source:';
const ASSET_SOURCE_FRAGMENT_PREFIX = 'patchmapAssetSource=';

export const isAssetSource = (source) =>
  isPlainObject(source) && typeof source.src === 'string';

const stableStringify = (value, seen = new WeakSet()) => {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (seen.has(value)) return '"__cycle__"';
  seen.add(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, seen)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key], seen)}`)
    .join(',')}}`;
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
  const separator = src.includes('#') ? '&' : '#';
  return `${src}${separator}${ASSET_SOURCE_FRAGMENT_PREFIX}${encodeURIComponent(
    key,
  )}`;
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

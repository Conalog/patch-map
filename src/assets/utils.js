import { Assets } from 'pixi.js';

export const addAsset = (assets) => {
  Assets.add(assets);
};

export const loadAsset = async (urls, onProgress) => {
  return Assets.load(urls, onProgress);
};

export const getAsset = (keys) => {
  return Assets.get(keys);
};

export const addAssetBundle = (bundleId, assets) => {
  Assets.addBundle(bundleId, assets);
};

export const loadAssetBundle = async (bundleIds, onProgress) => {
  return Assets.loadBundle(bundleIds, onProgress);
};

export const transformManifest = (data) => {
  return {
    bundles: Object.entries(data).map(([name, assets]) => ({
      name,
      assets: Object.entries(assets)
        .filter(([_, details]) => !details.disabled)
        .map(([alias, details]) => ({
          alias,
          src: details.src,
          data: { resolution: 3 },
        })),
    })),
  };
};

export const assets = {
  getAsset,
  loadAsset,
  addAsset,
  loadAssetBundle,
  addAssetBundle,
};

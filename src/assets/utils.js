import { Assets } from 'pixi.js';

export const getAsset = (key) => {
  return Assets.get(key);
};

export const loadAsset = (key) => {
  return Assets.load(key);
};

export const addAsset = (key, src) => {
  Assets.add({ alias: key, src });
};

export const loadAssetBundle = (bundleId) => {
  return Assets.loadBundle(bundleId);
};

export const addAssetBundle = (bundleId, assets) => {
  Assets.addBundle(bundleId, assets);
};

export const transformManifest = (data) => {
  return {
    bundles: Object.entries(data).map(([name, assets]) => ({
      name,
      assets: Object.entries(assets)
        .filter(([_, details]) => !details.isDisabled)
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

import { Assets } from 'pixi.js';
import { getSVGSource } from '../utils/svg';

export const getAsset = (key) => Assets.get(key).texture;
export const loadAsset = (key) => Assets.load(key);
export const addSVGAsset = (key, svg) => {
  const svgSource = getSVGSource(svg);
  Assets.add({ alias: key, src: svgSource });
};

export const loadAssetBundle = (bundleId) => Assets.loadBundle(bundleId);
export const addAssetBundle = (bundleId, svgs) => {
  const assets = Object.entries(svgs).reduce((acc, [key, option]) => {
    const svg = option?.svg;
    if (!option.isDisabled && svg) {
      acc[key] = getSVGSource(svg);
    }
    return acc;
  }, {});
  Assets.addBundle(bundleId, assets);
};

export const assetUtils = {
  getAsset,
  loadAsset,
  addSVGAsset,
  loadAssetBundle,
  addAssetBundle,
};

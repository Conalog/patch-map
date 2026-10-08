export const ASSET_SOURCE = 'shared/assets';
export const ASSET_PACKAGES = Object.freeze({ javascript: 'packages/javascript', flutter: 'packages/flutter' });

// A null target consumes the source directly in its build. A string target is
// the generated repository path. Missing keys mean the package does not consume it.
/** @type {readonly AssetEntry[]} */
export const ASSET_CATALOG = Object.freeze([
  ...['device', 'loading', 'object', 'warning', 'wifi'].map((name) => ({
    name: `icons/${name}.svg`,
    targets: { javascript: null, flutter: `${ASSET_PACKAGES.flutter}/assets/icons/${name}.svg` },
  })),
  { name: 'fonts/FiraCode-VF.woff2', targets: { javascript: null, flutter: `${ASSET_PACKAGES.flutter}/assets/fonts/FiraCode-VF.woff2` } },
  { name: 'fonts/LICENSE.txt', targets: {
    javascript: `${ASSET_PACKAGES.javascript}/docs/assets/fira-code-6.2-license.txt`,
    flutter: `${ASSET_PACKAGES.flutter}/assets/fonts/LICENSE.txt`,
  } },
  ...['FiraCode-VF.ttf', 'provenance.json'].map((name) => ({
    name: `fonts/${name}`, targets: { flutter: `${ASSET_PACKAGES.flutter}/assets/fonts/${name}` },
  })),
].sort((a, b) => a.name.localeCompare(b.name)).map((asset) => Object.freeze({ ...asset, targets: Object.freeze(asset.targets) })));

/** @param {string} path */
export function assetConsumerPaths(path) {
  if (path.startsWith('verification/assets/')) return Object.values(ASSET_PACKAGES);
  if (!path.startsWith(`${ASSET_SOURCE}/`)) return [];
  const asset = ASSET_CATALOG.find((entry) => path === `${ASSET_SOURCE}/${entry.name}`);
  // Unreviewed shared inputs conservatively affect both releases until their
  // ownership is added to the catalog; preparation rejects unknown source files.
  return asset ? Object.entries(ASSET_PACKAGES).filter(([name]) => Object.hasOwn(asset.targets, name)).map(([, path]) => path) : Object.values(ASSET_PACKAGES);
}
/** @typedef {'javascript' | 'flutter'} AssetPackage */
/** @typedef {Readonly<{ name: string, targets: Readonly<{ flutter: string, javascript?: string | null }> }>} AssetEntry */

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

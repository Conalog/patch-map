import { writeFile } from 'node:fs/promises';

import {
  buildCatalog,
  catalogExpectedPath,
  catalogFixturePath,
  catalogManifestPath,
  root,
  serialized,
} from './core-v2-catalog-lib.mjs';

const { fixtures, expected, manifest } = await buildCatalog();
await Promise.all([
  writeFile(`${root}${catalogFixturePath}`, serialized(fixtures)),
  writeFile(`${root}${catalogExpectedPath}`, serialized(expected)),
  writeFile(`${root}${catalogManifestPath}`, serialized(manifest)),
]);

console.log(`Generated Core v2 contract catalog: ${manifest.sourceCatalog.totalCount} cases`);

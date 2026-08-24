import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { argumentValue } from './patch-map-browser-launch.mjs';
import { resolvePatchMapCandidateOutputPath } from './patch-map-candidate-path.mjs';

import {
  buildCatalog,
  catalogExpectedPath,
  catalogFixturePath,
  catalogManifestPath,
  root,
  serialized,
} from './core-v2-catalog-lib.mjs';

const { fixtures, expected, manifest } = await buildCatalog();
const outputRoot = resolvePatchMapCandidateOutputPath({
  root,
  value: argumentValue(process.argv.slice(2), '--output-dir') ?? '.perf-results/contract-catalog',
  label: 'generated contract catalog output',
  prohibitedRoots: [
    'docs/reference/core-v2-functional-contract',
    'performance/patch-map/results',
  ],
});
await mkdir(outputRoot, { recursive: true });
await Promise.all([
  writeFile(path.join(outputRoot, path.basename(catalogFixturePath)), serialized(fixtures)),
  writeFile(path.join(outputRoot, path.basename(catalogExpectedPath)), serialized(expected)),
  writeFile(path.join(outputRoot, path.basename(catalogManifestPath)), serialized(manifest)),
]);

console.log(
  `Generated Core v2 contract catalog candidate: ${manifest.sourceCatalog.totalCount} cases at ${outputRoot}`,
);

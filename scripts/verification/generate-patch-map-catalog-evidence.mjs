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
} from './patch-map-catalog-lib.mjs';

const pendingReview = process.argv.includes('--pending-review');
const { fixtures, expected, manifest } = await buildCatalog(
  pendingReview
    ? { reviewRegistryOverride: { document: null, sha256: null, byId: new Map() } }
    : undefined,
);
const outputRoot = resolvePatchMapCandidateOutputPath({
  root,
  value: argumentValue(process.argv.slice(2), '--output-dir') ?? '.perf-results/contract-catalog',
  label: 'generated contract catalog output',
  prohibitedRoots: [
    'contracts/patch-map',
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
  `Generated PatchMap contract catalog candidate: ${manifest.sourceCatalog.totalCount} cases at ${outputRoot}`,
);

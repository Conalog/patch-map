import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { readFixtures, CONTRACT_REVISION } from './fixtures.mjs';

export async function runDataFixtures(root = process.cwd()) {
  const server = await createServer({ root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { materializePatchMapDataset } = await server.ssrLoadModule('/packages/javascript/src/semantic/dataset.ts');
    const observations = [];
    for (const fixture of await readFixtures(root)) {
      const before = JSON.stringify(fixture.dataset);
      const result = materializePatchMapDataset(fixture.dataset);
      for (const field of ['rootIds', 'elementTypes', 'componentTypes']) {
        if (JSON.stringify(result[field]) !== JSON.stringify(fixture.expected[field])) {
          throw new Error(`${fixture.id}: authored expected ${field} mismatch`);
        }
      }
      if (JSON.stringify(fixture.dataset) !== before) throw new Error(`${fixture.id}: caller input mutated`);
      const roundTrip = materializePatchMapDataset(JSON.parse(JSON.stringify(result.dataset)));
      if (roundTrip.semanticHash !== result.semanticHash) throw new Error(`${fixture.id}: hash round-trip mismatch`);
      observations.push({ fixtureId: fixture.id, dataset: result.dataset, rootIds: result.rootIds,
        elementTypes: result.elementTypes, componentTypes: result.componentTypes, semanticHash: result.semanticHash });
    }
    return { schemaRevision: CONTRACT_REVISION, runtime: 'npm-semantic', observations };
  } finally {
    await server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runDataFixtures();
  const destination = resolve(process.argv[2] ?? '.artifacts/flutter/npm-data.json');
  await mkdir(resolve(destination, '..'), { recursive: true });
  await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Validated ${result.observations.length} npm dataset fixtures: ${destination}`);
}

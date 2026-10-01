import { readFile } from 'node:fs/promises';
import { qualify, contractFingerprint } from './compare.mjs';

const evidencePath = process.argv[2];
if (!evidencePath) throw new Error('usage: node verification/conformance/qualify.mjs <installed-consumer-evidence.json>');
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const [manifest, inventory, evidence, fingerprint] = await Promise.all([
  read('conformance/manifest.json'), read('conformance/public-api.json'), read(evidencePath), contractFingerprint(),
]);
const result = qualify(manifest, inventory, evidence, fingerprint);
console.log(JSON.stringify(result, null, 2));
if (!result.qualified) process.exitCode = 1;

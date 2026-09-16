import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const apiShapeSha256 = (entry) => createHash('sha256').update(JSON.stringify(entry)).digest('hex');

/** Fail closed on stale/unknown declarations and stale witness locators.
 * This deliberately does NOT create a passed qualification witness. A source
 * locator is weaker than a Dart analyzer result and a test title is not a run. */
export async function verifyApiBindings(root, inventory, document) {
  if (document?.schemaRevision !== 'patch-map-api-bindings/1' || !Array.isArray(document.bindings)) {
    throw new Error('Invalid API bindings schema');
  }
  const index = new Map(inventory.map((entry) => [entry.id, entry]));
  const seen = new Set();
  const read = async (path) => {
    if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid repository locator');
    return readFile(resolve(root, path), 'utf8');
  };
  for (const binding of document.bindings) {
    const entry = index.get(binding.id);
    if (!entry || seen.has(binding.id)) throw new Error(`Unknown/duplicate binding: ${binding.id}`);
    seen.add(binding.id);
    if (binding.outcome !== undefined || binding.passed !== undefined || binding.qualified !== undefined) throw new Error('Static binding cannot claim execution');
    if (binding.shapeSha256 !== apiShapeSha256(entry)) throw new Error(`Stale shape: ${binding.id}`);
    if (!['input', 'output', 'bidirectional', 'runtime', 'host-protocol', 'language-adaptation'].includes(binding.role)) throw new Error(`Missing role: ${binding.id}`);
    if (!binding.dart?.symbol || !binding.dart?.adaptation || !binding.scope) throw new Error(`Missing binding meaning: ${binding.id}`);
    if (!Array.isArray(binding.pendingAssertions) || binding.pendingAssertions.some((value) => typeof value !== 'string' || value.length === 0)) throw new Error(`Missing explicit pending assertions: ${binding.id}`);
    const declaration = await read(binding.dart.file);
    if (!binding.dart.locator || !declaration.includes(binding.dart.locator)) throw new Error(`Missing Dart declaration locator: ${binding.id}`);
    const probe = await read(binding.probe.file);
    if (!binding.probe.marker || !probe.includes(binding.probe.marker) || !probe.includes("import 'package:conalog_patch_map/conalog_patch_map.dart'")) throw new Error(`Missing public compile probe: ${binding.id}`);
    if (!Array.isArray(binding.witnesses) || binding.witnesses.length === 0) throw new Error(`Missing witnesses: ${binding.id}`);
    for (const witness of binding.witnesses) {
      if (!['npm', 'dart'].includes(witness.runtime) || !witness.assertion || !witness.test) throw new Error(`Incomplete witness: ${binding.id}`);
      if (!(await read(witness.file)).includes(witness.test)) throw new Error(`Missing test locator: ${binding.id}/${witness.test}`);
    }
    if (!binding.witnesses.some((witness) => witness.runtime === 'dart') || !binding.witnesses.some((witness) => witness.runtime === 'npm')) {
      throw new Error(`Both runtimes need explicit witness locators: ${binding.id}`);
    }
  }
  return { inventoryCount: inventory.length, mappedCount: seen.size, unmappedCount: inventory.length - seen.size,
    pendingBindingCount: document.bindings.filter((binding) => binding.pendingAssertions.length > 0).length,
    declarationLocatorChecks: true, testLocatorChecks: true, qualified: false,
    missingEvidence: ['Dart compile-probe analyzer run and source hash', 'Exact npm/Dart test run results and artifact/source hashes', 'Per-binding assertion scope review; test title presence is not behavior proof'],
    unmappedIds: inventory.filter((entry) => !seen.has(entry.id)).map((entry) => entry.id) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const inventory = JSON.parse(await readFile(resolve(root, 'conformance/public-api.json'), 'utf8'));
  const document = JSON.parse(await readFile(resolve(root, process.argv[2] ?? 'conformance/api-bindings/assets.json'), 'utf8'));
  const result = await verifyApiBindings(root, inventory, document);
  console.log(JSON.stringify({ ...result, unmappedIds: undefined }, null, 2));
}

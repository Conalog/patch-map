import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

interface VerifierImportFirewallModule {
  assertCoreV2ContractImportFirewall(
    contractRoot?: string | URL,
  ): Promise<Readonly<{ handlerCount: number; foldCount: number }>>;
  assertVerifierEntryImportFirewall(options: Readonly<{
    contractRoot: string | URL;
    entryFile: string | URL;
    role: 'handler' | 'fold';
  }>): Promise<void>;
}

const {
  assertCoreV2ContractImportFirewall,
  assertVerifierEntryImportFirewall,
} = await import(
  '../../scripts/verification/core-v2-contract/verifier-import-firewall.mjs'
) as unknown as VerifierImportFirewallModule;

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(
    async (root) => rm(root, { recursive: true, force: true }),
  ));
});

describe('core-v2 verifier recursive import firewall', () => {
  it('covers every committed handler and fold without replacing their direct import-free checks', async () => {
    await expect(assertCoreV2ContractImportFirewall()).resolves.toEqual({
      handlerCount: 35,
      foldCount: 34,
    });
  });

  it('allows only each role-specific direct value atom path with an import-free browser leaf', async () => {
    const root = await createGraph({
      handlerSource: [
        "import { browserValue } from '../value-atoms.mjs';",
        'const now = globalThis.performance?.now?.() ?? 0;',
        'const global = { local: true };',
        'export { browserValue, global, now };',
        '',
      ].join('\n'),
      foldSource: "import { browserValue } from './value-atoms.mjs';\nexport { browserValue };\n",
      valueAtomsSource: [
        "// globalThis['process'] and process are inert comments",
        "const prose = \"import('node:fs') is inert text\";",
        'const whitespace = /\\s+/u;',
        'export const browserValue = globalThis.Math.max(prose.length, 1);',
        '',
      ].join('\n'),
    });

    await expect(assertHandler(root)).resolves.toBeUndefined();
    await expect(assertFold(root)).resolves.toBeUndefined();
  });

  it('checks a committed value atom leaf even before a handler or fold imports it', async () => {
    const root = await createGraph({
      handlerSource: '',
      foldSource: '',
      valueAtomsSource: 'export const value = process.env.NODE_ENV;\n',
    });
    await expect(assertCoreV2ContractImportFirewall(root)).rejects.toMatchObject({
      code: 'NODE_GLOBAL',
    });
  });

  it.each([
    ['Node', 'export const value = process.env.NODE_ENV;\n', 'NODE_GLOBAL'],
    ['dynamic', 'export const value = Function("return 1")();\n', 'DYNAMIC_CODE_GLOBAL'],
  ])('blocks %s globals directly in verifier entries', async (_label, handlerSource, code) => {
    const root = await createGraph({
      handlerSource,
      foldSource: '',
      valueAtomsSource: 'export const value = 1;\n',
    });

    await expect(assertHandler(root)).rejects.toMatchObject({ code });
  });

  it.each([
    ['handler sibling', "import '../other.mjs';\n", 'DIRECT_IMPORT_NOT_ALLOWED'],
    ['fold sibling', "import './other.mjs';\n", 'DIRECT_IMPORT_NOT_ALLOWED'],
    ['handler dynamic atom', "await import('../value-atoms.mjs');\n", 'DIRECT_IMPORT_NOT_ALLOWED'],
    ['handler re-export atom', "export { value } from '../value-atoms.mjs';\n", 'DIRECT_IMPORT_NOT_ALLOWED'],
  ])('rejects a non-approved direct %s edge', async (_label, source, code) => {
    const root = await createGraph({
      handlerSource: source.includes('../') ? source : '',
      foldSource: source.includes('./other') ? source : '',
      valueAtomsSource: 'export const value = 1;\n',
      files: { 'other.mjs': 'export const value = 1;\n' },
    });
    const assertion = source.includes('../') ? assertHandler(root) : assertFold(root);
    await expect(assertion).rejects.toMatchObject({ code });
  });

  it.each([
    ['Node import', "import 'node:fs';\n", {}, 'NODE_IMPORT'],
    ['bare package', "import 'pixi.js';\n", {}, 'BARE_IMPORT'],
    ['absolute path', "import '/tmp/forbidden.mjs';\n", {}, 'ABSOLUTE_IMPORT'],
    ['outside root', "import '../outside.mjs';\n", {}, 'OUTSIDE_CONTRACT_ROOT'],
    ['catalog control', "import './catalog.mjs';\n", { 'catalog.mjs': '' }, 'CONTROL_MODULE_IMPORT'],
    ['action registry control', "import './action-registry.mjs';\n", { 'action-registry.mjs': '' }, 'CONTROL_MODULE_IMPORT'],
    ['materialize control', "import './materialize.mjs';\n", { 'materialize.mjs': '' }, 'CONTROL_MODULE_IMPORT'],
    ['observe control', "import './observe.mjs';\n", { 'observe.mjs': '' }, 'CONTROL_MODULE_IMPORT'],
    ['compare control', "import './compare.mjs';\n", { 'compare.mjs': '' }, 'CONTROL_MODULE_IMPORT'],
    ['evidence control', "import './evidence.mjs';\n", { 'evidence.mjs': '' }, 'CONTROL_MODULE_IMPORT'],
    ['handler peer', "import './handlers/peer.mjs';\n", { 'handlers/peer.mjs': '' }, 'HANDLER_FOLD_IMPORT'],
    ['fold peer', "import './fold-peer.mjs';\n", { 'fold-peer.mjs': '' }, 'HANDLER_FOLD_IMPORT'],
    [
      'normalized expected file',
      "import './catalog-normalized-expected.mjs';\n",
      { 'catalog-normalized-expected.mjs': '' },
      'EXPECTED_VALUE_FILE',
    ],
    ['nested helper', "import './helper.mjs';\n", { 'helper.mjs': '' }, 'LEAF_IMPORT'],
    ['non-literal dynamic import', 'const path = "./helper.mjs";\nawait import(path);\n', {}, 'NON_LITERAL_IMPORT'],
    ['template dynamic import', "export const value = `${import('node:fs')}`;\n", {}, 'NODE_IMPORT'],
    ['Node require', "require('node:fs');\n", {}, 'NODE_GLOBAL'],
    ['Node process global', 'export const value = process.env.NODE_ENV;\n', {}, 'NODE_GLOBAL'],
    ['dynamic eval global', 'export const value = eval("1");\n', {}, 'DYNAMIC_CODE_GLOBAL'],
    ['dynamic Function global', 'export const value = Function("return 1")();\n', {}, 'DYNAMIC_CODE_GLOBAL'],
    [
      'computed Node global',
      "export const value = globalThis['process'];\n",
      {},
      'COMPUTED_GLOBAL_ACCESS',
    ],
    [
      'computed dynamic global',
      "export const value = globalThis['Function'];\n",
      {},
      'COMPUTED_GLOBAL_ACCESS',
    ],
    [
      'computed window global',
      "export const value = window['process'];\n",
      {},
      'COMPUTED_GLOBAL_ACCESS',
    ],
    [
      'computed self global',
      "export const value = self['process'];\n",
      {},
      'COMPUTED_GLOBAL_ACCESS',
    ],
    [
      'dotted Node global',
      'export const value = globalThis.process;\n',
      {},
      'NODE_GLOBAL',
    ],
    [
      'dotted dynamic global',
      'export const value = window.Function;\n',
      {},
      'DYNAMIC_CODE_GLOBAL',
    ],
    [
      'aliased browser global root',
      'export const value = globalThis;\n',
      {},
      'GLOBAL_ROOT_ESCAPE',
    ],
    [
      'browser global root passed to Reflect',
      "export const value = Reflect.get(globalThis, 'process');\n",
      {},
      'GLOBAL_ROOT_ESCAPE',
    ],
    [
      'template expected path',
      'export const value = fetch(`./catalog-normalized-expected.json`);\n',
      {},
      'EXPECTED_VALUE_FILE',
    ],
    [
      'escaped Node identifier',
      'export const value = proce\\u0073s.env.NODE_ENV;\n',
      {},
      'NODE_GLOBAL',
    ],
    [
      'braced escaped Node identifier',
      'export const value = proce\\u{73}s.env.NODE_ENV;\n',
      {},
      'NODE_GLOBAL',
    ],
    [
      'escaped expected identifier',
      'export const normalized\\u0045xpected = 1;\n',
      {},
      'EXPECTED_VALUE_TOKEN',
    ],
    [
      'escaped expected string',
      "export const value = './catalog-normalized-\\u0065xpected.json';\n",
      {},
      'EXPECTED_VALUE_FILE',
    ],
    [
      'escaped expected template segment',
      'export const value = `./catalog-normalized-\\x65xpected.json`;\n',
      {},
      'EXPECTED_VALUE_FILE',
    ],
    [
      'escaped inert leaf string',
      "export const value = 'ordinary\\nprose';\n",
      {},
      'ESCAPED_STRING',
    ],
    ['normalized expected token', 'export const normalizedExpected = 1;\n', {}, 'EXPECTED_VALUE_TOKEN'],
    ['approved expected token', 'export const approvedExpected = 1;\n', {}, 'EXPECTED_VALUE_TOKEN'],
  ])('blocks transitive %s access from the value atom leaf', async (
    _label,
    valueAtomsSource,
    files,
    code,
  ) => {
    const root = await createGraph({
      handlerSource: "import { value } from '../value-atoms.mjs';\nexport { value };\n",
      foldSource: '',
      valueAtomsSource,
      files,
    });
    await expect(assertHandler(root)).rejects.toMatchObject({ code });
  });
});

async function createGraph({
  handlerSource,
  foldSource,
  valueAtomsSource,
  files = {},
}: Readonly<{
  handlerSource: string;
  foldSource: string;
  valueAtomsSource: string;
  files?: Readonly<Record<string, string>>;
}>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'patch-map-verifier-firewall-'));
  temporaryRoots.push(root);
  await mkdir(join(root, 'handlers'), { recursive: true });
  await Promise.all([
    writeFile(join(root, 'handlers', 'entry.mjs'), handlerSource),
    writeFile(join(root, 'fold-entry.mjs'), foldSource),
    writeFile(join(root, 'value-atoms.mjs'), valueAtomsSource),
    ...Object.entries(files).map(async ([relativePath, source]) => {
      const filename = join(root, relativePath);
      await mkdir(join(filename, '..'), { recursive: true });
      await writeFile(filename, source);
    }),
  ]);
  return root;
}

async function assertHandler(root: string): Promise<void> {
  await assertVerifierEntryImportFirewall({
    contractRoot: root,
    entryFile: join(root, 'handlers', 'entry.mjs'),
    role: 'handler',
  });
}

async function assertFold(root: string): Promise<void> {
  await assertVerifierEntryImportFirewall({
    contractRoot: root,
    entryFile: join(root, 'fold-entry.mjs'),
    role: 'fold',
  });
}

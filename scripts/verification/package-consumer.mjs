import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'patch-map-consumer-'));
const packageDirectory = join(temporaryRoot, 'package');
const consumerDirectory = join(temporaryRoot, 'consumer');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const documentedExports = [
  'Command',
  'PROPAGATE_EVENT',
  'Patchmap',
  'State',
  'Transformer',
  'UndoRedoManager',
  'convertLegacyData',
  'findIntersectObject',
  'intersectPoint',
  'isMoved',
  'selector',
  'uid',
].sort();
const rootPackage = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
);
const typescriptVersion = rootPackage.devDependencies?.typescript;
assert.match(
  typescriptVersion,
  /^\d+\.\d+\.\d+$/u,
  'A pinned TypeScript version is required for packed-consumer verification',
);

const run = async (command, args, cwd) => {
  const { stdout, stderr } = await execute(command, args, {
    cwd,
    env: { ...process.env, npm_config_update_notifier: 'false' },
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stderr.trim()) process.stderr.write(stderr);
  return stdout;
};

const filesIn = async (directory) => {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesIn(path));
    else output.push(path);
  }
  return output;
};

const isContained = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (
    path !== '..'
    && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    && !isAbsolute(path)
  );
};

const assertContainedRegularFile = async (packageRoot, target, label) => {
  const absoluteTarget = resolve(target);
  assert(
    isContained(packageRoot, absoluteTarget),
    `${label} escapes the installed package: ${target}`,
  );
  const targetStat = await lstat(absoluteTarget);
  assert.equal(targetStat.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(targetStat.isFile(), true, `${label} must resolve to a regular file`);
  const [realPackageRoot, realTarget] = await Promise.all([
    realpath(packageRoot),
    realpath(absoluteTarget),
  ]);
  assert(
    isContained(realPackageRoot, realTarget),
    `${label} realpath escapes the installed package: ${target}`,
  );
  return absoluteTarget;
};

const declarationTarget = (declaration, specifier) => {
  assert(
    !specifier.includes('?') && !specifier.includes('#'),
    `Declaration import must not contain a query or fragment: ${specifier}`,
  );
  const runtimeTarget = resolve(dirname(declaration), specifier);
  if (specifier.endsWith('.d.ts') || specifier.endsWith('.d.mts') || specifier.endsWith('.d.cts')) {
    return runtimeTarget;
  }
  if (specifier.endsWith('.mjs')) return runtimeTarget.replace(/\.mjs$/u, '.d.mts');
  if (specifier.endsWith('.cjs')) return runtimeTarget.replace(/\.cjs$/u, '.d.cts');
  if (specifier.endsWith('.js')) return runtimeTarget.replace(/\.js$/u, '.d.ts');
  if (specifier.endsWith('.json') || specifier.endsWith('.css')) return runtimeTarget;
  assert.fail(`NodeNext declaration import needs an explicit resolvable extension: ${specifier}`);
};

const relativeSpecifiersIn = (typescript, sourceFile) => {
  const specifiers = [...sourceFile.referencedFiles.map(({ fileName }) => fileName)];
  const addLiteral = (node) => {
    if (node && typescript.isStringLiteralLike(node)) specifiers.push(node.text);
  };
  const visit = (node) => {
    if (typescript.isImportDeclaration(node) || typescript.isExportDeclaration(node)) {
      addLiteral(node.moduleSpecifier);
    } else if (typescript.isImportEqualsDeclaration(node)) {
      const expression = node.moduleReference?.expression;
      addLiteral(expression);
    } else if (typescript.isImportTypeNode(node)) {
      addLiteral(node.argument?.literal);
    } else if (
      typescript.isCallExpression(node)
      && node.expression.kind === typescript.SyntaxKind.ImportKeyword
    ) {
      addLiteral(node.arguments[0]);
    }
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers.filter((specifier) => /^\.{1,2}\//u.test(specifier));
};

const packageExportTargets = (value, conditions = [], output = []) => {
  if (typeof value === 'string') {
    output.push({ conditions, target: value });
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      packageExportTargets(entry, [...conditions, `[${index}]`], output);
    });
  } else if (value && typeof value === 'object') {
    for (const [condition, entry] of Object.entries(value)) {
      packageExportTargets(entry, [...conditions, condition], output);
    }
  }
  return output;
};

const serveConsumer = async () => {
  const html = `<!doctype html>
    <meta charset="utf-8">
    <div id="host"></div>
    <script type="module" src="/umd-consumer.mjs"></script>`;
  const module = `import * as PIXI from 'pixi.js';
globalThis.PIXI = PIXI;
await new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = '/node_modules/@conalog/patch-map/dist/index.umd.js';
  script.addEventListener('load', resolve, { once: true });
  script.addEventListener('error', reject, { once: true });
  document.head.append(script);
});
`;
  await Promise.all([
    writeFile(join(consumerDirectory, 'umd-consumer.html'), html),
    writeFile(join(consumerDirectory, 'umd-consumer.mjs'), module),
  ]);
  const server = await createViteServer({
    root: consumerDirectory,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0];
    assert(baseUrl, 'Vite did not expose a packed-consumer URL');
    return {
      server,
      url: new URL('/umd-consumer.html', baseUrl).href,
    };
  } catch (error) {
    await server.close().catch(() => undefined);
    throw error;
  }
};

try {
  await Promise.all([
    mkdir(packageDirectory, { recursive: true }),
    mkdir(consumerDirectory, { recursive: true }),
  ]);

  const packOutput = await run(
    npmCommand,
    [
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      packageDirectory,
    ],
    root,
  );
  const packed = JSON.parse(packOutput);
  assert.equal(packed.length, 1);
  assert(
    packed[0].files.every(({ path }) => !path.toLowerCase().endsWith('.map')),
    'Packed consumer tarball must not contain source maps',
  );
  const tarball = join(packageDirectory, packed[0].filename);

  await writeFile(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({ name: 'patch-map-packed-consumer', private: true, type: 'module' }),
  );
  await run(
    npmCommand,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      tarball,
      'pixi.js@8.19.0',
      `typescript@${typescriptVersion}`,
    ],
    consumerDirectory,
  );

  const installedPackageRoot = join(
    consumerDirectory,
    'node_modules/@conalog/patch-map',
  );
  const installedStat = await lstat(installedPackageRoot);
  assert.equal(
    installedStat.isSymbolicLink(),
    false,
    'Packed consumer must install a copied package, not a workspace link',
  );
  const installedManifest = JSON.parse(
    await readFile(join(installedPackageRoot, 'package.json'), 'utf8'),
  );
  assert.deepEqual(
    [installedManifest.name, installedManifest.version],
    [rootPackage.name, rootPackage.version],
  );

  const installedDeclarations = (await filesIn(installedPackageRoot))
    .filter((path) => /\.d\.[cm]?ts$/u.test(path));
  assert(installedDeclarations.length > 0, 'Packed package must include declarations');
  const typescriptModule = await import(pathToFileURL(join(
    consumerDirectory,
    'node_modules/typescript/lib/typescript.js',
  )).href);
  const typescript = typescriptModule.default ?? typescriptModule;
  let declarationEdgesVerified = 0;
  for (const declaration of installedDeclarations) {
    const source = await readFile(declaration, 'utf8');
    const sourceFile = typescript.createSourceFile(
      declaration,
      source,
      typescript.ScriptTarget.Latest,
      true,
      typescript.ScriptKind.TS,
    );
    assert.deepEqual(
      (sourceFile.parseDiagnostics ?? []).map((diagnostic) =>
        typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
      [],
      `Installed declaration could not be parsed: ${declaration}`,
    );
    for (const specifier of relativeSpecifiersIn(typescript, sourceFile)) {
      const target = declarationTarget(declaration, specifier);
      await assertContainedRegularFile(
        installedPackageRoot,
        target,
        `Declaration edge ${relative(installedPackageRoot, declaration)} -> ${specifier}`,
      );
      declarationEdgesVerified += 1;
    }
  }
  assert(
    declarationEdgesVerified > 0,
    'Packed declaration graph must contain and resolve relative declaration edges',
  );

  const installedEntryTargets = [];
  for (const [field, kind] of [
    ['main', 'runtime'],
    ['module', 'runtime'],
    ['browser', 'runtime'],
    ['unpkg', 'runtime'],
    ['types', 'declaration'],
    ['typings', 'declaration'],
  ]) {
    if (typeof installedManifest[field] === 'string') {
      installedEntryTargets.push({ kind, label: field, target: installedManifest[field] });
    }
  }
  for (const { conditions, target } of packageExportTargets(installedManifest.exports)) {
    installedEntryTargets.push({
      kind: conditions.includes('types') ? 'declaration' : 'runtime',
      label: `exports ${conditions.join(' > ')}`,
      target,
    });
  }
  assert(installedEntryTargets.length > 0, 'Packed package needs installed entry targets');
  for (const { kind, label, target } of installedEntryTargets) {
    assert(
      target.startsWith('./') && !target.includes('*'),
      `${label} must name an explicit package-relative target: ${target}`,
    );
    await assertContainedRegularFile(
      installedPackageRoot,
      resolve(installedPackageRoot, target),
      `${label} target`,
    );
    if (kind === 'declaration') {
      assert.match(target, /\.d\.[cm]?ts$/u, `${label} must resolve to a declaration`);
    } else {
      assert.match(
        target,
        /\.(?:[cm]?js|css|json)$/u,
        `${label} must resolve to an installed runtime target`,
      );
    }
  }

  await writeFile(
    join(consumerDirectory, 'esm-consumer.mjs'),
    `import assert from 'node:assert/strict';
import * as api from '@conalog/patch-map';
const expectedExports = ${JSON.stringify(documentedExports)};
assert.deepEqual(Object.keys(api).sort(), expectedExports);
const {
  Command,
  PROPAGATE_EVENT,
  Patchmap,
  State,
  Transformer,
  UndoRedoManager,
  convertLegacyData,
  findIntersectObject,
  intersectPoint,
  isMoved,
  selector,
  uid,
} = api;
class ConsumerPatchmap extends Patchmap {}
class ConsumerState extends State {}
class ConsumerCommand extends Command {}
assert(new ConsumerPatchmap() instanceof Patchmap);
assert(new Transformer());
assert(new UndoRedoManager());
assert(new ConsumerState());
assert(new ConsumerCommand('consumer-command'));
assert.notEqual(PROPAGATE_EVENT, undefined);
for (const helper of [
  convertLegacyData,
  findIntersectObject,
  intersectPoint,
  isMoved,
]) assert.equal(typeof helper, 'function');
assert.deepEqual(selector({ value: 7 }, '$.value'), [7]);
assert.match(uid(), /^[0-9A-Z_a-z-]{15}$/);
`,
  );
  await writeFile(
    join(consumerDirectory, 'cjs-consumer.cjs'),
    `const assert = require('node:assert/strict');
const api = require('@conalog/patch-map');
const expectedExports = ${JSON.stringify(documentedExports)};
assert.deepEqual(Object.keys(api).sort(), expectedExports);
class ConsumerPatchmap extends api.Patchmap {}
assert(new ConsumerPatchmap() instanceof api.Patchmap);
for (const name of expectedExports.filter((name) => name !== 'PROPAGATE_EVENT')) {
  assert.equal(typeof api[name], 'function', name);
}
assert.notEqual(api.PROPAGATE_EVENT, undefined);
assert(new api.Command('consumer-command'));
`,
  );
  await writeFile(
    join(consumerDirectory, 'typescript-consumer.ts'),
    `import {
  Command,
  PROPAGATE_EVENT,
  Patchmap,
  State,
  Transformer,
  UndoRedoManager,
  convertLegacyData,
  findIntersectObject,
  intersectPoint,
  isMoved,
  selector,
  uid,
} from '@conalog/patch-map';
import type {
  MapData,
  PatchmapInitOptions,
  PublicDisplayHandle,
  UpdateOptions,
} from '@conalog/patch-map';

class ConsumerPatchmap extends Patchmap {
  get consumerReady(): boolean {
    return !this.isInit;
  }
}
class ConsumerState extends State {}
class ConsumerCommand extends Command {}

const patchmap: Patchmap = new ConsumerPatchmap();
const transformer = new Transformer();
const history = new UndoRedoManager();
const state = new ConsumerState();
const command = new ConsumerCommand();
const selected = selector({ value: 7 }, '$.value');
const generatedId: string = uid();
const propagated = PROPAGATE_EVENT;
const publicHelpers = [
  convertLegacyData,
  findIntersectObject,
  intersectPoint,
  isMoved,
] as const;
const typedData: MapData = [
  { type: 'rect', id: 'typed-rect', size: 20, fill: '#1099FF' },
];
const typedInit: PatchmapInitOptions = {
  app: { width: 320, height: 240 },
  transformer,
};
const typedUpdate: UpdateOptions<PublicDisplayHandle> = {
  changes: { attrs: { x: 12 } },
  emit: false,
};

async function minimalFlow(host: HTMLElement): Promise<number> {
  await patchmap.init(host, typedInit);
  patchmap.viewport?.plugin.add({
    mouseEdges: { speed: 16, distance: 20, allowButtons: true },
  });
  patchmap.viewport?.plugin.stop('mouse-edges');
  patchmap.viewport?.plugin.start('mouse-edges');
  patchmap.viewport?.plugin.remove('mouse-edges');
  const drawn = patchmap.draw(typedData) ?? [];
  const matches = patchmap.selector(
    '$..children[?(@.id==="typed-rect")]',
  );
  const handle = matches[0];
  if (!handle) throw new Error('Expected typed handle');
  const observations = [
    handle.id,
    handle.type,
    handle.props,
    handle.parent,
    handle.children,
    handle.x,
    handle.y,
    handle.width,
    handle.height,
    handle.visible,
    handle.destroyed,
  ];
  const updated = patchmap.update({ ...typedUpdate, elements: handle });
  patchmap.transformer = transformer;
  transformer.elements = [handle];
  transformer.selection.set(handle);
  patchmap.focus(null, { filter: (element) => element.id !== 'hidden' });
  patchmap.fit(undefined, {
    filter: (element) => element.type !== 'relations',
    padding: { x: 5, y: 10 },
  });
  patchmap.rotation.rotateBy(15);
  patchmap.flip.set({ x: true, y: false });
  patchmap.event.add({ path: '$', action: 'click', fn: (_event) => undefined });
  patchmap.stateManager?.setState('selection', {
    onClick: (target: unknown) => target,
  });
  const animationContext = patchmap.animationContext;
  patchmap.destroy();
  return drawn.length
    + matches.length
    + updated.length
    + observations.length
    + Number(animationContext !== undefined);
}

void [
  transformer,
  history,
  state,
  command,
  selected,
  generatedId,
  propagated,
  publicHelpers,
  typedData,
  typedInit,
  typedUpdate,
  minimalFlow,
];
`,
  );
  await writeFile(
    join(consumerDirectory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          // The public dependency declarations are not strict NodeNext-clean;
          // consumer code remains fully checked while dependency .d.ts files
          // use the standard skipLibCheck compatibility boundary.
          skipLibCheck: true,
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        },
        include: ['typescript-consumer.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await Promise.all([
    run(process.execPath, ['esm-consumer.mjs'], consumerDirectory),
    run(process.execPath, ['cjs-consumer.cjs'], consumerDirectory),
    run(
      process.execPath,
      [
        join(consumerDirectory, 'node_modules/typescript/bin/tsc'),
        '--project',
        'tsconfig.json',
      ],
      consumerDirectory,
    ),
  ]);

  const { server, url } = await serveConsumer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.PatchMap?.Patchmap === 'function');
    const observed = await page.evaluate(async () => {
      const api = window.PatchMap;
      const host = document.querySelector('#host');
      class ConsumerPatchmap extends api.Patchmap {}
      const patchmap = new ConsumerPatchmap();
      await patchmap.init(host, { app: { width: 320, height: 240 } });
      const drawn = patchmap.draw([
        { type: 'rect', id: 'consumer-rect', size: 20, fill: '#1099FF' },
      ]);
      const selected = patchmap.selector(
        '$..children[?(@.id==="consumer-rect")]',
      );
      const updated = patchmap.update({
        elements: selected,
        changes: { attrs: { x: 12 } },
        emit: false,
      });
      const beforeDestroy = {
        exports: Object.keys(api).sort(),
        subclassed: patchmap instanceof api.Patchmap,
        helperTypes: [
          api.convertLegacyData,
          api.findIntersectObject,
          api.intersectPoint,
          api.isMoved,
          api.selector,
          api.uid,
        ].map((helper) => typeof helper),
        propagateEventDefined: api.PROPAGATE_EVENT !== undefined,
        isInit: patchmap.isInit,
        drawCount: drawn.length,
        selectedCount: selected.length,
        updatedCount: updated.length,
        x: selected[0].x,
        canvasCount: host.querySelectorAll('canvas').length,
      };
      patchmap.destroy();
      return {
        beforeDestroy,
        afterDestroy: {
          isInit: patchmap.isInit,
          canvasCount: host.querySelectorAll('canvas').length,
        },
      };
    });
    assert.deepEqual(observed.beforeDestroy.exports, documentedExports);
    assert.equal(observed.beforeDestroy.subclassed, true);
    assert.deepEqual(
      observed.beforeDestroy.helperTypes,
      Array.from({ length: 6 }, () => 'function'),
    );
    assert.equal(observed.beforeDestroy.propagateEventDefined, true);
    assert.equal(observed.beforeDestroy.isInit, true);
    assert.equal(observed.beforeDestroy.drawCount, 1);
    assert.equal(observed.beforeDestroy.selectedCount, 1);
    assert.equal(observed.beforeDestroy.updatedCount, 1);
    assert.equal(observed.beforeDestroy.x, 12);
    assert.equal(observed.beforeDestroy.canvasCount, 1);
    assert.deepEqual(observed.afterDestroy, { isInit: false, canvasCount: 0 });
  } finally {
    const cleanupResults = await Promise.allSettled([
      browser?.close() ?? Promise.resolve(),
      server.close(),
    ]);
    const cleanupErrors = cleanupResults
      .filter(({ status }) => status === 'rejected')
      .map(({ reason }) => reason);
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Packed consumer cleanup failed');
    }
  }

  process.stdout.write(
    `Packed consumer: all ${documentedExports.length} documented exports, `
      + `${installedEntryTargets.length} package entry targets, `
      + `${declarationEdgesVerified} declaration edges, ESM, CommonJS, `
      + 'NodeNext TypeScript, UMD, and subclass lifecycle passed\n',
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

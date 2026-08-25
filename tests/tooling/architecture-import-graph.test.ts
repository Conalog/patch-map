import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = fileURLToPath(
  new URL('../../src/', import.meta.url),
);

describe('PatchMap architecture import graph', () => {
  it('keeps production TypeScript modules acyclic', async () => {
    const files = await typescriptFiles(SOURCE_ROOT);
    const knownFiles = new Set(files);
    const graph = new Map<string, readonly string[]>();

    await Promise.all(files.map(async (file) => {
      const source = await readFile(file, 'utf8');
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const imports = new Set<string>();
      for (const specifier of moduleSpecifiers(parsed)) {
        const target = resolveLocalModule(file, specifier, knownFiles);
        if (target !== null) imports.add(target);
      }
      graph.set(file, Object.freeze([...imports].sort()));
    }));

    const cycles = stronglyConnectedComponents(graph)
      .filter((component) =>
        component.length > 1 ||
        (graph.get(component[0] ?? '') ?? []).includes(component[0] ?? '')
      )
      .map((component) => component
        .map((file) => relative(SOURCE_ROOT, file))
        .sort());

    expect(cycles).toEqual([]);
  });

  it.each([
    ['Engine', 'engine'],
    ['Core', 'core'],
  ] as const)(
    'keeps %s support modules behind neutral renderer contracts',
    async (_owner, sourceOwner) => {
      const files = await typescriptFiles(SOURCE_ROOT);
      const knownFiles = new Set(files);
      const violations: string[] = [];

      await Promise.all(files.map(async (file) => {
        const source = await readFile(file, 'utf8');
        const parsed = ts.createSourceFile(
          file,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        );
        const sourcePath = relative(SOURCE_ROOT, file);
        if (!belongsToOwner(sourcePath, sourceOwner)) return;
        if (rendererBoundary(sourcePath) === 'concrete-pixi') return;
        for (const specifier of moduleSpecifiers(parsed)) {
          const target = resolveLocalModule(file, specifier, knownFiles);
          if (target === null) continue;
          const targetPath = relative(SOURCE_ROOT, target);
          if (rendererBoundary(targetPath) !== 'concrete-pixi') continue;
          violations.push(
            `${sourcePath} -> ${targetPath} (use a neutral renderer contract)`,
          );
        }
      }));

      expect(violations.sort()).toEqual([]);
    },
  );

  it('keeps architecture owners acyclic', async () => {
    const files = await typescriptFiles(SOURCE_ROOT);
    const knownFiles = new Set(files);
    const ownerGraph = new Map<string, Set<string>>();
    const witnesses = new Map<string, string>();

    await Promise.all(files.map(async (file) => {
      const source = await readFile(file, 'utf8');
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const sourcePath = relative(SOURCE_ROOT, file);
      const sourceOwner = architectureOwner(sourcePath);
      const dependencies = ownerGraph.get(sourceOwner) ?? new Set<string>();
      ownerGraph.set(sourceOwner, dependencies);

      for (const specifier of moduleSpecifiers(parsed)) {
        const target = resolveLocalModule(file, specifier, knownFiles);
        if (target === null) continue;
        const targetPath = relative(SOURCE_ROOT, target);
        const targetOwner = architectureOwner(targetPath);
        if (sourceOwner === targetOwner) continue;
        dependencies.add(targetOwner);
        const edge = ownerEdge(sourceOwner, targetOwner);
        const witness = `${sourcePath} -> ${targetPath}`;
        const current = witnesses.get(edge);
        if (current === undefined || witness.localeCompare(current) < 0) {
          witnesses.set(edge, witness);
        }
      }
    }));

    const graph = new Map(
      [...ownerGraph].map(([owner, dependencies]) => [
        owner,
        Object.freeze([...dependencies].sort()),
      ]),
    );
    const cycles = stronglyConnectedComponents(graph)
      .filter((component) => component.length > 1)
      .map((component) => ownerCycleDiagnostic(component, graph, witnesses))
      .sort();

    expect(
      cycles,
      'Owner-level cycles hide dependency direction. Each diagnostic includes '
        + 'one source-file witness per owner edge.',
    ).toEqual([]);
  });

  it('enforces one-way owner dependencies', async () => {
    const files = await typescriptFiles(SOURCE_ROOT);
    const knownFiles = new Set(files);
    const violations: string[] = [];

    await Promise.all(files.map(async (file) => {
      const source = await readFile(file, 'utf8');
      const parsed = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const sourcePath = relative(SOURCE_ROOT, file);
      const sourceOwner = architectureOwner(sourcePath);
      const forbiddenTargets = FORBIDDEN_OWNER_DEPENDENCIES[sourceOwner];
      if (forbiddenTargets === undefined) return;

      for (const specifier of moduleSpecifiers(parsed)) {
        const target = resolveLocalModule(file, specifier, knownFiles);
        if (target === null) continue;
        const targetPath = relative(SOURCE_ROOT, target);
        const targetOwner = architectureOwner(targetPath);
        if (!forbiddenTargets.has(targetOwner)) continue;
        violations.push(`${sourcePath} -> ${targetPath}`);
      }
    }));

    expect(
      violations.sort(),
      'Owner dependencies must point toward neutral contracts and lower-level domains.',
    ).toEqual([]);
  });
});

const FORBIDDEN_OWNER_DEPENDENCIES: Readonly<
  Record<string, ReadonlySet<string>>
> = Object.freeze({
  'rendering-port': new Set(['composition', 'rendering', 'core', 'engine', 'public']),
  core: new Set(['composition', 'rendering', 'engine', 'public']),
  rendering: new Set(['composition', 'core', 'engine', 'public']),
  public: new Set(['composition', 'rendering', 'engine', 'core']),
  engine: new Set(['composition', 'rendering']),
  semantic: new Set(['composition', 'rendering', 'core', 'engine', 'public']),
  dense: new Set(['composition', 'rendering', 'core', 'engine', 'public']),
});

function belongsToOwner(sourcePath: string, owner: string): boolean {
  return sourcePath === `${owner}.ts` || sourcePath.startsWith(`${owner}/`);
}

function rendererBoundary(
  targetPath: string,
): 'neutral-contract' | 'concrete-pixi' | 'not-renderer' {
  if (targetPath.startsWith('rendering-port/')) return 'neutral-contract';
  if (
    targetPath.startsWith('rendering/') ||
    targetPath.startsWith('composition/')
  ) {
    return 'concrete-pixi';
  }
  return 'not-renderer';
}

function architectureOwner(sourcePath: string): string {
  const [entry = sourcePath] = sourcePath.split('/');
  return entry.endsWith('.ts') ? entry.slice(0, -3) : entry;
}

function ownerEdge(sourceOwner: string, targetOwner: string): string {
  return `${sourceOwner}\u0000${targetOwner}`;
}

function ownerCycleDiagnostic(
  component: readonly string[],
  graph: ReadonlyMap<string, readonly string[]>,
  witnesses: ReadonlyMap<string, string>,
): string {
  const owners = [...component].sort();
  const ownerSet = new Set(owners);
  const edges = owners.flatMap((sourceOwner) =>
    (graph.get(sourceOwner) ?? [])
      .filter((targetOwner) => ownerSet.has(targetOwner))
      .map((targetOwner) => {
        const witness = witnesses.get(ownerEdge(sourceOwner, targetOwner));
        return `  ${sourceOwner} -> ${targetOwner}: ${witness ?? 'no witness'}`;
      }))
    .sort();
  return [`owners: ${owners.join(', ')}`, ...edges].join('\n');
}

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  }));
  return nested.flat().sort();
}

function resolveLocalModule(
  sourceFile: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  if (!specifier.startsWith('.')) return null;
  const unresolved = resolve(dirname(sourceFile), specifier);
  const candidates = specifier.endsWith('.js')
    ? [unresolved.slice(0, -3) + '.ts']
    : specifier.endsWith('.ts')
      ? [unresolved]
      : [`${unresolved}.ts`, join(unresolved, 'index.ts')];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

function moduleSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const specifiers = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier !== undefined && ts.isStringLiteral(specifier)) {
        specifiers.add(specifier.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [specifier] = node.arguments;
      if (specifier !== undefined && ts.isStringLiteral(specifier)) {
        specifiers.add(specifier.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return Object.freeze([...specifiers]);
}

function stronglyConnectedComponents(
  graph: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const indexByNode = new Map<string, number>();
  const lowLinkByNode = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  const visit = (node: string): void => {
    const index = nextIndex;
    nextIndex += 1;
    indexByNode.set(node, index);
    lowLinkByNode.set(node, index);
    stack.push(node);
    onStack.add(node);

    for (const target of graph.get(node) ?? []) {
      if (!indexByNode.has(target)) {
        visit(target);
        lowLinkByNode.set(
          node,
          Math.min(lowLinkByNode.get(node)!, lowLinkByNode.get(target)!),
        );
      } else if (onStack.has(target)) {
        lowLinkByNode.set(
          node,
          Math.min(lowLinkByNode.get(node)!, indexByNode.get(target)!),
        );
      }
    }

    if (lowLinkByNode.get(node) !== indexByNode.get(node)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    components.push(component);
  };

  for (const node of graph.keys()) {
    if (!indexByNode.has(node)) visit(node);
  }
  return components;
}

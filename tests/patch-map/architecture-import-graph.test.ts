import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = fileURLToPath(
  new URL('../../src/patch-map/', import.meta.url),
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

  it('keeps Engine support modules independent from the concrete Pixi adapter', async () => {
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
      if (!sourcePath.startsWith('engine/')) return;
      for (const specifier of moduleSpecifiers(parsed)) {
        const target = resolveLocalModule(file, specifier, knownFiles);
        if (target === null) continue;
        const targetPath = relative(SOURCE_ROOT, target);
        if (
          targetPath === 'renderers/pixi-renderer.ts' ||
          targetPath.startsWith('renderers/pixi-renderer/')
        ) {
          violations.push(`${sourcePath} -> ${targetPath}`);
        }
      }
    }));

    expect(violations.sort()).toEqual([]);
  });
});

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

import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RULES = Object.freeze({
  src: new Set(['contracts', 'examples', 'lab', 'performance', 'tests', 'verification']),
  verification: new Set(['examples', 'lab', 'performance', 'tests']),
  performance: new Set(['lab', 'tests']),
  lab: new Set(['tests']),
});

describe('repository source boundaries', () => {
  it('keeps product and verification dependencies one-way', async () => {
    const violations: string[] = [];
    for (const [owner, prohibited] of Object.entries(RULES)) {
      for (const file of await sourceFiles(resolve(ROOT, owner))) {
        const source = await readFile(file, 'utf8');
        for (const specifier of moduleSpecifiers(file, source)) {
          if (!specifier.startsWith('.')) continue;
          const target = resolve(dirname(file), specifier);
          const targetRoot = relative(ROOT, target).split(sep)[0];
          if (targetRoot !== undefined && prohibited.has(targetRoot)) {
            violations.push(`${relative(ROOT, file)} -> ${specifier}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps shared performance datasets outside the Lab owner', async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles(resolve(ROOT, 'performance'))) {
      const source = await readFile(file, 'utf8');
      if (/lab\/fixtures\//u.test(source)) violations.push(relative(ROOT, file));
    }
    expect(violations).toEqual([]);
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:mjs|ts)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function moduleSpecifiers(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const values: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      values.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] !== undefined
      && ts.isStringLiteral(node.arguments[0])
    ) {
      values.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return values;
}

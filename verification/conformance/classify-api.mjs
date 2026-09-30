import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Structural classification only: callable interfaces may be host callbacks or SDK APIs.
 * Data direction must be reviewed at each binding; a name is not evidence of direction. */
export function classifyPublicApi(root, inventory) {
  const config = ts.readConfigFile(resolve(root, 'packages/javascript/tsconfig.json'), ts.sys.readFile);
  if (config.error) throw new Error('Cannot read TypeScript config');
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(root, 'packages/javascript'));
  const entry = resolve(root, 'packages/javascript/src/index.ts');
  const program = ts.createProgram([entry], parsed.options);
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(program.getSourceFile(entry));
  const exports = new Map(checker.getExportsOfModule(module).map((symbol) => [symbol.name,
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol]));
  return inventory.map((item) => {
    const symbol = exports.get(item.export);
    if (!symbol) throw new Error(`Unknown export: ${item.id}`);
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    const hasValue = Boolean(symbol.valueDeclaration);
    const typeFacet = item.id.startsWith(`api.${item.export}.type`);
    const type = hasValue && !typeFacet
      ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
      : checker.getDeclaredTypeOfSymbol(symbol);
    let at = declaration;
    let classifiedType = type;
    if (item.member) {
      const member = checker.getPropertyOfType(type, item.member);
      if (!member) throw new Error(`Unknown member: ${item.id}`);
      at = member.valueDeclaration ?? member.declarations?.[0] ?? declaration;
      classifiedType = checker.getTypeOfSymbolAtLocation(member, at);
    }
    const callable = checker.getSignaturesOfType(checker.getNonNullableType(classifiedType), ts.SignatureKind.Call).length > 0;
    let category;
    if (item.member === 'prototype' && ts.isClassDeclaration(declaration)) category = 'language-prototype-facet';
    else if (item.member) category = callable
      ? ts.isClassDeclaration(declaration) ? 'runtime-method' : 'callable-contract-member'
      : 'data-contract-member';
    else if (ts.isTypeAliasDeclaration(declaration)) category = 'type-alias';
    else if (ts.isInterfaceDeclaration(declaration)) category = 'interface-container';
    else if (ts.isClassDeclaration(declaration)) category = typeFacet ? 'class-instance-container' : 'runtime-constructor';
    else if (callable) category = 'runtime-function';
    else category = 'runtime-value';
    return { id: item.id, category, declarationKind: ts.SyntaxKind[at.kind],
      direction: category === 'data-contract-member' || category === 'callable-contract-member'
        ? 'requires-binding-review' : 'not-inferred',
      source: item.source };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const inventory = JSON.parse(await readFile(resolve(root, 'conformance/public-api.json'), 'utf8'));
  const entries = classifyPublicApi(root, inventory);
  const counts = {};
  for (const entry of entries) counts[entry.category] = (counts[entry.category] ?? 0) + 1;
  const report = { schemaRevision: 'patch-map-api-classification/1', qualified: false,
    description: 'AST structural classification, not binding or execution evidence. Input/output/callback direction requires explicit binding review.',
    counts, entries };
  const output = process.argv[2];
  if (output) await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ entries: entries.length, counts, qualified: false }));
}

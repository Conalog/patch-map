import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** Uses the real public export graph, including export-star and inherited members. */
export function inventoryPublicApi(root = process.cwd()) {
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const entry = resolve(root, 'src/index.ts');
  const program = ts.createProgram([entry], parsed.options);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  const module = source && checker.getSymbolAtLocation(source);
  if (!module) throw new Error('Public entry module not found');
  const entries = [];
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (!declaration) throw new Error(`Missing declaration: ${exported.name}`);
    const hasType = Boolean(symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Class));
    const hasValue = Boolean(symbol.valueDeclaration);
    const facets = hasValue
      ? [{ suffix: '', type: checker.getTypeOfSymbolAtLocation(symbol, declaration) },
        ...(hasType ? [{ suffix: '.type', type: checker.getDeclaredTypeOfSymbol(symbol) }] : [])]
      : [{ suffix: '', type: checker.getDeclaredTypeOfSymbol(symbol) }];
    const origin = relative(root, declaration.getSourceFile().fileName).split('\\').join('/');
    if (!origin.startsWith('src/')) continue;
    // TypeScript emits absolute import paths for some inferred external shapes.
    // Keep the fingerprint independent of checkout location.
    const portable = (value) => value.split('\\').join('/').replaceAll(`${resolve(root).split('\\').join('/')}/`, '');
    const describe = (value) => portable(checker.typeToString(value, declaration, ts.TypeFormatFlags.NoTruncation));
    for (const { suffix, type } of facets) {
    const prefix = `api.${exported.name}${suffix}`;
    const variants = type.isUnion() ? type.types.map(describe).sort() : [];
    entries.push({ id: prefix, export: exported.name, source: origin,
      kind: ts.SyntaxKind[declaration.kind], shape: describe(type), variants,
      constructors: checker.getSignaturesOfType(type, ts.SignatureKind.Construct).map((signature) => portable(checker.signatureToString(signature, declaration, ts.TypeFormatFlags.NoTruncation))) });
    for (const member of checker.getPropertiesOfType(type)) {
      if (member.declarations?.some((node) => ts.getCombinedModifierFlags(node) &
        (ts.ModifierFlags.Private | ts.ModifierFlags.Protected))) continue;
      const at = member.valueDeclaration ?? member.declarations?.[0] ?? declaration;
      const memberSource = relative(root, at.getSourceFile().fileName).split('\\').join('/');
      if (!memberSource.startsWith('src/')) continue;
      const memberType = checker.getTypeOfSymbolAtLocation(member, at);
      entries.push({ id: `${prefix}.${member.name}`, export: exported.name, member: member.name,
        source: memberSource,
        optional: Boolean(member.flags & ts.SymbolFlags.Optional), shape: describe(memberType) });
    }
  }
  }
  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = resolve('conformance/public-api.json');
  const inventory = inventoryPublicApi();
  if (process.argv.includes('--write')) {
    await writeFile(path, `${JSON.stringify(inventory, null, 2)}\n`);
    console.log(`Recorded ${inventory.length} public declaration entries`);
  } else {
    const saved = JSON.parse(await readFile(path, 'utf8'));
    if (JSON.stringify(saved) !== JSON.stringify(inventory)) throw new Error('Public API inventory drift: review declarations and update inventory');
    console.log(`Public API inventory verified: ${inventory.length} entries`);
  }
}

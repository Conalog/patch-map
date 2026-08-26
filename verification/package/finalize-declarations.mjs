import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';

const declarationRoot = resolve('dist');
const relativeSpecifier =
  /((?:\bfrom\s+|\bimport\s*\()\s*['"])(\.\.?\/[^'"]+)(['"])/gu;
const sourceMapDirective = /(?:^|\r?\n)\/\/[#@]\s*sourceMappingURL=.*?(?=\r?\n|$)/gu;

const hasRuntimeExtension = (specifier) =>
  ['.js', '.mjs', '.cjs', '.json', '.node'].includes(extname(specifier));

const declarationsIn = async (directory) => {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await declarationsIn(path));
    else if (entry.name.endsWith('.d.ts')) output.push(path);
  }
  return output;
};

const declarations = await declarationsIn(declarationRoot);
const declarationPaths = new Set(declarations.map((path) => resolve(path)));

const runtimeSpecifier = (declarationPath, specifier) => {
  if (hasRuntimeExtension(specifier)) return specifier;
  const target = resolve(dirname(declarationPath), specifier);
  if (declarationPaths.has(resolve(join(target, 'index.d.ts')))) {
    return `${specifier}/index.js`;
  }
  return `${specifier}.js`;
};

for (const path of declarations) {
  const source = await readFile(path, 'utf8');
  const finalized = source
    .replace(
      relativeSpecifier,
      (_match, prefix, specifier, suffix) =>
        `${prefix}${runtimeSpecifier(path, specifier)}${suffix}`,
    )
    .replace(sourceMapDirective, '');
  if (finalized !== source) await writeFile(path, finalized);
}

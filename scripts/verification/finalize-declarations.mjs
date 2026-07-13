import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

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

for (const path of await declarationsIn(declarationRoot)) {
  const source = await readFile(path, 'utf8');
  const finalized = source
    .replace(
      relativeSpecifier,
      (match, prefix, specifier, suffix) => hasRuntimeExtension(specifier)
        ? match
        : `${prefix}${specifier}.js${suffix}`,
    )
    .replace(sourceMapDirective, '');
  if (finalized !== source) await writeFile(path, finalized);
}

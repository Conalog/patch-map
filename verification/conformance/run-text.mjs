import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { compareObservations } from './compare.mjs';
const fields = ['source','layoutSource','graphemes','hardLines','splitLines','lines','visibleLines','visibleText',
  'fontSizePx','lineHeightPx','letterSpacingPx','lineAdvancesPx','layoutBounds','naturalLayoutBounds','bidiLines'];
const server = await createServer({ configFile:false, optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true}, appType:'custom' });
try {
  const { layoutPatchMapText }=await server.ssrLoadModule('/packages/javascript/src/semantic/text-layout.ts');
  const inputs=JSON.parse(await readFile('conformance/text/cases.json','utf8'));
  const results=inputs.map(({id,options})=>{ const result=layoutPatchMapText(options);return {id,options,expected:Object.fromEntries(fields.map((field)=>[field,result[field]]))}; });
  await mkdir('.artifacts/flutter',{recursive:true});
  await writeFile('.artifacts/flutter/npm-text.json',JSON.stringify(results,null,2)+'\n');
  const expected=JSON.parse(await readFile('conformance/text/expected.json','utf8'));
  compareObservations(results,expected,'$.text');
  console.log(`Recorded ${results.length} npm semantic text observations`);
} finally {await server.close();}

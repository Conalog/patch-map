import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {compareObservations} from './compare.mjs';

// Bounded representative public model fields, union branches and critical errors.
const server = await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
try {
  const {materializePatchMapDataset} = await server.ssrLoadModule('/src/semantic/dataset.ts');
  const cases=JSON.parse(await readFile('conformance/model/cases.json','utf8'));
  const observations=cases.map(({id,dataset,reject=false})=>{
    const before=JSON.stringify(dataset);
    let actual;
    try {
      const result=materializePatchMapDataset(dataset);
      actual={dataset:result.dataset,semanticHash:result.semanticHash};
    } catch(error) {
      actual={code:error.code,path:error.datasetPath};
    }
    if(JSON.stringify(dataset)!==before)throw new Error(`${id}: caller mutation`);
    if(reject!==Object.hasOwn(actual,'code'))throw new Error(`${id}: expected admission ${!reject}; ${JSON.stringify(actual)}`);
    return {id,actual};
  });
  await mkdir('.artifacts/flutter',{recursive:true});
  await writeFile('.artifacts/flutter/npm-model.json',JSON.stringify(observations,null,2)+'\n');
  const expected=JSON.parse(await readFile('conformance/model/expected.json','utf8'));
  compareObservations(observations,expected,'$.model');
  console.log(`Verified ${observations.length} npm model observations`);
} finally {await server.close();}

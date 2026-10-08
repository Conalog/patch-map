#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argumentValue } from '../browser-options.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const workspaceRoot=path.resolve(root,'../..'),argv=process.argv.slice(2);
const widgetRoot=path.resolve(argumentValue(argv,'--widget-root')??'');
const inputs=path.resolve(argumentValue(argv,'--inputs')??'');
const chrome=argumentValue(argv,'--executable-path');
if(!argumentValue(argv,'--widget-root')||!argumentValue(argv,'--inputs')||!chrome)throw new Error('requires --widget-root, --inputs, --executable-path');
const output=path.resolve(workspaceRoot,argumentValue(argv,'--output')??'.artifacts/performance/widget-image-e2e');
const smoke=argv.includes('--smoke');
const protocol={warmups:smoke?0:2,measured:smoke?1:7,sizes:smoke?[5000]:[5000,7000],concurrency:1,
 format:'jpeg',quality:0.9,barPercent:100,color:'#e53935',valueLength:12,batchSize:100,
 browserLifecycle:'fresh per HTTP request, closes before response',cpuThrottleRate:1,
 milestone:'HTTP request dispatched -> full response image received, includes model/data/browser/destroy/close',
 upstream:'local frozen Patch API HTTP replay and cached assets; excludes remote production network variance',
 acceptance:'output/workload/lifecycle gates; no predeclared latency or memory performance budget'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const jpegSize=bytes=>{
 let offset=2;while(offset<bytes.length){while(bytes[offset]===0xff)offset++;const marker=bytes[offset++];if(marker===0xd9||marker===0xda)break;const length=bytes.readUInt16BE(offset);if([0xc0,0xc1,0xc2].includes(marker))return[bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];offset+=length;}throw new Error('JPEG dimensions missing');
};
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{samples:values,min:sorted[0],median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1)};};
await mkdir(output,{recursive:false});
const snapshot=path.join(output,'widget-snapshot');await mkdir(snapshot);
for(const name of ['src','assets','package.json','package-lock.json'])await cp(path.join(widgetRoot,name),path.join(snapshot,name),{recursive:true});
await symlink(path.join(widgetRoot,'node_modules'),path.join(snapshot,'node_modules'),'dir');
await cp(inputs,path.join(output,'inputs'),{recursive:true});
const frozen=path.join(output,'inputs');
const paths=git(widgetRoot,'ls-files','src','assets','package.json','package-lock.json').split('\n');
const widgetDigests=Object.fromEntries(await Promise.all(paths.map(async name=>[name,hash(await readFile(path.join(snapshot,name)))])));
const libraryFiles=git(workspaceRoot,'ls-files','packages/javascript/src','packages/javascript/package.json',
 'package-lock.json','packages/javascript/vite.config.ts','shared/assets','verification/assets').split('\n').sort();
const sourceSha=hash(Buffer.concat(await Promise.all(libraryFiles.map(async name=>Buffer.concat([Buffer.from(name+'\0'),await readFile(path.join(workspaceRoot,name))])))));
const fixtures=Object.fromEntries(await Promise.all(['request.json','data.json','model.json','cache.json'].map(async name=>[name,hash(await readFile(path.join(frozen,name)))])));
for(const record of JSON.parse(await readFile(path.join(frozen,'cache.json'),'utf8'))){const bytes=await readFile(path.join(frozen,'asset-cache',record.file));if(hash(bytes)!==record.sha256)throw new Error('frozen asset hash mismatch');fixtures[record.file]=hash(bytes);}
await cp(path.join(root,'dist'),path.join(output,'patch-map-build'),{recursive:true});
await cp(path.join(snapshot,'src/renderer/render.js'),path.join(snapshot,'src/renderer/legacy-render.js'));
await cp(path.join(root,'performance/probes/widget-e2e/renderer.mjs'),path.join(snapshot,'src/renderer/image-renderer.js'));
await writeFile(path.join(snapshot,'src/renderer/render.js'),`import { buildDocument, resolveOutputDimensions } from './legacy-render.js';\nimport { renderImage as imageRender } from './image-renderer.js';\nexport const renderImage=(model,output,base,options)=>imageRender(model,output,base,{...options,buildDocument,resolveOutputDimensions});\n`);
await writeFile(path.join(snapshot,'src/renderer/browser-entry.js'),await readFile(path.join(root,'performance/probes/widget-e2e/browser.mjs')));
const bundleScript=`import {build} from 'esbuild';await build({entryPoints:[${JSON.stringify(path.join(snapshot,'src/renderer/browser-entry.js'))}],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:${JSON.stringify(path.join(snapshot,'assets/image-client.js'))},alias:{'@conalog/patch-map/image':${JSON.stringify(path.join(output,'patch-map-build/image.js'))}}});`;
execFileSync(process.execPath,['--input-type=module','-e',bundleScript],{cwd:snapshot,stdio:'inherit'});
await writeFile(path.join(snapshot,'src/renderer/render-assets.js'),`import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';\nconst root=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));\nexport function serveRendererAsset(req,res){let name;if(req.url==='/__renderer/image-client.js')name='assets/image-client.js';if(/^\\/__renderer\\/icons\\/(ess|inverter-frame)\\.svg$/.test(req.url))name='assets/icons/'+path.basename(req.url);if(!name)return false;res.writeHead(200,{'content-type':name.endsWith('.svg')?'image/svg+xml':'text/javascript','access-control-allow-origin':'*'});res.end(fs.readFileSync(path.join(root,name)));return true;}\n`);
const identity={libraryCommit:git(root,'rev-parse','HEAD'),librarySourceSha256:sourceSha,
 widgetCommit:git(widgetRoot,'rev-parse','HEAD'),widgetWorkingTreeStatus:git(widgetRoot,'status','--short'),widgetDigests,fixtures,
 consumerBundleSha256:hash(await readFile(path.join(snapshot,'assets/image-client.js'))),
 runnerSha256:hash(await readFile(new URL(import.meta.url))),
 probeDigests:Object.fromEntries(await Promise.all(['browser.mjs','renderer.mjs','server.mjs'].map(async name=>[name,hash(await readFile(path.join(root,'performance/probes/widget-e2e',name)))])))};
const environment={node:process.version,cpu:os.cpus()[0].model,memoryBytes:os.totalmem(),osRelease:os.release(),chrome};
await writeFile(path.join(output,'contract.json'),JSON.stringify({identity,protocol,environment},null,2));
const server=spawn(process.execPath,[path.join(root,'performance/probes/widget-e2e/server.mjs'),snapshot,frozen],{env:{...process.env,WIDGET_E2E_CHROME:chrome},stdio:['ignore','pipe','pipe']});
const serverExit=once(server,'exit');let base,logs='',stderr='';
server.stdout.on('data',chunk=>{logs+=chunk;for(const line of String(chunk).split('\n')){try{const event=JSON.parse(line);if(event.message==='E2E_READY')base=event.details.base;}catch{/* partial chunk retained in logs */}}});
server.stderr.on('data',chunk=>stderr+=chunk);
const raw=[];
try{
 const readyAt=Date.now();while(!base){if(server.exitCode!==null||Date.now()-readyAt>30000)throw new Error('E2E server failed: '+stderr);await new Promise(r=>setTimeout(r,25));}
 const requestTemplate=JSON.parse(await readFile(path.join(frozen,'request.json'),'utf8'));
 requestTemplate.view={mode:'text',color:protocol.color};
 for(let round=0;round<protocol.warmups+protocol.measured;round++)for(const size of round%2?[...protocol.sizes].reverse():protocol.sizes){
  const phase=round<protocol.warmups?'warmup':'measured';const label=`${phase}-${round}-${size}`;
  const directory=path.join(output,label);await mkdir(directory);
  await(await fetch(base+'/__e2e/reset')).text();
  const samples=[];let buffer='',samplerError='';
  const sampler=spawn('python3',[path.join(root,'performance/probes/image/sample.py'),String(process.pid)]);const samplerExit=once(sampler,'exit');
  sampler.stdout.on('data',chunk=>{buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)if(line)samples.push(JSON.parse(line));});
  sampler.stderr.on('data',chunk=>samplerError+=chunk);
  const row={label,size,phase,loadBefore:os.loadavg()};
  try{
   const wait=Date.now();while(!samples.length){if(sampler.exitCode!==null||Date.now()-wait>10000)throw new Error('sampler failed: '+samplerError);await new Promise(r=>setTimeout(r,10));}
   const request={...requestTemplate,output:{width:size,height:size,antialias:true}};
   row.requestSha256=hash(JSON.stringify(request));row.startEpochMs=Date.now();const t=performance.now();
   const response=await fetch(base+'/plant-map/render',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer local-benchmark','account-type':'manager'},body:JSON.stringify(request),signal:AbortSignal.timeout(60000)});
   row.headersMs=performance.now()-t;const bytes=Buffer.from(await response.arrayBuffer());row.responseMs=performance.now()-t;row.endEpochMs=Date.now();row.bytes=bytes.length;row.contentType=response.headers.get('content-type');row.imageSha256=hash(bytes);if(response.status===200)row.decodedSize=jpegSize(bytes);
   if(response.status!==200)throw new Error(`${response.status}: ${bytes.toString().slice(0,1500)}`);
   const meta=await(await fetch(base+'/__e2e/meta')).json();row.meta=meta;
   row.loadAfter=os.loadavg();
   await new Promise(r=>setTimeout(r,100));
   const primary=samples.filter(s=>s.epochMs>=row.startEpochMs&&s.epochMs<=row.endEpochMs);
   const roles=new Map(meta.timing.processInfo.processInfo.map(p=>[p.id,p.type]));
   const peak=fn=>Math.max(0,...primary.map(fn));
   const byRole=role=>peak(s=>s.processes.filter(p=>roles.get(p.pid)===role).reduce((sum,p)=>sum+p.footprintMiB,0));
   row.memory={sampleCount:primary.length,peakTotalMiB:peak(s=>s.footprintMiBSum),peakRssMiB:peak(s=>s.rssMiB),peakGpuMiB:byRole('GPU'),peakRendererMiB:byRole('renderer'),
    peakServiceNodeMiB:peak(s=>s.processes.find(p=>p.pid===server.pid)?.footprintMiB??0),
    maxSamplingGapMs:Math.max(0,...primary.slice(1).map((s,i)=>s.epochMs-primary[i].epochMs))};
   row.cpuSeconds=primary.at(-1).cpuSecondsObservedCumulative-samples[0].cpuSecondsObservedCumulative;
   if(JSON.stringify(row.decodedSize)!==JSON.stringify([size,size])||meta.queryCount!==3||meta.timing.browser.updateCount!==3377||meta.timing.browser.batches.some(b=>!b.changed||b.status!=='committed'||b.appliedCount!==b.count*2)||meta.timing.browser.resetBars===0||meta.timing.browser.resetTexts===0||row.contentType!=='image/jpeg'||row.bytes<100||primary.length<10)throw new Error('E2E update/output/query/sampling invariant failed');
   await writeFile(path.join(directory,'output.jpg'),bytes);
   row.status='pass';
  }catch(error){row.status='fail';row.failure=String(error.stack??error);}
  finally{sampler.kill('SIGTERM');await samplerExit;await writeFile(path.join(directory,'samples.jsonl'),samples.map(s=>JSON.stringify(s)).join('\n')+'\n');await writeFile(path.join(directory,'result.json'),JSON.stringify(row,null,2));}
  raw.push(row);console.log(JSON.stringify({label,status:row.status,responseMs:row.responseMs,peakGiB:row.memory?.peakTotalMiB/1024,failure:row.failure}));
  if(row.status!=='pass')throw new Error(`${label} failed; raw evidence retained`);
 }
 const cases=protocol.sizes.map(size=>{
  const rows=raw.filter(r=>r.size===size&&r.phase==='measured');const timings=['createMs','updateBatchMs','renderMs','browserToNodeMs','destroyMs'];
  return{size,responseMs:stats(rows.map(r=>r.responseMs)),cpuSeconds:stats(rows.map(r=>r.cpuSeconds)),
   memory:Object.fromEntries(['peakTotalMiB','peakGpuMiB','peakRendererMiB','peakServiceNodeMiB'].map(k=>[k,stats(rows.map(r=>r.memory[k]))])),
   stages:Object.fromEntries(timings.map(k=>[k,stats(rows.map(r=>r.meta.timing.browser.timings[k]))])),
   nodeStages:Object.fromEntries(['browserLaunchMs','moduleLoadMs','browserJourneyMs','browserCloseMs'].map(k=>[k,stats(rows.map(r=>r.meta.timing[k]))])),
   imageHashes:[...new Set(raw.filter(r=>r.size===size).map(r=>r.imageSha256))]};
 });
 if(cases.some(c=>c.imageHashes.length!==1))throw new Error('identical-case JPEG output hashes differ; preserve all raw evidence');
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),status:'pass',identity,protocol,environment,cases,raw,
  limitations:['Local HTTP E2E; frozen upstream responses exclude remote Patch API/network latency',
   'Actual widget HTTP/data/model pipeline with experimental image adapter, not a published widget change',
   'Initial component values are cleared before create to guarantee real bar/color/text mutations in updateBatch',
   'Physical footprint process sum is sampled, may miss short peaks; CPU sums concurrent process/core time',
   'n=7 p95 equals observed max; no latency/resource budget judgement or optimization claim']};
 await writeFile(path.join(output,'e2e-baseline.json'),JSON.stringify(report,null,2));
}finally{server.kill('SIGTERM');await serverExit;await writeFile(path.join(output,'server-events.jsonl'),logs);await writeFile(path.join(output,'server-stderr.txt'),stderr);}

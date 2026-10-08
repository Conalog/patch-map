import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [snapshot,inputs]=process.argv.slice(2);
const events=[];
console.log=(...args)=>{const entry={epochMs:Date.now(),message:args[0],details:args[1]};events.push(entry);process.stdout.write(JSON.stringify(entry)+'\n');};
console.error=(...args)=>console.log(...args);
const {createRendererServer}=await import(pathToFileURL(path.join(snapshot,'src/index.js')).href);
const {loadConfig}=await import(pathToFileURL(path.join(snapshot,'src/config.js')).href);
const data=JSON.parse(await readFile(path.join(inputs,'data.json'),'utf8'));
const records=JSON.parse(await readFile(path.join(inputs,'cache.json'),'utf8'));
const cache=new Map(await Promise.all(records.map(async record=>['/cached/'+record.file,{...record,body:await readFile(path.join(inputs,'asset-cache',record.file))}])));
let queryCount=0,base;
const upstream=createServer(async(req,res)=>{
  if(req.headers.authorization!=='Bearer local-benchmark'||req.headers['account-type']!=='manager'){res.writeHead(401);res.end();return;}
  const pathname=new URL(req.url,'http://localhost').pathname;
  const key=pathname.endsWith('/blueprint')?'blueprint':pathname.endsWith('/snapshots')?'registry-snapshots-yesterday':pathname.endsWith('/logs')?'registry-logs':null;
  if(!key){res.writeHead(404);res.end();return;}
  queryCount++;
  let value=JSON.stringify(data.queries[key].result);
  for(const [local,record] of cache)value=value.replaceAll(record.url,base+local);
  res.writeHead(200,{'content-type':'application/json'});res.end(value);
});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
const config=loadConfig({PATCH_API_URL:`http://127.0.0.1:${upstream.address().port}`});
const server=createRendererServer({config});
const original=server.listeners('request');server.removeAllListeners('request');
server.on('request',async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__e2e/reset'){
    events.length=0;queryCount=0;globalThis.__WIDGET_E2E_TIMING__={};globalThis.__WIDGET_E2E_BYTES__=null;
    res.end('ok');return;
  }
  if(pathname==='/__e2e/meta'){
    res.setHeader('content-type','application/json');res.end(JSON.stringify({timing:globalThis.__WIDGET_E2E_TIMING__,events,queryCount}));return;
  }
  if(pathname==='/__e2e/image'){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);globalThis.__WIDGET_E2E_BYTES__=Buffer.concat(chunks);
    res.end('ok');return;
  }
  if(pathname==='/__e2e/page'){
    res.setHeader('content-type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><script type="module" src="/__renderer/image-client.js"></script>');return;
  }
  if(cache.has(pathname)){const asset=cache.get(pathname);res.setHeader('content-type',asset.contentType);res.end(asset.body);return;}
  for(const handler of original)handler.call(server,req,res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
base=`http://127.0.0.1:${server.address().port}`;
console.log('E2E_READY',{base,pid:process.pid});
const close=async()=>{await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>upstream.close(resolve));process.exit(0);};
process.on('SIGTERM',()=>void close());

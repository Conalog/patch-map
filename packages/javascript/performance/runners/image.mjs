#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { argumentValue, parsePatchMapBrowserLaunch } from '../browser-options.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workspaceRoot = path.resolve(root, '../..');
const argv = process.argv.slice(2);
const inputsArg = argumentValue(argv, '--inputs');
if (argv.includes('--help')) { console.log('See performance/README.md: image API baseline runner'); process.exit(0); }
if (!inputsArg) throw new Error('--inputs requires a frozen widget fixture directory; see performance/README.md');
if (process.platform !== 'darwin') throw new Error('native physical-footprint sampler requires macOS');
const inputs = path.resolve(inputsArg);
const output = path.resolve(workspaceRoot, argumentValue(argv, '--output') ?? '.artifacts/performance/image-baseline');
const smoke = argv.includes('--smoke');
const launch = parsePatchMapBrowserLaunch(argv, { extraArgs: ['--enable-gpu', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const protocol = { warmups: smoke ? 0 : 2, measured: smoke ? 1 : 7, sizes: smoke ? [5000] : [5000, 7000],
  formats: smoke ? ['jpeg'] : ['jpeg', 'png'], concurrency: 1, deviceScaleFactor: 1,
  viewport: [1280, 720], cpuThrottleRate: 1, samplingIntervalMs: 50, browserLifecycle: 'fresh per trial',
  assetDelivery: 'frozen local HTTP, fresh browser cache, no routing/interception',
  milestone: 'create + all updates + render + binary Blob transfer to Node',
  acceptance: 'baseline collection only; no latency/memory performance budget or speedup claim',
  invariants: ['hardware WebGL2, AA4, exact dimensions/MIME, all updates accepted',
    'unchanged input, nonblank stable pixels per case, no DOM canvas, fonts released, browser closed'],
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const stats = values => {
  const sorted = [...values].sort((a,b) => a-b);
  return { samples: values, min: sorted[0], median: sorted[Math.floor(sorted.length/2)],
    p95: sorted[Math.ceil(sorted.length*0.95)-1], max: sorted.at(-1) };
};
await mkdir(output, { recursive: false });
// Freeze the exact build and input bytes; subsequent source edits cannot change this run.
await cp(path.join(root, 'dist'), path.join(output, 'build'), { recursive: true });
await cp(inputs, path.join(output, 'inputs'), { recursive: true });
const frozen = path.join(output, 'inputs');
const modelBytes = await readFile(path.join(frozen, 'model.json'));
const model = JSON.parse(modelBytes);
const assetsTemplate = await readFile(path.join(frozen, 'assets.json'), 'utf8');
const cacheRecords = JSON.parse(await readFile(path.join(frozen, 'cache.json'), 'utf8'));
const cached = new Map();
const fixtureFiles = {};
for (const name of ['model.json', 'assets.json', 'cache.json', 'icons/ess.svg', 'icons/inverter-frame.svg']) {
  fixtureFiles[name] = hash(await readFile(path.join(frozen, name)));
}
for (const record of cacheRecords) {
  const body = await readFile(path.join(frozen, 'asset-cache', record.file));
  if (hash(body) !== record.sha256) throw new Error(`asset digest mismatch: ${record.file}`);
  cached.set(`/cached/${record.file}`, { ...record, body });
  fixtureFiles[`asset-cache/${record.file}`] = hash(body);
}
const productionFiles = git('-C', workspaceRoot, 'ls-files', 'packages/javascript/src',
  'packages/javascript/package.json', 'package-lock.json', 'packages/javascript/vite.config.ts',
  'shared/assets', 'verification/assets').split('\n').sort();
const sourceIdentity = hash(Buffer.concat(await Promise.all(productionFiles.map(async name => Buffer.concat([
  Buffer.from(name+'\0'), await readFile(path.join(workspaceRoot,name)), Buffer.from('\0'),
])))));
const { readdir } = await import('node:fs/promises');
const artifactFiles = (await readdir(path.join(output, 'build'))).filter(name => /\.(js|cjs)$/.test(name)).sort();
const buildDigests = Object.fromEntries(await Promise.all(artifactFiles.map(async name => [name, hash(await readFile(path.join(output,'build',name)))])));
const probeBytes = await readFile(path.join(root,'performance/probes/image/browser.mjs'));
await writeFile(path.join(output,'entry.mjs'),probeBytes.toString().replace("'/dist/image.js'","'./build/image.js'"));
// Consumer bundling runs in a separate process which exits before native sampling.
const bundlerConfig = { root:output, configFile:false, logLevel:'error', build:{
  target:'es2022', outDir:path.join(output,'consumer'), emptyOutDir:true,
  lib:{entry:path.join(output,'entry.mjs'),formats:['es'],fileName: 'probe'},
} };
execFileSync(process.execPath,['--input-type=module','-e',
  `import { build } from 'vite'; await build(${JSON.stringify(bundlerConfig)});`],{cwd:root,stdio:'inherit'});
const consumerFiles = (await readdir(path.join(output,'consumer'))).sort();
const consumerDigests = Object.fromEntries(await Promise.all(consumerFiles.map(async name=>[name,hash(await readFile(path.join(output,'consumer',name)))])));
const identity = { consumerDigests, codeCommit: git('rev-parse','HEAD'), productionSourceSha256: sourceIdentity,
  lockSha256: hash(await readFile(path.join(workspaceRoot, 'package-lock.json'))), buildDigests, fixtureFiles,
  modelSha256: hash(modelBytes), runnerSha256: hash(await readFile(new URL(import.meta.url))),
  probeSha256: hash(probeBytes), samplerSha256: hash(await readFile(path.join(root, 'performance/probes/image/sample.py'))) };
const environment = { node: process.version, platform: process.platform, architecture: process.arch,
  osRelease: os.release(), cpuModel: os.cpus()[0].model, logicalCpus: os.cpus().length,
  systemMemoryBytes: os.totalmem(), browserTarget: launch.target, executablePath: launch.executablePath,
  headless: !launch.headed, browserArgs: launch.launchOptions.args };
await writeFile(path.join(output,'contract.json'), JSON.stringify({protocol,identity,environment},null,2));
let active = null;
const server = createServer(async (req,res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'POST' && pathname === '/output') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      active.bytes = Buffer.concat(chunks); active.receivedEpochMs = Date.now();
      res.writeHead(200); res.end(); return;
    }
    if (req.method === 'POST' && pathname === '/profile-end') {
      active.profileEndEpochMs = Date.now(); res.writeHead(200); res.end(); return;
    }
    if (pathname === '/page') {
      res.setHeader('Content-Type','text/html');
      res.end('<!doctype html><link rel="icon" href="data:,"><script type="module" src="/consumer/probe.js"></script>'); return;
    }
    if (pathname === '/probe.mjs') { res.setHeader('Content-Type','text/javascript'); res.end(probeBytes); return; }
    if (cached.has(pathname)) {
      const entry = cached.get(pathname); res.setHeader('Content-Type',entry.contentType); res.end(entry.body); return;
    }
    let file;
    if (/^\/consumer\/[A-Za-z0-9_.-]+$/.test(pathname)) file = path.join(output,'consumer',path.basename(pathname));
    if (/^\/__renderer\/icons\/(ess|inverter-frame)\.svg$/.test(pathname)) file = path.join(frozen,'icons',path.basename(pathname));
    if (!file) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type',file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'text/javascript'); res.end(await readFile(file));
  } catch(error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let effectiveModel = JSON.stringify(model);
for (const [local,record] of cached) effectiveModel = effectiveModel.replaceAll(record.url,base+local);
effectiveModel = JSON.parse(effectiveModel);
const assets = JSON.parse(assetsTemplate.replaceAll('http://fixture.invalid',base));
const raw = [];
const peak = (samples, fn) => Math.max(0,...samples.map(fn));
const summaryFor = rows => {
  const keys = ['createMs','updatesMs','renderMs','transferMs','blobReadyMs','requestMs','destroyMs'];
  return { latency: Object.fromEntries(keys.map(key => [key,stats(rows.map(row => row.result.timings[key]))])),
    coldNodeReadyMs: stats(rows.map(row => row.coldNodeReadyMs)),
    browserLaunchMs: stats(rows.map(row => row.stages.browserLaunchMs)),
    moduleLoadMs: stats(rows.map(row => row.stages.moduleLoadMs)),
    memory: Object.fromEntries(['peakTotalMiB','peakGpuMiB','peakRendererMiB','peakNodeMiB','peakRssMiB','retainedHeapBytes']
      .map(key => [key,stats(rows.map(row => row.memory[key]))])),
    cpuSeconds: stats(rows.map(row => row.cpuSeconds)), imageBytes: stats(rows.map(row => row.bytes)),
    maxSamplingGapMs: Math.max(...rows.map(row => row.memory.maxSamplingGapMs)),
  };
};
try {
  // Alternate case order each round to reduce thermal/order bias. No concurrent workload.
  const cases = protocol.sizes.flatMap(size => protocol.formats.map(format => ({size,format})));
  for (let round=0; round<protocol.warmups+protocol.measured; round++) {
    for (const spec of round%2 ? [...cases].reverse() : cases) {
      const phase = round<protocol.warmups ? 'warmup' : 'measured';
      const label = `${phase}-${round}-${spec.size}-${spec.format}`;
      const directory = path.join(output,label); await mkdir(directory,{recursive:true});
      active = {};
      const samples = []; let sampleBuffer = '';
      const sampler = spawn('python3',[path.join(root,'performance/probes/image/sample.py'),String(process.pid)]);
      const samplerExit = once(sampler,'exit');
      sampler.stdout.on('data', chunk => {
        sampleBuffer += chunk;
        const lines = sampleBuffer.split('\n'); sampleBuffer = lines.pop();
        for (const line of lines) if (line) samples.push(JSON.parse(line));
      });
      let browser;
      const row = { label,phase,...spec, errors: [],stages:{},loadBefore:os.loadavg() };
      const stage = async (name,fn) => { const t = performance.now(); try { return await fn(); } finally { row.stages[name] = performance.now()-t; } };
      try {
        while(samples.length===0) await new Promise(resolve=>setTimeout(resolve,10));
        row.startEpochMs = Date.now(); const start = performance.now();
        browser = await stage('browserLaunchMs',() => chromium.launch(launch.launchOptions));
        environment.browserVersion = browser.version();
        const bcdp = await browser.newBrowserCDPSession();
        if (!environment.gpu) environment.gpu = (await bcdp.send('SystemInfo.getInfo')).gpu;
        const initialProcesses = await bcdp.send('SystemInfo.getProcessInfo');
        const page = await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
        page.setDefaultTimeout(60000);
        page.on('pageerror',error=>row.errors.push(String(error)));
        page.on('console',message=> { if(message.type()==='error') row.errors.push(message.text()); });
        page.on('requestfailed',request=>row.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
        page.on('request',request=> { if (/^https?:/.test(request.url()) && new URL(request.url()).origin!==base) row.errors.push(`external: ${request.url()}`); });
        page.on('response',response=> { if(response.status()>=400) row.errors.push(`${response.status()}: ${response.url()}`); });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Performance.enable'); await cdp.send('HeapProfiler.enable');
        await stage('moduleLoadMs', async()=> {
          await page.goto(base+'/page',{waitUntil:'load'});
          await page.waitForFunction(()=>typeof window.runImageBenchmark==='function');
        });
        await cdp.send('HeapProfiler.collectGarbage');
        const heapBefore = (await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='JSHeapUsedSize').value;
        row.result = await page.evaluate(input=>window.runImageBenchmark(input),{model:effectiveModel,assets,...spec});
        row.coldNodeReadyMs = active.receivedEpochMs-row.startEpochMs;
        row.evaluateAndVerifyMs = performance.now()-start;
        row.bytes = active.bytes?.length;
        row.imageSha256 = hash(active.bytes);
        row.profileEndEpochMs = active.profileEndEpochMs;
        await cdp.send('HeapProfiler.collectGarbage');
        const heapAfter = (await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='JSHeapUsedSize').value;
        row.cleanup = await page.evaluate(()=>({ canvasCount:document.querySelectorAll('canvas').length,
          fontFaces:[...document.fonts].filter(face=>/FiraCode/.test(face.family)).length }));
        const finalProcesses = await bcdp.send('SystemInfo.getProcessInfo');
        const roles = new Map([...initialProcesses.processInfo,...finalProcesses.processInfo].map(p=>[p.id,p.type]));
        // Leave the sampler an opportunity to receive its latest line without widening the measurement window.
        await new Promise(resolve=>setTimeout(resolve,100));
        const primary = samples.filter(s=>s.epochMs>=row.startEpochMs && s.epochMs<=row.profileEndEpochMs);
        const rolePeak = role => peak(primary,s=>s.processes.filter(p=>roles.get(p.pid)===role).reduce((sum,p)=>sum+p.footprintMiB,0));
        row.memory = { sampleCount:primary.length, maxSamplingGapMs:peak(primary.slice(1),(s)=>s.epochMs-primary[primary.indexOf(s)-1].epochMs),
          peakTotalMiB:peak(primary,s=>s.footprintMiBSum), peakGpuMiB:rolePeak('GPU'),peakRendererMiB:rolePeak('renderer'),
          peakNodeMiB:peak(primary,s=>s.processes.find(p=>p.pid===process.pid)?.footprintMiB??0),
          peakRssMiB:peak(primary,s=>s.rssMiB), heapBefore,heapAfter,retainedHeapBytes:heapAfter-heapBefore };
        row.cpuSeconds = primary.at(-1).cpuSecondsObservedCumulative-samples[0].cpuSecondsObservedCumulative;
        row.cpuByRoleSeconds = Object.fromEntries(['GPU','renderer','browser'].map(role=>[role,
          finalProcesses.processInfo.filter(p=>p.type===role).reduce((sum,p)=>sum+p.cpuTime,0)]));
        row.loadAfter=os.loadavg();
        const r = row.result;
        if (!r.accepted || !r.immutable || r.bytes!==row.bytes || row.bytes<100 || r.distinctColors<100 ||
          r.appendedCanvases!==0 || row.cleanup.canvasCount!==0 || row.cleanup.fontFaces!==0 ||
          r.mime!==`image/${spec.format==='jpeg'?'jpeg':'png'}` || r.surface.context!=='webgl2' || r.surface.samples!==4 ||
          /swiftshader|software/i.test(r.surface.renderer??'') ||
          JSON.stringify(r.surface.backingSize)!==JSON.stringify([spec.size,spec.size]) ||
          JSON.stringify(r.decodedSize)!==JSON.stringify([spec.size,spec.size]) || row.errors.length || primary.length<10) {
          throw new Error('workload, output, hardware, sampling, or cleanup invariant failed');
        }
        if (round===0) await writeFile(path.join(directory,`output.${spec.format==='jpeg'?'jpg':'png'}`),active.bytes);
        row.status='pass';
      } catch(error) { row.status='fail'; row.failure=String(error.stack??error); }
      finally {
        await browser?.close(); sampler.kill('SIGTERM'); await samplerExit;
        await writeFile(path.join(directory,'samples.jsonl'),samples.map(s=>JSON.stringify(s)).join('\n')+'\n');
        await writeFile(path.join(directory,'result.json'),JSON.stringify(row,null,2));
        active=null;
      }
      raw.push(row);
      console.log(JSON.stringify({label,status:row.status,requestMs:row.result?.timings.requestMs,
        coldNodeReadyMs:row.coldNodeReadyMs,memory:row.memory?.peakTotalMiB,cpuSeconds:row.cpuSeconds,failure:row.failure}));
      if (row.status!=='pass') throw new Error(`${label} failed; raw evidence retained`);
    }
  }
  const casesSummary = protocol.sizes.flatMap(size=>protocol.formats.map(format=>{
    const all = raw.filter(row=>row.size===size&&row.format===format);
    const measured = all.filter(row=>row.phase==='measured');
    const hashes = new Set(all.map(row=>row.result.pixelSha256));
    return {size,format,status:hashes.size===1?'pass':'fail',pixelHashes:[...hashes],summary:summaryFor(measured)};
  }));
  const failures = casesSummary.filter(c=>c.status!=='pass').map(c=>`unstable pixels: ${c.size}/${c.format}`);
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),identity,protocol,environment,raw,cases:casesSummary,
    status:failures.length?'fail':'pass',failures,performanceDecision:'baseline-only, no before/after claim',
    memoryDefinition:'simultaneous sum of sampled macOS physical footprint of benchmark Node + its Chromium descendants, including GPU; role peaks are independent and not additive; RSS separately',
    limitations:['50ms sampling can miss brief peaks; physical footprint is process accounting, not individual GPU allocation size',
      'headless hardware Chromium on this Mac; not widget-renderer HTTP production latency',
      'n=7 p95 is maximum and not a stable tail estimate; no latency/resource budget declared',
      'post-GC heap is renderer JS retained size; warm global/font/GPU caches may remain in process until browser exit']};
  await writeFile(path.join(output,'baseline.json'),JSON.stringify(report,null,2));
  const lines=['# Image API baseline','',`Code: ${identity.codeCommit}`,`Environment: ${environment.cpuModel}, ${environment.browserVersion}, hardware headless WebGL2 AA4`,
    `Protocol: ${protocol.warmups} warmups + ${protocol.measured} measured / case; fresh browser, local assets, concurrency 1`,'',
    '| Output | API→Node median / range (s) | Cold Node-ready median (s) | Peak footprint median / max (GiB) | GPU process peak median (GiB) | CPU median (s) |',
    '|---|---:|---:|---:|---:|---:|'];
  for(const c of casesSummary){const s=c.summary;const t=s.latency.requestMs; lines.push(`| ${c.size} ${c.format} | ${(t.median/1000).toFixed(3)} / ${(t.min/1000).toFixed(3)}–${(t.max/1000).toFixed(3)} | ${(s.coldNodeReadyMs.median/1000).toFixed(3)} | ${(s.memory.peakTotalMiB.median/1024).toFixed(3)} / ${(s.memory.peakTotalMiB.max/1024).toFixed(3)} | ${(s.memory.peakGpuMiB.median/1024).toFixed(3)} | ${s.cpuSeconds.median.toFixed(3)} |`);}
  lines.push('','## Stage medians (ms)','','| Output | create | updates | render incl encoding | Blob transfer | destroy |','|---|---:|---:|---:|---:|---:|');
  for(const c of casesSummary)lines.push(`| ${c.size} ${c.format} | ${['createMs','updatesMs','renderMs','transferMs','destroyMs'].map(k=>c.summary.latency[k].median.toFixed(1)).join(' | ')} |`);
  lines.push('',`Harness/output/lifecycle status: ${report.status}. Baseline collection only; no speed or memory budget judgement.`,report.memoryDefinition,...report.limitations.map(v=>'- '+v));
  await writeFile(path.join(output,'report.md'),lines.join('\n')+'\n');
  if(failures.length)throw new Error(failures.join('; '));
} finally { await new Promise(resolve=>server.close(resolve)); }

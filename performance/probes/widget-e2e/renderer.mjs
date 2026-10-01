import puppeteer from 'puppeteer';

export async function renderImage(model, output, assetBaseUrl, options) {
  const timing=globalThis.__WIDGET_E2E_TIMING__;
  const phase=async(name,fn)=>{const start=performance.now();try{return await fn();}finally{timing[name]=performance.now()-start;}};
  const {width,height}=options.resolveOutputDimensions(model,output,options);
  // Reuse widget-renderer's fit-target and document-model construction unchanged.
  const legacyDocument=options.buildDocument(model,assetBaseUrl,{...options,antialias:output.antialias??true});
  const embedded=legacyDocument.match(/const model = (.+);\nconst assets = (.+);/);
  if(!embedded)throw new Error('widget document-model seam changed');
  const browserModel=JSON.parse(embedded[1]);const assets=JSON.parse(embedded[2]);
  const browser=await phase('browserLaunchMs',()=>puppeteer.launch({headless:true,
    ...(process.env.WIDGET_E2E_CHROME?{executablePath:process.env.WIDGET_E2E_CHROME}:{}),
    args:['--no-sandbox','--disable-setuid-sandbox','--enable-gpu','--enable-precise-memory-info']}));
  try {
    const page=await phase('pageCreateMs',()=>browser.newPage());
    await phase('viewportMs',()=>page.setViewport({width,height,deviceScaleFactor:1}));
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('requestfailed',request=>errors.push(request.url()+': '+request.failure()?.errorText));
    page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==assetBaseUrl)errors.push('external: '+request.url());});
    await phase('moduleLoadMs',async()=>{await page.goto(assetBaseUrl+'/__e2e/page',{waitUntil:'load'});await page.waitForFunction(()=>typeof window.renderWidgetImage==='function',{timeout:30000});});
    timing.browser=await phase('browserJourneyMs',()=>page.evaluate(input=>window.renderWidgetImage(input),{model:browserModel,assets,width,height}));
    const cleanup=await page.evaluate(()=>({canvases:document.querySelectorAll('canvas').length,fonts:[...document.fonts].filter(face=>/FiraCode/.test(face.family)).length}));
    timing.cleanup=cleanup;
    const meta=timing.browser;
    if(errors.length||cleanup.canvases||cleanup.fonts||meta.surface.samples!==4||/swiftshader|software/i.test(meta.surface.renderer??'')||meta.mime!=='image/jpeg'||JSON.stringify(meta.surface.size)!==JSON.stringify([width,height]))throw new Error(JSON.stringify({errors,cleanup,meta}));
    const cdp=await browser.target().createCDPSession();
    timing.processInfo=await cdp.send('SystemInfo.getProcessInfo');
    timing.gpu=(await cdp.send('SystemInfo.getInfo')).gpu;
    timing.browserVersion=await browser.version();
    if(!globalThis.__WIDGET_E2E_BYTES__?.length)throw new Error('image bytes missing');
    return globalThis.__WIDGET_E2E_BYTES__;
  } finally {await phase('browserCloseMs',()=>browser.close());}
}

import { PatchMap } from '@conalog/patch-map/image';

window.renderWidgetImage = async ({ model, assets, width, height }) => {
  const timings = {};
  const phase = async (name, fn) => { const start=performance.now(); try { return await fn(); } finally { timings[name]=performance.now()-start; } };
  // Do not preload final values in create: this workload explicitly applies them via updateBatch.
  const initial = structuredClone(model.blueprint);
  let resetBars=0, resetTexts=0;
  const reset = items => {
    for (const item of items ?? []) {
      if (item.components) for (const c of item.components) {
        if (c.type==='bar') { c.size={...(typeof c.size==='object'?c.size:{width:c.size}),height:0}; c.tint='#777777'; c.show=true; resetBars++; }
        if (c.type==='text' && c.id!=='label') { c.text=''; c.show=false; resetTexts++; }
      }
      if (item.children) reset(item.children);
    }
  };
  reset(initial);
  let canvas, gl;
  const tileAllocations=[];
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(...args){const context=original.apply(this,args);if(args[0]==='webgl2'&&context&&args[1]?.depth===false){canvas=this;gl=context;
    const allocate=gl.renderbufferStorageMultisample;
    gl.renderbufferStorageMultisample=function(target,samples,format,w,h){allocate.call(this,target,samples,format,w,h);tileAllocations.push({requestedSamples:samples,samples:this.getRenderbufferParameter(target,this.RENDERBUFFER_SAMPLES),width:w,height:h});};
  }return context;};
  let session;
  try {
    try {
      session = await phase('createMs',()=>PatchMap.create({data:initial,width,height,fit:model.fit,
        ...(model.viewport?{viewport:{initial:model.viewport}}:{}),
        ...(model.theme?{theme:model.theme}:{}), antialias:model.antialias,background:'#ffffff',zoomLimits:[0.1,30],assets}));
    } finally { HTMLCanvasElement.prototype.getContext=original; }
    const debug=gl.getExtension('WEBGL_debug_renderer_info');
    const surface={size:[width,height],gpuCanvasSize:[canvas.width,canvas.height],tileAllocations,samples:gl.getParameter(gl.SAMPLES),attributes:gl.getContextAttributes(),
      renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null};
    const rows=model.runtimeUpdates;
    if(!rows.length||rows.some(row=>!Number.isFinite(row.barHeight)||row.barHeight<=0||row.text?.length!==12||row.showText!==true||row.tint!=='#e53935'))throw new Error('100% bar/color/12-character text workload missing');
    const batches=[];
    const textComponent=row=>row.display==='inverter'?'inverter-value-text':row.display==='ess'?'ess-value-text':null;
    await phase('updateBatchMs',()=>{
      for(let offset=0;offset<rows.length;){
        const first=rows[offset];const batch=[];
        while(offset<rows.length&&batch.length<100&&Boolean(rows[offset].gridCell)===Boolean(first.gridCell)&&textComponent(rows[offset])===textComponent(first))batch.push(rows[offset++]);
        const result=session.updateBatch({targets:batch.map(row=>row.id),
          bar:{height:batch.map(row=>row.barHeight),changes:{show:batch.map(()=>true),tint:batch.map(row=>row.tint)}},
          text:{...(textComponent(first)?{componentId:textComponent(first)}:{}),text:batch.map(row=>row.text),changes:{show:batch.map(()=>true)}},
        });
        if(result.status!=='committed'||result.changed!==true)throw new Error(`updateBatch did not apply a real change: ${JSON.stringify(result)}`);
        batches.push({count:batch.length,status:result.status,changed:result.changed,appliedCount:result.appliedCount});
      }
    });
    const image=await phase('renderMs',()=>session.render({format:'jpeg',quality:0.9}));
    if(tileAllocations.length) {
      if(tileAllocations.some(a=>a.samples!==4||a.width>2048||a.height>2048))throw new Error('invalid tile allocation');
      surface.samples=tileAllocations[0].samples;
    }
    if(JSON.stringify(image.size)!==JSON.stringify([width,height]))throw new Error('invalid image size');
    const upload=await phase('browserToNodeMs',async()=>{const response=await fetch('/__e2e/image',{method:'POST',body:image.blob});if(!response.ok)throw new Error('Blob upload failed');await response.arrayBuffer();});
    void upload;
    return {timings,surface,batches,updateCount:rows.length,resetBars,resetTexts,bytes:image.blob.size,mime:image.mime,
      canvasCount:document.querySelectorAll('canvas').length};
  } finally {
    if(session)await phase('destroyMs',()=>session.destroy());
  }
};

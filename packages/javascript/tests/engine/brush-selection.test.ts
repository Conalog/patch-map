import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../conformance/scenes/brush-selection.json';
import { PatchMapPointerInteractionCoordinator, type PatchMapPointerInteractionPort } from '../../src/engine/pointer-interaction-coordinator';
import { hitPatchMapPaintRegion } from '../../src/pointer-gesture';
import type { PatchMapEnginePointerInput } from '../../src/engine/contracts/rendering';
import type { PatchMapSelectionPolicy } from '../../src/public/contracts';

function setup(policy: PatchMapSelectionPolicy = { brush: { longPress: { behavior: 'toggle' } } }) {
  vi.useFakeTimers();
  let ids: string[] = ['off'], view = 0, scene = 0, live = true, commits = 0;
  const entities = fixture.dataset.map((v) => ({ id:v.id, visible:true, interactive:true, screenBounds:[v.attrs.x,v.attrs.y,v.size.width,v.size.height] as const }));
  const targets = new Map(fixture.dataset.map((v) => [v.id, { id:v.id, key:v.id, selectionId:v.id, kind:'element', locked:false, ancestorLocked:false }]));
  const surface = {
    hitTestScreen: ({x,y}: {x:number;y:number}) => entities.find(e => x>=e.screenBounds[0] && x<=e.screenBounds[0]+20 && y>=e.screenBounds[1] && y<=e.screenBounds[1]+20)?.id ?? null,
    queryRegionGeometry: () => ({ entities, relations:[] }),
    screenToWorld: (p: unknown) => p,
    cancelViewportGestures: vi.fn(),
  };
  const coordinator = new PatchMapPointerInteractionCoordinator({
    requireSurface: () => { if (!live) throw new Error('destroyed'); return surface; },
    liveSurface: () => live ? surface : null,
    hasMaterialized: () => false,
    logicalSelectionIndex: () => ({ target:(id:string)=>targets.get(id) ?? null, resolveSelectionUnit:(id:string)=>targets.get(id) ?? null }),
    selectionIds: () => ids,
    transformerOwnsPointer: () => false,
    selectPaint: (segments: Parameters<typeof hitPatchMapPaintRegion>[2]) => ({ targets:hitPatchMapPaintRegion(entities,[],segments).candidateIds.map(id=>targets.get(id)) }),
    applySelection: (input: {op:string;ids:string[]}) => {
      const next = input.op==='remove' ? ids.filter(id=>!input.ids.includes(id)) : [...new Set([...ids,...input.ids])];
      if (JSON.stringify(next)!==JSON.stringify(ids)) commits++;
      ids=next;
    },
    sceneRevision:()=>scene, viewRevision:()=>view, interactionRevision:()=>0, advanceInteraction:()=>{}, interactionMode:()=> 'select',
    dispatchHostPointerEvent:()=>{}, clearHostTooltip:()=>{}, emitPointerEvent:()=>{}, emitPointerHover:()=>{}, emitPointerTooltip:()=>{},
    emitHostCallbackFailure:()=>{}, notReadyError:()=>new Error('not ready'),
  } as unknown as PatchMapPointerInteractionPort);
  coordinator.configureSelectionPolicy(policy);
  coordinator.adoptCandidateAuthority(coordinator.createCandidateAuthority(surface as never));
  const pointer = (type:PatchMapEnginePointerInput['type'],x=20,y=20,id=1) => coordinator.dispatch({type,pointerId:id,pointerType:'touch',button:0,buttons:type==='up'?0:1,screen:[x,y],timeMs:Date.now(),modifiers:{shift:false,ctrl:false,alt:false,meta:false}});
  return {targets,c:coordinator,pointer, ids:()=>ids,commits:()=>commits, surface,changeView:()=>view++,changeScene:()=>scene++,destroy:()=>{coordinator.destroy();live=false;}};
}
afterEach(()=>vi.useRealTimers());
describe('shared brush selection',()=>{
  it('toggle API disable and another longpress share one state',()=>{
    const {c,pointer,ids}=setup(); pointer('down'); vi.advanceTimersByTime(500); pointer('up');
    expect(c.brush.state).toEqual({enabled:true,drawing:false});
    c.brush.disable(); expect(c.brush.state.enabled).toBe(false);
    pointer('down');vi.advanceTimersByTime(500);pointer('up');expect(c.brush.state.enabled).toBe(true);
    const before=ids();pointer('down');vi.advanceTimersByTime(500);pointer('up');
    expect(c.brush.state.enabled).toBe(false);expect(ids()).toEqual(before);c.destroy();
  });
  it('segments add erase and revisit once using the common fixture',()=>{
    const {c,pointer,ids,commits,surface}=setup(); c.brush.enable();
    pointer('down');pointer('move',100);pointer('move',20);pointer('up');
    expect(ids()).toEqual(fixture.added);expect(commits()).toBe(2);expect(surface.cancelViewportGestures).toHaveBeenCalled();
    pointer('down');pointer('move',100);pointer('up');expect(ids()).toEqual(fixture.removed);c.destroy();
  });
  it('hold restores prior mode and cancel leaves published selection',()=>{
    const {c,pointer,ids}=setup({brush:{longPress:{behavior:'hold'}}});pointer('down');vi.advanceTimersByTime(500);pointer('move',100);pointer('cancel');
    expect(ids()).toEqual(fixture.added);expect(c.brush.state).toEqual({enabled:false,drawing:false});c.destroy();
  });
  it('early movement second pointer replacement API and destroy cancel timers',()=>{
    for(const cancel of ['move','second','replace','api','view','destroy']) {
      const {c,pointer,ids,changeView,destroy}=setup();pointer('down');
      if(cancel==='move')pointer('move',26);if(cancel==='second')pointer('down',60,20,2);
      if(cancel==='replace')c.interruptIfPresent('replace');if(cancel==='api')c.brush.disable();if(cancel==='view')changeView();if(cancel==='destroy')destroy();
      vi.advanceTimersByTime(600);expect(c.brush.state.enabled).toBe(false);expect(ids()).toEqual(['off']);expect(vi.getTimerCount()).toBe(0);c.destroy();
    }
  });
  it('API cancellation consumes a pending press without a later click',()=>{
    const {c,pointer,ids}=setup();pointer('down');c.brush.disable();
    expect(pointer('up').semanticCompletionCount).toBe(0);expect(ids()).toEqual(['off']);c.destroy();
  });
  it('scene edits cancel pending and active brush strokes',()=>{
    for(const active of [false,true]) {
      const current=setup();current.pointer('down');if(active)vi.advanceTimersByTime(500);
      const before=[...current.ids()];current.changeScene();vi.advanceTimersByTime(600);current.pointer('move',100);
      expect(current.ids()).toEqual(before);expect(current.c.brush.state.drawing).toBe(false);current.c.destroy();
    }
  });
  it('locked seeds and predicate lifecycle changes cannot arm or paint',()=>{
    const locked=setup();locked.targets.get('a')!.locked=true;locked.c.brush.enable();locked.pointer('down');locked.pointer('move',100);locked.pointer('up');expect(locked.ids()).not.toContain('a');locked.c.destroy();
    let cancel=()=>{};
    const current=setup({brush:{longPress:{behavior:'toggle'}},isSelectable:()=>{cancel();return true;}});
    cancel=()=>current.c.brush.disable();current.pointer('down');vi.advanceTimersByTime(600);
    expect(current.ids()).toEqual(['off']);expect(vi.getTimerCount()).toBe(0);current.c.destroy();
  });
  it('API cancellation listener cannot resurrect a destroyed brush',()=>{
    const current=setup();current.c.brush.enable();current.pointer('down');current.pointer('move',100);
    current.c.brush.onChange(e=>{if(!e.state.drawing)current.destroy();});
    expect(()=>current.c.brush.enable()).toThrow('destroyed');expect(current.c.brush.state.enabled).toBe(false);
  });
  it('activation callbacks may disable or destroy without a stale paint',()=>{
    for(const action of ['disable','destroy']) {
      const {c,pointer,ids}=setup();c.brush.onChange(()=>{if(action==='disable')c.brush.disable();else c.destroy();});
      pointer('down');vi.advanceTimersByTime(500);expect(ids()).toEqual(['off']);expect(vi.getTimerCount()).toBe(0);c.destroy();
    }
  });
});

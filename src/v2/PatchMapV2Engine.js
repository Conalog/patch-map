import { createV2Layout } from './layout/createV2Layout';
import { createV2Model } from './model/createV2Model';
import { updateV2Model } from './model/updateV2Model';
import { createV2RenderIR } from './render-ir/createV2RenderIR';
import { diffV2RenderIR } from './render-ir/diffV2RenderIR';
import { createV2RenderPlan } from './render-policy/createV2RenderPlan';
import { V2RenderScheduler } from './scheduler/V2RenderScheduler';

export class PatchMapV2Engine {
  constructor({ theme = {}, store = null } = {}) {
    this.theme = theme;
    this.store = store;
    this.model = null;
    this.layout = null;
    this.renderIR = null;
    this.renderDiff = null;
    this.renderPlan = null;
    this.scheduler = new V2RenderScheduler();
    this.revision = 0;
  }

  draw(data) {
    this.model = createV2Model(data);
    this.#refreshDerivedState();
    return this.snapshot();
  }

  update(opts = {}) {
    if (!this.model) return [];
    const updated = updateV2Model(this.model, opts);
    if (updated.length > 0) {
      this.#refreshDerivedState();
    }
    return updated.map((record) => record.ref);
  }

  selector(path) {
    if (!this.model) return [];
    return this.model.selector(path).map((record) => record.ref);
  }

  snapshot() {
    return {
      model: this.model,
      layout: this.layout,
      renderIR: this.renderIR,
      renderDiff: this.renderDiff,
      renderPlan: this.renderPlan,
      revision: this.revision,
    };
  }

  #refreshDerivedState() {
    const previousIR = this.renderIR;
    this.layout = createV2Layout(this.model);
    this.model.syncCompatibilityRefs(this.layout, this.store);
    this.renderIR = createV2RenderIR(this.model, this.layout, {
      theme: this.theme,
    });
    this.renderDiff = diffV2RenderIR(previousIR, this.renderIR);
    this.renderPlan = createV2RenderPlan(this.model, this.renderIR);
    this.scheduler.enqueue({
      revision: this.revision + 1,
      model: this.model,
      layout: this.layout,
      renderIR: this.renderIR,
      renderDiff: this.renderDiff,
      renderPlan: this.renderPlan,
    });
    this.revision += 1;
  }
}

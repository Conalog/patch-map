import { createV2Layout } from './layout/createV2Layout';
import { createV2Model } from './model/createV2Model';
import { updateV2Model } from './model/updateV2Model';
import { createV2RenderIR } from './render-ir/createV2RenderIR';
import { createV2RenderPlan } from './render-policy/createV2RenderPlan';

export class PatchMapV2Engine {
  constructor({ theme = {} } = {}) {
    this.theme = theme;
    this.model = null;
    this.layout = null;
    this.renderIR = null;
    this.renderPlan = null;
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
      renderPlan: this.renderPlan,
      revision: this.revision,
    };
  }

  #refreshDerivedState() {
    this.layout = createV2Layout(this.model);
    this.renderIR = createV2RenderIR(this.model, this.layout, {
      theme: this.theme,
    });
    this.renderPlan = createV2RenderPlan(this.model, this.renderIR);
    this.revision += 1;
  }
}

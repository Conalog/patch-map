import { createV2Layout, layoutV2Node } from './layout/createV2Layout';
import { createV2Model } from './model/createV2Model';
import { updateV2Model } from './model/updateV2Model';
import {
  createV2RenderIR,
  createV2RenderNode,
  groupV2NodesByFeature,
} from './render-ir/createV2RenderIR';
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
    this.dirty = false;
    this.dirtyOwnerIds = new Set();
  }

  draw(data) {
    this.model = createV2Model(data);
    this.dirty = false;
    this.dirtyOwnerIds.clear();
    this.#refreshDerivedState();
    return this.snapshot();
  }

  update(opts = {}) {
    if (!this.model) return [];
    const updated = updateV2Model(this.model, opts);
    if (updated.length > 0) {
      if (opts.deferRender) {
        this.dirty = true;
        for (const record of updated) {
          this.dirtyOwnerIds.add(record.id);
        }
      } else {
        this.dirty = false;
        this.dirtyOwnerIds.clear();
        this.#refreshDerivedState();
      }
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

  flush() {
    if (this.dirty) {
      this.dirty = false;
      if (!this.#refreshDirtyOwners()) {
        this.#refreshDerivedState();
      }
      this.dirtyOwnerIds.clear();
    }
    return this.scheduler.flush() ?? this.snapshot();
  }

  #refreshDirtyOwners() {
    if (!this.layout || !this.renderIR || this.dirtyOwnerIds.size === 0) {
      return false;
    }
    if (
      this.dirtyOwnerIds.size > 1000 ||
      this.dirtyOwnerIds.size > this.model.records.size / 2
    ) {
      return false;
    }

    const previousNodes = this.renderIR.nodes.filter((node) =>
      this.dirtyOwnerIds.has(node.ownerId),
    );
    const nextNodes = [];

    for (const ownerId of this.dirtyOwnerIds) {
      const owner = this.model.get(ownerId);
      if (!owner) continue;
      layoutV2Node(this.model, this.layout.frames, owner);
      const ownerNode = createV2RenderNode(
        owner,
        this.layout.getFrame(owner.id),
      );
      if (ownerNode) nextNodes.push(ownerNode);
      for (const component of this.model.getComponents(owner.id)) {
        const node = createV2RenderNode(
          component,
          this.layout.getFrame(component.id),
        );
        if (node) nextNodes.push(node);
      }
    }

    const dirtyOwnerIds = new Set(this.dirtyOwnerIds);
    this.renderIR = {
      nodes: [
        ...this.renderIR.nodes.filter(
          (node) => !dirtyOwnerIds.has(node.ownerId),
        ),
        ...nextNodes,
      ],
      byFeature: groupV2NodesByFeature([
        ...this.renderIR.nodes.filter(
          (node) => !dirtyOwnerIds.has(node.ownerId),
        ),
        ...nextNodes,
      ]),
    };
    this.renderDiff = diffV2RenderIR(
      { nodes: previousNodes },
      { nodes: nextNodes },
    );
    this.renderPlan = createV2RenderPlan(this.model, { nodes: nextNodes });
    this.scheduler.enqueue({
      revision: this.revision + 1,
      model: this.model,
      layout: this.layout,
      renderIR: this.renderIR,
      renderDiff: this.renderDiff,
      renderPlan: this.renderPlan,
      incremental: true,
    });
    this.revision += 1;
    this.model.syncCompatibilityRefs(this.layout, this.store);
    return true;
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

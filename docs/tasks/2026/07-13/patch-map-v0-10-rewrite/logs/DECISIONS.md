# Decisions

**2026-07-13**

- **Background:** PATCH MAP v0.10 will be rewritten over a long-lived clean-room effort that must remain safe across handoffs, compaction, and delegated work.
- **Decision:** `docs/reference/cleanroom-implementation-policy.md` is the canonical source for clean-room rules and may not be relaxed without explicit user approval.
- **Why:** A durable, single policy prevents accidental access to prohibited materials or drift in compatibility, performance, and evidence standards.
- **Impact:** Every resumed session and delegated task must read and follow the policy before acting; conflicting local assumptions are invalid.

**2026-07-13**

- **Background:** 클린룸 재작성의 안전 경계와 완료 결과는 유지하면서 장기 작업의 실행 방법을 명확히 해야 한다.
- **Decision:** 승인 source/evidence와 completion gates는 고정하되 내부 설계와 execution order는 주 에이전트가 적응적으로 결정한다.
- **Why:** 고정 절차는 새로운 증거, 성능 관찰, 독립 작업에 맞춘 안전한 재설계와 검증 가능한 병렬화를 방해할 수 있다.
- **Impact:** 향후 작업은 금지 자료 접근이나 계약 완화 없이 architecture, experiments, sequencing, delegation을 조정할 수 있다.

**2026-07-13**
- Large-scene compatibility requires live Pixi Container identities, parent/child traversal and bounds while the performance contract penalizes object-per-primitive rendering.
- Keep the observable managed handle tree under world, but separate it from a sibling aggregate render layer; handles own data, identity, transforms and explicit bounds while the render layer owns draw primitives.
- This preserves public scene semantics and allows rendering allocations to scale below the public object count without reconstructing or guessing a hidden implementation.
- Draw and update code must synchronize both layers and tests must cover identity, hierarchy, bounds and pixels independently; the backend may be replaced without changing the public handle model.

**2026-07-13**

- **Background:** Sequential large-scene updates were rebuilding indices, assets, orientation, and aggregate primitives once per target even though public state was already updated synchronously.
- **Decision:** Coalesce managed-scene reindex and render refresh work until an explicit application render or the next animation frame, while flushing event bindings synchronously when canvas listeners exist.
- **Why:** One invalidation boundary preserves public return-time state, event readiness, and next-frame visibility while removing target-count-proportional duplicate scene work.
- **Impact:** Selectors flush pending indices on demand, focus and fit flush complete scene state, draw and destroy cancel pending work, and performance tests must exercise both explicit-render and frame-driven boundaries.

**2026-07-14**

- **Background:** 공식 PixiJS dependency 검색 중 source-map 텍스트가 우발적으로 출력됐으나 PATCH MAP 원본·reference 자료에는 접근하지 않았고 출력 내용도 구현에 사용하지 않았다.
- **Decision:** 클린룸 소유자는 현재 작업트리와 구현 결과를 유효한 클린룸 결과로 인정하며 incident로 인한 폐기나 재시작을 요구하지 않는다.
- **Why:** 노출은 PATCH MAP 원본 오염이 아니며 구현 판단에 영향을 주지 않았으므로 결과를 폐기하는 것보다 사실관계와 적용 경계를 명시하는 것이 정확하다.
- **Impact:** Incident blocker는 해소되지만 자료 경계는 확장되지 않는다. 모든 후속 검색·검증은 source map을 명시적으로 제외하고 Q1~Q23은 승인된 블랙박스 oracle fixture와 normalized output만으로 해소한다.

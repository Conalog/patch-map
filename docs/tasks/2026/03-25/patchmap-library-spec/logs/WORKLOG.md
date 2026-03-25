**2026-03-25**
- `github-spec-kit`에 따라 `specify init . --here --no-git --ai codex --ai-skills --force --offline`로 Spec Kit을 초기화하고, `.specify/scripts/bash/create-new-feature.sh`로 `specs/001-patchmap-spec/spec.md`를 생성했다.
- `docs/reference/patchmap/**`, 핵심 소스(`src/patchmap.js`, `src/display/**`, `src/events/**`, `src/command/**`, `src/transformer/**`), 관련 테스트를 읽어 스펙에 필요한 관찰 가능한 계약을 추출하고 있다.
- `specs/001-patchmap-spec/spec.md` 초안 작성 후, async draw/relations refresh/history bundling/selection precondition/resize semantics 누락 여부를 다시 점검하고 wording을 수정했다.
- `python3 /Users/minholim/.agents/skills/project-context/scripts/check_runtime_shape.py`로 task/runtime shape를 검증했고 `[OK]`를 확인했다.
- 서브에이전트 3개로 공개 표면, schema/update, interaction/history/transformer 관점 리뷰를 병렬 수행했고, 실제 누락으로 확인된 항목만 `spec.md`에 반영했다: `rotation`/`flip`의 pre-init 지속성, standalone `text` upright 규칙, `onClick`/`onDoubleClick`/tap 분기, `transformer.selection` API.
- 최종 재구현 가능성 기준으로 서브에이전트 3개를 다시 돌려 `selector` 기본값과 override 계약, `focus`/`fit`의 filter subtree pruning, 기본 `selection` state defaults, `event.add`의 auto-ID 및 teardown 규칙, async `init()` 완료 시점, `opts.assets` 허용 shape와 built-in asset namespace, injected init 옵션, patchmap/state/history/transformer 이벤트 payload 계약이 아직 열려 있음을 확인했다.
- 위 누락을 `specs/001-patchmap-spec/spec.md`에 반영해 init/options/assets 표면, selector/event/focus, selection defaults, lifecycle/history/transformer emitted payload를 language-agnostic 계약으로 보강했다.
- 최종 수정 후 `python3 /Users/minholim/.agents/skills/project-context/scripts/check_runtime_shape.py`를 다시 실행했고 `[OK]`를 확인했다.

**2026-03-25**
- spec 이후 생성했던 구현 전제 산출물(`specs/001-patchmap-spec/plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/*.md`, `tasks.md`)과 부수 생성물(`AGENTS.md`)을 out-of-scope로 판단해 제거했다.
- `docs/memory.md`와 `docs/tasks/2026/03-25/patchmap-library-spec/**`는 “spec만 유지하고 implementation planning artifacts는 제거” 상태로 다시 정리했다.

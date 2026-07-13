# PATCH MAP v0.10 Clean-room Implementation Policy

## 목적

- PATCH MAP v0.10의 공개 기능과 observable behavior가 호환되는 대체 라이브러리를 처음부터 새로 작성한다.
- 기존 공개 API 사용자가 가능한 한 변경 없이 교체할 수 있어야 한다.
- 저사양 Windows와 다수 객체 환경의 성능을 최우선으로 한다.
- 기존 구조를 복원하거나 추측하지 않고 공개 계약을 만족하는 가장 단순하고 빠른 구조를 설계한다.

## 클린룸 경계

- 현재 작업트리에 승인·반입된 clean-room oracle v3 export만 구현 자료로 사용한다.
- 다른 작업트리, 브랜치, Git ref, 기존 Git 이력, 원본 저장소 코드와 기존 구현 파일의 열람·검색을 금지한다.
- reference package, tarball, bundle, source map, 원본 test/fixture를 열거나 분석하지 않는다.
- `git show`, `git log -p`, 다른 브랜치 checkout, 원본 브랜치 diff를 금지한다.
- `cleanroom/oracle-v0.10`의 merge/cherry-pick을 금지한다.
- Git은 현재 구현 브랜치의 status/add/commit과 구현 이후 자체 변경 검토에만 사용한다.
- `artifacts/expected/**`와 reference screenshot은 수정하거나 기대값을 완화할 수 없다.
- PixiJS 등 공개 의존성은 공식 공개 API와 공식 문서만 근거로 사용한다.
- 불명확한 observable behavior는 추측하지 않고 oracle owner에게 전달할 질문으로 기록한다.

## 서브에이전트

- 독립적으로 분리 가능한 작업은 서브에이전트로 병렬화할 수 있고 권장한다.
- 모든 에이전트와 하위 에이전트에 동일한 클린룸 경계를 적용한다.
- 금지 자료 조사를 다른 에이전트에게 위임하는 것도 금지한다.
- 동일 파일 동시 수정을 피하도록 파일 소유와 책임 범위를 먼저 나눈다.
- 서브에이전트 보고만으로 통과를 인정하지 않고 주 에이전트가 직접 검토·통합·전체 테스트한다.
- 권장 분담은 public API coverage, lifecycle, draw/scene, update/selector, conformance/determinism, performance, safety/package review다.

## 시작 및 재개 절차

- `pwd`, `git status --short --branch`, 현재 orphan root commit, export manifest와 50개 payload checksum을 확인한다.
- `AGENTS.md`, 이 정책, `BRIEF.md`를 읽는다.
- `IMPLEMENTATION_HANDOFF.md`, `docs/reference/**`의 승인 계약 문서, `docs/implementation/**`, `fixtures/**`, `artifacts/expected/**`를 읽는다.
- 문서화된 전체 public API coverage 표를 만든다.
- 구현 구조와 성능 전략을 정리한 뒤 확인을 기다리지 않고 구현한다.
- 컨텍스트 압축 또는 재개 후에는 정책과 `BRIEF.md`를 다시 읽고 가장 가까운 Next Step부터 재개한다.

## 공개 계약 분석

- 모든 public export, 생성자, 공개 속성, 메서드, 옵션, 기본값, 반환값, 오류, 이벤트 이름/payload/순서를 목록화한다.
- 각 API를 oracle fixture 또는 문서 기반 독립 계약 테스트에 연결한다.
- 기존 14개 fixture가 없는 공개 API도 누락하지 않는다.
- 14개 fixture 통과만으로 전체 공개 API 완료를 선언하지 않는다.

## 구현 순서

1. 프로젝트 구조, public entry point, package exports
2. Patchmap lifecycle과 LIF-001~002
3. element/component 데이터 모델과 scene graph
4. DRW-001~006
5. selector와 ID/type/label index
6. update/merge/replace/refresh/relative transform/event
7. UPD-001~006
8. 문서화됐으나 fixture가 없는 나머지 public API
9. 구현 전용 conformance runner와 determinism
10. clean-room safety와 package consumer 검증
11. 기능 계약 고정 후 성능 최적화
12. 최적화 후 전체 기능 재검증

## 성능 원칙

- 객체별 ticker/listener/closure와 불필요한 DisplayObject를 피한다.
- 객체 수에 비례하는 중복 탐색과 할당을 줄인다.
- bulk update는 가능한 한 한 번의 탐색, 상태 변경 단계와 render invalidation으로 처리한다.
- 데이터 모델, public live handle, scene node, 렌더링 상태를 분리한다.
- ID/type/label index를 고려하고 불필요한 전체 scene 재생성을 피한다.
- 텍스트, geometry, texture, style 재사용을 고려한다.
- destroy 시 listener, ticker, scene, index와 retained reference를 해제한다.
- 최적화가 public identity, 반환값, event timing/payload, scene hierarchy를 바꾸지 않게 한다.
- 성능을 위해 fixture 기대 동작을 삭제하거나 완화하지 않는다.

## UPD-005

- macOS/SwiftShader의 검은 pixel evidence는 non-normative다.
- update 반환 시 공개 상태 변경과 다음 native frame 렌더 반영은 구현한다.
- 검은 화면 자체를 재현하도록 코드를 왜곡하지 않는다.
- headed Windows 확인 전에는 pixel 결과를 규범적 성공 조건으로 승격하지 않는다.

## 테스트와 패키징

- 문서화된 모든 public API에 자동화 계약 테스트를 둔다.
- LIF-001~002, DRW-001~006, UPD-001~006 actual normalized output을 `artifacts/expected/**`와 비교한다.
- 선언된 volatile field와 승인된 pixel tolerance 외 차이를 허용하지 않는다.
- expected output을 구현 결과에 맞춰 변경하지 않는다.
- fresh browser/session determinism, 입력 불변성, 반환 reference, event payload/order, destroy/re-init, 오류 후 상태, missing target을 검증한다.
- build, typecheck, lint, unit, conformance를 구성하고 통과한다.
- `npm audit` 알려진 취약점 0개를 유지한다.
- `npm pack`으로 실제 패키지를 만들고 별도 임시 consumer에서 public import와 최소 사용 흐름을 검증한다.

## 성능 검증

- 제공된 동일 benchmark 계약을 사용한다.
- 100, 500, 1,000, 2,000, 5,000 객체를 native와 Chromium 4x proxy에서 측정한다.
- 각 구간 기본 warmup 2회, measured sample 7회를 사용한다.
- init, draw, synchronous render, trusted bulk update, update render, teardown, retained heap을 분리한다.
- raw samples, median, p95, min, max와 p95/median noise ratio를 보존한다.
- reference 보고서와 동일 지표로 비교하고 최적화 전후를 분리한다.
- 최적화 후 전체 conformance와 determinism을 다시 실행한다.
- Windows native 기준선은 pending이며, 확인 전 최종 Windows 성능 승인으로 표현하지 않는다.

## 완료 조건

- `docs/reference/**`에 문서화된 모든 public API가 구현되고 자동화 계약 테스트와 연결돼야 한다.
- 14개 oracle fixture만 통과한 상태로 완료를 선언하지 않는다.
- build, typecheck, lint, unit, conformance, fresh determinism이 통과해야 한다.
- expected/reference evidence가 변경되지 않아야 한다.
- 실제 package와 별도 consumer import가 검증돼야 한다.
- `npm audit`, native/4x 성능 보고서, 최적화 후 전체 재검증, clean-room safety가 통과해야 한다.
- 의도별 커밋과 clean worktree가 필요하다.
- 미해결 observable behavior와 Windows pending을 숨기지 않는다.

## 최종 보고

- public API coverage, 아키텍처, 성능 전략, 모든 검증 명령/결과, fixture/계약 결과, determinism/safety/audit/package 결과를 보고한다.
- 객체 수별 성능 및 reference 대비, 산출물 경로, 커밋, worktree 상태, 미해결 질문과 Windows pending을 보고한다.
- 금지된 원본 구현 자료를 열람하지 않았음을 확인한다.

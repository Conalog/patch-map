# Patchmap 개발자 컨텍스트

이 문서는 `docs/reference/patchmap/`만 읽고도 개발 에이전트가 현재 `patch-map` 저장소의 구현 진입점, 수정 지점, 검증 루틴을 파악할 수 있도록 정리한 개발자용 안내서다.

현재 reference 세트는 기능 사용법만이 아니라, "어떤 변경을 하려면 어디를 읽고 어디를 고쳐야 하는가"까지 문서에서 바로 찾을 수 있어야 한다. 이 문서는 그 목적을 위해 `package.json`, `src/patch-map.ts`, `src/patchmap.js`, `src/init.js`, `src/display/draw.js`, `src/display/update.js`, 그리고 기존 기능 가이드들의 근거 소스를 한 번 더 압축해 놓는다.

## 1. 에이전트 관점 결론

현재 `overview.md`, `public-api.md`, `data-model.md`, `interactions.md`, `history-and-transformer.md`만으로는 "라이브러리를 어떻게 쓰는가"는 충분히 파악할 수 있다.

하지만 그 조합만으로는 아래 개발 컨텍스트가 부족했다.

- 어떤 파일이 공개 진입점이고 어떤 파일이 실제 런타임 본체인지
- `draw()`와 `update()`가 실제로 어느 모듈을 호출하는지
- 기능 수정 시 어떤 디렉터리를 우선 읽어야 하는지
- 어떤 검증 명령을 어느 상황에서 실행해야 하는지

즉, 기존 문서만으로는 "코드를 전혀 안 보고 구현 변경을 설계"하기에는 정보가 모자랐고, 이 문서가 그 공백을 메운다.

## 2. 저장소 진입점

### 배포 진입점

- 패키지 이름은 `@conalog/patch-map`이다.
- 패키지 export는 `package.json` 기준 아래 세 산출물을 가리킨다.
  - ESM: `dist/index.esm.js`
  - CJS: `dist/index.cjs.js`
  - 타입: `dist/types/src/patchmap.d.ts`
- 소스 수준 공개 진입점은 `src/patch-map.ts`다.

### 소스 수준 공개 export

`src/patch-map.ts`는 아래만 외부로 내보낸다.

- `Patchmap`
- `Command`
- `UndoRedoManager`
- `State`
- `PROPAGATE_EVENT`
- `Transformer`
- `selector`
- `convertLegacyData`
- `src/utils/index.js`의 재export 4개
  - `findIntersectObject`
  - `isMoved`
  - `intersectPoint`
  - `uid`

따라서 공개 API를 넓히거나 줄이는 작업은 대부분 `src/patch-map.ts`와 대응 문서(`public-api.md`, `coverage-checklist.md`)를 함께 수정해야 한다.

## 3. 구현 책임 맵

현재 구현은 아래 책임 경계로 이해하면 가장 빠르다.

### `src/patchmap.js`

- 런타임 퍼사드이자 실제 `Patchmap` 클래스 본체다.
- 공개 getter, `init()`, `draw()`, `update()`, `focus()`, `fit()`, `selector()`, `rotation`, `flip`, `transformer` setter가 여기에 모여 있다.
- 공개 동작이 바뀌면 이 파일과 `public-api.md`를 같이 보는 것이 기본이다.

### `src/init.js`

- 초기화 전용 모듈이다.
- `initApp()`, `initViewport()`, `initAsset()`, `initResizeObserver()`, `initCanvas()`를 제공한다.
- 기본 app/viewport 옵션, 기본 asset 번들, viewport plugin 등록 규칙을 바꾸려면 여기서 시작한다.

### `src/display/draw.js`

- 새 데이터를 통째로 다시 그리는 경로다.
- `store.world.apply({ type: 'canvas', children: data }, { mergeStrategy: 'replace', validateSchema: false })`를 수행한다.
- draw 관련 버그를 추적할 때는 실제 렌더링 세부 구현보다 먼저 이 파일과 `patchmap.draw()` 호출부를 보면 된다.

### `src/display/update.js`

- 기존 요소 부분 갱신 경로다.
- `path`, `elements`, `changes`, `history`, `relativeTransform`, `mergeStrategy`, `refresh`를 해석한다.
- README에 없는 `validateSchema`, `normalize`도 그대로 `element.apply()`까지 전달된다.
- update 계약을 바꾸는 수정은 이 파일과 `public-api.md`, `history-and-transformer.md`, `data-model.md`가 함께 영향받는다.

### `src/display/data-schema/**`

- draw/update 입력 스키마의 기준 정의다.
- 새 요소 타입, 새 컴포넌트 타입, primitive 규칙, strict validation 변경은 여기서 시작한다.
- 관련 문서는 `data-model.md`다.

### `src/events/**`

- selection, focus/fit, 상태 머신, hit-test 규칙을 담는다.
- `StateManager`, `SelectionState`, 충돌 판정 헬퍼, focus/fit 규칙 변경은 이 폴더가 기준이다.
- 관련 문서는 `interactions.md`다.

### `src/command/**`

- undo/redo와 command abstraction을 담는다.
- 히스토리 묶음, command stack, hotkey 규칙 변경은 여기서 본다.
- 관련 문서는 `history-and-transformer.md`다.

### `src/transformer/**`

- transformer selection model, wireframe, resize handle/gesture를 담는다.
- 선택 bounds와 resize 동작을 바꾸려면 이 폴더를 읽는다.
- 관련 문서는 `history-and-transformer.md`다.

### `src/utils/**`

- 공개 util은 적지만 내부 공용 헬퍼가 넓게 퍼져 있다.
- selector, viewport helper, bounds, convert, uuid, theme, event helper가 여기에 있다.
- 공개 export 여부는 `src/utils/index.js`와 `src/patch-map.ts`를 함께 봐야 한다.

## 4. 런타임 흐름을 문서만으로 따라가는 법

개발 에이전트가 코드를 열지 않고도 현재 동작을 추적하려면 아래 순서가 가장 효율적이다.

1. 공개 표면과 옵션: `public-api.md`
2. 생성부터 destroy까지 생명주기: `overview.md`
3. 입력 데이터와 정규화: `data-model.md`
4. 선택, 이벤트, viewport, focus/fit: `interactions.md`
5. history, command, transformer: `history-and-transformer.md`
6. 수정 파일 위치와 검증 명령: 이 문서

실제 호출 체인은 아래처럼 압축할 수 있다.

- `new Patchmap()`
  - 내부 store/manager 껍데기만 준비
- `init(element, opts)`
  - app, viewport, world, asset, stateManager, optional transformer 준비
- `draw(data)`
  - clone -> legacy convert -> validate -> world replace draw -> 다음 tick relations refresh
- `update(opts)`
  - selector/elements 해석 -> element.apply() 반복 -> optional history emit
- `destroy()`
  - history/state/event/viewport/app teardown

## 5. 변경 유형별 시작 지점

### 공개 메서드나 getter를 바꾸는 경우

- 먼저 읽을 파일
  - `src/patchmap.js`
  - `src/patch-map.ts`
- 같이 갱신할 문서
  - `public-api.md`
  - `overview.md`
  - `coverage-checklist.md`

### init 기본 옵션이나 asset 정책을 바꾸는 경우

- 먼저 읽을 파일
  - `src/init.js`
  - `src/patchmap.js`
- 같이 갱신할 문서
  - `overview.md`
  - `public-api.md`

### draw/update 입력 형식이나 요소 타입을 바꾸는 경우

- 먼저 읽을 파일
  - `src/display/data-schema/**`
  - `src/display/update.js`
  - `src/display/draw.js`
  - `src/utils/convert.js`
  - `src/utils/validator.js`
- 같이 갱신할 문서
  - `data-model.md`
  - `public-api.md`
  - `coverage-checklist.md`

### selection, focus/fit, canvas 이벤트를 바꾸는 경우

- 먼저 읽을 파일
  - `src/events/**`
  - `src/utils/event/**`
  - `src/utils/selector/**`
- 같이 갱신할 문서
  - `interactions.md`
  - 필요 시 `overview.md`

### undo/redo 또는 transformer를 바꾸는 경우

- 먼저 읽을 파일
  - `src/command/**`
  - `src/transformer/**`
  - `src/patchmap.js`
- 같이 갱신할 문서
  - `history-and-transformer.md`
  - 필요 시 `public-api.md`

## 6. 개발/검증 명령

현재 저장소의 표준 스크립트는 `package.json` 기준 아래와 같다.

- `npm run build`
  - `tsc && rollup -c`
  - dist 산출물과 타입 출력까지 확인할 때 사용한다.
- `npm run test:unit`
  - vitest unit 프로젝트 실행
- `npm run test:browser`
  - chromium 브라우저로 vitest browser 테스트 실행
- `npm run test:headless`
  - headless browser 테스트 실행
- `npm run format`
  - `biome format`
- `npm run lint`
  - staged 파일 기준 `biome check`
- `npm run lint:fix`
  - staged 파일 기준 `biome check --write`

문서 작업만 할 때는 최소한 아래 정도가 현실적인 검증 루틴이다.

- `python3 /Users/minholim/.agents/skills/project-context/scripts/check_runtime_shape.py`
- `find docs/reference/patchmap -maxdepth 1 -type f | sort`

코드 변경까지 들어가면 변경 유형에 맞는 테스트를 추가해야 한다.

- schema/update/history 성격 변경: `npm run test:unit`
- Pixi 렌더링/selection/transformer 변경: `npm run test:headless` 또는 `npm run test:browser`
- 배포 진입점/타입 영향 변경: `npm run build`

## 7. 현재 reference 세트의 한계와 보완 상태

이 문서 추가 전 상태를 냉정하게 말하면, reference 세트는 "사용 설명서"로는 충분했지만 "개발 핸드오프 패키지"로는 불완전했다.

부족했던 점은 아래 두 축이었다.

- 구현 맥락
  - 어떤 파일이 어떤 책임을 가지는지 한 번에 보이지 않았다.
- 작업 절차
  - 어떤 변경에 어떤 검증을 연결해야 하는지 reference에 없었다.

이 문서 추가 후에는 적어도 아래 질문에 대해 코드를 먼저 열지 않고 답할 수 있다.

- 공개 표면은 어디서 export되는가
- 런타임 본체는 어느 파일인가
- draw/update/focus/transformer 변경은 어느 디렉터리부터 읽어야 하는가
- 문서 변경과 코드 변경에 각각 어떤 검증을 돌려야 하는가

## 8. 실무용 최소 읽기 세트

새 세션의 개발 에이전트가 빠르게 복귀하려면 보통 아래 핵심 세트면 충분하다.

- `docs/memory.md`
- `docs/reference/patchmap/overview.md`
- `docs/reference/patchmap/public-api.md`
- `docs/reference/patchmap/data-model.md`
- `docs/reference/patchmap/interactions.md`
- `docs/reference/patchmap/history-and-transformer.md`
- 구현 맥락과 수정 지점이 필요하면 이 문서 `developer-context.md`까지 읽는다.

즉, 앞으로는 "reference 문서만 읽고 개발 시작"이라는 목표를 달성하려면 `developer-context.md`를 포함한 세트를 기준으로 삼는 편이 맞다.

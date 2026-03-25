# Patchmap Interactions

이 문서는 현재 JS/TS 구현 기준의 상호작용 동작만 정리한다.

## `patchmap.event`

`patchmap.event`는 `viewport.events` 레지스트리를 감싸는 facade다. `add()`는 이벤트 정의를 저장한 뒤 즉시 활성화까지 수행하고, `remove()`와 `removeAll()`은 등록된 리스너를 먼저 떼고 레지스트리에서도 제거한다. `get()`과 `getAll()`은 저장된 이벤트를 조회한다.

- `add({ id, path, elements, action, fn, options })`
  - `id`를 생략하면 `uid()`로 생성된다.
  - `path`는 기본값이 `'$'`이며, `'$'`는 패치맵 캔버스 표면, 즉 `viewport` 자체를 뜻한다.
  - `path`가 `'$'`가 아니면 `world`를 기준으로 selector가 동작한다.
  - `elements`를 직접 넘기면 selector를 거치지 않는다.
  - `path`와 `elements`를 함께 주면 둘 다 이벤트 대상이 된다.
  - 같은 `id`가 이미 있으면 경고만 남기고 덮어쓰지 않는다.
- `on(id)` / `off(id)` / `remove(id)`
  - 공백으로 구분한 여러 `id`를 한 번에 처리할 수 있다.
  - `on()`은 각 대상 객체에 `addEventListener`를 붙이고, `off()`는 같은 조합으로 `removeEventListener`를 호출한다.
  - `remove()`는 `off()` 후 레지스트리에서 항목을 삭제한다.
- `removeAll()`
  - 현재 등록된 모든 이벤트를 제거한다.
- `get(id)`
  - 존재하지 않는 `id`, 상속된 프로퍼티 이름, prototype 키는 `null`을 반환한다.
- `getAll()`
  - 현재 `viewport.events` 원본을 그대로 돌려준다.

## `viewport.plugin`

초기화 시 `initViewport()`는 다음 플러그인을 기본으로 켠다.

- `clampZoom: { minScale: 0.5, maxScale: 30 }`
- `drag: {}`
- `wheel: {}`
- `pinch: {}`
- `decelerate: {}`
- `passiveWheel: false`

플러그인 제어는 `viewport.plugin` 래퍼로 한다.

- `add(plugins)`
  - `disabled: true`인 항목은 건너뛴다.
  - 같은 키가 있으면 먼저 `viewport.plugins.remove(key)`를 호출한 뒤 `viewport[key](options)`로 다시 붙인다.
- `start(keys)`
  - `viewport.plugins.resume(key)`를 호출한다.
- `stop(keys)`
  - `viewport.plugins.pause(key)`를 호출한다.
- `remove(keys)`
  - `viewport.plugins.remove(key)`를 호출한다.

`SelectionState`는 드래그/페인트 선택이 시작될 때 `mouse-edges` 플러그인을 시작하고, `pointerup`에서 중지한다.

## `selector(path)`

`patchmap.selector(path, opts)`는 `world`를 루트로 하는 JSONPath 스타일 탐색기다. 내부적으로 `JSONPath-Plus`를 사용하며, 탐색 가능한 키는 `children`으로 제한된다.

- 루트 `'$'`는 `world`를 가리킨다.
- `flatten: true`가 적용되어 결과가 평탄화된다.
- `path`가 `null`/`undefined`면 빈 문자열로 처리된다.
- 예시 형태의 쿼리인 `$..[?(@.label=="group-label-1")]` 같은 패턴을 그대로 사용할 수 있다.

주의할 점은, `patchmap.event`에서 `'$'`는 `viewport` 표면을 뜻하지만 `patchmap.selector('$')`는 `world` 루트를 뜻한다는 점이다.

## `focus()` / `fit()`

두 함수 모두 `ids`를 `string`, `string[]`, `null`, `undefined` 중 하나로 받는다. 객체를 첫 번째 인자로 넘기면 옵션이 아니라 `ids`로 해석되어 검증에 실패한다. 옵션만 전달하려면 `null` 또는 `undefined`를 넣어야 한다.

- 공통 규칙
  - `ids`를 생략하면 기본 타깃은 `world.children` 중 `relations`를 제외한 최상위 관리 요소다.
  - `filter`는 탐색 과정에서 적용되며, 거짓값을 반환한 노드와 그 하위 트리는 제외된다.
  - 명시적 `ids`는 `$..children[?(@.type != null)]`에서 먼저 찾는다.
  - 주소 가능한 노드는 `constructor.isElement`가 참인 항목만이다.
  - `relations`는 명시적으로 찾으면 `props.links`의 `source`/`target` 엔드포인트로 해석된다. 링크 엔드포인트가 없으면 `relations` 자신을 사용한다.
  - 컨테이너는 기본적으로 관리 자식이 있으면 자식 쪽으로 내려간다. 단, `grid`는 하위로 내려가지 않고 자체가 바운스 기여자로 취급된다.
  - `filter`가 컨테이너에서 거짓이면 그 하위 트리는 내려가지 않는다.
  - 결과가 비면 `null`을 반환하고 뷰포트를 움직이지 않는다.

- `focus(ids, opts)`
  - 계산된 바운스의 중심으로만 이동한다.
  - `fit()`과 달리 크기 조정은 하지 않는다.

- `fit(ids, opts)`
  - `padding`은 기본값 `{ x: 16, y: 16 }`에서 시작한다.
  - 숫자를 넣으면 모든 변에 같은 패딩이 적용된다.
  - `{ x, y }`만 허용한다. `{ top, right, bottom, left }` 같은 edge 키는 거부된다.
  - 바운스를 중심으로 이동한 뒤 `viewport.fit(true, width, height)`를 호출한다.
  - 현재 뷰포트 scale을 기준으로 fit 크기를 계산한다.

## `StateManager` / `SelectionState`

`StateManager`는 스택 기반 상태 머신이다. `patchmap.init()` 시 `selection` 상태가 등록되며, 활성화는 `patchmap.stateManager.setState('selection', options)`로 한다.

- `register(name, StateClassOrObject, isSingleton = true)`
  - 클래스나 싱글톤 인스턴스를 등록한다.
  - `handledEvents`에 적힌 이벤트들을 자동으로 바인딩한다.
- `setState(name, ...args)`
  - 현재 스택을 비우고 새 상태를 푸시한다.
- `pushState(name, ...args)`
  - 기존 활성 상태에 `pause()`를 호출한 뒤 새 상태의 `enter()`를 호출한다.
- `popState(payload)`
  - 현재 상태의 `exit()` 후 아래 상태의 `resume(payload)`를 호출한다.
- `resetState()`
  - 모든 상태에 `exit()`를 호출하고 스택을 비운다.
- `activateModifier(name, ...args)` / `deactivateModifier()`
  - modifier 상태는 메인 스택과 별도로 동작하고, 활성화되면 모든 이벤트를 먼저 받는다.

modifier 상태가 활성화되어 있으면 해당 modifier가 이벤트를 독점하고 메인 스택은 이벤트를 받지 않는다. modifier가 없을 때만 `stateStack`의 top부터 아래로 내려가며, 상태 핸들러가 `PROPAGATE_EVENT`를 반환하면 다음 상태로 이벤트가 전달되고, 다른 값이면 전파가 멈춘다. 키 이벤트는 `window`, 나머지는 `viewport`에 붙는다.

`SelectionState`는 현재 구현의 기본 선택/드래그 상태다. 설정은 `deepMerge(defaultConfig, config)`로 합쳐진다.

중요한 현재 구현 전제 조건이 하나 있다. `SelectionState`의 hit-test 경로는 내부에서 `this.store.transformer.elements`를 직접 읽기 때문에, 실사용에서는 `patchmap.transformer`가 연결되어 있고 `elements` 배열을 제공한다고 가정하는 편이 안전하다. transformer를 붙이지 않은 상태에서 선택 로직을 바로 쓰면 런타임 오류가 날 수 있다.

- 기본값
  - `draggable: false`
  - `paintSelection: false`
  - `filter: () => true`
  - `selectUnit: 'entity'`
  - `drillDown: false`
  - `deepSelect: false`
  - 콜백들은 기본적으로 no-op
  - `selectionBoxStyle.fill = { color: '#9FD6FF', alpha: 0.2 }`
  - `selectionBoxStyle.stroke = { width: 2, color: '#1099FF' }`
- 선택 단위
  - `entity`: 대상 자체
  - `closestGroup`: 가장 가까운 `group`, 없으면 `grid`
  - `highestGroup`: 가장 바깥쪽 `group`, 없으면 가장 가까운 `grid`
  - `grid`: 가장 가까운 `grid`
  - 알 수 없는 값은 대상 자체로 되돌아간다
- 입력 처리
  - `pointerdown`에서 시작점과 viewport 상태 스냅샷을 저장하고 `onDown(target, event)`를 호출한다.
  - 오른쪽 버튼(`button === 2`)이면 즉시 상태/선택 박스/제스처를 초기화한다.
  - `draggable`이 꺼져 있으면 `pointermove`는 사실상 무시된다.
  - 이동 임계값은 `4 / viewport.scale` 기준이다.
  - 임계값을 넘으면 드래그 또는 페인트 모드로 전환되고 `mouse-edges`가 시작된다.
  - `pointerup`에서 드래그/페인트 중이면 `onDragEnd()`를 호출하고 `mouse-edges`를 중지한다.
  - `onUp()`은 `PRESSING` 상태에서의 `pointerup`마다 호출된다. 즉 뷰포트 이동 여부와 무관하게 drag 모드로 넘어가지 않았다면 실행될 수 있다.
  - `pointerover`는 idle 상태에서만 `onOver()`를 호출한다.
  - `ontap`은 `onclick`으로 라우팅된다.
  - `click`과 `rightclick`은 `pointerdown` 이후 뷰포트 위치/scale이 바뀌지 않았고 실제 이동이 임계값을 넘지 않았을 때만 처리된다.
  - `click`의 `detail === 2`일 때만 `onDoubleClick()`이 호출되고, 이 경우 `onClick()`은 호출되지 않는다.
  - `rightclick`은 `onRightClick()`으로 라우팅된다.
  - `pointerleave`는 상태와 selection box, gesture 데이터를 정리하지만 `onDragEnd()`를 대신 호출하지는 않는다.
- 추가 동작
  - `drillDown`이 켜져 있고 `detail >= 2`이면 같은 위치에서 더 깊은 대상이 있는지 반복적으로 다시 찾는다.
  - `deepSelect`가 켜져 있고 `Ctrl` 또는 `Meta`를 누른 상태면 `selectUnit`을 강제로 `grid`로 바꿔 찾는다.
  - 현재 transformer의 `elements`로부터 조상 집합을 만들어, `closestGroup` / `highestGroup` / `grid` 선택 시 그 조상은 제외한다.
  - wireframe 위를 클릭하면, 가능하면 같은 지점의 아래 대상로 한 번 더 찾아 내려간다.

## 찾기 / 충돌 판정

선택과 드래그 판정은 다음 헬퍼에 의존한다.

- `findIntersectObject(parent, point, config)`
  - 점 충돌 기준의 단일 대상 탐색이다.
  - `zIndex`가 높은 순, 그리고 표시 순서를 반영해 먼저 맞는 대상을 찾는다.
  - `hitScope === 'children'`인 후보는 자기 자신이 아니라 자식들을 검사한다.
- `findIntersectObjects(parent, polygon, config)`
  - 사각형/다각형 선택에 쓰인다.
  - 결과는 중복 제거된 배열이다.
- `findIntersectObjectsBySegment(parent, p1, p2, config)`
  - 페인트 선택에 쓰인다.
  - 교차 진입 `t`가 빠른 순으로 정렬된다.

공통으로 다음 규칙을 따른다.

- 검색 루트가 잠겨 있으면 결과는 비거나 `null`이다.
- 잠긴 오브젝트와 잠긴 조상 아래의 오브젝트는 후보에서 제외된다.
- 후보 선택 가능 여부는 `constructor.isSelectable`와 잠금 상태로 결정된다.
- `isResizableCandidate()`는 `constructor.isResizable`와 잠금 상태를 함께 본다.

## 상호작용 관련 유틸리티와 이벤트

`src/utils/index.js`에서 상호작용에 직접 쓰이는 공개 export는 다음이다.

- `findIntersectObject`
- `isMoved`
- `intersectPoint`
- `uid`

`isMoved()`는 기본 이동 임계값 4px를 쓰고, viewport scale에 따라 임계값을 보정한다. `uid()`는 이벤트 id를 자동 생성할 때도 쓰인다.

패치맵과 상태 시스템이 실제로 내보내는 주요 이벤트는 다음이다.

- `patchmap:initialized`
- `patchmap:draw`
- `patchmap:draw`는 `draw()` 호출 직후 동기적으로 emit되지 않고, `scheduler.postTask(..., { priority: 'user-visible' })` 또는 `setTimeout(..., 0)`을 통해 늦게 전달된다.
- `patchmap:updated`
- `patchmap:rotated`
- `patchmap:flipped`
- `patchmap:destroyed`
- `state:pushed`
- `state:popped`
- `state:set`
- `state:reset`
- `state:destroyed`
- `modifier:activated`
- `modifier:deactivated`

추가 주의사항:

- `patchmap.draw()`는 관계선(`relations`)을 한 번 더 갱신하도록 다음 틱에 `update({ path: '$..[?(@.type=="relations")]', refresh: true, emit: false })`를 예약한다.
- 캔버스 래퍼는 `contextmenu`를 막는다.
- `patchmap.destroy()`는 이벤트 레지스트리, 상태 관리, viewport, 애니메이션 컨텍스트를 정리한다.

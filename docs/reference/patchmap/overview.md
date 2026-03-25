# Patchmap 개요 및 라이프사이클

PATCH MAP은 `pixi.js`와 `pixi-viewport` 위에서 동작하는 캔버스 지도 라이브러리다. 현재 구현 기준으로는 `Patchmap` 인스턴스를 만들고 `init()`으로 캔버스와 씬을 준비한 뒤 `draw()`로 데이터를 렌더링하고, 이후 `update()`, `focus()`, `fit()`, `rotation`, `flip`, `event`, `stateManager`, `transformer`를 통해 상호작용을 제어한다.

공개 메서드와 프로퍼티를 옵션 단위로 빠르게 훑고 싶다면 먼저 `public-api.md`를 보고, 세부 데이터/상호작용/히스토리 동작은 각 주제 문서로 내려가는 방식이 가장 효율적이다.

## 런타임 의존성과 전제 조건

- 필수 peer dependency는 `pixi.js >= 8`이다.
- 런타임 의존성은 `pixi-viewport`, `gsap`, `zod`, `zod-validation-error`, `jsonpath-plus`, `@pixi-essentials/bounds`, `is-plain-object`, `nanoid`다.
- `package.json` 기준 개발/빌드용 Node.js 요구사항은 `>=20`이다.
- `init()`은 DOM 엘리먼트가 필요하고, 내부적으로 `ResizeObserver`, `window`, `document`를 사용한다.
- `init()`은 기본 아이콘 번들과 Fira Code 폰트 번들을 미리 적재한다. `opts.assets`로 추가 자산을 병합할 수 있다.
- CDN 사용 시에는 README처럼 `pixi.js`를 먼저 로드하고, 그 다음 `@conalog/patch-map` 번들을 로드해야 한다.
- npm 설치는 `npm install @conalog/patch-map`을 사용한다. 호스트 앱에는 `pixi.js`를 함께 설치해야 한다.

### `init()`의 기본 옵션

`src/init.js` 기준 기본값은 다음과 같다.

- `app`
  - `background: '#FAFAFA'`
  - `antialias: true`
  - `autoStart: true`
  - `autoDensity: true`
  - `useContextAlpha: true`
  - `resolution: 2`
- `viewport`
  - `passiveWheel: false`
  - `clampZoom: { minScale: 0.5, maxScale: 30 }`
  - `drag`, `wheel`, `pinch`, `decelerate` 플러그인 활성화
- `theme`
  - `primary`, `gray`, `white`, `black` 팔레트가 기본으로 들어 있다.

## `src/patch-map.ts` 공개 export

이 모듈은 아래를 외부로 노출한다.

- `Patchmap`
- `Command`
- `UndoRedoManager`
- `State`
- `PROPAGATE_EVENT`
- `Transformer`
- `selector`
- `convertLegacyData`
- `./utils` 전체 재export

## Patchmap 라이프사이클

### 생성

`new Patchmap()`은 아직 캔버스를 만들지 않는다. 이 시점에 내부적으로는 이벤트 emitter, theme store, `UndoRedoManager`, `gsap.context()`, `ViewTransform`이 준비되지만 `app`, `viewport`, `world`는 모두 `null`이다.

### `init(element, opts)`

`init()`은 한 번만 실제 초기화를 수행한다. 이미 초기화된 인스턴스라면 바로 반환한다.

현재 구현 흐름은 다음과 같다.

1. `UndoRedoManager`의 단축키를 등록한다.
2. `theme`를 병합한다.
3. `PIXI.Application`을 만들고 `initApp()`로 초기화한다.
4. `store`를 만든다. 이 store에는 `app`, `viewport`, `world`, `view`, `undoRedoManager`, `theme`, `animationContext`가 들어간다.
5. `initViewport()`로 `Viewport`를 만들고 `app.stage`에 붙인다.
6. `World`를 생성해 `viewport`의 자식으로 추가한다.
7. `ViewTransform`을 `viewport`와 `world`에 연결한다.
8. `initAsset()`로 자산을 로드한다.
9. `initCanvas()`로 `app.canvas`를 전달받은 엘리먼트 안에 넣는다.
10. `ResizeObserver`를 붙여 리사이즈 시 `app.resize()`, `viewport.resize()`, `ViewTransform.applyWorldTransform()`를 수행한다.
11. `StateManager`를 만들고 `selection` 상태를 기본 상태로 등록한다.
12. `opts.transformer`가 있으면 `transformer` setter로 연결한다.
13. `isInit = true`가 된 뒤 `patchmap:initialized`를 emit한다.

`init()` 직후 사용자에게 보이는 관계는 다음과 같다.

- `patchmap.app`는 `PIXI.Application`이다.
- `patchmap.viewport`는 `app.stage` 아래에 있다.
- `patchmap.world`는 `viewport`의 첫 번째 자식이다.
- `patchmap.theme`는 병합된 테마 객체의 얕은 복사본이다. 최상위 객체는 새로 만들어지지만, 내부 팔레트 객체는 공유 참조일 수 있다.

### `draw(data)`

`draw()`는 들어온 데이터를 먼저 `JSON.parse(JSON.stringify(data))`로 복제한 뒤 처리한다. 객체에 `grids` 키가 있으면 레거시 데이터로 보고 `convertLegacyData()`를 거친다. 이후 `validateMapData()`로 검증하고, 검증 에러면 그대로 throw한다.

렌더링 직전에는 다음을 수행한다.

- `app.stop()`
- `undoRedoManager.clear()`
- `animationContext.revert()`
- `event.removeAllEvent(viewport)`

그 다음 `draw(store, validatedData)`를 호출한다. 초기 draw 이후에는 `relations` 요소를 한 번 더 갱신하기 위해, 다음 ticker tick에서 `update({ path: '$..[?(@.type=="relations")]', refresh: true, emit: false })`를 실행한다. draw가 끝나면 `app.start()`를 다시 호출하고, 사용자에게 보이는 시점에 `patchmap:draw`를 emit한다. `scheduler.postTask()`가 있으면 `user-visible` 우선순위로, 없으면 `setTimeout()`으로 지연 실행한다.

`draw()`의 반환값은 검증을 통과한 데이터다.

### `update(opts)`

`update()`는 내부 `world`에 대해 `update(this.world, opts)`를 호출하고, 기본적으로 `patchmap:updated`를 emit한다. 단, `opts.emit === false`이면 이벤트를 내보내지 않는다. 반환값은 업데이트된 요소 목록이다.

### `destroy()`

초기화되지 않은 상태라면 아무 일도 하지 않는다. 초기화된 상태에서는 다음 순서로 정리한다.

- `undoRedoManager.destroy()`
- `animationContext.revert()`
- `stateManager.resetState()` 후 `stateManager.destroy()`
- `event.removeAllEvent(viewport)`
- `viewport.destroy({ children: true, context: true, style: true })`
- `app.destroy(true)` 후 `app.canvas.parentElement.remove()`
- `ResizeObserver.disconnect()`

그 뒤 내부 참조를 전부 초기화하고 `isInit = false`로 되돌린 다음 `patchmap:destroyed`를 emit한다. 마지막에 `removeAllListeners()`까지 호출한다.

## 사용자에게 보이는 상태와 관계

### `app`, `viewport`, `world`, `theme`

- `app`는 Pixi 애플리케이션이다.
- `viewport`는 줌/드래그/핀치/휠 플러그인을 붙인 카메라 레이어다.
- `world`는 실제 도형과 컴포넌트가 렌더링되는 루트 컨테이너다.
- `theme`는 `themeStore()` 기반 병합 객체이며 getter는 얕은 복사본을 반환한다.
- `selector()`와 `focus()/fit()`는 모두 `world`를 기준으로 동작한다.

`StateManager`가 state를 `enter(store, ...)`로 넘길 때 받는 값은 내부 draw store가 아니라 `Patchmap` 인스턴스 자신이다. 그래서 커스텀 state에서는 `store.app`, `store.viewport`, `store.world`, `store.undoRedoManager`, `store.transformer`, `store.stateManager` 같은 `Patchmap` 공개 표면을 사용할 수 있지만, `_createStoreContext()`의 `view` 같은 내부 전용 필드를 직접 기대하면 안 된다.

### `event` facade

`patchmap.event`는 `src/utils/event/canvas.js`의 함수를 감싼 얇은 facade다.

- `add(opts)`는 이벤트를 등록하고 즉시 활성화한다. 반환값은 이벤트 id다.
- `remove(id)`는 하나 또는 공백으로 구분된 여러 id를 제거한다.
- `removeAll()`은 등록된 이벤트를 전부 제거한다.
- `on(id)`과 `off(id)`는 활성화/비활성화만 제어한다.
- `get(id)`과 `getAll()`은 현재 등록 상태를 읽는다.

`path: '$'`는 `viewport` 자체를 대상으로 한다. 그 외 경로는 `world`를 루트로 `selector()`가 해석한다. `elements`를 직접 넘기면 그 객체들에만 이벤트가 연결된다.

### `stateManager`

`StateManager`는 스택 기반 상태 머신이다. `init()` 시점에 기본 `selection` 상태가 이미 등록된다. 사용자는 `register(name, StateClassOrObject, isSingleton)`로 상태를 추가하고 `setState()`, `pushState()`, `popState()`, `activateModifier()`, `deactivateModifier()`, `resetState()`를 사용할 수 있다.

현재 구현에서 알아둘 이벤트는 다음과 같다.

- `state:pushed`
- `state:popped`
- `state:set`
- `state:reset`
- `state:destroyed`
- `modifier:activated`
- `modifier:deactivated`

### `undoRedoManager`

`patchmap.undoRedoManager`는 `Patchmap` 인스턴스가 기본으로 들고 있는 history 관리자다. 상세 계약은 `history-and-transformer.md`를 보는 편이 맞지만, 개요 수준에서는 다음 정도를 알아두면 충분하다.

- `execute(command, { historyId })`로 명령을 기록한다.
- `undo()`, `redo()`, `canUndo()`, `canRedo()`, `clear()`를 제공한다.
- `init()` 시점에 기본 단축키를 등록한다.
  - `Ctrl/Cmd + Z`: undo
  - `Ctrl/Cmd + Shift + Z`: redo
  - `Ctrl/Cmd + Y`: redo
- `draw()`는 새 데이터를 다시 그리기 전에 기존 history를 비운다.
- 관련 이벤트는 `history:executed`, `history:undone`, `history:redone`, `history:cleared`, `history:destroyed`, `history:*`다.

### `transformer`

`patchmap.transformer`는 `Transformer` 인스턴스만 허용한다. 새 값을 넣으면 기존 transformer가 살아 있을 때 먼저 `object_transformed` 리스너를 해제하고 `destroy(true)`로 정리한 뒤, 새 transformer를 `viewport`에 추가한다. 이후 `viewport`의 `object_transformed` 이벤트가 `transformer.update`와 연결된다.

## focus / fit / rotation / flip / selector

### `focus(ids, opts)`와 `fit(ids, opts)`

- `ids`는 `string`, `string[]`, `null`, `undefined`를 받을 수 있다.
- `ids`가 비어 있으면 최상위 `world` 자식들에 대해 동작한다.
- `filter` 옵션을 줄 수 있다.
- `fit()`은 `padding`을 추가로 받는다. 현재 구현에서 `padding`은 `number` 또는 `{ x, y }`만 허용하고, 기본값은 좌우/상하 각각 `16`이다.
- `relations`를 직접 가리키면 즉시 안정적인 bounds가 없을 수 있어서, 가능한 경우 연결된 endpoint로 해석한다.

### `rotation` / `flip`

`patchmap.rotation`은 회전 컨트롤러다.

- `value`
- `set(value)`
- `rotateBy(delta)`
- `reset()`

`patchmap.flip`은 뒤집기 컨트롤러다.

- `x`, `y` getter/setter
- `set({ x, y })`
- `toggleX()`
- `toggleY()`
- `reset()`

회전 또는 flip이 바뀌면 각각 `patchmap:rotated`, `patchmap:flipped`가 emit된다. 내부적으로는 world의 pivot, position, angle, scale을 다시 맞춘다.

### `selector(path, opts)`

`selector()`는 `JSONSearch`를 사용해 `world`를 기준으로 검색한다. `searchableKeys`는 `children`이고 결과는 `flatten: true`로 펼쳐진다. 예를 들어 `patchmap.selector('$')[0]`는 `patchmap.world`다.

## 자주 쓰는 이벤트

### Patchmap

- `patchmap:initialized`
- `patchmap:draw`
- `patchmap:updated`
- `patchmap:rotated`
- `patchmap:flipped`
- `patchmap:destroyed`

### Transformer

- `update_elements`

### StateManager

- `state:pushed`
- `state:popped`
- `state:set`
- `state:reset`
- `state:destroyed`
- `modifier:activated`
- `modifier:deactivated`

## 짧은 사용 예시

### 초기화와 렌더링

```js
import { Patchmap } from '@conalog/patch-map';

const patchmap = new Patchmap();

await patchmap.init(document.body);

patchmap.draw([
  {
    type: 'group',
    id: 'group-1',
    children: [
      {
        type: 'item',
        id: 'item-1',
        attrs: { x: 100, y: 120 },
      },
    ],
  },
]);
```

### 갱신, 포커스, 회전

```js
patchmap.update({
  path: '$..[?(@.id=="item-1")]',
  changes: { attrs: { x: 240 } },
});

patchmap.focus('item-1');
patchmap.fit('item-1', { padding: { x: 12, y: 8 } });

patchmap.rotation.set(90);
patchmap.flip.toggleX();
```

### 이벤트, 선택기, transformer

```js
import { Transformer } from '@conalog/patch-map';

const id = patchmap.event.add({
  path: '$..[?(@.id=="item-1")]',
  action: 'pointerdown',
  fn: (event) => {
    console.log(event);
  },
});

const item = patchmap.selector('$..[?(@.id=="item-1")]')[0];
patchmap.event.off(id);
patchmap.event.remove(id);

patchmap.transformer = new Transformer();
patchmap.transformer.elements = item ? [item] : [];
```

### 사용자 상태 등록

```js
import { State } from '@conalog/patch-map';

class CustomState extends State {
  static handledEvents = ['onpointerdown'];
  onpointerdown(event) {
    console.log(event);
  }
}

patchmap.stateManager.register('custom', CustomState);
patchmap.stateManager.setState('custom');
```

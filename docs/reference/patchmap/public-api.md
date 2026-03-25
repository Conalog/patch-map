# Patchmap Public API 가이드

이 문서는 `Patchmap` 클래스의 공개 메서드와 주요 프로퍼티를 한 곳에서 설명한다. 목표는 `docs/reference/patchmap/`만 읽어도 README 없이 현재 구현 기준 사용법을 파악할 수 있게 하는 것이다.

상세 데이터 스키마는 `data-model.md`, 상호작용 계층은 `interactions.md`, history/transformer는 `history-and-transformer.md`를 함께 보면 된다. 이 문서는 그중에서도 `Patchmap` 인스턴스가 직접 노출하는 표면에 집중한다.

## 1. 공개 표면 요약

`src/patchmap.js` 기준으로 실사용자가 직접 만나는 `Patchmap` 표면은 아래와 같다.

- getter
  - `app`
  - `viewport`
  - `world`
  - `theme`
  - `isInit`
  - `undoRedoManager`
  - `transformer`
  - `stateManager`
  - `animationContext`
  - `event`
- 메서드
  - `init(element, opts)`
  - `destroy()`
  - `draw(data)`
  - `update(opts)`
  - `focus(ids, opts)`
  - `fit(ids, opts)`
  - `selector(path, opts)`
- 컨트롤러 getter
  - `rotation`
  - `flip`

## 2. 생성과 초기화

### `new Patchmap()`

인스턴스 생성만으로는 Pixi canvas가 만들어지지 않는다.

- 생성 직후 기본 상태
  - `app`, `viewport`, `world`, `stateManager`, `transformer`는 `null`
  - `isInit`은 `false`
  - `undoRedoManager`는 새 인스턴스로 준비됨
  - `theme`는 기본 테마를 가진 store 기반 getter
  - `rotation`, `flip`은 아직 world가 없어도 호출 가능한 컨트롤러

### `await init(element, opts)`

`Patchmap` 런타임을 실제 DOM에 붙이는 진입점이다.

- 인자
  - `element`
    - canvas 래퍼를 붙일 DOM 요소
    - `ResizeObserver`가 이 요소를 관찰한다
  - `opts`
    - 선택 객체, 생략 가능

#### `init()` 특징

- `async` 메서드다.
- 이미 초기화된 인스턴스면 바로 반환한다.
- `patchmap:initialized` 이벤트를 emit한다.
- `selection` 상태를 `stateManager`에 기본 등록한다.
- `opts.transformer`가 있으면 초기화 마지막 단계에서 자동 attach한다.

#### `init()` 옵션

##### `opts.app`

`PIXI.Application.init()`으로 전달되는 옵션이다. 내부적으로 `resizeTo: element`가 강제로 합쳐진다.

기본값:

```js
{
  background: '#FAFAFA',
  antialias: true,
  autoStart: true,
  autoDensity: true,
  useContextAlpha: true,
  resolution: 2,
}
```

##### `opts.viewport`

`pixi-viewport` 생성 옵션이다. 내부적으로 아래 필드가 자동 주입된다.

- `screenWidth: app.screen.width`
- `screenHeight: app.screen.height`
- `events: app.renderer.events`

기본값:

```js
{
  passiveWheel: false,
  plugins: {
    clampZoom: { minScale: 0.5, maxScale: 30 },
    drag: {},
    wheel: {},
    pinch: {},
    decelerate: {},
  },
}
```

주의사항:

- `plugins`는 단순 옵션 객체가 아니라 초기화 시 자동 등록될 viewport plugin 집합이다.
- `{ disabled: true }`가 붙은 플러그인은 등록되지 않는다.

##### `opts.theme`

기본 테마에 deep merge된다.

기본 구조:

```js
{
  primary: {
    default: '#0C73BF',
    dark: '#083967',
    accent: '#EF4444',
  },
  gray: {
    light: '#9EB3C3',
    default: '#D9D9D9',
    dark: '#71717A',
  },
  white: '#FFFFFF',
  black: '#1A1A1A',
}
```

##### `opts.assets`

Pixi `Assets`에 추가로 등록/로드할 asset 정의 배열이다. 현재 구현은 두 형식을 모두 받는다.

- bundle 형식

```js
{
  name: 'icons',
  items: [
    { alias: 'custom-icon', src: '/icons/custom.svg' },
  ],
}
```

- 단일 asset 형식

```js
{
  alias: 'logo',
  src: '/images/logo.png',
}
```

현재 구현 규칙:

- 기본 아이콘 번들과 Fira Code 폰트 번들이 항상 먼저 merge 대상에 포함된다.
- bundle은 `name`, 단일 asset은 `alias` 기준으로 중복 등록을 피한다.
- 이미 Pixi resolver에 등록된 항목은 다시 추가하지 않는다.
- bundle과 단일 asset은 각각 `Assets.loadBundle()` / `Assets.load()`로 함께 로드된다.

##### `opts.transformer`

`Transformer` 인스턴스를 넘기면 `init()` 마지막 단계에서 `patchmap.transformer = transformer`가 실행된다.

예시:

```js
import { Patchmap, Transformer } from '@conalog/patch-map';

const patchmap = new Patchmap();

await patchmap.init(document.body, {
  app: { background: '#eceff3' },
  viewport: {
    plugins: {
      decelerate: { disabled: true },
    },
  },
  theme: {
    primary: { default: '#c2410c' },
  },
  assets: [
    { alias: 'logo', src: '/logo.png' },
  ],
  transformer: new Transformer({ resizeHandles: true }),
});
```

## 3. 렌더링 메서드

### `draw(data)`

맵 데이터를 새로 렌더링한다.

#### 입력

- `data`
  - 일반적으로 `Element[]`
  - 레거시 형식이면 `{ grids, strings, ... }` 객체도 허용

#### 현재 구현 흐름

1. `JSON.parse(JSON.stringify(data))`로 입력을 복제한다.
2. 복제 결과가 레거시 형식이면 `convertLegacyData()`로 변환한다.
3. `validateMapData()`로 검증한다.
4. 기존 실행 상태를 정리한다.
   - `app.stop()`
   - `undoRedoManager.clear()`
   - `animationContext.revert()`
   - `event.removeAllEvent(viewport)`
5. `world`를 새 데이터로 다시 그린다.
6. 다음 ticker tick에서 `relations`만 `refresh: true`로 한 번 더 갱신한다.
7. `app.start()`를 호출한다.
8. 비동기적으로 `patchmap:draw`를 emit한다.

#### 반환값

- 성공 시 검증된 데이터
- 레거시 입력이면 변환 후 데이터
- `null`처럼 clone 이후 falsy가 되는 입력은 조용히 `undefined`
- 검증 실패 시 예외 throw

#### `draw()`를 쓸 때 알아둘 점

- 새 draw는 이전 history를 지운다.
- 등록된 canvas 이벤트도 모두 제거된다.
- `patchmap:draw`는 동기 이벤트가 아니다. `scheduler.postTask()` 또는 `setTimeout()`으로 늦게 실행된다.
- 입력은 JSON 복제를 거치므로 함수, 클래스 인스턴스, 순환 참조는 안전하지 않다.

예시:

```js
const rendered = patchmap.draw([
  {
    type: 'item',
    id: 'item-1',
    size: 80,
  },
]);

console.log(rendered[0].id); // item-1
```

### `update(opts = {})`

이미 렌더링된 객체를 선택해서 변경한다.

`Patchmap.update()`는 내부적으로 `src/display/update.js`를 그대로 감싼다. 즉 README에 없는 옵션도 현재 구현상은 전달된다.

#### 반환값

- 실제로 처리 대상으로 잡힌 요소 배열
- 대상이 없으면 빈 배열

#### `update()` 대상 선택 규칙

- `elements`
  - 직접 참조를 넘기는 방식
  - 단일 객체 또는 배열 허용
- `path`
  - `selector()`로 찾는 방식
- 두 옵션을 함께 쓰면 합쳐진다.
- 중복 제거는 하지 않으므로 같은 요소가 `elements`와 `path` 양쪽에서 잡히면 두 번 적용될 수 있다.
- falsy 대상은 순회 중 건너뛴다.

#### `update()` 옵션

##### `path?: string`

`world`를 루트로 하는 JSONPath 스타일 selector다.

```js
path: '$..[?(@.id=="item-1")]'
```

##### `elements?: object | object[]`

이미 잡아둔 요소 참조를 직접 넘길 수 있다.

```js
const item = patchmap.selector('$..[?(@.id=="item-1")]')[0];
patchmap.update({ elements: item, changes: { show: false } });
```

##### `changes?: object | null`

적용할 변경사항이다.

- 기본적으로 patch merge 대상으로 해석된다.
- `refresh: true`일 때는 생략 가능하다.
- `refresh: false`인데 `changes`도 없으면 대상 탐색만 하고 실질 변경은 일어나지 않는다.
- `relativeTransform: true`면 내부적으로 복제 후 `attrs.x`, `attrs.y`, `attrs.rotation`, `attrs.angle`만 상대값 처리한다.

##### `history?: boolean | string`

history 기록 여부와 묶음 단위를 정한다.

- `false` 또는 생략
  - history 기록 안 함
- `true`
  - 호출마다 새 `historyId`를 자동 생성
- `'some-id'`
  - 같은 문자열을 쓰는 **연속 update**를 하나의 undo/redo 단계로 묶음
  - 중간에 다른 history가 끼면 새 묶음이 시작된다

##### `relativeTransform?: boolean`

`changes.attrs` 안의 아래 숫자 필드만 절대값이 아니라 상대 델타로 처리한다.

- `x`
- `y`
- `rotation`
- `angle`

예시:

```js
patchmap.update({
  path: '$..[?(@.id=="item-1")]',
  changes: { attrs: { x: 20, y: -10 } },
  relativeTransform: true,
});
```

이 경우 현재 좌표에 `(+20, -10)`이 더해진다.

##### `mergeStrategy?: 'merge' | 'replace'`

기본값은 `'merge'`다.

- `'merge'`
  - deep merge
  - 일부 필드만 갱신할 때 사용
- `'replace'`
  - 지정한 top-level 필드를 통째로 교체
  - undo 복원이나 style/component 전체 교체에 적합

##### `refresh?: boolean`

기본값은 `false`다.

- `true`면 실제 diff가 없어도 핸들러를 강제로 다시 실행한다.
- 부모/관계선처럼 계산 기반 자식을 다시 만들고 싶을 때 유용하다.

##### `emit?: boolean`

이 옵션은 `Patchmap.update()` 레벨에서만 해석된다.

- 기본값은 `true`
- `false`면 `patchmap:updated`를 emit하지 않는다.
- 요소 업데이트 자체는 계속 수행된다.

##### `validateSchema?: boolean`

이 옵션은 내부 `element.apply()`로 전달된다.

- 기본값은 `true`
- `false`면 schema 검증 없이 적용한다.
- 정상 public usage에서는 끄지 않는 편이 안전하다.

##### `normalize?: boolean`

이 옵션도 내부 `element.apply()`로 전달된다.

- 기본값은 `true`
- `false`면 `size: 80`, `gap: 4`, `margin: { x, y }` 같은 shorthand 정규화를 건너뛴다.

#### `update()` 예시

기본 patch update:

```js
patchmap.update({
  path: '$..[?(@.id=="item-1")]',
  changes: {
    attrs: { x: 240 },
    show: true,
  },
});
```

history를 묶어서 여러 번 호출:

```js
patchmap.update({
  path: '$..[?(@.id=="item-1")]',
  changes: { attrs: { x: 10 } },
  relativeTransform: true,
  history: 'drag-item-1',
});

patchmap.update({
  path: '$..[?(@.id=="item-1")]',
  changes: { attrs: { y: 12 } },
  relativeTransform: true,
  history: 'drag-item-1',
});
```

강제 refresh:

```js
patchmap.update({
  path: '$..[?(@.type=="relations")]',
  refresh: true,
  emit: false,
});
```

정규화/검증을 끄는 내부 지향 호출:

```js
patchmap.update({
  elements: patchmap.selector('$..[?(@.id=="item-1")]'),
  changes: {
    size: { width: 100, height: 80 },
  },
  validateSchema: false,
  normalize: false,
});
```

#### `draw()`와 `update()`의 역할 차이

- `draw()`
  - 전체 scene을 새로 렌더링
  - history/event/animation 초기화
  - 입력 검증 후 canvas 루트 교체
- `update()`
  - 기존 scene 일부만 갱신
  - 선택된 요소에만 patch 적용
  - history, refresh, relative transform 제어 가능

## 4. 탐색과 뷰포트 제어

### `focus(ids?, opts?)`

현재 뷰포트 중심을 특정 대상 쪽으로 이동시킨다. 확대/축소는 하지 않는다.

- `ids`
  - `string | string[] | null | undefined`
- `opts.filter`
  - `(obj) => unknown`

핵심 규칙:

- `ids`가 없으면 top-level 관리 요소(기본적으로 `relations` 제외)를 대상으로 한다.
- `relations` id를 직접 넘기면 가능한 경우 연결 endpoint를 사용한다.
- 결과가 없으면 `null`을 반환한다.

```js
patchmap.focus('item-1');
patchmap.focus(['item-1', 'item-2']);
patchmap.focus(null, {
  filter: (obj) => obj.id !== 'background-image',
});
```

### `fit(ids?, opts?)`

대상을 화면 안에 맞게 center + zoom을 동시에 수행한다.

- `ids`
  - `string | string[] | null | undefined`
- `opts.filter`
  - `(obj) => unknown`
- `opts.padding`
  - `number | { x?: number, y?: number }`
  - 기본 패딩은 `{ x: 16, y: 16 }`

```js
patchmap.fit('group-1', { padding: 24 });
patchmap.fit(['item-1', 'item-2'], { padding: { x: 8, y: 12 } });
```

### `selector(path, opts?)`

`world`를 루트로 하는 object 탐색기다.

- `path`
  - JSONPath 스타일 문자열
  - `'$'`는 `world`를 가리킨다
- `opts`
  - 내부 `JSONSearch` 옵션으로 pass-through된다
  - 기본값은 `searchableKeys: ['children']`, `flatten: true`
  - 필요하면 override 가능하다

```js
const allGroups = patchmap.selector('$..[?(@.type=="group")]');
const raw = patchmap.selector('$', { flatten: false });
```

### `rotation`

world view 회전 컨트롤러다. 단위는 degree다.

- `rotation.value`
- `rotation.set(value)`
- `rotation.rotateBy(delta)`
- `rotation.reset()`

### `flip`

world view 반전 컨트롤러다.

- `flip.x`
- `flip.y`
- `flip.set({ x, y })`
- `flip.toggleX()`
- `flip.toggleY()`
- `flip.reset()`

## 5. 인스턴스 프로퍼티

### `app`

초기화 후 `PIXI.Application` 인스턴스.

### `viewport`

초기화 후 `pixi-viewport` 인스턴스.

- plugin 제어는 `interactions.md` 참고

### `world`

실제 element tree가 붙는 루트 컨테이너.

### `theme`

현재 테마 getter. 얕은 복사본을 반환한다.

### `undoRedoManager`

현재 인스턴스가 사용하는 history 관리자.

- 상세는 `history-and-transformer.md`

### `stateManager`

현재 인스턴스의 상태 머신 관리자.

- 상세는 `interactions.md`

### `transformer`

현재 연결된 `Transformer` 인스턴스.

- setter에 `Transformer`가 아닌 값을 넣으면 `console.error` 후 `null` 처리
- 기존 transformer가 있으면 교체 전에 destroy

### `animationContext`

GSAP context getter. draw/destroy 시 `revert()` 대상이다.

### `event`

canvas event facade다.

- `add(opts)`
- `remove(id)`
- `removeAll()`
- `on(id)`
- `off(id)`
- `get(id)`
- `getAll()`

상세 규약은 `interactions.md` 참고.

## 6. 종료와 재초기화

### `destroy()`

현재 인스턴스를 정리한다.

- history listener 제거
- animation context revert
- state reset/destroy
- canvas event 제거
- viewport destroy
- app destroy
- canvas wrapper DOM 제거
- resize observer disconnect
- 내부 참조 초기화
- `patchmap:destroyed` emit
- listener 전체 제거

현재 구현 기준으로는 `destroy()` 후에도 같은 인스턴스를 다시 `init()`할 수 있다. 내부 상태를 새로 만들어 두기 때문이다.

## 7. README의 `asset` 섹션에 대한 보정

현재 구현에는 `patchmap.asset` 같은 공개 메서드/프로퍼티가 없다. README의 `asset` 항목은 Pixi `Assets` 일반 문서를 가리키는 참고 링크에 가깝다.

실제 `Patchmap` 공개 표면에서 asset과 직접 연결되는 부분은 다음 둘이다.

- `init({ assets })`
- component / element의 `source` 필드가 Pixi asset alias를 참조할 수 있다는 점

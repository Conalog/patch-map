# PATCH MAP
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Conalog/patch-map)

[English](./README.md) | 한국어

PATCH MAP은 PATCH 서비스의 요구 사항을 충족시키기 위해 `pixi.js`와 `pixi-viewport`를 기반으로 최적화된 캔버스 라이브러리입니다.
<br/>
따라서 이를 사용하기 위해서는 아래 두 라이브러리에 대한 이해가 필수적입니다.

- **[pixi.js](https://github.com/pixijs/pixijs)**  
- **[pixi-viewport](https://github.com/pixi-viewport/pixi-viewport)**  

<br/>


## 목차

- [🚀 시작하기](#-시작하기)
  - [설치](#설치)
  - [기본 예제](#기본-예제)
- [Patchmap](#patchmap)
  - [init(el, options)](#initel-options)
  - [destroy()](#destroy)
  - [draw(data)](#drawdata)
  - [update(options)](#updateoptions)
  - [event](#event)
  - [viewport](#viewport)
  - [asset](#asset)
  - [focus(ids)](#focusids)
  - [fit(ids, options)](#fitids-options)
  - [selector(path)](#selectorpath)
  - [stateManager](#statemanager)  
  - [SelectionState](#selectionstate)
  - [Transformer](#transformer)
- [undoRedoManager](#undoredomanager)
  - [execute(command, options)](#executecommand-options)
  - [undo()](#undo)
  - [redo()](#redo)
  - [canUndo()](#canundo)
  - [canRedo()](#canredo)
  - [clear()](#clear)
- [📢 사용 가능한 전체 이벤트 목록](#-사용-가능한-전체-이벤트-목록)
- [🧑‍💻 개발](#-개발)
  - [개발 환경 세팅](#개발-환경-세팅)
  - [VSCode 통합](#vscode-통합)
- [🤝 기여하기](#-기여하기)
- [📄 라이선스](#라이선스)
- [🔤 Fira Code](#fira-code)


## 🚀 시작하기

### 설치

#### NPM

```sh
npm install @conalog/patch-map
```

#### CDN

```html
<script src="https://cdn.jsdelivr.net/npm/pixi.js@latest/dist/pixi.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@conalog/patch-map@latest/dist/index.umd.js"></script>
```

### 기본 예제

시작하는 데 도움이 되는 간단한 예제입니다: [예제](https://codesandbox.io/p/sandbox/yvjrpx)

```js
import { Patchmap } from '@conalog/patch-map';

const data = [
  {
    type: 'group',
    id: 'group-id-1',
    label: 'group-label-1',
    children: [{
      type: 'grid',
      id: 'grid-1',
      label: 'grid-label-1',
      cells: [ [1, 0, 1], [1, 1, 1] ],
      gap: 4,
      item: {
        size: { width: 40, height: 80 },
        components: [
          {
            type: 'background',
            source: {
              type: 'rect',
              fill: 'white',
              borderWidth: 2,
              borderColor: 'primary.dark',
              radius: 4,
            }
          },
          { type: 'icon', source: 'loading', tint: 'black', size: 16 },
        ]
      },
    }],
    attrs: { x: 100, y: 100, },
  }
];

const patchmap = new Patchmap();

await patchmap.init(document.body);

patchmap.draw(data);
```

<br/>


## Patchmap

### `init(el, options)`

PATCH MAP을 초기화하는 것으로, 1번만 실행되어야 합니다.

```js
await patchmap.init(el, {
  app: { background: '#CCCCCC' },
  viewport: {
    plugins: { decelerate: { disabled: true } }
  },
  theme: {
    primary: { default: '#c2410c' }
  }
});
```

#### **Options**

렌더링 동작을 사용자 정의하려면 다음 옵션을 사용하세요:

- `app`
  - `pixi.js Application options` ([Docs](https://pixijs.download/release/docs/app.ApplicationOptions.html))  

  Default:
  ```js
  {
    background: '#FAFAFA',
    antialias: true,
    autoDensity: true,
    resolution: 2,
  }
  ```

- `viewport`
  - `Viewport options` ([Docs](https://viewport.pixijs.io/jsdoc/Viewport.html))  
  - `plugins` - Viewport의 동작을 향상시키거나 수정하는 플러그인입니다. 새로운 플러그인을 추가하거나 기본 플러그인을 비활성화할 수 있습니다.  
  
  Default:
  ```js
  {
    passiveWheel: false,
    plugins: {
      clampZoom: { minScale: 0.5, maxScale: 30 },
      drag: {},
      wheel: {},
      decelerate: {},
    },
  }
  ```

- `theme`  
  Default:
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

<br/>

### `destroy()`
메모리 누수를 방지하고자 등록된 Asset 및 Application을 destroy합니다.

<br/>

### `draw(data)`
캔버스에 맵 데이터를 렌더링합니다.  
```js
const data = [
  {
    type: 'group',
    id: 'group-id-1',
    label: 'group-label-1',
    children: [{
      type: 'grid',
      id: 'grid-1',
      label: 'grid-label-1',
      cells: [ [1, 0, 1], [1, 1, 1] ],
      gap: 4,
      item: {
        size: { width: 40, height: 80 },
        components: [
          {
            type: 'background',
            source: {
              type: 'rect',
              fill: 'white',
              borderWidth: 2,
              borderColor: 'primary.dark',
              radius: 4,
            }
          },
          { type: 'icon', source: 'loading', tint: 'black', size: 16 },
        ]
      },
    }],
    attrs: { x: 100, y: 100, },
  }
];
patchmap.draw(data);
```

**Data Schema**

draw method가 요구하는 **데이터 구조**입니다.  
**자세한 타입 정의**는 [data.d.ts](src/display/data-schema/data.d.ts) 파일을 참조하세요.

#### Spacing shorthand

컴포넌트의 `margin`, element/item의 `padding` 같은 박스형 spacing 필드는 `draw(data)`와 `update({ changes })` 모두에서 아래 입력을 정규화합니다.

- `number` - 네 방향 모두 같은 값을 적용합니다.
- `{ x, y }` - `x`는 `left/right`, `y`는 `top/bottom`에 적용합니다.
- `{ top, right, bottom, left }` - 각 방향 값을 그대로 적용합니다.
- 축 키와 edge 키를 함께 사용한 경우 - `top/right/bottom/left`가 `x` 또는 `y`로부터 만들어진 값을 덮어씁니다.

```js
patchmap.update({
  path: '$..[?(@.id=="item-1")]',
  changes: {
    padding: { bottom: 12, x: 3 },
    components: [
      {
        type: 'text',
        margin: { top: 10, x: 5 },
      },
    ],
  },
});
```

<br/>

### `update(options)`
캔버스에 렌더링된 객체의 속성을 업데이트합니다. 기본적으로 변경된 속성만 반영하지만, refresh 또는 mergeStrategy 옵션을 통해 업데이트 동작을 정밀하게 제어할 수 있습니다.

#### **`Options`**
- `path` (optional, string) - [jsonpath](https://github.com/JSONPath-Plus/JSONPath) 문법에 따른 selector로, 이벤트가 적용될 객체를 선택합니다.
- `elements` (optional, object \| array) - 업데이트할 하나 이상의 객체에 대한 직접 참조입니다. 단일 객체 또는 배열을 허용합니다. ([selector](#selectorpath)에서 반환된 객체 등).
- `changes` (optional, object) - 적용할 새로운 속성 (예: 색상, 텍스트 가시성). `refresh` 옵션을 `true`로 설정할 경우 생략할 수 있습니다.
- `history` (optional, boolean \| string) - 해당 `update` 메소드에 의한 변경 사항을 `undoRedoManager`에 기록할 것인지 결정합니다. 이전에 저장된 기록의 historyId와 일치하는 문자열이 제공되면, 두 기록이 하나의 실행 취소/재실행 단계로 병합됩니다.
- `relativeTransform` (optional, boolean) - `position`, `rotation`, `angle` 값에 대해서 상대값을 이용할 지 결정합니다. 만약, `true` 라면 전달된 값을 객체의 값에 더합니다.
- `mergeStrategy` (optional, string) - `changes` 객체를 기존 속성에 적용하는 방식을 결정합니다. 기본값은 `'merge'` 입니다.
  - `'merge'` (기본값): `changes` 객체를 기존 속성에 깊게 병합(deep merge)합니다. 객체 내의 개별 속성이 업데이트됩니다.
  - `'replace'`: `changes`에 지정된 최상위 속성을 통째로 교체합니다. `undo`를 실행하거나 `style`, `components`와 같은 복잡한 속성을 특정 상태로 완전히 리셋할 때 유용합니다.
- `refresh` (optional, boolean) - `true`로 설정하면, `changes`의 속성 값이 이전과 동일하더라도 모든 속성 핸들러를 강제로 다시 실행하여 객체를 "새로고침"합니다. 부모의 상태 변화에 따라 자식 객체를 다시 계산해야 할 때 유용합니다. 기본값은 `false` 입니다.

```js
// label이 "grid-label-1"인 객체들에 대해 변경 사항 적용
patchmap.update({
  path: `$..children[?(@.label=="grid-label-1")]`,
  changes: {
    item: {
      components: [{ type: 'icon', source: 'wifi' }],
    },
  },
});

// type이 "group"인 객체들에 대해 변경 사항 적용
patchmap.update({
  path: `$..children[?(@.type=="group")]`,
  changes: { 
    show: false
  }
});

// type이 "group"인 객체 내에 type이 "grid"인 객체에 대해 변경 사항 적용
patchmap.update({
  path: `$..children[?(@.type=="group")].children[?(@.type=="grid")]`,
  changes: {
    item: {
      components: [{ type: 'icon', tint: 'red' }],
    },
  },
});

// type이 "relations"인 모든 객체를 찾아서(refresh: true로) 강제로 전체 속성 업데이트(새로고침) 수행
patchmap.update({
  path: `$..children[?(@.type==="relations")]`,
  refresh: true
});
```

<br/>

### `event`
캔버스 및 다양한 컴포넌트에 대한 이벤트를 관리합니다.  
더블 클릭과 같은 여러 이벤트 동작에 대해 알고자 한다면, 해당 [addEventListener documentation](https://pixijs.download/release/docs/scene.Container.html#addEventListener) 문서를 참고하길 바랍니다.

#### add(options)
- `id` (optional, string) - 이벤트의 고유 식별자입니다. 나중에 이벤트를 관리하는 데 유용합니다.
- `path` (required, string) - [jsonpath](https://github.com/JSONPath-Plus/JSONPath) 문법에 따른 selector로, 이벤트가 적용될 객체를 선택합니다.
- `action` (required, string) - 이벤트 유형을 지정합니다. 예를 들어, 'click', 'pointerdown' 등이 있습니다.
- `fn` (required, function) - 이벤트가 발생했을 때 실행될 콜백 함수입니다. 이벤트 객체를 매개변수로 받습니다.

```js
const id = patchmap.event.add({
  path: '$',
  action: 'click tap',
  fn: (e) => {
    console.log(e.target.id)
  }
});

patchmap.event.add({
  id: 'pointerdown-event',
  path: '$..[?(@.label=="group-label-1")]',
  action: 'pointerdown',
  fn: (e) => {
    console.log(e.target.type);
  }
});

patchmap.event.add({
  id: 'double-click',
  path: '$',
  action: 'click',
  fn: (e) => {
    if (e.detail === 2 && e.target.type === 'canvas') {
      console.log('Double click detected on canvas');
    }
  }
});
```

```js
// 'pointerdown-event' & 'double-click' 이벤트를 활성화합니다.
patchmap.event.on('pointerdown-event double-click');

// 'pointerdown-event' & 'double-click' 이벤트를 비활성화합니다.
patchmap.event.off('pointerdown-event double-click');

// 'pointerdown-event' & 'double-click' 이벤트를 제거합니다.
patchmap.event.remove('pointerdown-event');

// 등록되어 있는 'double-click' 이벤트를 가져옵니다.
const event = patchmap.event.get('double-click');

// 등록된 모든 이벤트를 가져옵니다.
const events = patchmap.event.getAll();
```

<br/>

### `viewport`
- viewport 플러그인에 대한 자세한 내용은 [pixi-viewport](https://viewport.pixijs.io/jsdoc/Viewport.html)를 참조하세요.
```js
patchmap.viewport.plugin.add({
  mouseEdges: { speed: 16, distance: 20, allowButtons: true },
});

patchmap.viewport.plugin.stop('mouse-edges');

patchmap.viewport.plugin.start('mouse-edges');

patchmap.viewport.plugin.remove('mouse-edges');
```
<br/>


### `asset`
- asset에 대한 내용은 [pixi.js Assets](https://pixijs.download/release/docs/assets.Assets.html)를 참조하세요.

<br/>

### `focus(ids, opts)`
- `ids` (optional, string \| string[]) - focus할 객체 ID를 나타내는 문자열 또는 문자열 배열입니다.
- `opts` (optional, object)
  `filter` (`(obj) => boolean`) - 최종 viewport 대상 집합에서 유지할 객체만 남깁니다. `true`를 반환하면 포함됩니다.
- `ids`를 지정하지 않으면 `relations`를 제외한 top-level 관리 대상 element가 기본 focus 대상 집합이 됩니다.
- `filter`는 `ids`를 명시한 경우에도 항상 마지막에 적용됩니다.
- 옵션만 전달할 때는 `ids` 자리에 `null` 또는 `undefined`를 넣습니다.
- `group` 같은 컨테이너 element는 viewport bounds 계산 시 필터링된 관리 대상 하위 element 기준으로 반영됩니다.
```js
// 기본 대상 집합(top-level 관리 대상 element, relations 제외)을 기준으로 focus
patchmap.focus()

// id가 'group-id-1'인 객체를 기준으로 focus
patchmap.focus('group-id-1')

// id가 'grid-1'인 객체를 기준으로 focus
patchmap.focus('grid-1')

// id가 'item-1'과 'item-2'인 객체들을 기준으로 focus
patchmap.focus(['item-1', 'item-2'])

// background 이미지를 제외하고 전체 element를 기준으로 focus
patchmap.focus(null, {
  filter: (obj) => obj.id !== 'background-image',
})

// 명시한 ids를 기준으로 찾은 뒤 filter를 적용
patchmap.focus(['item-1', 'item-2'], {
  filter: (obj) => obj.id !== 'item-2',
})
```

<br/>

### `fit(ids, options)`
- `ids` (optional, string \| string[]) - fit할 객체 ID를 나타내는 문자열 또는 문자열 배열입니다.
- `options` (optional, object)
  - `filter` (`(obj) => boolean`) - 최종 viewport 대상 집합에서 유지할 객체만 남깁니다. `true`를 반환하면 포함됩니다.
  - `padding` (optional, number \| { x?: number, y?: number }) - 축 기반 fit 패딩입니다. `fit()`은 기본적으로 각 방향에 `16` 패딩을 사용합니다. 숫자를 전달하면 네 방향 모두 그 값으로 대체되고, 객체를 전달하면 지정한 축만 덮어쓰며 나머지는 `16`을 유지합니다.
  - `fit()`의 `padding`은 숫자 또는 `{ x, y }`만 허용합니다. `{ top, right, bottom, left }` 같은 edge 기반 키는 유효하지 않습니다.
  - `ids`를 지정하지 않으면 `relations`를 제외한 top-level 관리 대상 element가 기본 fit 대상 집합이 됩니다.
  - `filter`는 `ids`를 명시한 경우에도 항상 마지막에 적용됩니다.
  - 옵션만 전달할 때는 `ids` 자리에 `null` 또는 `undefined`를 넣습니다. 첫 번째 인자에 객체 하나만 넘기면 `options`가 아니라 `ids`로 해석됩니다.
  - `group` 같은 컨테이너 element는 viewport bounds 계산 시 필터링된 관리 대상 하위 element 기준으로 반영됩니다.
```js
// 기본 대상 집합(top-level 관리 대상 element, relations 제외)을 기준으로 fit
patchmap.fit()

// 기본 대상 집합에 네 방향 모두 24px 패딩을 적용해 fit
patchmap.fit(undefined, { padding: 24 })

// id가 'group-id-1'인 객체를 기준으로 fit
patchmap.fit('group-id-1')

// id가 'grid-1'인 객체를 기준으로 fit
patchmap.fit('grid-1')

// id가 'item-1'과 'item-2'인 객체들을 기준으로 fit
patchmap.fit(['item-1', 'item-2'])

// background 이미지를 제외하고 전체 element를 기준으로 fit
patchmap.fit(null, {
  filter: (obj) => obj.id !== 'background-image',
})

// 대상 객체에 네 방향 모두 24px 패딩으로 fit
patchmap.fit('group-id-1', { padding: 24 })

// top/bottom=10px, left/right=5px로 fit
patchmap.fit('grid-1', { padding: { y: 10, x: 5 } })

// 명시한 ids를 기준으로 찾은 뒤 filter와 padding을 함께 적용
patchmap.fit(['item-1', 'item-2'], {
  filter: (obj) => obj.id !== 'item-2',
  padding: { y: 10, x: 5 },
})
```

<br/>

### `selector(path)`

[jsonpath](https://github.com/JSONPath-Plus/JSONPath) 문법에 따른 객체 탐색기입니다.

```js
const result = patchmap.selector('$..[?(@.label=="group-label-1")]')
```

<br/>

### `stateManager`

`patchmap` 인스턴스의 이벤트 상태를 관리하는 `StateManager` 인스턴스입니다. `State` 클래스를 상속받아 자신만의 상태를 정의하고, `stateManager`에 등록하여 사용할 수 있습니다. 이를 통해 사용자의 복잡한 인터랙션을 체계적으로 관리할 수 있습니다.

`patchmap.draw()`가 실행되면 기본적으로 `selection`이라는 이름의 `SelectionState`가 등록됩니다.

```js
// selection 상태를 활성화하여 객체 선택 및 드래그 선택 기능을 사용합니다.
patchmap.stateManager.setState('selection', {
  draggable: true,
  selectUnit: 'grid',
  filter: (obj) => obj.type !== 'relations',
  onClick: (obj, event) => {
    console.log('Selected:', obj);
    // 선택된 객체를 transformer에 할당
    if (patchmap.transformer) {
      patchmap.transformer.elements = obj;
    }
  },
  onDrag: (objs, event) => {
    console.log('Drag Selected:', objs);
    if (patchmap.transformer) {
      patchmap.transformer.elements = objs;
    }
  },
});
```

#### 사용자 정의 상태 만들기

`State`를 상속하여 새로운 상태 클래스를 만들고, `stateManager`에 등록하여 사용할 수 있습니다.

```js
import { State, PROPAGATE_EVENT } from '@conalog/patch-map';

// 1. 새로운 상태 클래스 정의
class CustomState extends State {
  // 이 상태가 처리할 이벤트를 static 속성으로 정의합니다.
  static handledEvents = ['onpointerdown', 'onkeydown'];

  enter(store, customOptions) {
    super.enter(store);
    console.log('CustomState가 시작되었습니다.', customOptions);
  }

  exit() {
    console.log('CustomState가 종료되었습니다.');
    super.exit();
  }

  onpointerdown(event) {
    console.log('Pointer down in CustomState');
    // 이벤트를 여기서 처리하고 전파를 중지합니다.
  }

  onkeydown(event) {
    if (event.key === 'Escape') {
      // 'selection' 상태(기본 상태)로 전환합니다.
      this.store.stateManager.setState('selection');
    }
    // 이벤트를 스택의 다음 상태로 전파하려면 PROPAGATE_EVENT를 반환합니다.
    return PROPAGATE_EVENT;
  }
}

// 2. StateManager에 등록
patchmap.stateManager.register('custom', CustomState);

// 3. 필요할 때 상태 전환
patchmap.stateManager.setState('custom', { message: 'Hello World' });
```

<br/>

### `SelectionState`
사용자의 선택 및 드래그 이벤트를 처리하는 기본 상태(State)입니다. `patchmap.draw()`가 실행되면 'selection'이라는 이름으로 `stateManager`에 자동으로 등록됩니다. `stateManager.setState('selection', options)`를 호출하여 활성화하고 설정을 전달할 수 있습니다.

- `draggable` (optional, boolean): 드래그를 통한 다중 선택 활성화 여부를 결정합니다.
- `paintSelection` (optional, boolean): 마우스를 누른 채 이동하는 경로상의 객체들을 실시간으로 누적 선택하는 '페인트 선택' 기능을 활성화합니다. 활성화 시 기존의 사각형 범위 선택 대신, 붓으로 칠하듯 자유로운 궤적을 따라 원하는 객체들을 훑어서 선택할 수 있습니다.
- `selectUnit` (optional, string): 선택 시 반환될 논리적 단위를 지정합니다. 기본값은 `'entity'` 입니다.
  - `'entity'`: 개별 객체를 선택합니다.
  - `'closestGroup'`: 선택된 객체에서 가장 가까운 상위 그룹을 선택합니다.
  - `'highestGroup'`: 선택된 객체에서 가장 최상위 그룹을 선택합니다.
  - `'grid'`: 선택된 객체가 속한 그리드를 선택합니다.
- `drillDown` (optional, boolean): 더블 클릭(또는 연속 클릭) 시 중첩된 그룹 내부로 단계별로 진입하며 하위 요소를 탐색하여 선택하는 기능을 활성화합니다. 활성화 시 이미 상위 그룹이 선택된 상태에서 다시 클릭하면, 해당 클릭 지점에 있는 더 깊은 단계의 자식 객체를 찾아 선택합니다.
- `deepSelect` (optional, boolean): Ctrl(Windows) 또는 Meta(Mac) 키를 누른 상태에서 클릭할 때, 설정된 selectUnit과 관계없이 즉시 하위 요소(기본 'grid' 단위)를 검색하여 선택할 수 있는 기능을 활성화합니다. 복잡한 그룹 구조를 거치지 않고 특정 요소를 빠르게 선택하고 싶을 때 유용합니다.
- `filter` (optional, function): 선택 대상 객체를 조건에 따라 필터링할 수 있는 함수입니다.
- `selectionBoxStyle` (optional, object): 드래그 선택 시 표시되는 사각형의 스타일을 지정합니다.
  - `fill` (object): 채우기 스타일. 기본값: `{ color: '#9FD6FF', alpha: 0.2 }`.
  - `stroke` (object): 테두리 스타일. 기본값: `{ width: 2, color: '#1099FF' }`.

#### 이벤트 콜백
- `onDown` (optional, function): 포인터를 눌렀을 때 '즉시' 호출됩니다. 'Select-on-Down' UX(즉각적인 선택 피드백)를 구현할 때 사용합니다.
- `onUp` (optional, function):  드래그가 아닐 경우, `pointerup` 시점에 호출됩니다.
- `onClick` (optional, function): '클릭'이 '완료'되었을 때 호출됩니다. 탭(tap)도 동일하게 onClick으로 처리됩니다. 더블클릭이 아닐 때만 호출됩니다.
- `onDoubleClick` (optional, function): '더블클릭'이 '완료'되었을 때 호출됩니다. `e.detail === 2`를 기반으로 호출됩니다.
- `onRightClick` (optional, function): '우클릭'이 '완료'되었을 때 호출됩니다. 캔버스 영역 내에서 브라우저 기본 컨텍스트 메뉴가 나타나지 않도록 자동으로 방지됩니다.
- `onDragStart` (optional, function): 드래그(다중 선택)가 '시작'되는 시점 (일정 거리 이상 이동)에 1회 호출됩니다.
- `onDrag` (optional, function): 드래그가 '진행'되는 동안 실시간으로 호출됩니다.
- `onDragEnd` (optional, function): 드래그가 '종료'되었을 때 (`pointerup`) 호출됩니다.
- `onOver` (optional, function): 포인터가 (드래그 중이 아닐 때) 객체 위로 이동했을 때 호출됩니다.

```js
patchmap.stateManager.setState('selection', {
  draggable: true,
  selectUnit: 'grid',
  filter: (obj) => obj.type !== 'relations',

  // '클릭' 완료 시 선택을 확정합니다.
  onClick: (target, event) => {
    console.log('Clicked:', target?.id);
    if (patchmap.transformer) {
      patchmap.transformer.elements = target ? [target] : [];
    }
  },

  // '더블클릭' 시 다른 동작을 수행합니다. (이 경우 onClick은 호출되지 않습니다)
  onDoubleClick: (target, event) => {
    console.log('Double Clicked:', target?.id);
    // 예: patchmap.stateManager.setState('textEdit', target);
  },

  // 드래그가 끝났을 때 최종 선택을 확정합니다.
  onDragEnd: (selected, event) => {
    console.log('Drag Selected:', selected.map(s => s.id));
    if (patchmap.transformer) {
      patchmap.transformer.elements = selected;
    }
  },
  
  // onDown: (target) => {
  //   if (patchmap.transformer) {
  //     patchmap.transformer.elements = target ? [target] : [];
  //   }
  // },
  // onDragStart: () => {
  //   if (patchmap.transformer) {
  //     patchmap.transformer.elements = [];
  //   }
  // },
});
```

<br/>

### `Transformer`

선택된 요소의 외곽선을 시각적으로 표시하고, 크기 조절이나 회전과 같은 변형 작업을 수행하기 위한 시각적 도구입니다. `Transformer` 인스턴스를 생성하여 `patchmap.transformer`에 할당하면 활성화됩니다.

#### new Transformer(options)

`Transformer` 인스턴스를 생성할 때 다음과 같은 옵션을 전달하여 동작을 제어할 수 있습니다.

  - `elements` (optional, Array<PIXI.DisplayObject>): 초기에 외곽선을 표시할 요소들의 배열입니다.
  - `wireframeStyle` (optional, object): 외곽선의 스타일을 지정합니다.
      - `thickness` (number): 선의 두께 (기본값: `1.5`).
      - `color` (string): 선의 색상 (기본값: `'#1099FF'`).
  - `boundsDisplayMode` (optional, string): 외곽선을 표시할 단위를 결정합니다 (기본값: `'all'`).
      - `'all'`: 그룹의 전체 외곽선과 그룹 내 개별 요소의 외곽선을 모두 표시합니다.
      - `'groupOnly'`: 그룹의 전체 외곽선만 표시합니다.
      - `'elementOnly'`: 그룹 내 개별 요소의 외곽선만 표시합니다.
      - `'none'`: 외곽선을 표시하지 않습니다.
  - `resizeHandles` (optional, boolean): 그룹 리사이즈 핸들과 엣지 히트 타깃을 활성화합니다 (기본값: `false`).
  - `resizeHistory` (optional, boolean): 리사이즈 변경 사항을 `undoRedoManager`에 기록할지 결정합니다 (기본값: `false`). 활성화하면 한 번의 드래그 제스처 내 업데이트가 하나의 실행 취소/재실행 단계로 묶입니다.

```js
import { Patchmap, Transformer } from '@conalog/patch-map';

const patchmap = new Patchmap();
await patchmap.init(element);
patchmap.draw(data);

// 1. Transformer 인스턴스 생성 및 할당
const transformer = new Transformer({
  wireframeStyle: {
    thickness: 2,
    color: '#FF00FF',
  },
  boundsDisplayMode: 'groupOnly',
});
patchmap.transformer = transformer;

// 2. 선택된 객체를 transformer의 elements 속성에 할당하여 외곽선 표시
const selectedObject = patchmap.selector('$..[?(@.id=="group-id-1")]')[0];
patchmap.transformer.elements = [selectedObject];

// 선택 해제 시
patchmap.transformer.elements = [];
```

#### transformer.selection

`Transformer`의 선택 상태를 전문적으로 관리하는 `SelectionModel` 인스턴스입니다. 이를 통해 선택된 요소를 프로그래밍 방식으로 제어할 수 있습니다.

```js
// 선택 요소 추가, 제거, 교체
transformer.selection.add(item1);
transformer.selection.remove(item1);
transformer.selection.set([item2]);

// 선택 변경 이벤트 구독
transformer.on('update_elements', ({ current, added, removed }) => {
  console.log('현재 선택:', current);
});
```

<br/>

## undoRedoManager
`UndoRedoManager` 클래스의 인스턴스입니다. 이 매니저는 실행된 명령을 기록하고, 이를 통해 실행 취소(undo) 및 재실행(redo) 기능을 제공합니다.

### method

#### `execute(command, options)`
주어진 명령을 실행하고, 이를 기록합니다. `options` 객체를 통해 `historyId`를 설정할 수 있습니다.

#### `undo()`
마지막으로 실행된 명령을 취소합니다.
```js
undoRedoManager.undo();
```

#### `redo()`
마지막으로 취소된 명령을 재실행합니다.
```js
undoRedoManager.redo();
```

#### `canUndo()`

실행 취소가 가능한지 여부를 반환합니다.

#### `canRedo()`

재실행이 가능한지 여부를 반환합니다.

#### `clear()`

모든 명령 기록을 초기화합니다.

<br/>

## 📢 사용 가능한 전체 이벤트 목록

이번 업데이트로 인해 구독 가능한 이벤트 목록입니다. `.on(eventName, callback)`을 사용하여 구독할 수 있습니다.

#### `Patchmap`

  * `patchmap:initialized`: `patchmap.init()`이 성공적으로 완료되었을 때 발생합니다.
  * `patchmap:draw`: `patchmap.draw()`를 통해 새로운 데이터가 렌더링되었을 때 발생합니다.
  * `patchmap:updated`: `patchmap.update()`를 통해 요소가 업데이트되었을 때 발생합니다.
  * `patchmap:destroyed`: `patchmap.destroy()`가 호출되어 인스턴스가 파괴될 때 발생합니다.

#### `UndoRedoManager`

  * `history:executed`: 새로운 커맨드가 실행 스택에 추가되었을 때 발생합니다.
  * `history:undone`: `undo()`가 실행되었을 때 발생합니다.
  * `history:redone`: `redo()`가 실행되었을 때 발생합니다.
  * `history:cleared`: `clear()`로 모든 히스토리가 삭제되었을 때 발생합니다.
  * `history:destroyed`: `destroy()`가 호출되었을 때 발생합니다.
  * `history:*`: 위의 모든 `history:` 네임스페이스 이벤트를 구독합니다.

#### `StateManager`

  * `state:pushed`: 새로운 상태가 스택에 추가되었을 때 발생합니다.
  * `state:popped`: 현재 상태가 스택에서 제거되었을 때 발생합니다.
  * `state:set`: `setState()`를 통해 상태 스택이 리셋되고 새로운 상태가 설정되었을 때 발생합니다.
  * `state:reset`: `resetState()`로 모든 상태가 제거되었을 때 발생합니다.
  * `state:destroyed`: `destroy()`가 호출되었을 때 발생합니다.
  * `modifier:activated`: 수정자(Modifier) 상태가 활성화되었을 때 발생합니다.
  * `modifier:deactivated`: 수정자(Modifier) 상태가 비활성화되었을 때 발생합니다.
  * `state:*`: 위의 모든 `state:` 네임스페이스 이벤트를 구독합니다.
  * `modifier:*`: 위의 모든 `modifier:` 네임스페이스 이벤트를 구독합니다.

#### `Transformer`

  * `update_elements`: `transformer.elements` 또는 `transformer.selection`의 내용이 변경될 때 발생합니다.

<br/>

## 🧑‍💻 개발

### 개발 환경 세팅

```sh
npm install      # 의존성 설치
npm run dev      # 개발 서버 시작
npm run build    # 라이브러리 빌드
npm run lint:fix # 코드 포맷팅 수정
```

### VSCode 통합

일관된 코드 포맷팅을 위해 Biome을 설정하세요.

1.  [Biome 확장](https://biomejs.dev/reference/vscode/)을 설치하세요.
2.  VSCode 설정을 업데이트하세요:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit"
  },
}
```
3. Biome이 특정 파일 형식을 포맷하지 않는 경우  
특정 확장자에 대해 개별적으로 설정을 추가하세요:
```json
{
  ...
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[json]": {
    "editor.defaultFormatter": "biomejs.biome"
  }
}
```

## 🤝 기여하기

기여 가이드, PR 템플릿, 작업 흐름은 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고하세요.

## 라이선스
- [MIT](./LICENSE)

### Third-party Code

`src/utils/zod-deep-strict-partial.js` 파일은 원래 Apache License 2.0 하에 라이선스된 코드를 포함합니다. 원래의 저작권 고지 및 라이선스 조건이 파일에 보존되어 있습니다.

## Fira Code
이 프로젝트는 캔버스 상에서 문자 가독성을 높이기 위해 [Fira Code](https://github.com/tonsky/FiraCode) 폰트를 사용합니다.  
Fira Code는 [SIL Open Font License, Version 1.1](https://scripts.sil.org/OFL) 하에 배포되며, 라이선스 사본은 [OFL-1.1.txt](./src/assets/fonts/OFL-1.1.txt)에 제공됩니다.

# PATCH MAP
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
  - [fit(ids)](#fitids)
  - [selector(path)](#selectorpath)
  - [select(options)](#selectoptions)
- [undoRedoManager](#undoredomanager)
  - [execute(command, options)](#executecommand-options)
  - [undo()](#undo)
  - [redo()](#redo)
  - [canUndo()](#canundo)
  - [canRedo()](#canredo)
  - [clear()](#clear)
  - [subscribe(listener)](#subscribelistener)  
- [🧑‍💻 개발](#-개발)
  - [개발 환경 세팅](#개발-환경-세팅)
  - [VSCode 통합](#vscode-통합)
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

<br/>

### `update(options)`
캔버스에 렌더링된 객체의 속성을 업데이트합니다. 기본적으로 변경된 속성만 반영하지만, refresh 또는 arrayMerge 옵션을 통해 업데이트 동작을 정밀하게 제어할 수 있습니다.

#### **`Options`**
- `path` (optional, string) - [jsonpath](https://github.com/JSONPath-Plus/JSONPath) 문법에 따른 selector로, 이벤트가 적용될 객체를 선택합니다.
- `elements` (optional, object \| array) - 업데이트할 하나 이상의 객체에 대한 직접 참조입니다. 단일 객체 또는 배열을 허용합니다. ([selector](#selectorpath)에서 반환된 객체 등).
- `changes` (optional, object) - 적용할 새로운 속성 (예: 색상, 텍스트 가시성). `refresh` 옵션을 `true`로 설정할 경우 생략할 수 있습니다.
- `history` (optional, boolean \| string) - 해당 `update` 메소드에 의한 변경 사항을 `undoRedoManager`에 기록할 것인지 결정합니다. 이전에 저장된 기록의 historyId와 일치하는 문자열이 제공되면, 두 기록이 하나의 실행 취소/재실행 단계로 병합됩니다.
- `relativeTransform` (optional, boolean) - `position`, `rotation`, `angle` 값에 대해서 상대값을 이용할 지 결정합니다. 만약, `true` 라면 전달된 값을 객체의 값에 더합니다.
- `arrayMerge` (optional, string) - 배열 속성을 병합하는 방식을 결정합니다. 기본값은 `'merge'` 입니다.
  - `'merge'` (기본값): 대상 배열과 소스 배열을 병합합니다.
  - `'replace'`: 대상 배열을 소스 배열로 완전히 교체하여, 특정 상태로 강제할 때 유용합니다.
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

### `focus(ids)`
- `ids` (optional, string \| string[]) - focus할 객체 ID를 나타내는 문자열 또는 문자열 배열입니다. 지정하지 않으면 캔버스 전체 객체가 대상이 됩니다.
```js
// 전체 캔버스 객체를 기준으로 focus
patchmap.focus()

// id가 'group-id-1'인 객체를 기준으로 focus
patchmap.focus('group-id-1')

// id가 'grid-1'인 객체를 기준으로 focus
patchmap.focus('grid-1')

// id가 'item-1'과 'item-2'인 객체들을 기준으로 focus
patchmap.focus(['item-1', 'item-2'])
```

<br/>

### `fit(ids)`
- `ids` (optional, string \| string[]) - fit할 객체 ID를 나타내는 문자열 또는 문자열 배열입니다. 지정하지 않으면 캔버스 전체 객체가 대상이 됩니다.
```js
// 전체 캔버스 객체를 기준으로 fit
patchmap.fit()

// id가 'group-id-1'인 객체를 기준으로 fit
patchmap.fit('group-id-1')

// id가 'grid-1'인 객체를 기준으로 fit
patchmap.fit('grid-1')

// id가 'item-1'과 'item-2'인 객체들을 기준으로 fit
patchmap.fit(['item-1', 'item-2'])
```

<br/>

### `selector(path)`
[jsonpath](https://github.com/JSONPath-Plus/JSONPath) 문법에 따른 객체 탐색기입니다.

```js
const result = patchmap.selector('$..[?(@.label=="group-label-1")]')
```

<br/>

### `select(options)`
선택 이벤트를 활성화하여, 사용자가 화면에서 선택한 객체들을 감지하고 콜백 함수에 전달합니다.
`draw` 메소드 이후에 실행되어야 합니다.
- `enabled` (optional, boolean): 선택 이벤트의 활성화 여부를 결정합니다.
- `draggable` (optional, boolean): 드래그 활성화 여부를 결정합니다.
- `isSelectGroup` (optional, boolean): group 객체를 선택할지 결정합니다.
- `isSelectGrid` (optional, boolean): grid 객체를 선택할지 결정합니다.
- `filter` (optional, function): 선택 대상 객체를 조건에 따라 필터링할 수 있는 함수입니다.
- `onSelect` (optional, function): 선택이 발생할 때 호출될 콜백 함수입니다.
- `onOver` (optional, function): 포인터 오버가 발생할 때 호출될 콜백 함수입니다.
- `onDragSelect` (optional, function): 드래그가 발생할 때 호출될 콜백 함수입니다.

```js
patchmap.select({
  enabled: true,
  draggable: true,
  isSelectGroup: false,
  isSelectGrid: true,
  filter: (obj) => obj.type !== 'relations',
  onSelect: (obj) => {
    console.log(obj);
  },
  onOver: (obj) => {
    console.log(obj);
  },
  onDragSelect: (objs) => {
    console.log(objs);
  }
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

#### `subscribe(listener)`
리스너를 구독하여 명령 관련 변경 사항이 이루어졌을 때, 해당 리스너가 호출됩니다. 반환된 함수를 호출하여 구독을 취소할 수 있습니다.
```js
let canUndo = false;
let canRedo = false;

const unsubscribe = undoRedoManager.subscribe((manager) => {
  canUndo = manager.canUndo();
  canRedo = manager.canRedo();
});
```

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
1.	[Biome 확장](https://biomejs.dev/reference/vscode/)을 설치하세요.
2.	VSCode 설정을 업데이트하세요:
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

## 라이선스
- [MIT](./LICENSE)

### Third-party Code

`src/utils/zod-deep-strict-partial.js` 파일은 원래 Apache License 2.0 하에 라이선스된 코드를 포함합니다. 원래의 저작권 고지 및 라이선스 조건이 파일에 보존되어 있습니다.

## Fira Code
이 프로젝트는 캔버스 상에서 문자 가독성을 높이기 위해 [Fira Code](https://github.com/tonsky/FiraCode) 폰트를 사용합니다.  
Fira Code는 [SIL Open Font License, Version 1.1](https://scripts.sil.org/OFL) 하에 배포되며, 라이선스 사본은 [OFL-1.1.txt](./src/assets/fonts/OFL-1.1.txt)에 제공됩니다.
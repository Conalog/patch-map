# PATCH MAP
[English](./README.md) | 한국어

PATCH MAP은 PATCH 서비스의 요구 사항을 충족시키기 위해 `pixijs`와 `pixi-viewport`를 기반으로 최적화된 캔버스 라이브러리입니다.
유연하고 빠른 2D 콘텐츠 생성을 가능하게 합니다.

- **[PixiJS](https://github.com/pixijs/pixijs)**  
- **[Pixi-Viewport](https://github.com/pixi-viewport/pixi-viewport)**  

<br/>


## 목차

- [🚀 시작하기](#-시작하기)
  - [설치](#설치)
  - [기본 예제](#기본-예제)
- [🛠 API 문서](#-api-문서)
  - [init(el, options)](#initel-options)
  - [draw(data)](#drawdata)
  - [update(options)](#updateoptions)
  - [event](#event)
  - [asset](#asset)
  - [focus(id)](#focusid)
  - [fit(id)](#fitid)
  - [selector(path)](#selectorpath)
- [🧑‍💻 개발](#-개발)
  - [개발 환경 세팅](#개발-환경-세팅)
  - [VSCode 통합](#vscode-통합)
- [📄 라이선스](#라이선스)
- [🔤 Fira Code](#fira-code)


## 🚀 시작하기

### 설치
npm을 이용한 `@conalog/patch-map` 설치:
```sh
npm install @conalog/patch-map
```

### 기본 예제
시작하는 데 도움이 되는 간단한 예제입니다:
```js
(async () => {
  import { PatchMap } from '@conalog/patch-map';

  const data = [
    {
      type: 'group',
      id: 'group-id-1',
      label: 'group-label-1',
      items: [{
        type: 'grid',
        id: 'grid-1',
        label: 'grid-label-1',
        cells: [ [1, 0, 1], [1, 1, 1] ],
        position: { x: 0, y: 0 },
        size: { width: 40, height: 80 },
        components: [
          { type: 'background', texture: 'base' },
          { type: 'icon', texture: 'loading', size: 16 }
        ]
      }]
    }
  ];

  const patchMap = new PatchMap();

  await patchMap.init(document.body);
  
  patchMap.draw(data);
})()
```

<br/>

## 🛠 API 문서

### `init(el, options)`
PATCH MAP을 초기화하는 것으로, 1번만 실행되어야 합니다.

```js
await patchMap.init(el, {
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
  - `PixiJS Application options` ([Docs](https://pixijs.download/release/docs/app.ApplicationOptions.html))  

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
  - `Viewport options` ([Docs](https://pixi-viewport.github.io/pixi-viewport/jsdoc/Viewport.html#Viewport))  
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

### `draw(data)`
캔버스에 맵 데이터를 렌더링합니다.  
```js
const data = [
  {
    type: 'group',
    id: 'group-id-1',
    label: 'group-label-1',
    items: [{
      type: 'grid',
      id: 'grid-1',
      label: 'grid-label-1',
      cells: [ [1, 0, 1], [1, 1, 1] ],
      position: { x: 0, y: 0 },
      size: { width: 40, height: 80 },
      components: [
        { type: 'background', texture: 'base' },
        { type: 'icon', texture: 'loading', size: 16 }
      ]
    }]
  }
];
patchMap.draw(data);
```

**Data Schema**

draw method가 요구하는 **데이터 구조**입니다.  
**자세한 타입 정의**는 [data.d.ts](src/display/data-schema/data.d.ts) 파일을 참조하세요.

<br/>

### `update(options)`
캔버스에 이미 렌더링된 객체의 상태를 업데이트합니다. 색상이나 텍스트 가시성 같은 속성을 변경하는 데 사용하세요.

#### **`Options`**
- `path`(required, string) - [jsonpath](https://github.com/JSONPath-Plus/JSONPath) 문법에 따른 selector로, 이벤트가 적용될 객체를 선택합니다.
- `changes`(required, object) - 적용할 새로운 속성 (예: 색상, 텍스트 가시성).

```js
// label이 "grid-label-1"인 객체들에 대해 변경 사항 적용
patchMap.update({
  path: `$..children[?(@.label=="grid-label-1")]`,
  changes: {
    components: [
      { type: 'icon', texture: 'wifi' }
    ]
  }
});

// type이 "group"인 객체들에 대해 변경 사항 적용
patchMap.update({
  path: `$..children[?(@.type=="group")]`,
  changes: { 
    show: false
  }
});

// type이 "group"인 객체 내에 type이 "grid"인 객체에 대해 변경 사항 적용
patchMap.update({
  path: `$..children[?(@.type=="group")].children[?(@.type=="grid")]`,
  changes: {
    components: [
      { type: 'icon', color: 'black' }
    ]
  }
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
const id = patchMap.event.add({
  path: '$',
  action: 'click tap',
  fn: (e) => {
    console.log(e.target.id)
  }
});

patchMap.event.add({
  id: 'pointerdown-event',
  path: '$..[?(@.label=="group-label-1")]',
  action: 'pointerdown',
  fn: (e) => {
    console.log(e.target.type);
  }
});

patchMap.event.add({
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
patchMap.event.on('pointerdown-event double-click');

// 'pointerdown-event' & 'double-click' 이벤트를 비활성화합니다.
patchMap.event.off('pointerdown-event double-click');

// 'pointerdown-event' & 'double-click' 이벤트를 제거합니다.
patchMap.event.remove('pointerdown-event');

// 등록되어 있는 'double-click' 이벤트를 가져옵니다.
const event = patchMap.event.get('double-click');

// 등록된 모든 이벤트를 가져옵니다.
const events = patchMap.event.getAll();
```

<br/>

### `asset`

#### `add(assets)`
- PixiJS Assets 매니저에 에셋을 추가합니다. 자세한 내용은 [pixiJS add method](https://pixijs.download/release/docs/assets.Assets.html#add)를 참조하세요.
- 아이콘 해상도를 지정하려면 `data: { resolution: <your_value> }` 옵션을 추가할 수 있습니다.
- **아이콘 에셋**을 추가하려면 `alias`에 `icons-` 접두사를 붙이세요.
```js
patchMap.asset.add({
  alias: 'icons-expand',
  src: '/expand.svg',
  data: { resolution: 3 }
});
```

#### `load(urls, onProgress)`
- 지정된 URL에서 에셋을 로드합니다. 자세한 내용은 [pixiJS load method](https://pixijs.download/release/docs/assets.Assets.html#load)를 참조하세요.
```js
await patchMap.asset.load('icons-expand');

await patchMap.asset.load({
  alias: 'icons-plus',
  src: '/plus.svg',
  data: { resolution: 2 }
});
```

##### `get(keys)`
- 지정된 키를 사용하여 에셋을 검색합니다. 자세한 내용은 [pixiJS get method](https://pixijs.download/release/docs/assets.Assets.html#get)를 참조하세요.

##### `addBundle(bundleId, assets)`
- PixiJS Assets 매니저에 에셋 번들을 추가합니다. 자세한 내용은 [pixiJS addBundle method](https://pixijs.download/release/docs/assets.Assets.html#addBundle)를 참조하세요.

##### `loadBundle(bundleIds, onProgress)`
- 제공된 번들 ID를 기반으로 에셋 번들을 로드합니다. 자세한 내용은 [pixiJS loadBundle method](https://pixijs.download/release/docs/assets.Assets.html#loadBundle)를 참조하세요.


<br/>

### `focus(id)`
```js
// 전체 캔버스 객체를 기준으로 focus
patchMap.focus()

// id가 'group-id-1'인 객체를 기준으로 focus
patchMap.focus('group-id-1')

// id가 'grid-1'인 객체를 기준으로 focus
patchMap.focus('grid-1')
```

### `fit(id)`
```js
// 전체 캔버스 객체를 기준으로 fit
patchMap.fit()

// id가 'group-id-1'인 객체를 기준으로 fit
patchMap.fit('group-id-1')

// id가 'grid-1'인 객체를 기준으로 fit
patchMap.fit('grid-1')
```

### `selector(path)`
[jsonpath](https://github.com/JSONPath-Plus/JSONPath) 문법에 따른 객체 탐색기입니다.

```js
const result = patchMap.selector('$..[?(@.label=="group-label-1")]')
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

## Fira Code
이 프로젝트는 캔버스 상에서 문자 가독성을 높이기 위해 [Fira Code](https://github.com/tonsky/FiraCode) 폰트를 사용합니다.  
Fira Code는 [SIL Open Font License, Version 1.1](https://scripts.sil.org/OFL) 하에 배포되며, 라이선스 사본은 [OFL-1.1.txt](./src/assets/fonts/OFL-1.1.txt)에 제공됩니다.
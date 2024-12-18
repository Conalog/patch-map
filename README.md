# PATCH MAP

본 라이브러리는 `pixijs` 라이브러리를 이용하여 PATCH 서비스의 요구사항에 맞는 PATCH MAP을 제공하고자 함

- [pixijs](https://github.com/pixijs/pixijs)
- [pixi-viewport](https://github.com/pixi-viewport/pixi-viewport)


## 목차
- [Setup](#setup)
  - [NPM Install](#npm-install)
  - [import](#import)
  - [기본 사용 예시](#기본-사용-예시)
- [init(el, options)](#initel-options)
  - [app](#app)
  - [viewport](#viewport)
  - [theme](#theme)
  - [asset](#asset)
  - [texture](#texture)
- [draw(options)](#drawoptions)
  - [mapData](#mapdata)
  - [grids](#grids)
  - [strings](#strings)
  - [inverters](#inverters)
  - [combines](#combines)
  - [edges](#edges)
- [Events](#events)
  - [add(type, action, fn, eventId)](#addtype-action-fn-eventid)
  - [remove(eventId)](#removeeventid)
  - [on(eventId)](#oneventid)
  - [off(eventId)](#offeventid)
  - [get(eventId)](#geteventid)
  - [getAll()](#getall)

## Setup

### NPM Install
```sh
npm install @conalog/patch-map
```

### import
```js
import { PatchMap } from '@conalog/patch-map';
```

### 기본 사용 예시
```js
import { PatchMap } from '@conalog/patch-map';

(async () => {
  const body = document.body;

  // Create a new patchMap
  const patchMap = new PatchMap();

  // Initialize
  await patchMap.init(body);

  // patchMap render
  patchMap.draw({ mapData: data });
})()
```

<details>
  <summary>svelte</summary>
  
```html
<script>
  import { onMount } from 'svelte';
  import { PatchMap } from '@conalog/patch-map';

  onMount(async () => {
    const panelmapData = await getPanelmap();

    const element = document.getElementById('patchmap');
    const patchMap = new PatchMap();
    await patchMap.init(element);
    patchMap.draw({ mapData: panelmapData });
  });

  const getPanelmap = async () => {
    const response = await fetch('panelmap.json');
    const result = await response.json();
    return result;
  };
</script>

<main class="flex h-svh w-full flex-col">
  <div id="patchmap" class="h-full grow"></div>
</main>
```
</details>

## init(el, options)
- `app` - `pixijs`의 [ApplicationOptions](https://pixijs.download/release/docs/app.ApplicationOptions.html) 참고
  ```js
  // default options
  {
    background: '#FAFAFA',
    antialias: true,
    autoStart: true,
    autoDensity: true,
    useContextAlpha: true,
    resolution: 2,
  }
  ```
- `viewport` - `pixi-viewport`의 [ViewportOptions](https://pixi-viewport.github.io/pixi-viewport/jsdoc/Viewport.html#Viewport) 참고
  - `plugins` - `pixi-viewport`의 plugins을 추가하거나 기본 동작 diable 가능
  ```js
  // default options
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

- `theme` - `PATCH MAP`에 사용될 색상 테마
  ```js
  // default options
  {
    primary: {
      default: '#0C73BF',
      dark: '#083967',
    },
    gray: {
      light: '#9EB3C3',
      default: '#D9D9D9',
      dark: '#71717A',
    },
    red: {
      default: '#EF4444',
    },
    white: '#FFFFFF',
    black: '#1A1A1A',
  }
  ```
- `asset` - svg/png 등 asset 설정
  ```js
  // default options
  {
    icons: {
      inverter: {
        src: inverterSVG,
      },
      combine: {
        src: combineSVG,
      },
      edge: {
        src: edgeSVG,
      },
      device: {
        src: deviceSVG,
      },
      loading: {
        src: loadingSVG,
      },
      warning: {
        src: warningSVG,
      },
      wifi: {
        src: wifiSVG
      },
    },
  }
  ```
- `texture` - 개발 중

### **Example**
```js
init(el, {
  app: {
    background: '#CCC'
  },
  viewport: {
    plugins: {
      decelerate: {
        disabled: true
      }
    }
  },
  assets: {
    icons: {
      wifi: {
        disabled: true
      }
    }
  }
})
```

## draw(options)
- `mapData` - `PATCH MAP`에 사용될 map data
- `grids`, `strings`, `inverters`, `combines`, `edges` map data의 객체 key
  - `show` - 해당 객체를 보여줄지 여부
  - `frame` - 해당 객체에 사용할 frame 이름
  - `components` - 해당 객체별로 보여줄 컴포넌트 종류
    - `bar`, `icon`, `text` 각 컴포넌트 보여줄 수 있음
      - `show` - 해당 컴포넌트 보여줄지 여부
      - `name` - 해당 컴포넌트에 쓰일 asset 이름
      - `color` - 해당 컴포넌트의 색상

### **example**
```js
draw({
  mapData: data,
  grids: {
    components: {
      icon: {
        show: true,
        name: 'loading',
      },
      bar: {
        show: true,
        color: 'primary.dark'
      },
      text: {
        show: false
      }
    }
  }
})
```

## Events

### add(type, action, fn, eventId)
- `type` - 각 type(grid, inverter, edge)별로 이벤트를 등록할 수 있음
- `action` - `pixijs`의 이벤트
  - `click`, `pointerdown`, `rightclick` 등
  - `space`로 구분하여 여러 이벤트 동시 등록 가능
- `fn` - 이벤트에 등록할 함수, 매개변수로 `event` 전달됨
- `options` - 기타 이벤트 옵션 (선택)
  - `eventId` - 해당 event를 쉽게 찾기 위해 Id 전달 가능함
  - `options` - [AddEventListenerOptions](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#options) 참고
```js
event().add('grids', 'click', (e) => {
  console.log('id: ', e.target.label);
}, { eventId: 'grid-click' });
```

#### canvas
- canvas에 이벤트를 등록하고자 한다면 type `canvas`을 사용할 것
```js
event().add('canvas', 'click', (e) => {
  if (e.target.constructor.name === '_Canvas') {
    console.log('canvas clicked');
  }
});
```


#### double click
- `pixijs` [addEventListener](https://pixijs.download/release/docs/scene.Container.html#addEventListener) 참고
```js
event().add('canvas', 'click', (e) => {
  let prefix;
  switch (e.detail) {
    case 1:
      prefix = 'single'; break;
    case 2:
      prefix = 'double'; break;
    case 3:
      prefix = 'triple'; break;
    default:
      prefix = e.detail + 'th'; break;
  }
  console.log('That was a ' + prefix + 'click');
});
```
```js
event().add('grids', 'click tap', (e) => {
  console.log('id: ', e.target.label);
}, 'grid-click');
```

### remove(eventId)
전달된 `eventId`로 등록된 이벤트 삭제함
```js
event().remove('grid-click');
```

### on(eventId)
전달된 `eventId`에 해당하는 이벤트 활성화
```js
event().on('grid-click');
```

### off(eventId)
전달된 `eventId`에 해당하는 이벤트 비활성화
```js
event().off('grid-click');
```

### get(eventId)
전달된 `eventId`에 해당하는 이벤트 반환함
```js
event().get('grid-click');
```

### getAll()
등록되어 있는 이벤트 모두 반환함
```js
event().getAll();
```

<br/>
<br/>

---

<br/>
<br/>

## 개발 환경 세팅
```
npm i # 의존성 설치
npm run dev # 개발 서버 실행
npm run build # 배포 전 빌드
npm run lint:fix # 코드 정리, 커밋 전 필수
```

### VSCode 설정

https://biomejs.dev/reference/vscode/

1. Biome VS Code Extension 설치
2. `/.vscode/settings.json` 설정
```
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit"
  },
}
```
- 만약 biome formatting 되지 않는 확장자 있을 경우 (확장자마다 별도 설정 필요)
```
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


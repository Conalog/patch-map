# PATCH MAP

[English](./README.md)

`@conalog/patch-map`은 PATCH MAP v0.10 데이터셋을 위한 PixiJS v8 GPU
렌더러·인터랙션 런타임입니다. 권위 데이터는 dense store에 보관하고,
소수의 aggregate scene graph로 렌더링합니다. viewport, 선택, history,
asset, 화면 추출, lifecycle 정리까지 라이브러리가 직접 소유합니다.

## 설치

```sh
npm install @conalog/patch-map pixi.js
```

## 기본 사용법

```ts
import { PatchMap } from '@conalog/patch-map';

const data = [{
  type: 'item',
  id: 'rack-01',
  attrs: { x: 40, y: 32 },
  size: { width: 80, height: 120 },
  components: [
    {
      type: 'background',
      id: 'frame',
      source: { type: 'rect', fill: '#e2e8f0', radius: 6 },
    },
    {
      type: 'bar',
      id: 'usage',
      source: { type: 'rect', fill: '#2563eb', radius: 4 },
      size: { width: '72%', height: '65%' },
      placement: 'bottom',
      animation: true,
      animationDuration: 500,
    },
    {
      type: 'text',
      id: 'label',
      text: '65',
      placement: 'top',
      style: { fontSize: 14, fill: '#0f172a' },
    },
  ],
}];

const patchMap = await PatchMap.mount({
  container: '#map',
  data,
  fit: { padding: 24 },
});

patchMap.update({
  id: 'rack-01',
  bar: { height: 82 },
});

// 화면에서 제거할 때
await patchMap.destroy();
```

`mount()`는 production 기준인 WebGL2 Mesh renderer, 단 하나의 animation
frame loop, host 크기 관찰, 최초 fit을 자동으로 소유합니다. `destroy()`만
호출하면 이 자원도 함께 정리됩니다. `backend: 'webgpu'`는 실험 세션을
명시적으로 실행할 때만 사용하세요.

host tooltip과 selection plugin은 hit test를 복제하지 않고 package가 소유한
pointer projection을 사용합니다. 일반 primary drag는 viewport pan으로
유지하고 `selection: { box: { activationModifier: 'shift' }, allowMultiple,
isSelectable }`로 Shift+primary drag box selection을 켭니다.
`pointer.onHover()`에서 stable hover target을,
`selection.onPointerChange()`에서 pointer-origin selection을 구독합니다.
두 구독은 disposer를 반환하며 `destroy()`에서도 자동 정리됩니다.

극저배율에서 인접 선택선이 면처럼 겹치지 않게 하려면 persistent bound에
`selection.visual: { strokeWidth: 3, strokeScale: 'viewport',
minStrokeWidth: 1 }`을 사용합니다. 1배율에서는 3 CSS px, 축소 시에는
viewport 비율만큼 줄되 1 CSS px 아래로 내려가지 않고, 확대 시에는 3 CSS
px을 넘지 않습니다. 생략하면 기존 fixed-screen 폭을 유지하며 Shift
marquee의 `selection.box.visual.strokeWidth`에는 이 정책이 적용되지 않습니다.

grid instance를 반복 갱신할 때는 JSONPath나 갱신마다 scene scan을 쓰지
않고 semantic target set을 한 번 조회해 재사용할 수 있습니다.

```ts
const cells = patchMap.targets.query({
  within: 'rack-grid',
  scope: 'instances',
});

patchMap.updateBatch({
  targets: cells,
  bar: {
    componentId: 'usage',
    height: new Float32Array(cells.count).fill(75),
    changes: { tint: barTints, source: barSources, show: barShows },
  },
  icon: {
    componentId: 'status',
    changes: { show: iconShows, source: iconSources, tint: iconTints },
  },
}, { animate: true });
```

입력 객체는 내부 데이터와 분리되며 수정되지 않습니다. element ID와
component의 owner/ID identity가 유지됩니다. strict load와 mutation 오류는
부분 적용 없이 원자적으로 실패합니다.

## 지원 범위

- Node.js: 패키지 소비자는 `>=20`, 저장소 CI는 Node.js 22
- WebGL2: production 기준선
- WebGPU: experimental
- WebGL1·Canvas fallback: 미지원
- PixiJS peer dependency: `>=8 <9`

자세한 내용은 [제품 문서](./docs/patch-map/README.md), 배포에 포함되는
[예제](./examples/patch-map), `npm run lab`으로 실행하는 조작형 Lab에서
확인할 수 있습니다.

기존 host integration을 교체하는 경우에는 engine, frame loop, 저장,
teardown 경로를 바꾸기 전에 [마이그레이션 가이드](./docs/patch-map/migration.md)를
먼저 확인하세요.

## 개발 검증

Node.js 22(`.nvmrc`, 패키지 최소 20)에서 `npm ci`로 잠긴 의존성을 설치합니다. 변경 위험별
검증 범위는 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고하세요.

```sh
npm run typecheck
npm run lint
npm run unit
npm run build
npm run verify:contract
```

이 브랜치에서는 버전을 `0.10.0`으로 유지합니다. 배포 버전은 merge 후
올립니다.

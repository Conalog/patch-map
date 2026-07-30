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

const patchMap = new PatchMap();

await patchMap.initialize({
  instanceId: 'rack-map',
  target: document.querySelector('#map')!,
  width: 960,
  height: 640,
  preference: 'webgl',
  strategy: 'mesh',
});

patchMap.loadDataset(data);
patchMap.fitViewport({ paddingCssPx: 24 });

const frameLoop = patchMap.createFrameLoop();
frameLoop.publishNow();

patchMap.updateBarHeights({
  targets: [{ ownerId: 'rack-01', componentId: 'usage' }],
  heights: [82],
});
frameLoop.request(600);

// 화면에서 제거할 때
frameLoop.destroy();
await patchMap.destroy();
```

입력 객체는 내부 데이터와 분리되며 수정되지 않습니다. element ID와
component의 owner/ID identity가 유지됩니다. strict load와 mutation 오류는
부분 적용 없이 원자적으로 실패합니다.

## 지원 범위

- WebGL2: production 기준선
- WebGPU: experimental
- WebGL1·Canvas fallback: 미지원
- PixiJS peer dependency: `>=8 <9`

자세한 내용은 [제품 문서](./docs/patch-map/README.md), 배포에 포함되는
[예제](./examples/patch-map), `npm run lab`으로 실행하는 조작형 Lab에서
확인할 수 있습니다.

## 개발 검증

```sh
npm run typecheck
npm run lint
npm run unit
npm run build
npm run verify:contract
```

이 브랜치에서는 버전을 `0.10.0`으로 유지합니다. 배포 버전은 merge 후
올립니다.
